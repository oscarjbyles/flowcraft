// execution orchestrator - coordinates execution flow and ui
(function() {
    'use strict';
    if (window.ExecutionOrchestrator) { return; }

class ExecutionOrchestrator extends EventEmitter {
    constructor(stateManager, executionEngine) {
        super();
        this.state = stateManager;
        this.engine = executionEngine;
        this.isAutoTrackEnabled = false;
        this.userDisabledTracking = false;
        this.lastExecutionStatus = 'idle';
        this.lastFailedNode = null;
        
        this.setupEngineListeners();
    }

    setupEngineListeners() {
        // forward engine events
        this.engine.on('executionStarted', (data) => {
            this.lastExecutionStatus = 'running';
            this.lastFailedNode = null;
            this.emit('executionStarted', data);
        });
        
        this.engine.on('executionCompleted', (message) => {
            this.lastExecutionStatus = 'completed';
            this.emit('executionCompleted', message);
        });
        
        this.engine.on('executionFailed', (data) => {
            this.lastExecutionStatus = 'failed';
            this.lastFailedNode = data.node;
            this.emit('executionFailed', data);
        });
        
        this.engine.on('executionStopped', (message) => {
            this.lastExecutionStatus = 'stopped';
            this.emit('executionStopped', message);
        });
        
        this.engine.on('executionError', (message) => {
            this.lastExecutionStatus = 'error';
            this.emit('executionError', message);
        });
        
        this.engine.on('nodeExecutionStarted', (data) => {
            this.updateNodeState(data.node, 'running');
            if (this.isAutoTrackEnabled && !this.userDisabledTracking) {
                this.emit('trackNode', data.node);
            }
            this.emit('nodeExecutionStarted', data);
        });
        
        this.engine.on('nodeExecutionCompleted', (data) => {
            this.updateNodeState(data.node, 'success');
            this.emit('nodeExecutionCompleted', data);
        });
        
        this.engine.on('nodeExecutionFailed', (data) => {
            this.updateNodeState(data.node, 'error');
            this.emit('nodeExecutionFailed', data);
        });
        
        this.engine.on('nodeSkipped', (data) => {
            this.emit('nodeSkipped', data);
        });
        
        this.engine.on('executionProgress', (data) => {
            this.emit('executionProgress', data);
        });
        
        this.engine.on('executionFeedUpdated', (entry) => {
            this.emit('executionFeedUpdated', entry);
        });
    }

    async startExecution() {
        // clear selections
        this.state.clearSelection();
        
        // calculate execution order
        const executionOrder = this.calculateNodeOrder();
        
        if (executionOrder.length === 0) {
            this.emit('executionError', 'no connected nodes to execute');
            return false;
        }
        
        // reset node states
        this.resetNodeStates();
        
        // start execution
        return await this.engine.startExecution(executionOrder);
    }

    async stopExecution() {
        await this.engine.stopExecution();
    }

    calculateNodeOrder() {
        const visited = new Set();
        const order = [];
        const nodes = this.state.nodes;
        
        // find root nodes (no incoming connections)
        const rootNodes = nodes.filter(node => {
            if (node.type === 'input_node' || node.type === 'data_save') return false;
            const incomingLinks = this.state.linkManager.getIncomingLinks(node.id);
            return incomingLinks.filter(link => {
                const sourceNode = this.state.getNode(link.source);
                return sourceNode && sourceNode.type !== 'input_node';
            }).length === 0;
        });
        
        // depth-first traversal from each root
        const visit = (node) => {
            if (visited.has(node.id)) return;
            visited.add(node.id);
            
            // visit dependencies first
            const incomingLinks = this.state.linkManager.getIncomingLinks(node.id);
            incomingLinks.forEach(link => {
                const sourceNode = this.state.getNode(link.source);
                if (sourceNode && sourceNode.type !== 'input_node' && sourceNode.type !== 'data_save') {
                    visit(sourceNode);
                }
            });
            
            // add node to order
            if (node.type !== 'input_node' && node.type !== 'data_save') {
                order.push(node);
            }
        };
        
        // start traversal from root nodes
        rootNodes.forEach(visit);
        
        // handle disconnected components
        nodes.forEach(node => {
            if (!visited.has(node.id) && node.type !== 'input_node' && node.type !== 'data_save') {
                visit(node);
            }
        });
        
        return order;
    }

    resetNodeStates() {
        this.state.nodes.forEach(node => {
            this.updateNodeState(node, 'idle');
            if (node.type === 'data_save') {
                delete node.runtimeStatus;
            }
        });
        this.emit('nodeStatesReset');
    }

    updateNodeState(node, state) {
        node.executionState = state;
        this.emit('nodeStateUpdated', { node, state });
    }

    clearAllNodeColorState() {
        this.state.nodes.forEach(node => {
            delete node.executionState;
            delete node.runtimeStatus;
        });
        this.emit('nodeStatesCleared');
    }

    async handleResumeExecution(data) {
        const { nodeId, variableState } = data;
        const node = this.state.getNode(nodeId);
        
        if (!node) {
            this.emit('executionError', 'node not found for resume');
            return;
        }
        
        // restore variable state
        if (variableState) {
            this.engine.restoredVariableState = variableState;
            variableState.forEach(({ node_id, variables }) => {
                this.engine.nodeVariables.set(node_id, variables);
            });
        }
        
        // calculate remaining execution order
        const fullOrder = this.calculateNodeOrder();
        const nodeIndex = fullOrder.findIndex(n => n.id === nodeId);
        
        if (nodeIndex === -1) {
            this.emit('executionError', 'node not in execution order');
            return;
        }
        
        const remainingOrder = fullOrder.slice(nodeIndex);
        
        // reset states for remaining nodes
        remainingOrder.forEach(n => this.updateNodeState(n, 'idle'));
        
        // execute remaining nodes
        await this.engine.startExecution(remainingOrder);
    }

    setAutoTrack(enabled) {
        this.isAutoTrackEnabled = enabled;
        if (enabled) {
            this.userDisabledTracking = false;
        }
        this.emit('autoTrackChanged', enabled);
    }

    disableAutoTrack() {
        this.userDisabledTracking = true;
        this.emit('autoTrackDisabled');
    }

    getExecutionStatus() {
        return {
            isExecuting: this.engine.isExecuting,
            lastStatus: this.lastExecutionStatus,
            lastFailedNode: this.lastFailedNode,
            results: this.engine.getExecutionResults()
        };
    }

    clearExecutionResults() {
        this.engine.resetExecutionState();
        this.resetNodeStates();
        this.lastExecutionStatus = 'idle';
        this.lastFailedNode = null;
        this.emit('executionCleared');
    }
}

window.ExecutionOrchestrator = ExecutionOrchestrator;
})();
