// execution logic module - core execution orchestration
(function(){
    'use strict';
    if (window.ExecutionLogic) { return; }

class ExecutionLogic {
    constructor(app) {
        this.builder = app;
        this.state = app.state;
        
        // execution control
        this.currentExecutionController = null;
        
        // execution state
        this.isExecuting = false;
        this.executionAborted = false;
        // guard to prevent double-start on rapid clicks
        this.executionStarting = false;
        
        // runtime branch control: nodes blocked by false if arms in the current run
        // all comments in lower case
        this.blockedNodeIds = new Set();
        
        // store execution results for individual nodes
        this.nodeExecutionResults = new Map(); // nodeId -> execution result

    }

    // helper method to delegate getNode calls to CreateNode
    getNode(nodeId) {
        return this.state.createNode ? this.state.createNode.getNode(nodeId) : null;
    }

    // clear all runtime condition flags on if→python links (used when clearing run or leaving run mode)
    clearIfRuntimeIndicators() {
        try {
            const links = Array.isArray(this.state.links) ? this.state.links : [];
            links.forEach(l => {
                const s = this.getNode(l.source);
                const t = this.getNode(l.target);
                if (s && t && s.type === 'if_node' && t.type === 'python_file') {
                    this.state.connectionHandler.updateLink(l.source, l.target, { runtime_condition: null, runtime_details: null });
                }
            });
            // re-render if-to-python nodes to reflect cleared state
            this.builder.linkRenderer.renderIfToPythonNodes();
        } catch (_) {}
    }

    async startExecution() {
        // clear all selections when starting execution (same as deselect button)
        this.builder.state.selectionHandler.deselectAll();

        // get execution order
        const executionOrder = this.builder.calculateNodeOrder();
        
        if (executionOrder.length === 0) {
            this.builder.executionStatus.updateExecutionStatus('error', 'no connected nodes to execute');
            return;
        }

        // create abort controller for this execution session
        this.currentExecutionController = new AbortController();

        // set execution state
        this.isExecuting = true;
        this.executionAborted = false;
        // clear the starting guard as soon as execution officially begins
        this.executionStarting = false;
        
        // update ui to show stop button and loading wheel
        this.updateExecutionUI(true);

        // reset all node states and clear previous execution results
        this.resetNodeStates();
        this.nodeExecutionResults.clear();
        this.builder.variableManager.clearVariables();
        // sync with builder for legacy compatibility
        this.builder.nodeExecutionResults = this.nodeExecutionResults;
        this.builder.outputManager.globalExecutionLog = '';
        this.builder.outputManager.clearOutput();

        // clear execution feed
        if (this.builder.executionFeed) {
            this.builder.executionFeed.clear();
        }

        // reset blocked branches
        this.blockedNodeIds.clear();
        // clear restored variable state when starting new execution
        this.builder.variableManager.setRestoredVariableState(null);
        // clear any previous runtime condition indicators on if→python links
        try {
            const links = Array.isArray(this.state.links) ? this.state.links : [];
            links.forEach(l => {
                const s = this.getNode(l.source);
                const t = this.getNode(l.target);
                if (s && t && s.type === 'if_node' && t.type === 'python_file') {
                    this.state.connectionHandler.updateLink(l.source, l.target, { runtime_condition: null, runtime_details: null });
                }
            });
        } catch (_) {}
        
        // update execution status
        this.builder.executionStatus.updateExecutionStatus('running', `executing ${executionOrder.length} nodes`);
        
        try {
            // execute nodes one by one with live feedback
            for (let i = 0; i < executionOrder.length; i++) {
                // check if execution was stopped
                if (this.executionAborted) {
                    this.builder.executionStatus.updateExecutionStatus('stopped', 'execution stopped by user');
                    await this.builder.executionStatus.saveExecutionHistory('stopped', executionOrder, 'execution stopped by user');
                    return;
                }
                
                const node = executionOrder[i];
                const success = await this.executeNodeLive(node, i + 1, executionOrder.length);
                // after a successful python node, persist any connected data_save values
                if (success && node.type === 'python_file') {
                    try { await this.builder.persistDataSaveForNode(node); } catch (e) { console.warn('data_save persist failed:', e); }
                }
                // update sidebar progress each step
                this.builder.executionStatus.updateExecutionStatus('running', `executing ${i + 1} of ${executionOrder.length}`);
                
                // if node failed or execution was aborted, stop execution immediately
                if (!success) {
                    if (this.executionAborted) {
                        this.builder.executionStatus.updateExecutionStatus('stopped', 'execution stopped by user');
                        await this.builder.executionStatus.saveExecutionHistory('stopped', executionOrder, 'execution stopped by user');
                    } else {
                        this.builder.executionStatus.updateExecutionStatus('failed', `execution stopped at node: ${node.name}`);
                        // ensure sidebar refresh picks up failure info in no-selection view
                        this.state.emit('selectionChanged', { nodes: [], link: null, group: null });
                        await this.builder.executionStatus.saveExecutionHistory('failed', executionOrder, `execution stopped at node: ${node.name}`);
                    }
                    return;
                }
            }
            
            // all nodes completed successfully
            this.builder.executionStatus.updateExecutionStatus('completed', 'execution completed successfully');
            await this.builder.executionStatus.saveExecutionHistory('success', executionOrder);
            
        } catch (error) {
            this.builder.executionStatus.updateExecutionStatus('error', `execution failed: ${error.message}`);
            await this.builder.executionStatus.saveExecutionHistory('error', executionOrder, error.message);
        } finally {
            // reset execution state
            this.isExecuting = false;
            this.updateExecutionUI(false);
        }
    }
    
    async stopExecution() {
        if (this.isExecuting) {
            this.executionAborted = true;
            
            // abort the current API request if one is in progress
            if (this.currentExecutionController) {
                this.currentExecutionController.abort();
            }
            
            // call stop API to terminate any running Python processes
            try {
                await fetch('/api/stop-execution', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    }
                });
            } catch (error) {
                console.warn('failed to call stop API:', error);
            }
            
            this.isExecuting = false;
            this.updateExecutionUI(false);
            this.builder.executionStatus.updateExecutionStatus('stopped', 'execution stopped by user');
            
            // reset the abort controller
            this.currentExecutionController = null;
        }
    }
    
    updateExecutionUI(isExecuting) {
        const button = document.getElementById('execute_start_btn');
        const loadingWheel = document.getElementById('execution_loading_wheel');
        const icon = button.querySelector('.material-icons');
        const text = button.childNodes[button.childNodes.length - 1];
        
        if (isExecuting) {
            // change to stop button
            button.classList.remove('btn_primary');
            button.classList.add('btn_stop');
            icon.textContent = 'stop';
            text.textContent = ' Stop';
            loadingWheel.style.display = 'block';
        } else {
            // change back to start button
            button.classList.remove('btn_stop');
            button.classList.add('btn_primary');
            icon.textContent = 'play_arrow';
            text.textContent = ' Start';
            loadingWheel.style.display = 'none';
        }
    }

    async executeNodeLive(node, nodeIndex, totalNodes, accumulatedVariables = null) {
        // skip blocked nodes silently
        if (this.blockedNodeIds && this.blockedNodeIds.has(node.id)) {
            return true;
        }
        
        // handle if splitter nodes without executing python
        if (node && node.type === 'if_node') {
            await this.evaluateIfNodeAndBlockBranches(node);
            // mark as completed for visual feedback without running
            this.builder.nodeStateManager.setNodeState(node.id, 'completed');
            this.builder.executionStatus.updateNodeDetails(node, 'completed', 0);
            return true;
        }
        
        // remember current executing node for immediate tracking when toggled on mid-run
        this.builder.currentExecutingNodeId = node && node.id;
        
        // set node to running state with loading animation
        this.builder.nodeStateManager.setNodeState(node.id, 'running');
        this.builder.nodeStateManager.addNodeLoadingAnimation(node.id);
        this.builder.executionStatus.updateExecutionStatus('running', `executing node ${nodeIndex}/${totalNodes}: ${node.name}`);
        
        // create feed entry for this node
        if (this.builder.executionFeed) {
            this.builder.executionFeed.createNodeEntry(node);
        }
        
        // auto-follow currently running python nodes if tracking is enabled and not user-disabled
        console.log('[ExecutionLogic] viewport tracking check:', {
            nodeType: node?.type,
            isAutoTrackEnabled: this.builder.isAutoTrackEnabled,
            userDisabledTracking: this.builder.userDisabledTracking,
            shouldTrack: node && node.type === 'python_file' && this.builder.isAutoTrackEnabled && !this.builder.userDisabledTracking
        });
        if (
            node && node.type === 'python_file' &&
            this.builder.isAutoTrackEnabled && !this.builder.userDisabledTracking
        ) {
            console.log('[ExecutionLogic] triggering viewport tracking for node:', node.id);
            this.builder.viewportTracker.centerOnNode(node.id);
        }
        
        // show node details in sidebar
        this.builder.executionStatus.updateNodeDetails(node, 'running', Date.now());
        
        const startTime = Date.now();
        
        try {
            // gather input variables from previous nodes
            const inputVariables = await this.builder.gatherInputVariables(node);
            
            // merge accumulated variables if provided (for resume execution)
            const finalFunctionArgs = accumulatedVariables 
                ? { ...inputVariables.functionArgs, ...accumulatedVariables }
                : inputVariables.functionArgs;
            const finalInputValues = inputVariables.inputValues;
            
            // execute the node via API with input variables
            const result = await this.callNodeExecution(node, {
                functionArgs: finalFunctionArgs,
                inputValues: finalInputValues
            });
            
            const endTime = Date.now();
            const runtime = endTime - startTime;
            
            // remove loading animation
            this.builder.nodeStateManager.removeNodeLoadingAnimation(node.id);
            
            if (result.success) {
                // store return value from function if any - do this FIRST
                if (result.return_value !== null && result.return_value !== undefined) {
                    this.builder.variableManager.setNodeVariable(node.id, result.return_value);
                }
                
                // store execution result
                this.nodeExecutionResults.set(node.id, {
                    node: node,
                    success: true,
                    output: result.output || '',
                    error: null,
                    runtime: runtime,
                    timestamp: new Date().toLocaleTimeString(),
                    return_value: result.return_value,
                    function_name: result.function_name,
                    input_args: result.input_args,
                    input_values: result.input_values,
                    input_used: !!(result && (result.input_used || (result.input_values && Object.keys(result.input_values || {}).length > 0)))
                });
                
                // sync with builder for legacy compatibility
                this.builder.nodeExecutionResults = this.nodeExecutionResults;
                
                // set node to completed state (green)
                this.builder.nodeStateManager.setNodeState(node.id, 'completed');
                this.builder.executionStatus.updateNodeDetails(node, 'completed', runtime, result.output);

                // finalize feed entry for this node
                if (this.builder.executionFeed) {
                    this.builder.executionFeed.finalizeNode(node, result, startTime);
                }

                // auto-highlight associated input node in green when inputs were used successfully
                try {
                    const usedInputs = !!(result && (result.input_used || (result.input_values && Object.keys(result.input_values || {}).length > 0)));
                    if (node.type === 'python_file' && usedInputs) {
                        let inputNode = (this.state.nodes || []).find(n => n && n.type === 'input_node' && n.targetNodeId === node.id);
                        if (!inputNode) {
                            const linkFromInput = (this.state.links || []).find(l => {
                                if (!l) return false;
                                const src = this.getNode(l.source);
                                return !!(src && src.type === 'input_node' && l.target === node.id);
                            });
                            if (linkFromInput) inputNode = this.getNode(linkFromInput.source);
                        }
                        if (inputNode) {
                            inputNode.runtimeStatus = 'success';
                            this.builder.nodeStateManager.setNodeState(inputNode.id, 'completed');
                            this.builder.nodeRenderer.updateNodeStyles();
                        }
                    }
                } catch (_) {}

                // if this was a data_save node (synthetic), theme it green as success
                if (node.type === 'data_save') {
                    node.runtimeStatus = 'success';
                    if (this.builder.nodeRenderer) this.builder.nodeRenderer.updateNodeStyles();
                }
                
                const returnValueText = result.return_value !== null && result.return_value !== undefined 
                    ? `\nReturned: ${JSON.stringify(result.return_value)}` 
                    : '';
                this.builder.outputManager.appendOutput(`[${node.name}] execution completed in ${(runtime/1000).toFixed(3)}s${returnValueText}\n${result.output || ''}\n`);
                return true; // success
            } else {
                // store execution result and remember failed node for no-selection view
                this.nodeExecutionResults.set(node.id, {
                    node: node,
                    success: false,
                    output: result.output || '',
                    error: result.error || 'unknown error',
                    runtime: runtime,
                    timestamp: new Date().toLocaleTimeString(),
                    return_value: null,
                    function_name: result.function_name,
                    input_args: result.input_args,
                    input_values: result.input_values,
                    input_used: !!(result && (result.input_used || (result.input_values && Object.keys(result.input_values || {}).length > 0)))
                });
                
                // sync with builder for legacy compatibility
                this.builder.nodeExecutionResults = this.nodeExecutionResults;
                
                this.builder.lastFailedNode = { id: node.id, name: node.name, pythonFile: node.pythonFile, error: result.error || 'unknown error' };
                
                // set node to error state (red)
                this.builder.nodeStateManager.setNodeState(node.id, 'error');
                this.builder.executionStatus.updateNodeDetails(node, 'error', runtime, result.error);
                if (node.type === 'data_save') {
                    node.runtimeStatus = 'error';
                    if (this.builder.nodeRenderer) this.builder.nodeRenderer.updateNodeStyles();
                }
                
                // finalize feed entry for this node (with error)
                if (this.builder.executionFeed) {
                    this.builder.executionFeed.finalizeNode(node, result, startTime);
                }
                
                // format error message with line number if available
                let errorDisplay = result.error || 'unknown error';
                if (result.error_line && result.error_line > 0 && !/^\s*line\s+\d+\s*:/i.test(errorDisplay)) {
                    errorDisplay = `Line ${result.error_line}: ${errorDisplay}`;
                }
                this.builder.outputManager.appendOutput(`[${node.name}] execution failed after ${(runtime/1000).toFixed(3)}s\n${errorDisplay}\n`);
                return false; // failure - will stop execution
            }
            
        } catch (error) {
            // store execution result for error case
            this.nodeExecutionResults.set(node.id, {
                node: node,
                success: false,
                output: '',
                error: error.message,
                runtime: 0,
                timestamp: new Date().toLocaleTimeString()
            });
            
            // sync with builder for legacy compatibility
            this.builder.nodeExecutionResults = this.nodeExecutionResults;
            
            this.builder.lastFailedNode = { id: node.id, name: node.name, pythonFile: node.pythonFile, error: error.message };
            
            this.builder.nodeStateManager.removeNodeLoadingAnimation(node.id);
            this.builder.nodeStateManager.setNodeState(node.id, 'error');
            this.builder.executionStatus.updateNodeDetails(node, 'error', 0, error.message);
            this.builder.outputManager.appendOutput(`[${node.name}] execution error: ${error.message}\n`);
            return false; // failure
        }
    }

    // evaluate an if splitter's outgoing link conditions against available upstream variables
    // and block branches whose conditions evaluate to false for the current run
    async evaluateIfNodeAndBlockBranches(ifNode) {
        try {
            // gather variables from incoming python nodes
            const incomingLinks = this.state.links.filter(l => l.target === ifNode.id);
            const vars = {};
            for (const link of incomingLinks) {
                const sourceId = link.source;
                            if (!this.builder.variableManager.hasNodeVariable(sourceId)) continue;
            const val = this.builder.variableManager.getNodeVariable(sourceId);
                if (val && typeof val === 'object' && val !== null) {
                    // if the return value is an array, treat it as a single variable (do not spread indices)
                    if (Array.isArray(val)) {
                        const src = this.getNode(sourceId);
                        let mapped = false;
                        try {
                            if (src && src.type === 'python_file' && src.pythonFile) {
                                const resp = await fetch('/api/analyze-python-function', {
                                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ python_file: (src.pythonFile || '').replace(/\\/g,'/').replace(/^(?:nodes\/)*?/i,'') })
                                });
                                const data = await resp.json();
                                const returns = Array.isArray(data && data.returns) ? data.returns : [];
                                let varName = null;
                                if (returns.length === 1 && returns[0] && returns[0].name) {
                                    varName = returns[0].name;
                                } else {
                                    const variableItem = returns.find(r => r && (r.type === 'variable' || typeof r.name === 'string') && r.name);
                                    if (variableItem && variableItem.name) varName = variableItem.name;
                                }
                                if (varName && typeof varName === 'string') {
                                    vars[varName] = val;
                                    mapped = true;
                                }
                            }
                        } catch (_) {}
                        if (!mapped) {
                            const key = (src && src.name) ? src.name.toLowerCase().replace(/[^a-z0-9_]/g, '_') : `node_${sourceId}`;
                            vars[key] = val;
                        }
                    } else {
                        Object.assign(vars, val);
                    }
                } else if (typeof val !== 'undefined') {
                    const src = this.getNode(sourceId);
                    let mapped = false;
                    // try to map primitive return value to the real return variable name via analysis
                    try {
                        if (src && src.type === 'python_file' && src.pythonFile) {
                            const resp = await fetch('/api/analyze-python-function', {
                                method: 'POST', headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ python_file: (src.pythonFile || '').replace(/\\/g,'/').replace(/^(?:nodes\/)*/i,'') })
                            });
                            const data = await resp.json();
                            const returns = Array.isArray(data && data.returns) ? data.returns : [];
                            // prefer single variable name; otherwise first variable-like name
                            let varName = null;
                            if (returns.length === 1 && returns[0] && returns[0].name) {
                                varName = returns[0].name;
                            } else {
                                const variableItem = returns.find(r => r && (r.type === 'variable' || typeof r.name === 'string') && r.name);
                                if (variableItem && variableItem.name) varName = variableItem.name;
                            }
                            if (varName && typeof varName === 'string') {
                                vars[varName] = val;
                                mapped = true;
                            }
                        }
                    } catch (_) {}
                    if (!mapped) {
                        const key = (src && src.name) ? src.name.toLowerCase().replace(/[^a-z0-9_]/g, '_') : `node_${sourceId}`;
                        vars[key] = val;
                    }
                }
            }

            // evaluate outgoing links
            const outgoingLinks = this.state.links.filter(l => l.source === ifNode.id);
            if (!outgoingLinks.length) return;

            // helper to evaluate a single condition object { variable, operator, value, combiner? }
            const evalSingle = (variableName, operator, compareRaw) => {
                const left = vars.hasOwnProperty(variableName) ? vars[variableName] : undefined;
                if (typeof left === 'undefined') return false;
                let right = compareRaw;
                // basic type coercion based on left type
                if (typeof left === 'number') {
                    const n = Number(right);
                    right = Number.isNaN(n) ? right : n;
                } else if (typeof left === 'boolean') {
                    if (String(right).toLowerCase() === 'true') right = true;
                    else if (String(right).toLowerCase() === 'false') right = false;
                }
                switch (operator) {
                    // array length comparisons
                    case 'len==': {
                        const leftLen = (left != null && typeof left === 'object' && 'length' in left) ? Number(left.length) : (typeof left === 'string' ? left.length : Number(left));
                        const rightNum = Number(compareRaw);
                        return Number.isNaN(leftLen) || Number.isNaN(rightNum) ? false : leftLen == rightNum; // eslint-disable-line eqeqeq
                    }
                    case 'len<': {
                        const leftLen = (left != null && typeof left === 'object' && 'length' in left) ? Number(left.length) : (typeof left === 'string' ? left.length : Number(left));
                        const rightNum = Number(compareRaw);
                        return Number.isNaN(leftLen) || Number.isNaN(rightNum) ? false : leftLen < rightNum;
                    }
                    case 'len>': {
                        const leftLen = (left != null && typeof left === 'object' && 'length' in left) ? Number(left.length) : (typeof left === 'string' ? left.length : Number(left));
                        const rightNum = Number(compareRaw);
                        return Number.isNaN(leftLen) || Number.isNaN(rightNum) ? false : leftLen > rightNum;
                    }
                    case '===': return left === right;
                    case '==': return left == right; // eslint-disable-line eqeqeq
                    case '>': return Number(left) > Number(right);
                    case '<': return Number(left) < Number(right);
                    case '>=': return Number(left) >= Number(right);
                    case '<=': return Number(left) <= Number(right);
                    default: return false;
                }
            };

            const trueTargets = [];
            const falseTargets = [];
            for (const link of outgoingLinks) {
                const meta = this.state.connectionHandler.getLink(link.source, link.target) || link;
                const conditions = Array.isArray(meta.conditions) ? meta.conditions : [];
                if (conditions.length === 0) {
                    // no conditions means this arm is not taken by default
                    falseTargets.push(link.target);
                    // mark link as false in runtime
                    this.state.connectionHandler.updateLink(link.source, link.target, { runtime_condition: 'false', runtime_details: { variables: { ...vars }, conditions: [], final: false } });
                    continue;
                }
                // evaluate left-to-right with optional combiner on subsequent conditions (default 'and')
                const details = [];
                let result = evalSingle(conditions[0].variable, conditions[0].operator, conditions[0].value);
                details.push({
                    variable: conditions[0].variable,
                    operator: conditions[0].operator,
                    value: conditions[0].value,
                    left: Object.prototype.hasOwnProperty.call(vars, conditions[0].variable) ? vars[conditions[0].variable] : undefined,
                    result
                });
                for (let i = 1; i < conditions.length; i++) {
                    const c = conditions[i];
                    const next = evalSingle(c.variable, c.operator, c.value);
                    const comb = (c.combiner || 'and').toLowerCase();
                    details.push({
                        variable: c.variable,
                        operator: c.operator,
                        value: c.value,
                        combiner: comb,
                        left: Object.prototype.hasOwnProperty.call(vars, c.variable) ? vars[c.variable] : undefined,
                        result: next
                    });
                    if (comb === 'or') result = result || next; else result = result && next;
                }
                if (result) {
                    trueTargets.push(link.target);
                    this.state.connectionHandler.updateLink(link.source, link.target, { runtime_condition: 'true', runtime_details: { variables: { ...vars }, conditions: details, final: true } });
                } else {
                    falseTargets.push(link.target);
                    this.state.connectionHandler.updateLink(link.source, link.target, { runtime_condition: 'false', runtime_details: { variables: { ...vars }, conditions: details, final: false } });
                }
            }

            // block all false arms (and their downstream nodes where appropriate)
            for (const tgt of falseTargets) {
                this.blockBranchFrom(tgt);
            }
            // ensure true arm immediate targets are unblocked if previously marked
            for (const tgt of trueTargets) {
                if (this.blockedNodeIds.has(tgt)) this.blockedNodeIds.delete(tgt);
            }
        } catch (e) {
            console.warn('if evaluation error', e);
        }
    }

    // block a branch starting from a node id, but stop at merge points that also have
    // incoming links from nodes not in the blocked set (so other paths can still proceed)
    blockBranchFrom(startNodeId) {
        const queue = [startNodeId];
        const localVisited = new Set();
        while (queue.length) {
            const currentId = queue.shift();
            if (localVisited.has(currentId)) continue;
            localVisited.add(currentId);

            // add to global blocked set
            this.blockedNodeIds.add(currentId);

            // traverse outgoing links
            const outgoing = this.state.links.filter(l => l.source === currentId);
            for (const l of outgoing) {
                const targetId = l.target;
                if (localVisited.has(targetId)) continue;
                // check if target has any incoming from outside blocked area
                const incomers = this.state.links.filter(il => il.target === targetId);
                const hasAlternative = incomers.some(il => !this.blockedNodeIds.has(il.source) && !localVisited.has(il.source));
                if (!hasAlternative) {
                    queue.push(targetId);
                }
            }
        }
    }

    async callNodeExecution(node, inputVariables = {}) {
        // call streaming endpoint to receive live stdout as events
        try {
            const callStartTime = Date.now();
            const controller = this.currentExecutionController || new AbortController();
            const response = await fetch('/api/execute-node-stream', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    node_id: node.id,
                    python_file: (node.pythonFile || '').replace(/\\/g,'/').replace(/^(?:nodes\/)*/i,''),
                    node_name: node.name,
                    function_args: inputVariables.functionArgs || {},
                    input_values: inputVariables.inputValues || {}
                }),
                signal: controller.signal
            });

            if (!response.ok) {
                throw new Error(`server error: ${response.status} ${response.statusText}`);
            }
            
            if (!response.body) {
                throw new Error('streaming not supported by server');
            }

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';
            let finalResult = null;
            let inResultBlock = false; // filter out embedded result payload from live feed

            const appendConsole = (rawLine) => {
                // filter out embedded result block markers and their contents
                let line = String(rawLine || '');
                if (line.includes('__RESULT_START__') && line.includes('__RESULT_END__')) {
                    line = line.replace(/__RESULT_START__[\s\S]*?__RESULT_END__/g, '');
                    inResultBlock = false;
                } else if (line.includes('__RESULT_START__')) {
                    // keep anything before the start marker, then enter skip mode
                    line = line.split('__RESULT_START__')[0];
                    inResultBlock = true;
                } else if (line.includes('__RESULT_END__')) {
                    // leave skip mode; keep anything after the end marker
                    line = line.split('__RESULT_END__')[1] || '';
                    inResultBlock = false;
                } else if (inResultBlock) {
                    // skip lines inside the result block
                    return;
                }
                // normalize whitespace to improve duplicate detection
                line = line.trim();
                if (!line) return;
                
                // add line to execution feed
                if (this.builder.executionFeed) {
                    this.builder.executionFeed.addLine(node, line);
                }
                
                // append live output to the sidebar console if this node is selected
                const selected = this.state.selectionHandler ? Array.from(this.state.selectionHandler.selectedNodes) : [];
                if (selected.length === 1 && selected[0] === node.id) {
                    const container = document.getElementById('console_output_log');
                    if (container) {
                        const current = container.textContent || '';
                        container.textContent = current ? (current + '\n' + line) : line;
                        container.scrollTop = container.scrollHeight;
                    }
                }
            };

            while (true) {
                const { value, done } = await reader.read();
                if (done) break;
                buffer += decoder.decode(value, { stream: true });

                // process sse-like chunks
                let idx;
                while ((idx = buffer.indexOf('\n\n')) !== -1) {
                    const chunk = buffer.slice(0, idx).trimEnd();
                    buffer = buffer.slice(idx + 2);
                    if (!chunk) continue;
                    const lines = chunk.split('\n');
                    let eventType = 'message';
                    let dataLines = [];
                    for (const l of lines) {
                        if (l.startsWith('event:')) {
                            eventType = l.slice(6).trim();
                        } else if (l.startsWith('data:')) {
                            dataLines.push(l.slice(5).trim());
                        }
                    }
                    const data = dataLines.join('\n');
                    if (eventType === 'stdout') {
                        appendConsole(data);
                    } else if (eventType === 'result') {
                        try {
                            finalResult = JSON.parse(data);
                        } catch (_) {
                            finalResult = { success: false, error: 'invalid result payload' };
                        }
                        // finalize the running feed item state
                        try {
                            const runningId = `run_feed_running_${node.id}`;
                            const item = document.getElementById(runningId);
                            if (item) {
                                item.classList.add(finalResult.success ? 'success' : 'error');
                                // keep id so we can reuse if the same node is run again in the same session; but we want to start a new group next time
                                // we will remove id right before creating a new running item for this node next time
                                const metaCol = item.children[2];
                                if (metaCol) {
                                    const finishedAt = new Date();
                                    const elapsedMs = Math.max(0, finishedAt.getTime() - callStartTime);
                                    const elapsedSec = (elapsedMs / 1000).toFixed(3);
                                    metaCol.textContent = `${finishedAt.toLocaleTimeString()}  ·  ${elapsedSec}s`;
                                }
                                // if failed, append error text lines to the live feed ui
                                // all comments in lower case
                                try {
                                    if (!finalResult.success && finalResult && (finalResult.error || finalResult.error_line)) {
                                        const outCol = item.children[1];
                                        if (outCol) {
                                            let errorDisplay = String(finalResult.error || '').trim();
                                            if (finalResult.error_line && finalResult.error_line > 0) {
                                                // prefix line number if not already present
                                                if (!/^\s*line\s+\d+\s*:/i.test(errorDisplay)) {
                                                    errorDisplay = `Line ${finalResult.error_line}: ${errorDisplay}`.trim();
                                                }
                                            }
                                            errorDisplay
                                                .split(/\r?\n/)
                                                .filter(Boolean)
                                                .forEach(tl => {
                                                    const lineDiv = document.createElement('div');
                                                    lineDiv.className = 'run_feed_line';
                                                    lineDiv.textContent = tl;
                                                    outCol.appendChild(lineDiv);
                                                });
                                            const list = document.getElementById('run_feed_list');
                                            if (list) list.scrollTop = list.scrollHeight;
                                        }
                                    }
                                } catch (_) {}
                            }
                        } catch (_) {}
                    }
                }
            }

            // ensure we have a result
            if (!finalResult) {
                finalResult = { success: false, error: 'no result received' };
            }
            return finalResult;
        } catch (error) {
            if (error.name === 'AbortError') {
                return { success: false, error: 'execution was cancelled by user' };
            }
            return { success: false, error: `network error: ${error.message}` };
        }
    }

    resetNodeStates() {
        // reset all nodes to default state using node state manager
        this.builder.nodeStateManager.clearAllNodeColorState();
    }

    // getter methods for external access to execution state
    getExecutionResults() {
        return this.nodeExecutionResults;
    }

    getNodeVariables() {
        return this.builder.variableManager.getNodeVariables();
    }

    getBlockedNodeIds() {
        return this.blockedNodeIds;
    }

    isCurrentlyExecuting() {
        return this.isExecuting;
    }

    isExecutionAborted() {
        return this.executionAborted;
    }

    // setter methods for external access to execution state
    setExecutionResults(results) {
        this.nodeExecutionResults = results;
    }

    setNodeVariables(variables) {
        this.builder.variableManager.setNodeVariables(variables);
    }

    setBlockedNodeIds(blockedIds) {
        this.blockedNodeIds = blockedIds;
    }

    setExecuting(value) {
        this.isExecuting = value;
    }

    setExecutionAborted(value) {
        this.executionAborted = value;
    }
}

window.ExecutionLogic = ExecutionLogic;
})();
