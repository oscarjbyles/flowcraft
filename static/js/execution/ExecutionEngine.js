// core execution engine for running flowchart nodes
(function() {
    'use strict';
    if (window.ExecutionEngine) { return; }

class ExecutionEngine extends EventEmitter {
    constructor(stateManager) {
        super();
        this.state = stateManager;
        this.currentController = null;
        this.isExecuting = false;
        this.executionAborted = false;
        this.executionStarting = false;
        this.blockedNodeIds = new Set();
        this.nodeExecutionResults = new Map();
        this.nodeVariables = new Map();
        this.executionFeed = [];
        this.restoredVariableState = null;
    }

    async startExecution(executionOrder) {
        if (executionOrder.length === 0) {
            this.emit('executionError', 'no connected nodes to execute');
            return false;
        }

        // create abort controller
        this.currentController = new AbortController();
        
        // set execution state
        this.isExecuting = true;
        this.executionAborted = false;
        this.executionStarting = false;
        
        // reset state
        this.resetExecutionState();
        
        this.emit('executionStarted', { nodeCount: executionOrder.length });

        try {
            // execute nodes sequentially
            for (let i = 0; i < executionOrder.length; i++) {
                if (this.executionAborted) {
                    this.emit('executionStopped', 'execution stopped by user');
                    await this.saveExecutionHistory('stopped', executionOrder, 'execution stopped by user');
                    return false;
                }

                const node = executionOrder[i];
                const success = await this.executeNode(node, i + 1, executionOrder.length);
                
                // persist data save nodes after successful python execution
                if (success && node.type === 'python_file') {
                    await this.persistDataSaveForNode(node);
                }
                
                this.emit('executionProgress', {
                    current: i + 1,
                    total: executionOrder.length,
                    node: node
                });

                if (!success) {
                    if (this.executionAborted) {
                        this.emit('executionStopped', 'execution stopped by user');
                        await this.saveExecutionHistory('stopped', executionOrder, 'execution stopped by user');
                    } else {
                        this.emit('executionFailed', {
                            node: node,
                            message: `execution stopped at node: ${node.name}`
                        });
                        await this.saveExecutionHistory('failed', executionOrder, `execution stopped at node: ${node.name}`);
                    }
                    return false;
                }
            }

            // all nodes completed successfully
            this.emit('executionCompleted', 'execution completed successfully');
            await this.saveExecutionHistory('success', executionOrder);
            return true;

        } catch (error) {
            this.emit('executionError', `execution failed: ${error.message}`);
            await this.saveExecutionHistory('error', executionOrder, error.message);
            return false;
        } finally {
            this.isExecuting = false;
            this.emit('executionFinished');
        }
    }

    async stopExecution() {
        if (!this.isExecuting) return;
        
        this.executionAborted = true;
        
        // abort current request
        if (this.currentController) {
            this.currentController.abort();
        }
        
        // terminate python processes
        try {
            await fetch('/api/stop-execution', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            });
        } catch (error) {
            // silently fail
        }
        
        this.isExecuting = false;
        this.currentController = null;
        this.emit('executionStopped', 'execution stopped by user');
    }

    async executeNode(node, currentIndex, totalNodes) {
        // skip if nodes
        if (node.type === 'if_node') {
            return await this.executeIfNode(node);
        }
        
        // skip blocked nodes
        if (this.blockedNodeIds.has(node.id)) {
            this.emit('nodeSkipped', { node, reason: 'blocked by condition' });
            return true;
        }
        
        // skip input nodes
        if (node.type === 'input_node') {
            this.emit('nodeSkipped', { node, reason: 'input node' });
            return true;
        }
        
        // skip data save nodes
        if (node.type === 'data_save') {
            this.emit('nodeSkipped', { node, reason: 'data save node' });
            return true;
        }
        
        // execute python nodes
        if (node.type === 'python_file') {
            return await this.executePythonNode(node, currentIndex, totalNodes);
        }
        
        return true;
    }

    async executePythonNode(node, currentIndex, totalNodes) {
        const startTime = Date.now();
        
        this.emit('nodeExecutionStarted', {
            node,
            currentIndex,
            totalNodes,
            timestamp: new Date().toISOString()
        });

        try {
            // gather input values
            const inputValues = await this.gatherInputValues(node);
            
            // prepare execution request
            const requestBody = {
                python_file: node.pythonFile,
                arguments: inputValues,
                node_id: node.id,
                upstream_variables: this.gatherUpstreamVariables(node)
            };
            
            // execute python file
            const response = await fetch('/api/execute-python', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(requestBody),
                signal: this.currentController.signal
            });
            
            const result = await response.json();
            const executionTime = Date.now() - startTime;
            
            if (result.success) {
                // store results
                this.nodeExecutionResults.set(node.id, result);
                if (result.variables) {
                    this.nodeVariables.set(node.id, result.variables);
                }
                
                // add to execution feed
                this.addToExecutionFeed({
                    node_id: node.id,
                    node_name: node.name,
                    started_at: new Date(startTime).toISOString(),
                    finished_at: new Date().toISOString(),
                    success: true,
                    lines: result.output ? result.output.split('\n').map(text => ({
                        text,
                        ts: new Date().toISOString()
                    })) : []
                });
                
                this.emit('nodeExecutionCompleted', {
                    node,
                    result,
                    executionTime,
                    currentIndex,
                    totalNodes
                });
                
                return true;
            } else {
                this.emit('nodeExecutionFailed', {
                    node,
                    error: result.error || 'unknown error',
                    executionTime
                });
                return false;
            }
        } catch (error) {
            if (error.name === 'AbortError') {
                this.emit('nodeExecutionAborted', { node });
                return false;
            }
            
            this.emit('nodeExecutionError', {
                node,
                error: error.message,
                executionTime: Date.now() - startTime
            });
            return false;
        }
    }

    async executeIfNode(node) {
        // evaluate conditions from incoming links
        const incomingLinks = this.state.linkManager.getIncomingLinks(node.id);
        let conditionMet = false;
        
        for (const link of incomingLinks) {
            const sourceNode = this.state.getNode(link.source);
            if (!sourceNode || sourceNode.type !== 'python_file') continue;
            
            const conditions = link.conditions || [];
            if (conditions.length === 0) continue;
            
            const variables = this.nodeVariables.get(sourceNode.id) || {};
            const result = this.evaluateConditions(conditions, variables);
            
            if (result) {
                conditionMet = true;
                break;
            }
        }
        
        // block downstream nodes if condition not met
        if (!conditionMet) {
            const outgoingLinks = this.state.linkManager.getOutgoingLinks(node.id);
            outgoingLinks.forEach(link => {
                const targetNode = this.state.getNode(link.target);
                if (targetNode && targetNode.type === 'python_file') {
                    this.blockedNodeIds.add(targetNode.id);
                    this.state.updateLink(link.source, link.target, {
                        runtime_condition: false,
                        runtime_details: 'blocked by condition'
                    });
                }
            });
        } else {
            // mark true branches
            const outgoingLinks = this.state.linkManager.getOutgoingLinks(node.id);
            outgoingLinks.forEach(link => {
                this.state.updateLink(link.source, link.target, {
                    runtime_condition: true,
                    runtime_details: 'condition met'
                });
            });
        }
        
        this.emit('ifNodeEvaluated', {
            node,
            conditionMet,
            blockedNodes: Array.from(this.blockedNodeIds)
        });
        
        return true;
    }

    evaluateConditions(conditions, variables) {
        if (!conditions || conditions.length === 0) return false;
        
        const combiner = conditions[0].combiner || 'and';
        const results = conditions.map(condition => {
            const value = variables[condition.variable];
            return this.evaluateSingleCondition(value, condition.operator, condition.value);
        });
        
        if (combiner === 'and') {
            return results.every(r => r);
        } else {
            return results.some(r => r);
        }
    }

    evaluateSingleCondition(value, operator, compareValue) {
        // convert values for comparison
        const numValue = parseFloat(value);
        const numCompare = parseFloat(compareValue);
        
        switch (operator) {
            case '==': return value == compareValue;
            case '!=': return value != compareValue;
            case '>': return numValue > numCompare;
            case '>=': return numValue >= numCompare;
            case '<': return numValue < numCompare;
            case '<=': return numValue <= numCompare;
            case 'contains': return String(value).includes(String(compareValue));
            case 'not contains': return !String(value).includes(String(compareValue));
            case 'is true': return value === true || value === 'true' || value === 1;
            case 'is false': return value === false || value === 'false' || value === 0;
            case 'is empty': return !value || value === '' || value === null;
            case 'is not empty': return value && value !== '' && value !== null;
            default: return false;
        }
    }

    async gatherInputValues(node) {
        const inputValues = {};
        
        // find connected input node
        const inputNodes = this.state.nodes.filter(n => 
            n.type === 'input_node' && n.targetNodeId === node.id
        );
        
        if (inputNodes.length > 0) {
            const inputNode = inputNodes[0];
            Object.assign(inputValues, inputNode.inputValues || {});
        }
        
        return inputValues;
    }

    gatherUpstreamVariables(node) {
        const upstreamVars = {};
        const incomingLinks = this.state.linkManager.getIncomingLinks(node.id);
        
        incomingLinks.forEach(link => {
            const sourceNode = this.state.getNode(link.source);
            if (sourceNode && this.nodeVariables.has(sourceNode.id)) {
                const vars = this.nodeVariables.get(sourceNode.id);
                Object.assign(upstreamVars, vars);
            }
        });
        
        return upstreamVars;
    }

    async persistDataSaveForNode(pythonNode) {
        const outgoingLinks = this.state.linkManager.getOutgoingLinks(pythonNode.id);
        const dataSaveNodes = outgoingLinks
            .map(link => this.state.getNode(link.target))
            .filter(n => n && n.type === 'data_save');
        
        for (const dataSaveNode of dataSaveNodes) {
            const variableName = dataSaveNode.variableName;
            if (!variableName) continue;
            
            const variables = this.nodeVariables.get(pythonNode.id) || {};
            const value = variables[variableName];
            
            if (value !== undefined) {
                dataSaveNode.runtimeStatus = {
                    variableValue: value,
                    variableType: typeof value,
                    savedAt: new Date().toISOString()
                };
                
                this.emit('dataSavePersisted', {
                    node: dataSaveNode,
                    variableName,
                    value
                });
            }
        }
    }

    resetExecutionState() {
        this.nodeExecutionResults.clear();
        this.nodeVariables.clear();
        this.executionFeed = [];
        this.blockedNodeIds.clear();
        this.restoredVariableState = null;
        
        // clear runtime indicators on links
        this.state.links.forEach(link => {
            const sourceNode = this.state.getNode(link.source);
            const targetNode = this.state.getNode(link.target);
            if (sourceNode && targetNode && sourceNode.type === 'if_node' && targetNode.type === 'python_file') {
                this.state.updateLink(link.source, link.target, {
                    runtime_condition: null,
                    runtime_details: null
                });
            }
        });
    }

    addToExecutionFeed(entry) {
        this.executionFeed.push(entry);
        this.emit('executionFeedUpdated', entry);
    }

    async saveExecutionHistory(status, executionOrder, errorMessage = null) {
        try {
            const historyData = {
                timestamp: new Date().toISOString(),
                status,
                execution_order: executionOrder.map(n => ({
                    id: n.id,
                    name: n.name,
                    type: n.type
                })),
                error_message: errorMessage,
                execution_feed: this.executionFeed,
                node_variables: Array.from(this.nodeVariables.entries()).map(([nodeId, vars]) => ({
                    node_id: nodeId,
                    variables: vars
                }))
            };
            
            await fetch('/api/execution-history', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(historyData)
            });
        } catch (error) {
            // silently fail - history is optional
        }
    }

    getExecutionResults() {
        return {
            results: Array.from(this.nodeExecutionResults.entries()),
            variables: Array.from(this.nodeVariables.entries()),
            feed: this.executionFeed,
            blockedNodes: Array.from(this.blockedNodeIds)
        };
    }
}

window.ExecutionEngine = ExecutionEngine;
})();
