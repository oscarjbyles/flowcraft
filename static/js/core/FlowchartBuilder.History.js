// FlowchartBuilder History Module
// Contains all history-related methods for the FlowchartBuilder class

(function() {
    'use strict';

    // Extend the FlowchartBuilder prototype with history methods
    const HistoryModule = {

        async viewExecutionHistory(executionId) {
            try {
                const response = await fetch(`/api/history/${executionId}?flowchart_name=${encodeURIComponent(this.getCurrentFlowchartName())}`);
                const result = await response.json();

                if (result.status === 'success') {
                    const executionData = result.execution.execution_data;

                    // switch to run mode first (before restoring state to avoid clearing restored runtime indicators)
                    this.switchToRunMode(false);

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
        },

        async deleteExecutionHistory(executionId) {
            if (!confirm('are you sure you want to delete this execution history?')) {
                return;
            }

            try {
                const response = await fetch(`/api/history/${executionId}?flowchart_name=${encodeURIComponent(this.getCurrentFlowchartName())}`, {
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
        },

        restoreFlowchartFromHistory(executionData) {
            // set restoration flag to prevent input node recreation
            this.state.isRestoringFromHistory = true;

            // clear current node execution results and variables
            this.nodeExecutionResults.clear();
            this.nodeVariables.clear();

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
                        this.linkRenderer.render();
                        // then render if condition circles
                        this.linkRenderer.renderIfToPythonNodes();
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
                    this.nodeExecutionResults.set(result.node_id, {
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
                        this.nodeVariables.set(result.node_id, result.return_value);
                    }

                    // set visual node state
                    if (result.success) {
                        this.setNodeState(result.node_id, 'completed');
                    } else {
                        this.setNodeState(result.node_id, 'error');
                    }
                }
            });

            // restore global variable state if available (for resume functionality)
            if (executionData.variable_state && typeof executionData.variable_state === 'object') {
                try {
                    // store the global variable state for resume operations
                    this.restoredVariableState = executionData.variable_state;
                } catch (_) {}
            }

            // restore visual state for input nodes based on their target node's execution state
            this.state.nodes.forEach(node => {
                if (node.type === 'input_node' && node.targetNodeId) {
                    const targetNode = this.state.getNode(node.targetNodeId);
                    if (targetNode) {
                        const targetResult = this.nodeExecutionResults.get(node.targetNodeId);
                        if (targetResult) {
                            // set input node visual state to match its target node
                            if (targetResult.success) {
                                this.setNodeState(node.id, 'completed');
                            } else {
                                this.setNodeState(node.id, 'error');
                            }
                        }
                    }
                }
            });

            // clear restoration flag after a short delay to allow UI updates to complete
            setTimeout(() => {
                this.state.isRestoringFromHistory = false;
            }, 100);
        },

        displayHistoryExecutionResults(executionData) {
            // restore the bottom live feed from saved history when viewing
            try {
                const list = document.getElementById('run_feed_list');
                if (list) {
                    list.innerHTML = '';
                    const feed = Array.isArray(executionData.feed) ? executionData.feed : [];
                    // prefer per-node runtimes saved in results; fallback to elapsed_ms from feed
                    const resultsArr = Array.isArray(executionData.results) ? executionData.results : [];
                    const runtimeById = new Map();
                    try {
                        resultsArr.forEach(r => {
                            const ms = parseInt(r && r.runtime != null ? r.runtime : 0, 10);
                            if (!isNaN(ms)) runtimeById.set(r.node_id, ms);
                        });
                    } catch (_) {}
                    feed.forEach(entry => {
                        const item = document.createElement('div');
                        item.className = 'run_feed_item ' + (entry.success ? 'success' : (entry.success === false ? 'error' : ''));
                        const title = document.createElement('div');
                        title.className = 'run_feed_item_title';
                        title.textContent = entry.node_name;
                        const outCol = document.createElement('div');
                        outCol.className = 'run_feed_output';
                        (entry.lines || []).forEach(line => {
                            const lineDiv = document.createElement('div');
                            lineDiv.className = 'run_feed_line';
                            lineDiv.textContent = line.text;
                            outCol.appendChild(lineDiv);
                        });
                        const metaCol = document.createElement('div');
                        metaCol.className = 'run_feed_meta';
                        // restore both time and duration; prefer saved node runtime, fallback to elapsed from feed
                        try {
                            const tsIso = entry.finished_at || entry.started_at || '';
                            const dt = tsIso ? new Date(tsIso) : null;
                            const timeStr = (dt && !isNaN(dt.getTime())) ? dt.toLocaleTimeString() : ((tsIso || '').replace('T',' ').split('.')[0]);
                            const rtMs = runtimeById.has(entry.node_id) ? runtimeById.get(entry.node_id) : null;
                            let secText = '';
                            if (typeof rtMs === 'number' && !isNaN(rtMs) && rtMs >= 0) {
                                secText = `${(rtMs / 1000).toFixed(3)}s`;
                            } else if (typeof entry.elapsed_ms === 'number') {
                                secText = `${(entry.elapsed_ms / 1000).toFixed(3)}s`;
                            }
                            metaCol.textContent = secText ? `${timeStr}  ·  ${secText}` : timeStr;
                        } catch (_) {
                            metaCol.textContent = (entry.finished_at || entry.started_at || '').replace('T', ' ').split('.')[0];
                        }
                        item.appendChild(title);
                        item.appendChild(outCol);
                        item.appendChild(metaCol);
                        list.appendChild(item);
                    });
                }
            } catch (_) {}

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
        },

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
                const result = this.nodeExecutionResults.get(node.id);

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
        },

        // Load execution history for history mode
        loadExecutionHistory: function() {
            // This method is called when the app starts in history mode
            // The actual history loading is handled by the History module
            // when the execution data is available
        }

    };

    // Apply the history methods to FlowchartBuilder prototype
    Object.assign(FlowchartBuilder.prototype, HistoryModule);

})();
