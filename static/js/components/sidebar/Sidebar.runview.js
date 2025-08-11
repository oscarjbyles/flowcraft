// run mode sidebar helpers and status updates
(function(){
    if (!window.Sidebar) return;

    Sidebar.prototype.updateStatus = function(message) {
        const statusElement = document.getElementById('status_text');
        const statusBar = document.querySelector('.status_bar');
        if (!statusElement || !statusBar) return;
        if (!this._defaultStatusTextCaptured) {
            this._defaultStatusText = statusElement.textContent || 'ready';
            this._defaultStatusTextCaptured = true;
        }
        statusElement.textContent = message;
        const lower = String(message || '').toLowerCase();
        let bg = null;
        if (/warning:/.test(lower) || /no python file assigned/.test(lower)) {
            bg = '#2A0E0E';
        } else if (/error/.test(lower) || /failed/.test(lower)) {
            bg = '#2A0E0E';
        } else if (/success/.test(lower)) {
            bg = '#0e2a16';
        }
        const originalBg = statusBar.style.backgroundColor;
        statusBar.style.backgroundColor = bg;
        if (this._statusResetTimeout) clearTimeout(this._statusResetTimeout);
        this._statusResetTimeout = setTimeout(() => {
            statusBar.style.backgroundColor = originalBg || 'var(--surface-color)';
            statusElement.textContent = '';
            this._statusResetTimeout = null;
        }, 3000);
    };

    Sidebar.prototype.updateRunModeNodeDetails = function(selection) {
        const nodeFileContent = document.getElementById('node_file_content');
        const executionTimeRow = document.getElementById('execution_time_row');
        const executionTimeText = document.getElementById('execution_time_text');
        const executionTimestamp = document.getElementById('execution_timestamp');
        const nodeInputContent = document.getElementById('node_input_content');
        const nodeOutputContent = document.getElementById('node_output_content');
        const consoleContent = document.getElementById('console_content');
        const progressText = document.getElementById('execution_progress_text');
        const executionStatusGroup = document.getElementById('execution_status')?.closest('.form_group');
        const nodeFileInfoGroup = document.getElementById('node_file_info')?.closest('.form_group');
        const nodeInputGroup = document.getElementById('node_input_log')?.closest('.form_group');
        const nodeOutputGroup = document.getElementById('node_output_log')?.closest('.form_group');
        const consoleGroup = document.getElementById('console_output_log')?.closest('.form_group');
        const progressGroup = document.getElementById('execution_progress_group');
        const failureInfo = document.getElementById('execution_failure_info');
        const failedTitle = document.getElementById('failed_node_title');
        const failedPath = document.getElementById('failed_node_path');
        const failedError = document.getElementById('failed_node_error');
        const gotoBtn = document.getElementById('go_to_failed_node_btn');
        const dataSaveGroup = document.getElementById('data_save_details_group');
        const dsNodeName = document.getElementById('ds_node_name');
        const dsVariableName = document.getElementById('ds_variable_name');
        const dsVariableType = document.getElementById('ds_variable_type');
        const dsVariableValue = document.getElementById('ds_variable_value');
        const dsHistoryIcon = document.getElementById('ds_history_icon');
        const dsHistoryText = document.getElementById('ds_history_text');
        
        if (selection.nodes.length === 1) {
            if (executionStatusGroup) executionStatusGroup.style.display = '';
            if (nodeFileInfoGroup) nodeFileInfoGroup.style.display = '';
            if (nodeInputGroup) nodeInputGroup.style.display = '';
            if (nodeOutputGroup) nodeOutputGroup.style.display = '';
            if (consoleGroup) consoleGroup.style.display = '';
            if (dataSaveGroup) dataSaveGroup.style.display = 'none';
            if (failureInfo) failureInfo.style.display = 'none';
            const nodeId = selection.nodes[0];
            const node = this.state.getNode(nodeId);
            if (node) {
                if (progressGroup) {
                    if (node.type === 'python_file') {
                        progressGroup.style.display = 'none';
                    } else {
                        progressGroup.style.display = '';
                    }
                }
                this.displayNodeFileInfo(node, nodeFileContent);
                const executionResult = window.flowchartApp?.nodeExecutionResults?.get(nodeId);
                // if this is a data_save node, only show the data save block
                if (node.type === 'data_save') {
                    // hide python-specific groups
                    if (nodeFileInfoGroup) nodeFileInfoGroup.style.display = 'none';
                    if (nodeInputGroup) nodeInputGroup.style.display = 'none';
                    if (nodeOutputGroup) nodeOutputGroup.style.display = 'none';
                    if (consoleGroup) consoleGroup.style.display = 'none';
                    // hide data save group until we have an execution result (i.e., only show while/after running)
                    if (!executionResult) {
                        if (dataSaveGroup) dataSaveGroup.style.display = 'none';
                        return; // nothing to render for data_save before running
                    }
                    if (dataSaveGroup) dataSaveGroup.style.display = '';
                    // populate fields
                    if (dsNodeName) dsNodeName.textContent = node.name || 'data save';
                    // derive variable name and value from execution result
                    let varName = null;
                    let value = null;
                    if (executionResult && executionResult.return_value && typeof executionResult.return_value === 'object') {
                        const keys = Object.keys(executionResult.return_value);
                        if (keys.length > 0) {
                            varName = keys[0];
                            value = executionResult.return_value[varName];
                        }
                    }
                    if (!varName && executionResult && executionResult.data_save && executionResult.data_save.variable_name) {
                        varName = executionResult.data_save.variable_name;
                        if (executionResult.return_value && typeof executionResult.return_value === 'object' && varName in executionResult.return_value) {
                            value = executionResult.return_value[varName];
                        }
                    }
                    if (dsVariableName) dsVariableName.textContent = varName || '-';
                    const typeOf = (val) => {
                        if (val === null) return 'null';
                        if (Array.isArray(val)) return 'array';
                        if (typeof val === 'number') return Number.isInteger(val) ? 'integer' : 'float';
                        if (typeof val === 'object') return 'object';
                        if (typeof val === 'string') return 'string';
                        if (typeof val === 'boolean') return 'boolean';
                        return typeof val;
                    };
                    if (dsVariableType) dsVariableType.textContent = typeOf(value);
                    if (dsVariableValue) dsVariableValue.textContent = (value !== undefined) ? JSON.stringify(value, null, 2) : 'no value';
                    // confirmation: saved in history if the execution record exists
                    const saved = !!executionResult; // presence indicates it was synthesized and included in history
                    const historyConfirmation = document.getElementById('ds_history_confirmation');
                    if (saved) {
                        if (dsHistoryIcon) dsHistoryIcon.textContent = 'check_circle';
                        if (dsHistoryText) dsHistoryText.textContent = 'saved to history';
                        if (historyConfirmation) {
                            historyConfirmation.className = 'data_save_history data_save_history_success';
                        }
                    } else {
                        if (dsHistoryIcon) dsHistoryIcon.textContent = 'hourglass_empty';
                        if (dsHistoryText) dsHistoryText.textContent = 'waiting to save...';
                        if (historyConfirmation) {
                            historyConfirmation.className = 'data_save_history data_save_history_waiting';
                        }
                    }
                    return; // stop further python-node UI rendering
                }
                if (executionResult) {
                    if (executionTimeRow) executionTimeRow.style.display = 'flex';
                    const _rt = executionResult.runtime || 0;
                    executionTimeText.textContent = `${_rt}ms (${(_rt/1000).toFixed(3)}s)`;
                    executionTimestamp.textContent = executionResult.timestamp;
                    if (executionResult.success) {
                        if (nodeInputContent) {
                            if (executionResult.input_args && Object.keys(executionResult.input_args).length > 0) {
                                nodeInputContent.textContent = JSON.stringify(executionResult.input_args, null, 2);
                            } else {
                                nodeInputContent.textContent = 'no inputs';
                            }
                        }
                        if (nodeOutputContent) {
                            if (executionResult.return_value !== null && executionResult.return_value !== undefined) {
                                nodeOutputContent.textContent = JSON.stringify(executionResult.return_value, null, 2);
                            } else {
                                nodeOutputContent.textContent = 'no returns';
                            }
                        }
                        if (consoleContent) {
                            const rawOutput = executionResult.output || '';
                            const lines = rawOutput.split(/\r?\n/).filter(l => l.trim().length > 0);
                            if (lines.length === 0) {
                                consoleContent.textContent = 'no console output';
                            } else {
                                const escapeHtml = (txt) => {
                                    try {
                                        return window.flowchartApp && typeof window.flowchartApp.escapeHtml === 'function'
                                            ? window.flowchartApp.escapeHtml(txt)
                                            : String(txt)
                                                .replaceAll('&', '&amp;')
                                                .replaceAll('<', '&lt;')
                                                .replaceAll('>', '&gt;')
                                                .replaceAll('"', '&quot;')
                                                .replaceAll("'", '&#39;');
                                    } catch (e) {
                                        return String(txt);
                                    }
                                };
                                consoleContent.innerHTML = lines.map(line => `
<div style="
    margin-bottom: 8px;
    background: var(--surface-variant);
    border-left: 3px solid var(--secondary);
    padding: 8px 12px;
    font-family: 'Courier New', monospace;
    font-size: 0.85em;
    color: var(--on-surface);
    border-radius: 0 6px 6px 0;
    opacity: 0.9;
    white-space: pre-wrap;
">${escapeHtml(line)}</div>`).join('');
                            }
                        }
                    } else {
                        if (nodeInputContent) nodeInputContent.innerHTML = `<span style="color: #f44336;">execution failed</span>`;
                        if (nodeOutputContent) nodeOutputContent.innerHTML = `<span style="color: #f44336;">execution failed</span>`;
                        consoleContent.innerHTML = `<span style="color: #f44336;">${executionResult.error || 'unknown error'}</span>`;
                    }
                } else {
                    if (executionTimeRow) executionTimeRow.style.display = 'none';
                    if (nodeInputContent) nodeInputContent.textContent = 'no inputs - node not executed';
                    if (nodeOutputContent) nodeOutputContent.textContent = 'no returns - node not executed';
                    consoleContent.textContent = 'no console output - node not executed';
                }
            }
        } else if (selection.nodes.length > 1) {
            if (executionStatusGroup) executionStatusGroup.style.display = '';
            if (executionTimeGroup) executionTimeGroup.style.display = '';
            if (progressGroup) progressGroup.style.display = '';
            if (nodeFileInfoGroup) nodeFileInfoGroup.style.display = '';
            if (nodeInputGroup) nodeInputGroup.style.display = 'none';
            if (nodeOutputGroup) nodeOutputGroup.style.display = 'none';
            if (consoleGroup) consoleGroup.style.display = 'none';
            if (dataSaveGroup) dataSaveGroup.style.display = 'none';
            if (failureInfo) failureInfo.style.display = 'none';
            nodeFileContent.innerHTML = `
                <div style="margin-bottom: 8px;">
                    <strong>${selection.nodes.length} nodes selected</strong>
                </div>
                <div style="font-size: 0.8em; opacity: 0.8;">
                    select a single node to view file details
                </div>
            `;
            if (executionTimeRow) executionTimeRow.style.display = 'none';
            if (nodeInputContent) nodeInputContent.textContent = 'select a single node to view inputs';
            if (nodeOutputContent) nodeOutputContent.textContent = 'select a single node to view returns';
            consoleContent.textContent = 'select a single node to view console output';
        } else {
            if (executionStatusGroup) executionStatusGroup.style.display = '';
            if (progressGroup) progressGroup.style.display = '';
            if (nodeFileInfoGroup) nodeFileInfoGroup.style.display = 'none';
            if (nodeInputGroup) nodeInputGroup.style.display = 'none';
            if (nodeOutputGroup) nodeOutputGroup.style.display = 'none';
            if (consoleGroup) consoleGroup.style.display = 'none';
            if (dataSaveGroup) dataSaveGroup.style.display = 'none';
            const app = window.flowchartApp;
            const isRunning = !!(app && app._elapsedTimer);
            const hasLast = !!(app && (app.lastExecutionElapsedMs || app.lastExecutionElapsedMs === 0));
            if (executionTimeRow && (isRunning || hasLast)) executionTimeRow.style.display = 'flex';
            if (progressText && window.flowchartApp) {
                const order = window.flowchartApp.calculateNodeOrder ? window.flowchartApp.calculateNodeOrder() : [];
                const total = order.length;
                // only count executed nodes that are part of the execution order (exclude data_save etc.)
                const executed = window.flowchartApp.nodeExecutionResults
                    ? Array.from(window.flowchartApp.nodeExecutionResults.keys()).filter(id => order.some(n => n.id === id)).length
                    : 0;
                progressText.textContent = `${executed} of ${total}`;
            }
            if (failureInfo && window.flowchartApp && window.flowchartApp.lastExecutionStatus === 'failed' && window.flowchartApp.lastFailedNode) {
                const { id, name, pythonFile, error } = window.flowchartApp.lastFailedNode;
                if (failedTitle) failedTitle.textContent = `node: ${name}`;
                if (failedPath) failedPath.textContent = `path: ${pythonFile || '-'}`;
                if (failedError) failedError.textContent = error || '';
                failureInfo.style.display = '';
                if (gotoBtn) {
                    gotoBtn.onclick = () => {
                        if (window.flowchartApp && typeof window.flowchartApp.centerOnNode === 'function') {
                            window.flowchartApp.centerOnNode(id);
                        }
                    };
                }
            } else if (failureInfo) {
                failureInfo.style.display = 'none';
            }
        }
    };

    Sidebar.prototype.displayNodeFileInfo = function(node, container) {
        const pythonFile = node.pythonFile || 'not assigned';
        if (pythonFile === 'not assigned') {
            container.innerHTML = `
                <div style="font-size: 0.8em; opacity: 0.8; text-align: center; padding: 20px;">
                    no python file assigned
                </div>
            `;
            return;
        }
        container.innerHTML = `
            <div style="margin-bottom: 8px;">
                <div style="font-size: 0.9em; font-weight: 500; margin-bottom: 4px;">
                    file path:
                </div>
                <div style="font-size: 0.8em; opacity: 0.8; font-family: monospace; background: rgba(255,255,255,0.1); padding: 8px; border-radius: 4px;">
                    ${pythonFile}
                </div>
            </div>
            <div id="function_info_${node.id}" style="font-size: 0.8em; opacity: 0.8;">
                analyzing function...
            </div>
        `;
        this.fetchFunctionInfo(pythonFile, node.id);
    };

    Sidebar.prototype.fetchFunctionInfo = async function(pythonFile, nodeId) {
        try {
            const response = await fetch('/api/analyze-python-function', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ python_file: pythonFile })
            });
            const result = await response.json();
            const infoElement = document.getElementById(`function_info_${nodeId}`);
            if (result.success && infoElement) {
                const fileResponse = await fetch(`/nodes/${pythonFile.replace('nodes/', '')}`);
                const fileContent = await fileResponse.text();
                const totalLines = fileContent.split('\n').length;
                infoElement.innerHTML = `
                    function: <span style="font-family: monospace;">${result.function_name}</span><br>
                    total lines: ${totalLines}
                `;
            } else if (infoElement) {
                infoElement.innerHTML = 'function analysis failed';
            }
        } catch (error) {
            const infoElement = document.getElementById(`function_info_${nodeId}`);
            if (infoElement) {
                infoElement.innerHTML = 'unable to analyze function';
            }
        }
    };
})();


