// FlowchartBuilder Execution Module
// Contains all execution-related methods for the FlowchartBuilder class

(function() {
    'use strict';

    // Extend the FlowchartBuilder prototype with execution methods
    const ExecutionModule = {

        // Main execution methods
        startExecution: async function() {
            // clear all selections when starting execution (same as deselect button)
            this.deselectAll();

            // get execution order
            const executionOrder = this.calculateNodeOrder();

            if (executionOrder.length === 0) {
                this.updateExecutionStatus('error', 'no connected nodes to execute');
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
            this.nodeVariables.clear();
            this.globalExecutionLog = '';
            this.clearOutput();
            // reset live feed for this run
            this.executionFeed = [];
            // reset blocked branches
            this.blockedNodeIds.clear();
            // clear restored variable state when starting new execution
            this.restoredVariableState = null;
            // clear any previous runtime condition indicators on if→python links
            try {
                const links = Array.isArray(this.state.links) ? this.state.links : [];
                links.forEach(l => {
                    const s = this.state.getNode(l.source);
                    const t = this.state.getNode(l.target);
                    if (s && t && s.type === 'if_node' && t.type === 'python_file') {
                        this.state.updateLink(l.source, l.target, { runtime_condition: null, runtime_details: null });
                    }
                });
            } catch (_) {}

            // update execution status
            this.updateExecutionStatus('running', `executing ${executionOrder.length} nodes`);

            try {
                // execute nodes one by one with live feedback
                for (let i = 0; i < executionOrder.length; i++) {
                    // check if execution was stopped
                    if (this.executionAborted) {
                        this.updateExecutionStatus('stopped', 'execution stopped by user');
                        await this.saveExecutionHistory('stopped', executionOrder, 'execution stopped by user');
                        return;
                    }

                    const node = executionOrder[i];
                    const success = await this.executeNodeLive(node, i + 1, executionOrder.length);
                    // after a successful python node, persist any connected data_save values
                    if (success && node.type === 'python_file') {
                        try { await this.persistDataSaveForNode(node); } catch (e) { console.warn('data_save persist failed:', e); }
                    }
                    // update sidebar progress each step
                    this.updateExecutionStatus('running', `executing ${i + 1} of ${executionOrder.length}`);

                    // if node failed or execution was aborted, stop execution immediately
                    if (!success) {
                        if (this.executionAborted) {
                            this.updateExecutionStatus('stopped', 'execution stopped by user');
                            await this.saveExecutionHistory('stopped', executionOrder, 'execution stopped by user');
                        } else {
                            this.updateExecutionStatus('failed', `execution stopped at node: ${node.name}`);
                            // ensure sidebar refresh picks up failure info in no-selection view
                            this.state.emit('selectionChanged', { nodes: [], link: null, group: null });
                            await this.saveExecutionHistory('failed', executionOrder, `execution stopped at node: ${node.name}`);
                        }
                        return;
                    }
                }

                // all nodes completed successfully
                this.updateExecutionStatus('completed', 'execution completed successfully');
                await this.saveExecutionHistory('success', executionOrder);

            } catch (error) {
                this.updateExecutionStatus('error', `execution failed: ${error.message}`);
                await this.saveExecutionHistory('error', executionOrder, error.message);
            } finally {
                // reset execution state
                this.isExecuting = false;
                this.updateExecutionUI(false);
            }
        },

        stopExecution: async function() {
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
                this.updateExecutionStatus('stopped', 'execution stopped by user');

                // reset the abort controller
                this.currentExecutionController = null;
            }
        },

        updateExecutionUI: function(isExecuting) {
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
        },

        getCurrentFlowchartName: function() {
            // prefer the canonical filename from storage to avoid ui sync issues
            const filename = this.state.storage.getCurrentFlowchart() || '';
            if (filename) {
                // strip .json extension for history api which expects folder name
                return filename.endsWith('.json') ? filename.slice(0, -5) : filename;
            }

            // fallback to the selector's display name
            const selector = document.getElementById('flowchart_selector');
            return (selector && selector.value) ? selector.value : 'default';
        },

        saveExecutionHistory: async function(status, executionOrder, errorMessage = null) {
            try {
                // prepare execution results
                const results = [];

                // convert node execution results to array format
                for (const node of executionOrder) {
                    const result = this.nodeExecutionResults.get(node.id);
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
                    const dsResult = this.nodeExecutionResults.get(ds.id);
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
                    const dsResult = this.nodeExecutionResults.get(ds.id);
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
                const sanitizedFeed = Array.isArray(this.executionFeed) ? (() => {
                    // first, remove duplicate entries for the same node (keep the latest one)
                    const nodeEntries = new Map();
                    this.executionFeed.forEach(entry => {
                        if (entry && entry.node_id) {
                            const existing = nodeEntries.get(entry.node_id);
                            if (!existing || (entry.finished_at && !existing.finished_at) ||
                                (entry.finished_at && existing.finished_at && entry.finished_at > existing.finished_at)) {
                                nodeEntries.set(entry.node_id, entry);
                            }
                        }
                    });

                    // then sanitize lines within each entry
                    return Array.from(nodeEntries.values()).map(entry => {
                        const seen = new Set();
                        const uniqueLines = [];
                        (entry.lines || []).forEach(l => {
                            const t = (l && typeof l.text === 'string') ? l.text.trim() : '';
                            if (!t || seen.has(t)) return;
                            seen.add(t);
                            uniqueLines.push({ text: t, ts: l.ts || new Date().toISOString() });
                        });
                        return { ...entry, lines: uniqueLines };
                    });
                })() : [];

                // build variable state for resume functionality
                const variableState = {};
                // collect variables from all executed nodes in order
                for (const node of executionOrder) {
                    const result = this.nodeExecutionResults.get(node.id);
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
                        flowchart_name: this.getCurrentFlowchartName(),
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
        },

        updateExecutionStatus: function(type, message) {
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
                const order = this.calculateNodeOrder ? this.calculateNodeOrder() : [];
                const total = order.length;
                // only count executed nodes that are part of the execution order (exclude data_save etc.)
                const executed = this.nodeExecutionResults
                    ? Array.from(this.nodeExecutionResults.keys()).filter(id => order.some(n => n.id === id)).length
                    : 0;
                progressText.textContent = `${executed} of ${total}`;
            }

            // also update the main status bar for important execution messages
            if (type === 'error' || type === 'failed' || type === 'completed') {
                this.updateStatus(type, message, { autoClear: false });
            }
        }
    },

    // scroll to a specific node in the run feed
    scrollRunFeedToNode: function(nodeId) {
        // find a running or completed feed item for this node and scroll it into view
        const list = document.getElementById('run_feed_list');
        if (!list) return;
        // prefer the running item id if present
        const running = document.getElementById(`run_feed_running_${nodeId}`);
        const match = running || Array.from(list.children).find(el => {
            try {
                const title = el.querySelector('.run_feed_item_title');
                if (!title) return false;
                // compare by name from state to avoid relying on node_name text differences
                const node = this.state.getNode(nodeId);
                return node && title.textContent === node.name;
            } catch (_) { return false; }
        });
        if (match) {
            match.scrollIntoView({ behavior: 'smooth', block: 'start' });
        } else if (list && list.lastElementChild) {
            // fallback: scroll to bottom
            list.lastElementChild.scrollIntoView({ behavior: 'smooth', block: 'end' });
        }
    }
};

    // Apply the execution methods to FlowchartBuilder prototype
    Object.assign(FlowchartBuilder.prototype, ExecutionModule);

})();
