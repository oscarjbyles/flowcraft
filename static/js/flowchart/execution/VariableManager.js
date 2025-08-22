// variable management for flowchart execution
(function(){
    'use strict';
    if (window.VariableManager) { return; }

class VariableManager {
    constructor(builder) {
        this.builder = builder;
        this.state = builder.state;
        
        // variable storage
        this.nodeVariables = new Map(); // nodeId -> returned variables from function
        this.restoredVariableState = null; // restored variable state from history (for resume functionality)
    }

    // getter and setter for nodeVariables
    getNodeVariables() {
        return this.nodeVariables;
    }

    setNodeVariables(variables) {
        this.nodeVariables = variables;
    }

    // clear all variables
    clearVariables() {
        this.nodeVariables.clear();
        this.restoredVariableState = null;
    }

    // set variable for a specific node
    setNodeVariable(nodeId, returnValue) {
        this.nodeVariables.set(nodeId, returnValue);
    }

    // get variable for a specific node
    getNodeVariable(nodeId) {
        return this.nodeVariables.get(nodeId);
    }

    // check if a node has variables
    hasNodeVariable(nodeId) {
        return this.nodeVariables.has(nodeId);
    }

    // set restored variable state from history
    setRestoredVariableState(state) {
        this.restoredVariableState = state;
    }

    // get restored variable state
    getRestoredVariableState() {
        return this.restoredVariableState;
    }

    // get variables from previous execution for resume functionality
    getPreviousExecutionVariables(resumeNodeId, executionOrder) {
        // find the index of the resume node
        const resumeIndex = executionOrder.findIndex(n => n.id === resumeNodeId);
        
        if (resumeIndex <= 0) {
            return {}; // no previous nodes or first node
        }

        // collect variables from all previous nodes that have execution results
        const variables = {};
        
        for (let i = 0; i < resumeIndex; i++) {
            const node = executionOrder[i];
            const result = this.builder.nodeExecutionResults.get(node.id);
            
            if (result && result.success && result.return_value) {
                // if return value is an object, merge its properties
                if (typeof result.return_value === 'object' && result.return_value !== null) {
                    Object.assign(variables, result.return_value);
                } else {
                    // use node name as variable name for simple values
                    const varName = node.name.toLowerCase().replace(/[^a-zA-Z0-9]/g, '_');
                    variables[varName] = result.return_value;
                }
            }
        }
        
        return variables;
    }

    // enhanced method to get variables from both live and restored executions
    getVariablesForResume(resumeNodeId, executionOrder) {
        // first try to get variables from current execution results (live execution)
        const liveVariables = this.getPreviousExecutionVariables(resumeNodeId, executionOrder);
        
        // if we have variables from live execution, use them
        if (Object.keys(liveVariables).length > 0) {
            return liveVariables;
        }
        
        // if no live variables, try to use restored variable state (from history)
        if (this.restoredVariableState && typeof this.restoredVariableState === 'object') {
            const resumeIndex = executionOrder.findIndex(n => n.id === resumeNodeId);
            
            if (resumeIndex > 0) {
                // return the full variable state since it represents the state up to the resume point
                return { ...this.restoredVariableState };
            }
        }
        
        // if no restored variable state, try to reconstruct from restored execution history
        const resumeIndex = executionOrder.findIndex(n => n.id === resumeNodeId);
        
        if (resumeIndex <= 0) {
            return {}; // no previous nodes or first node
        }

        // collect variables from all previous nodes in the restored execution
        const variables = {};
        
        for (let i = 0; i < resumeIndex; i++) {
            const node = executionOrder[i];
            const result = this.builder.nodeExecutionResults.get(node.id);
            
            if (result && result.success && result.return_value) {
                // if return value is an object, merge its properties
                if (typeof result.return_value === 'object' && result.return_value !== null) {
                    Object.assign(variables, result.return_value);
                } else {
                    // use node name as variable name for simple values
                    const varName = node.name.toLowerCase().replace(/[^a-zA-Z0-9]/g, '_');
                    variables[varName] = result.return_value;
                }
            }
        }
        
        return variables;
    }

    // gather input variables for a target node
    async gatherInputVariables(targetNode) {
        // gather all variables from nodes that connect to this target node
        // separate function arguments (from previous nodes) from input values (from input nodes)
        const functionArgs = {};
        const inputValues = {};
        
        // find all links that point to this node
        const incomingLinks = this.state.links.filter(link => link.target === targetNode.id);
        
        // first, we need to know what parameters the target function expects
        const targetFunctionInfo = await this.analyzePythonFunction(targetNode.pythonFile);
        const expectedParams = targetFunctionInfo.formal_parameters || [];  // formal parameters come from previous nodes
        const inputVariableNames = targetFunctionInfo.input_variable_names || []; // input() calls get values from input nodes
        
        // separate input nodes from regular nodes
        const inputNodes = [];
        const regularNodes = [];
        
        incomingLinks.forEach(link => {
            const sourceNodeId = link.source;
            const sourceNode = this.state.createNode ? this.state.createNode.getNode(sourceNodeId) : null;
            
            if (sourceNode && sourceNode.type === 'input_node') {
                inputNodes.push(sourceNode);
            } else if (sourceNode && sourceNode.type === 'if_node') {
                // bridge variables across an if splitter: pull from upstream python nodes
                const upstreamLinks = this.state.links.filter(l => l.target === sourceNode.id);
                upstreamLinks.forEach(ul => {
                    const upNode = this.state.createNode ? this.state.createNode.getNode(ul.source) : null;
                    if (!upNode) return;
                    if (upNode.type === 'input_node') {
                        inputNodes.push(upNode);
                        return;
                    }
                    if (this.nodeVariables.has(upNode.id)) {
                        const returnValue = this.nodeVariables.get(upNode.id);
                        regularNodes.push({ node: upNode, returnValue });
                    }
                });
            } else if (sourceNode) {
                // check if this source node has variables available
                if (this.nodeVariables.has(sourceNodeId)) {
                    const returnValue = this.nodeVariables.get(sourceNodeId);
                    regularNodes.push({ node: sourceNode, returnValue });
                }
            }
        });
        
        // collect variables from regular nodes (previous node outputs) -> these become function arguments
        regularNodes.forEach(({ node: sourceNode, returnValue }) => {
            if (returnValue === null || typeof returnValue === 'undefined') return;

            // case 1: upstream returned a plain object (e.g., dict from python)
            if (typeof returnValue === 'object' && returnValue.constructor === Object) {
                // merge without overwriting already-set parameters
                Object.keys(returnValue).forEach((key) => {
                    const val = returnValue[key];
                    // if this key corresponds to an expected parameter and it's not set yet, set it
                    if (!Object.prototype.hasOwnProperty.call(functionArgs, key)) {
                        functionArgs[key] = val;
                    }
                });
                return;
            }

            // case 2: upstream returned an array/tuple — map elements to remaining expected params in order
            if (Array.isArray(returnValue)) {
                const remainingParams = expectedParams.filter((p) => !Object.prototype.hasOwnProperty.call(functionArgs, p));
                for (let i = 0; i < returnValue.length && i < remainingParams.length; i++) {
                    const paramName = remainingParams[i];
                    if (!Object.prototype.hasOwnProperty.call(functionArgs, paramName)) {
                        functionArgs[paramName] = returnValue[i];
                    }
                }
                return;
            }

            // case 3: primitive return — try to match by heuristics
            const variableName = this.matchVariableToParameter(sourceNode, returnValue, expectedParams, functionArgs);
            if (variableName && !Object.prototype.hasOwnProperty.call(functionArgs, variableName)) {
                functionArgs[variableName] = returnValue;
            }
        });
        
        // collect from input nodes -> these become input values for input() calls
        inputNodes.forEach(inputNode => {
            if (inputNode.inputValues) {
                Object.keys(inputNode.inputValues).forEach(param => {
                    const value = inputNode.inputValues[param];
                    // use input node values for input() calls
                    if (value !== '' && value !== null && value !== undefined) {
                        inputValues[param] = value;
                    }
                });
            }
        });
        
        return { functionArgs, inputValues };
    }

    // update connected input nodes with return values
    async updateConnectedInputNodes(sourceNodeId, returnValue) {
        // find all nodes that this source node connects to
        const outgoingLinks = this.state.links.filter(link => link.source === sourceNodeId);
        
        for (const link of outgoingLinks) {
            const targetNode = this.state.createNode ? this.state.createNode.getNode(link.target) : null;
            if (!targetNode || targetNode.type !== 'python_file') continue;
            
            // find the input node for this target node
            const inputNode = this.state.nodes.find(n => 
                n.type === 'input_node' && n.targetNodeId === targetNode.id
            );
            
            if (inputNode) {
                // analyze the target function to get expected parameters
                const targetFunctionInfo = await this.analyzePythonFunction(targetNode.pythonFile);
                const expectedParams = targetFunctionInfo.formal_parameters || [];  // use formal_parameters for variable passing
                
                // match the return value to the expected parameters
                const variableName = this.matchVariableToParameter(
                    this.state.createNode ? this.state.createNode.getNode(sourceNodeId) : null, 
                    returnValue, 
                    expectedParams, 
                    inputNode.inputValues || {}
                );
                
                if (variableName && expectedParams.includes(variableName)) {
                    // update the input node's value
                    if (!inputNode.inputValues) {
                        inputNode.inputValues = {};
                    }
                    
                    // only update if the current value is empty (preserve user-entered values)
                    if (!inputNode.inputValues[variableName] || inputNode.inputValues[variableName] === '') {
                        inputNode.inputValues[variableName] = returnValue;
                        
                        // emit update to refresh the visual representation
                        this.state.emit('nodeUpdated', inputNode);
                        this.state.emit('stateChanged');
                    }
                }
            }
        }
    }

    // analyze python function to get parameter information
    async analyzePythonFunction(pythonFile) {
        // analyze a python file to get function information
        try {
            const response = await fetch('/api/analyze-python-function', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    python_file: (pythonFile || '').replace(/\\/g,'/').replace(/^(?:nodes\/)*/i,'')
                })
            });
            
            const result = await response.json();
            return result;
        } catch (error) {
            this.builder.handleError('error analyzing python function', error);
            return { parameters: [] };
        }
    }

    // match variable to parameter based on heuristics
    matchVariableToParameter(sourceNode, returnValue, expectedParams, existingVariables) {
        // try to match the return value to one of the expected parameters
        
        // if there's only one expected parameter, use it (highest priority)
        if (expectedParams.length === 1) {
            const paramName = expectedParams[0];
            if (!existingVariables.hasOwnProperty(paramName)) {
                return paramName;
            }
        }
        
        // try to match based on common naming patterns
        for (const paramName of expectedParams) {
            if (!existingVariables.hasOwnProperty(paramName)) {
                // direct match with common variable names
                if (paramName === 'result' && typeof returnValue === 'number') {
                    return paramName;
                }
                if (paramName === 'text' && typeof returnValue === 'string') {
                    return paramName;
                }
                if (paramName === 'data' || paramName === 'value') {
                    return paramName;
                }
                if (paramName === 'items' && Array.isArray(returnValue)) {
                    return paramName;
                }
            }
        }
        
        // fallback: use the first available expected parameter
        for (const paramName of expectedParams) {
            if (!existingVariables.hasOwnProperty(paramName)) {
                return paramName;
            }
        }
        
        // last resort: use a generic name based on return value type
        const genericName = this.getVariableNameForNode(sourceNode, returnValue);
        return genericName;
    }

    // get variable name for node based on node name or return value type
    getVariableNameForNode(sourceNode, returnValue) {
        // try to determine a good variable name based on the source node or return value
        if (sourceNode.name && sourceNode.name.toLowerCase() !== 'untitled') {
            // use node name, sanitized for variable naming
            return sourceNode.name.toLowerCase().replace(/[^a-z0-9_]/g, '_');
        }
        
        // fallback to generic name based on return value type
        if (typeof returnValue === 'number') {
            return 'result';
        } else if (typeof returnValue === 'string') {
            return 'text';
        } else if (Array.isArray(returnValue)) {
            return 'items';
        } else {
            return 'data';
        }
    }

    // persist data from connected data_save nodes when a python node completes successfully
    async persistDataSaveForNode(pythonNode) {
        try {
            // find all data_save nodes connected to this python node (either direction)
            const connectedDataSaves = [];
            for (const link of this.state.links) {
                if (link.source === pythonNode.id) {
                    const t = this.state.createNode ? this.state.createNode.getNode(link.target) : null;
                    if (t && t.type === 'data_save') connectedDataSaves.push(t);
                } else if (link.target === pythonNode.id) {
                    const s = this.state.createNode ? this.state.createNode.getNode(link.source) : null;
                    if (s && s.type === 'data_save') connectedDataSaves.push(s);
                }
            }
            if (connectedDataSaves.length === 0) return;

            // get latest execution result for this python node
            const result = this.builder.nodeExecutionResults.get(pythonNode.id);
            const returnsVal = result ? result.return_value : undefined;

            const analyzeReturnsForNode = async () => {
                try {
                    const resp = await fetch('/api/analyze-python-function', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ python_file: (pythonNode.pythonFile || '').replace(/\\/g,'/').replace(/^(?:nodes\/)*/i,'') })
                    });
                    const data = await resp.json();
                    if (!data || data.success === false) return null;
                    return Array.isArray(data.returns) ? data.returns : [];
                } catch (e) {
                    console.warn('[data_save] analyze-python-function failed:', e);
                    return null;
                }
            };

            const returnsAnalysis = Array.isArray(returnsVal) ? await analyzeReturnsForNode() : null;

            const getIndexForVariable = (varName, varLine, rvArray, analysis) => {
                if (!Array.isArray(rvArray) || !analysis) return -1;
                // group analysis returns by line to identify tuple elements from the same return statement
                const grouped = new Map();
                analysis.forEach(item => {
                    const ln = item && typeof item.line === 'number' ? item.line : null;
                    if (ln === null) return;
                    if (!grouped.has(ln)) grouped.set(ln, []);
                    grouped.get(ln).push(item);
                });
                const tryFindInGroup = (items) => {
                    // prefer variables; keep order
                    const names = items.filter(it => it && it.type === 'variable').map(it => it.name);
                    const idx = names.indexOf(varName);
                    return idx >= 0 ? idx : -1;
                };
                // 1) if we know the line, use that group directly
                if (typeof varLine === 'number' && grouped.has(varLine)) {
                    const idx = tryFindInGroup(grouped.get(varLine));
                    if (idx >= 0 && idx < rvArray.length) return idx;
                }
                // 2) otherwise, search for a group whose size matches rv length
                for (const [, items] of grouped.entries()) {
                    const onlyVars = items.filter(it => it && it.type === 'variable');
                    if (onlyVars.length === rvArray.length) {
                        const idx = tryFindInGroup(onlyVars);
                        if (idx >= 0) return idx;
                    }
                }
                // 3) fallback: search any group in order
                for (const [, items] of grouped.entries()) {
                    const idx = tryFindInGroup(items);
                    if (idx >= 0) return idx;
                }
                return -1;
            };

            connectedDataSaves.forEach(async ds => {
                // try to use the selected variable name; if none, infer from return value
                let varName = (ds && ds.dataSource && ds.dataSource.variable && ds.dataSource.variable.name) || null;
                const varLine = (ds && ds.dataSource && ds.dataSource.variable && ds.dataSource.variable.line) || null;
                if (!result) { return; }
                let value;
                const rv = returnsVal;
                if (rv && typeof rv === 'object') {
                    const keys = Object.keys(rv);
                    // if no explicit variable chosen, default to first key when available
                    if (typeof varName !== 'string' || varName.length === 0) {
                        if (keys.length > 0) {
                            varName = keys[0];
                        }
                    }
                    if (Array.isArray(rv)) {
                        // map variable name to index using analysis grouping by return line
                        let idx = -1;
                        if (typeof varName === 'string' && varName.length > 0) {
                            idx = getIndexForVariable(varName, typeof varLine === 'number' ? varLine : null, rv, returnsAnalysis);
                        }
                        if (idx >= 0 && idx < rv.length) {
                            value = rv[idx];
                        } else if (typeof varName === 'string' && Object.prototype.hasOwnProperty.call(rv, varName)) {
                            // as a last resort, allow numeric-string index
                            value = rv[varName];
                        } else {
                            // no reliable mapping: keep whole array
                            value = rv;
                        }
                    } else if (typeof varName === 'string' && Object.prototype.hasOwnProperty.call(rv, varName)) {
                        value = rv[varName];
                    } else if (keys.length === 1) {
                        value = rv[keys[0]];
                        if (typeof varName !== 'string' || varName.length === 0) {
                            varName = keys[0];
                        }
                    } else {
                        // as a fallback for objects with multiple keys and no match, persist the whole object
                        value = rv;
                    }
                } else if (typeof rv !== 'undefined') {
                    // primitive return: save it directly
                    value = rv;
                }
                // choose a data key for storage
                const dataKey = (typeof varName === 'string' && varName.length > 0) ? varName : ((ds && ds.name) || 'data');
                if (typeof value === 'undefined') { return; }
                try {
                    // store a synthetic result entry so it shows up in history and data matrix
                    const synthetic = {
                        node_id: ds.id,
                        node_name: ds.name || 'data save',
                        python_file: (pythonNode.pythonFile || '').replace(/\\/g,'/').replace(/^(?:nodes\/)*/i,''),
                        success: true,
                        output: '',
                        error: null,
                        runtime: 0,
                        timestamp: new Date().toLocaleTimeString(),
                        return_value: { [dataKey]: value },
                        function_name: 'data_save',
                        input_args: {},
                        data_save: { data_name: dataKey, variable_name: (typeof varName === 'string' && varName.length > 0) ? varName : null }
                    };
                    // push into current map so saveExecutionHistory includes it
                    this.builder.nodeExecutionResults.set(ds.id, synthetic);
                    // mark the data_save node as success and refresh style in run mode
                    ds.runtimeStatus = 'success'; 
                    if (this.builder.nodeRenderer) this.builder.nodeRenderer.updateNodeStyles();

                } catch (e) {
                    console.warn('failed to synthesize data_save result', e);
                    ds.runtimeStatus = 'error'; 
                    if (this.builder.nodeRenderer) this.builder.nodeRenderer.updateNodeStyles();
                }
            });
        } catch (e) {
            console.warn('persistDataSaveForNode error', e);
        }
    }
}

window.VariableManager = VariableManager;
})();
