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
            const selected = this.state.selectionHandler ? Array.from(this.state.selectionHandler.selectedNodes || []) : [];
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
        const selectedNodes = this.state.selectionHandler ? Array.from(this.state.selectionHandler.selectedNodes) : [];
        if (selectedNodes.length === 1 && selectedNodes[0] === node.id) {
            this.state.emit('updateSidebar');
        }
    }

    // history management
    async saveExecutionHistory(status, executionOrder, errorMessage = null) {
        if (this.state.saving) {
            await this.state.saving.saveExecutionHistory(status, executionOrder, errorMessage);
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
            const node = this.state.createNode ? this.state.createNode.getNode(result.node_id) : null;
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
                const targetNode = this.state.createNode ? this.state.createNode.getNode(node.targetNodeId) : null;
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
