// execution status module - manage execution status display and history management
(function(){
    'use strict';
    if (window.ExecutionStatus) { return; }

class ExecutionStatus {
    constructor(app) {
        this.builder = app;
        this.state = app.state;
        
        // execution status tracking
        this.executionStartTimestamp = null;
        this.lastExecutionElapsedMs = null;
        this.lastExecutionTimestampString = '';
        this.lastExecutionStatus = 'idle';
        this._elapsedTimer = null;
    }

    // execution status management
    updateExecutionStatus(type, message) {
        const statusElement = document.getElementById('execution_status_text');
        const iconElement = document.querySelector('#execution_status .material-icons');
        const timeRow = document.getElementById('execution_time_row');
        const timeText = document.getElementById('execution_time_text');
        const timestampEl = document.getElementById('execution_timestamp');
        const progressText = document.getElementById('execution_progress_text');
        const failureInfo = document.getElementById('execution_failure_info');
        
        // when a single node is selected in run mode, the sidebar shows node-specific status.
        // avoid overwriting that with global status updates.
        let isSingleNodeSelected = false;
        try {
            const selected = Array.from(this.state.selectedNodes || []);
            isSingleNodeSelected = (selected.length === 1);
        } catch(_) { isSingleNodeSelected = false; }
        
        // compute display message for global (no-selection) view
        let displayMessage = message;
        if (!isSingleNodeSelected) {
            switch (type) {
                case 'completed':
                    displayMessage = 'flowchart executed successfully';
                    break;
                case 'stopped':
                    displayMessage = 'script was stopped by user';
                    break;
                case 'error':
                case 'failed':
                    displayMessage = 'execution faced an error';
                    break;
                default:
                    // keep provided message for non-terminal states like running/idle
                    break;
            }
        }

        if (!isSingleNodeSelected && statusElement) statusElement.textContent = displayMessage;
        
        // update icon based on status type
        switch (type) {
            case 'running':
                if (!isSingleNodeSelected && iconElement) {
                    iconElement.textContent = 'play_arrow';
                    iconElement.style.color = '#2196f3';
                }
                // show elapsed timer
                if (!this.executionStartTimestamp) {
                    this.executionStartTimestamp = Date.now();
                }
                // clear last execution snapshot when starting a new run
                this.lastExecutionElapsedMs = null;
                this.lastExecutionTimestampString = '';
                if (!isSingleNodeSelected && timeRow) timeRow.style.display = 'flex';
                if (!isSingleNodeSelected && failureInfo) failureInfo.style.display = 'none';
                if (this._elapsedTimer) clearInterval(this._elapsedTimer);
                this._elapsedTimer = setInterval(() => {
                    const elapsed = Date.now() - this.executionStartTimestamp;
                    if (!isSingleNodeSelected && timeText) {
                        const seconds = (elapsed / 1000).toFixed(3);
                        timeText.textContent = `${seconds}s`;
                    }
                }, 100);
                this.lastExecutionStatus = 'running';
                break;
            case 'completed':
                if (!isSingleNodeSelected && iconElement) {
                    iconElement.textContent = 'check_circle';
                    iconElement.style.color = '#4caf50';
                }
                if (this._elapsedTimer) clearInterval(this._elapsedTimer);
                {
                    const elapsed = this.executionStartTimestamp
                        ? (Date.now() - this.executionStartTimestamp)
                        : (typeof this.lastExecutionElapsedMs === 'number' ? this.lastExecutionElapsedMs : 0);
                    this.lastExecutionElapsedMs = elapsed;
                    if (!isSingleNodeSelected && timeText) {
                        const seconds = (elapsed / 1000).toFixed(3);
                        timeText.textContent = `${seconds}s`;
                    }
                    if (!isSingleNodeSelected && timestampEl) {
                        // use restored snapshot if available; otherwise current time
                        let ts = this.lastExecutionTimestampString;
                        if (!ts) {
                            const now = new Date();
                            const hh = String(now.getHours()).padStart(2, '0');
                            const mm = String(now.getMinutes()).padStart(2, '0');
                            const ss = String(now.getSeconds()).padStart(2, '0');
                            ts = `${hh}:${mm}:${ss}`;
                        }
                        timestampEl.textContent = ts;
                        this.lastExecutionTimestampString = ts;
                    }
                }
                if (!isSingleNodeSelected && timeRow) timeRow.style.display = 'flex';
                if (!isSingleNodeSelected && failureInfo) failureInfo.style.display = 'none';
                this.executionStartTimestamp = null;
                this.lastExecutionStatus = 'completed';
                break;
            case 'error':
                if (!isSingleNodeSelected && iconElement) {
                    iconElement.textContent = 'error';
                    iconElement.style.color = '#f44336';
                }
                if (this._elapsedTimer) clearInterval(this._elapsedTimer);
                {
                    const elapsed = this.executionStartTimestamp
                        ? (Date.now() - this.executionStartTimestamp)
                        : (typeof this.lastExecutionElapsedMs === 'number' ? this.lastExecutionElapsedMs : 0);
                    this.lastExecutionElapsedMs = elapsed;
                    if (!isSingleNodeSelected && timeText) {
                        const seconds = (elapsed / 1000).toFixed(3);
                        timeText.textContent = `${seconds}s`;
                    }
                    if (!isSingleNodeSelected && timestampEl) {
                        let ts = this.lastExecutionTimestampString;
                        if (!ts) {
                            const now = new Date();
                            const hh = String(now.getHours()).padStart(2, '0');
                            const mm = String(now.getMinutes()).padStart(2, '0');
                            const ss = String(now.getSeconds()).padStart(2, '0');
                            ts = `${hh}:${mm}:${ss}`;
                        }
                        timestampEl.textContent = ts;
                        this.lastExecutionTimestampString = ts;
                    }
                }
                if (!isSingleNodeSelected && timeRow) timeRow.style.display = 'flex';
                if (!isSingleNodeSelected && failureInfo) failureInfo.style.display = 'none';
                this.executionStartTimestamp = null;
                this.lastExecutionStatus = 'error';
                break;
            case 'stopped':
                if (!isSingleNodeSelected && iconElement) {
                    iconElement.textContent = 'stop';
                    iconElement.style.color = '#ff9800';
                }
                if (this._elapsedTimer) clearInterval(this._elapsedTimer);
                {
                    const elapsed = this.executionStartTimestamp
                        ? (Date.now() - this.executionStartTimestamp)
                        : (typeof this.lastExecutionElapsedMs === 'number' ? this.lastExecutionElapsedMs : 0);
                    this.lastExecutionElapsedMs = elapsed;
                    if (!isSingleNodeSelected && timeText) {
                        const seconds = (elapsed / 1000).toFixed(3);
                        timeText.textContent = `${seconds}s`;
                    }
                    if (!isSingleNodeSelected && timestampEl) {
                        let ts = this.lastExecutionTimestampString;
                        if (!ts) {
                            const now = new Date();
                            const hh = String(now.getHours()).padStart(2, '0');
                            const mm = String(now.getMinutes()).padStart(2, '0');
                            const ss = String(now.getSeconds()).padStart(2, '0');
                            ts = `${hh}:${mm}:${ss}`;
                        }
                        timestampEl.textContent = ts;
                        this.lastExecutionTimestampString = ts;
                    }
                }
                if (!isSingleNodeSelected && timeRow) timeRow.style.display = 'flex';
                if (!isSingleNodeSelected && failureInfo) failureInfo.style.display = 'none';
                this.executionStartTimestamp = null;
                this.lastExecutionStatus = 'stopped';
                break;
            case 'failed':
                if (!isSingleNodeSelected && iconElement) {
                    iconElement.textContent = 'error';
                    iconElement.style.color = '#f44336';
                }
                if (this._elapsedTimer) clearInterval(this._elapsedTimer);
                {
                    const elapsed = this.executionStartTimestamp
                        ? (Date.now() - this.executionStartTimestamp)
                        : (typeof this.lastExecutionElapsedMs === 'number' ? this.lastExecutionElapsedMs : 0);
                    this.lastExecutionElapsedMs = elapsed;
                    if (!isSingleNodeSelected && timeText) {
                        const seconds = (elapsed / 1000).toFixed(3);
                        timeText.textContent = `${seconds}s`;
                    }
                    if (!isSingleNodeSelected && timestampEl) {
                        let ts = this.lastExecutionTimestampString;
                        if (!ts) {
                            const now = new Date();
                            const hh = String(now.getHours()).padStart(2, '0');
                            const mm = String(now.getMinutes()).padStart(2, '0');
                            const ss = String(now.getSeconds()).padStart(2, '0');
                            ts = `${hh}:${mm}:${ss}`;
                        }
                        timestampEl.textContent = ts;
                        this.lastExecutionTimestampString = ts;
                    }
                }
                if (!isSingleNodeSelected && timeRow) timeRow.style.display = 'flex';
                this.executionStartTimestamp = null;
                this.lastExecutionStatus = 'failed';
                break;
            default:
                if (!isSingleNodeSelected && iconElement) {
                    iconElement.textContent = 'info';
                    iconElement.style.color = 'var(--on-surface)';
                }
                if (this._elapsedTimer) clearInterval(this._elapsedTimer);
                // keep last visible time; do not hide the row here
                // default resets failure info visibility
                if (!isSingleNodeSelected && failureInfo) failureInfo.style.display = 'none';
                this.lastExecutionStatus = 'idle';
        }

        // update global progress when status updates
        if (progressText) {
            const order = this.builder.calculateNodeOrder ? this.builder.calculateNodeOrder() : [];
            const total = order.length;
            // only count executed nodes that are part of the execution order (exclude data_save etc.)
            const executed = this.builder.nodeExecutionResults
                ? Array.from(this.builder.nodeExecutionResults.keys()).filter(id => order.some(n => n.id === id)).length
                : 0;
            progressText.textContent = `${executed} of ${total}`;
        }

        // also update the main status bar for important execution messages
        if (type === 'error' || type === 'failed' || type === 'completed') {
            if (this.builder.statusBar) {
                this.builder.statusBar.updateStatus(type, message, { autoClear: false });
            }
        }
    }

    updateNodeDetails(node, state, runtime, output = '') {
        // in run mode, the sidebar handles node details display
        // this method is kept for compatibility but doesn't update the UI directly
        // the sidebar will be updated through the normal selection change events
        
        // trigger sidebar update if this node is currently selected
        const selectedNodes = Array.from(this.state.selectedNodes);
        if (selectedNodes.length === 1 && selectedNodes[0] === node.id) {
            this.state.emit('updateSidebar');
        }
    }

    // history management
    async saveExecutionHistory(status, executionOrder, errorMessage = null) {
        try {
            // prepare execution results
            const results = [];
            
            // convert node execution results to array format
            for (const node of executionOrder) {
                const result = this.builder.nodeExecutionResults.get(node.id);
                if (result) {
                    results.push({
                        node_id: node.id,
                        node_name: node.name,
                        python_file: (node.pythonFile || '').replace(/\\/g,'/').replace(/^(?:nodes\/)*/i,''),
                        success: result.success,
                        output: result.output,
                        error: result.error,
                        runtime: result.runtime,
                        timestamp: result.timestamp,
                        return_value: result.return_value,
                        function_name: result.function_name,
                        input_args: result.input_args
                    });
                }
            }

            // also include synthesized results for data_save nodes (not part of executionOrder)
            const dataSaveNodes = this.state.nodes.filter(n => n.type === 'data_save');
            for (const ds of dataSaveNodes) {
                const dsResult = this.builder.nodeExecutionResults.get(ds.id);
                if (!dsResult) continue;
                results.push({
                    node_id: ds.id,
                    node_name: ds.name,
                    python_file: (dsResult.python_file || '').replace(/\\/g,'/').replace(/^(?:nodes\/)*/i,''),
                    success: dsResult.success,
                    output: dsResult.output,
                    error: dsResult.error,
                    runtime: dsResult.runtime,
                    timestamp: dsResult.timestamp,
                    return_value: dsResult.return_value,
                    function_name: dsResult.function_name || 'data_save',
                    input_args: dsResult.input_args,
                    // carry metadata to help ui show the python variable name
                    data_save: dsResult.data_save || {
                        data_name: (ds && ds.dataSource && ds.dataSource.variable && ds.dataSource.variable.name) || (ds && ds.name) || 'data',
                        variable_name: (ds && ds.dataSource && ds.dataSource.variable && ds.dataSource.variable.name) || null
                    }
                });
            }

            // build a normalized data_saves array for easy consumption in the data matrix
            const dataSaves = [];
            const dataSaveNodesForMatrix = this.state.nodes.filter(n => n.type === 'data_save');
            for (const ds of dataSaveNodesForMatrix) {
                const dsResult = this.builder.nodeExecutionResults.get(ds.id);
                if (!dsResult || !dsResult.return_value || typeof dsResult.return_value !== 'object') continue;
                const keys = Object.keys(dsResult.return_value);
                if (keys.length === 0) continue;
                const varName = (dsResult.data_save && dsResult.data_save.variable_name) || keys[0];
                const value = dsResult.return_value[varName] ?? dsResult.return_value[keys[0]];
                const typeOf = (val) => {
                    if (val === null) return 'null';
                    if (Array.isArray(val)) return 'array';
                    if (typeof val === 'number') return Number.isInteger(val) ? 'integer' : 'float';
                    if (typeof val === 'object') return 'object';
                    if (typeof val === 'string') return 'string';
                    if (typeof val === 'boolean') return 'boolean';
                    return typeof val;
                };
                dataSaves.push({
                    node_name: ds.name || 'data save',
                    variable_name: varName || keys[0],
                    variable_content: [ typeOf(value), value ]
                });
            }
            
            // sanitize feed to ensure no duplicate entries or line texts per node before saving history
            const sanitizedFeed = [];

            // build variable state for resume functionality
            const variableState = {};
            // collect variables from all executed nodes in order
            for (const node of executionOrder) {
                const result = this.builder.nodeExecutionResults.get(node.id);
                if (result && result.success && result.return_value) {
                    if (typeof result.return_value === 'object' && result.return_value !== null) {
                        Object.assign(variableState, result.return_value);
                    } else {
                        // use node name as variable name for simple values
                        const varName = node.name.toLowerCase().replace(/[^a-zA-Z0-9]/g, '_');
                        variableState[varName] = result.return_value;
                    }
                }
            }

            const executionData = {
                status: status,
                execution_order: executionOrder.map(node => node.id),
                results: results,
                data_saves: dataSaves,
                feed: sanitizedFeed,
                // exclude data_save nodes from counts by only considering the computed execution order
                total_nodes: executionOrder.length,
                successful_nodes: results.filter(r => r.success && executionOrder.some(node => node.id === r.node_id)).length,
                error_message: errorMessage,
                variable_state: variableState, // add variable state for resume functionality
                flowchart_state: {
                    nodes: this.state.nodes.map(node => {
                        // base properties for all nodes
                        const baseNode = {
                            id: node.id,
                            name: node.name,
                            x: node.x,
                            y: node.y,
                            pythonFile: node.pythonFile,
                            description: node.description,
                            type: node.type,
                            width: node.width,
                            groupId: node.groupId
                        };
                        
                        // add type-specific properties
                        if (node.type === 'input_node') {
                            // include all input node specific properties
                            return {
                                ...baseNode,
                                parameters: node.parameters,
                                targetNodeId: node.targetNodeId,
                                inputValues: node.inputValues,
                                skipInputCheck: node.skipInputCheck
                            };
                        } else if (node.type === 'data_save') {
                            // include data_save specific fields to support data matrix table
                            return {
                                ...baseNode,
                                dataSource: node.dataSource
                            };
                        } else {
                            // for other node types, include any additional properties they might have
                            return {
                                ...baseNode,
                                // include any other properties that might be needed
                                ...(node.magnet_partner_id && { magnet_partner_id: node.magnet_partner_id })
                            };
                        }
                    }),
                    links: this.state.links,
                    groups: this.state.groups
                }
            };
            
            const response = await fetch('/api/save-execution', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    flowchart_name: this.builder.getCurrentFlowchartName(),
                    execution_data: executionData
                })
            });
            
            const result = await response.json();
            
            if (result.status === 'success') {
        
            } else {
                console.error('failed to save execution history:', result.message);
            }
            
        } catch (error) {
            console.error('error saving execution history:', error);
        }
    }

    async viewExecutionHistory(executionId) {
        try {
            const response = await fetch(`/api/history/${executionId}?flowchart_name=${encodeURIComponent(this.builder.getCurrentFlowchartName())}`);
            const result = await response.json();
            
            if (result.status === 'success') {
                const executionData = result.execution.execution_data;
                
                // switch to run mode first (before restoring state to avoid clearing restored runtime indicators)
                this.builder.switchToRunMode(false);
                
                // restore flowchart state
                this.restoreFlowchartFromHistory(executionData);
                
                // show execution results in sidebar
                this.displayHistoryExecutionResults(executionData);
                
            } else {
                alert('failed to load execution details: ' + result.message);
            }
            
        } catch (error) {
            console.error('error viewing execution history:', error);
            alert('error loading execution details');
        }
    }

    async deleteExecutionHistory(executionId) {
        if (!confirm('are you sure you want to delete this execution history?')) {
            return;
        }
        
        try {
            const response = await fetch(`/api/history/${executionId}?flowchart_name=${encodeURIComponent(this.builder.getCurrentFlowchartName())}`, {
                method: 'DELETE'
            });
            
            const result = await response.json();
            
            if (result.status === 'success') {
                // no-op: history panel removed; data matrix will reflect deletion on refresh
            } else {
                alert('failed to delete execution: ' + result.message);
            }
            
        } catch (error) {
            console.error('error deleting execution history:', error);
            alert('error deleting execution');
        }
    }

    restoreFlowchartFromHistory(executionData) {
        // set restoration flag to prevent input node recreation
        this.state.isRestoringFromHistory = true;
        
        // clear current node execution results and variables
        this.builder.nodeExecutionResults.clear();
        this.builder.variableManager.clearVariables();
        
        // restore flowchart state from saved execution data if available
        if (executionData.flowchart_state) {
            try {
                // restore nodes, links, and groups from the saved state
                if (Array.isArray(executionData.flowchart_state.nodes)) {
                    this.state.nodes = executionData.flowchart_state.nodes;
                }
                if (Array.isArray(executionData.flowchart_state.links)) {
                    this.state.links = executionData.flowchart_state.links;
                }
                if (Array.isArray(executionData.flowchart_state.groups)) {
                    this.state.groups = executionData.flowchart_state.groups;
                }
                
                // ensure input nodes are properly handled after restoration
                // mark all existing input nodes to prevent duplicate creation
                this.state.nodes.forEach(node => {
                    if (node.type === 'input_node') {
                        // ensure all required properties are present
                        node.skipInputCheck = true; // prevent this input node from being recreated
                        node.inputValues = node.inputValues || {}; // ensure inputValues exists
                        node.parameters = node.parameters || []; // ensure parameters exists
                        
                        // validate that the target node exists
                        if (node.targetNodeId) {
                            const targetNode = this.state.nodes.find(n => n.id === node.targetNodeId);
                            if (!targetNode) {
                                console.warn(`input node ${node.id} has invalid targetNodeId: ${node.targetNodeId}`);
                            }
                        }
                    }
                });
                
                // trigger state change to update the ui
                this.state.emit('stateChanged');
                
                // explicitly update link renderer to show restored if condition states
                // add a small delay to ensure link paths are fully rendered before positioning circles
                setTimeout(() => {
                    // ensure link renderer is fully updated first
                    this.builder.linkRenderer.render();
                    // then render if condition circles
                    this.builder.linkRenderer.renderIfToPythonNodes();
                }, 50);
                
                // update sidebar content to reflect restored state
                this.state.emit('updateSidebar');
            } catch (error) {
                console.warn('error restoring flowchart state from history:', error);
            }
        }
        
        // restore node states from execution results
        executionData.results.forEach(result => {
            // set node execution result
            const node = this.state.getNode(result.node_id);
            if (node) {
                this.builder.nodeExecutionResults.set(result.node_id, {
                    node: node,
                    success: result.success,
                    output: result.output || '',
                    error: result.error || null,
                    runtime: result.runtime || 0,
                    timestamp: result.timestamp || 'unknown',
                    return_value: result.return_value,
                    function_name: result.function_name,
                    input_args: result.input_args
                });
                
                // restore variables if any
                if (result.success && result.return_value !== null && result.return_value !== undefined) {
                    this.builder.variableManager.setNodeVariable(result.node_id, result.return_value);
                }
                
                // set visual node state
                if (result.success) {
                    this.builder.nodeStateManager.setNodeState(result.node_id, 'completed');
                } else {
                    this.builder.nodeStateManager.setNodeState(result.node_id, 'error');
                }
            }
        });

        // restore global variable state if available (for resume functionality)
        if (executionData.variable_state && typeof executionData.variable_state === 'object') {
            try {
                // store the global variable state for resume operations
                this.builder.variableManager.setRestoredVariableState(executionData.variable_state);
            } catch (_) {}
        }
        
        // restore visual state for input nodes based on their target node's execution state
        this.state.nodes.forEach(node => {
            if (node.type === 'input_node' && node.targetNodeId) {
                const targetNode = this.state.getNode(node.targetNodeId);
                if (targetNode) {
                    const targetResult = this.builder.nodeExecutionResults.get(node.targetNodeId);
                    if (targetResult) {
                        // set input node visual state to match its target node
                        if (targetResult.success) {
                            this.builder.nodeStateManager.setNodeState(node.id, 'completed');
                        } else {
                            this.builder.nodeStateManager.setNodeState(node.id, 'error');
                        }
                    }
                }
            }
        });
        
        // clear restoration flag after a short delay to allow UI updates to complete
        setTimeout(() => {
            this.state.isRestoringFromHistory = false;
        }, 100);
    }

    displayHistoryExecutionResults(executionData) {
        // update execution status and top time row with restored elapsed/timestamp
        try {
            // compute elapsed by summing per-node runtimes that are part of the execution order
            const orderIds = new Set(Array.isArray(executionData.execution_order) ? executionData.execution_order : []);
            const resultsArr = Array.isArray(executionData.results) ? executionData.results : [];
            let elapsedMs = 0;
            for (const r of resultsArr) {
                if (orderIds.size === 0 || orderIds.has(r.node_id)) {
                    const ms = parseInt(r.runtime || 0, 10);
                    if (!isNaN(ms)) elapsedMs += ms;
                }
            }
            // prefer a finished_at from feed; fallback to started_at
            let tsIso = '';
            try {
                const feed = Array.isArray(executionData.feed) ? executionData.feed : [];
                const finished = feed.filter(e => e && e.finished_at).slice(-1)[0];
                if (finished && finished.finished_at) tsIso = finished.finished_at;
                else if (feed.length && feed[0] && feed[0].started_at) tsIso = feed[0].started_at;
            } catch (_) {}
            let tsShort = '';
            if (tsIso) {
                try {
                    const d = new Date(tsIso);
                    if (!isNaN(d.getTime())) tsShort = d.toLocaleTimeString();
                } catch (_) {}
            }
            // apply to ui and persistent snapshot used by sidebar when no node selected
            const timeRow = document.getElementById('execution_time_row');
            const timeText = document.getElementById('execution_time_text');
            const timestampEl = document.getElementById('execution_timestamp');
            if (timeRow) timeRow.style.display = 'flex';
            if (timeText) timeText.textContent = `${(elapsedMs / 1000).toFixed(3)}s`;
            if (timestampEl) timestampEl.textContent = tsShort || (timestampEl.textContent || '');
            this.lastExecutionElapsedMs = elapsedMs;
            this.lastExecutionTimestampString = tsShort || this.lastExecutionTimestampString || '';
        } catch (_) {}

        // update execution status line
        const statusText = executionData.status === 'success' ? 'completed' : 
                          executionData.status === 'failed' ? 'failed' : (executionData.status || 'stopped');
        this.updateExecutionStatus(statusText, `historical execution - ${executionData.successful_nodes}/${executionData.total_nodes} nodes completed`);
    }
}

window.ExecutionStatus = ExecutionStatus;
})();
