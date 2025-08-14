// run mode sidebar helpers and status updates
(function(){
    if (!window.Sidebar) return;

    // note: updateStatus unified in Sidebar.status.js

    Sidebar.prototype.updateRunModeNodeDetails = function(selection) {
        const nodeFileContent = document.getElementById('node_file_content');
        const executionTimeRow = document.getElementById('execution_time_row');
        const executionTimeText = document.getElementById('execution_time_text');
        const executionTimestamp = document.getElementById('execution_timestamp');
        // node-specific status elements (we repurpose the global status block when a node is selected)
        const executionStatusText = document.getElementById('execution_status_text');
        const executionStatusIcon = document.querySelector('#execution_status .material-icons');
        const executionStatusBox = document.getElementById('execution_status');
        const nodeInputContent = document.getElementById('node_input_content');
        const nodeOutputContent = document.getElementById('node_output_content');
        const consoleLogEl = document.getElementById('console_output_log');
        // returns (data out) block
        const pythonReturnsGroup = document.getElementById('python_returns_group');
        const pythonReturnsContent = document.getElementById('python_returns_content');
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
            if (consoleGroup) consoleGroup.style.display = '';
            if (dataSaveGroup) dataSaveGroup.style.display = 'none';
            if (failureInfo) failureInfo.style.display = 'none';
            const nodeId = selection.nodes[0];
            const node = this.state.getNode(nodeId);
            if (node) {
                // progress should only be visible when no nodes are selected
                if (progressGroup) progressGroup.style.display = 'none';
                if (node.type === 'python_file') {
                    if (nodeInputGroup) nodeInputGroup.style.display = 'none';
                    if (nodeOutputGroup) nodeOutputGroup.style.display = 'none';
                } else {
                    if (nodeInputGroup) nodeInputGroup.style.display = '';
                    if (nodeOutputGroup) nodeOutputGroup.style.display = '';
                }
                // if splitter: show only the execution status section in run mode
                if (node.type === 'if_node') {
                    if (nodeFileInfoGroup) nodeFileInfoGroup.style.display = 'none';
                    if (nodeInputGroup) nodeInputGroup.style.display = 'none';
                    if (nodeOutputGroup) nodeOutputGroup.style.display = 'none';
                    if (consoleGroup) consoleGroup.style.display = 'none';
                    if (dataSaveGroup) dataSaveGroup.style.display = 'none';
                    if (progressGroup) progressGroup.style.display = 'none';
                    if (executionTimeRow) executionTimeRow.style.display = 'none';
                    // neutral per-node status for splitters (they do not execute like python nodes)
                    if (executionStatusText) executionStatusText.textContent = 'node not executed';
                    if (executionStatusIcon) { executionStatusIcon.textContent = 'hourglass_empty'; executionStatusIcon.style.color = ''; }
                    return;
                }
                // input node: only show execution status indicating whether its values were passed to the python node
                if (node.type === 'input_node') {
                    if (nodeFileInfoGroup) nodeFileInfoGroup.style.display = 'none';
                    if (nodeInputGroup) nodeInputGroup.style.display = 'none';
                    if (nodeOutputGroup) nodeOutputGroup.style.display = 'none';
                    if (consoleGroup) consoleGroup.style.display = 'none';
                    if (dataSaveGroup) dataSaveGroup.style.display = 'none';
                    if (progressGroup) progressGroup.style.display = 'none';
                    if (executionTimeRow) executionTimeRow.style.display = 'none';
                    // determine the associated python node and its latest execution result
                    let pythonNode = null;
                    try {
                        if (typeof node.targetNodeId !== 'undefined' && node.targetNodeId !== null) {
                            const t = this.state.getNode(node.targetNodeId);
                            if (t && t.type === 'python_file') pythonNode = t;
                        }
                        if (!pythonNode) {
                            for (const link of this.state.links) {
                                if (link.source === node.id) {
                                    const t = this.state.getNode(link.target);
                                    if (t && t.type === 'python_file') { pythonNode = t; break; }
                                }
                            }
                        }
                    } catch(_) {}
                    const pyResult = pythonNode && window.flowchartApp && window.flowchartApp.nodeExecutionResults
                        ? window.flowchartApp.nodeExecutionResults.get(pythonNode.id)
                        : null;
                    const setStatus = (text, color, icon) => {
                        if (executionStatusText) executionStatusText.textContent = text;
                        if (executionStatusIcon) {
                            executionStatusIcon.textContent = icon || 'info';
                            if ((icon || 'info') === 'hourglass_empty') {
                                executionStatusIcon.style.color = '';
                            } else {
                                executionStatusIcon.style.color = color || 'var(--on-surface)';
                            }
                        }
                    };
                    if (pyResult) {
                        const usedInputs = !!(pyResult && (pyResult.input_used || (pyResult.input_values && Object.keys(pyResult.input_values || {}).length > 0)));
                        if (pyResult.success && usedInputs) {
                            setStatus('input used in python file', '#66bb6a', 'check_circle');
                            try {
                                const inputNode = node; // current node is the input node
                                inputNode.runtimeStatus = 'success';
                                // also apply the standard completed class like python nodes
                                if (window.flowchartApp && typeof window.flowchartApp.setNodeState === 'function') {
                                    window.flowchartApp.setNodeState(inputNode.id, 'completed');
                                } else if (this.setNodeState) {
                                    this.setNodeState(inputNode.id, 'completed');
                                }
                                if (window.flowchartApp && window.flowchartApp.nodeRenderer) {
                                    window.flowchartApp.nodeRenderer.updateNodeStyles();
                                } else if (this.nodeRenderer && typeof this.nodeRenderer.updateNodeStyles === 'function') {
                                    this.nodeRenderer.updateNodeStyles();
                                }
                            } catch (_) {}
                        } else if (pyResult.success && !usedInputs) {
                            setStatus('python ran (no input values used)', '#90caf9', 'info');
                        } else {
                            setStatus('python failed to run', '#f44336', 'error');
                        }
                    } else {
                        setStatus('waiting for python node execution', '#ff9800', 'hourglass_empty');
                    }
                    return;
                }
                this.displayNodeFileInfo(node, nodeFileContent);
                const executionResult = window.flowchartApp?.nodeExecutionResults?.get(nodeId);

                // node-specific status rendering: always first section under header
                // all comments in lower case
                const setStatus = (text, color, icon) => {
                    if (executionStatusText) {
                        executionStatusText.textContent = text;
                        // do not set inline color on the status text
                    }
                    if (executionStatusIcon) {
                        executionStatusIcon.textContent = icon || 'info';
                        // avoid inline color for hourglass icon; otherwise keep provided color or fallback
                        if ((icon || 'info') === 'hourglass_empty') {
                            executionStatusIcon.style.color = '';
                        } else {
                            executionStatusIcon.style.color = color || 'var(--on-surface)';
                        }
                    }
                    if (executionStatusBox) {
                        // keep background consistent; only adjust text/icon color
                    }
                    // if status indicates node not executed, hide the execution time block
                    try {
                        if (executionTimeRow && String(text).toLowerCase().includes('node not executed')) {
                            executionTimeRow.style.display = 'none';
                        }
                    } catch(_) {}
                };

                if (executionResult) {
                    // show time row for executed nodes
                    if (executionTimeRow) executionTimeRow.style.display = 'flex';
                    if (executionResult.success) {
                        setStatus('node executed successfully', '#66bb6a', 'check_circle');
                    } else {
                        setStatus('node returned an error', '#f44336', 'error');
                    }
                } else {
                    // hide time row when node was not executed
                    if (executionTimeRow) executionTimeRow.style.display = 'none';
                    // default pre-execution status; for python nodes show clearer message
                    if (node.type === 'python_file') {
                        setStatus('waiting for execution', '#ff9800', 'hourglass_empty');
                    } else {
                        setStatus('node not executed', '#ff9800', 'hourglass_empty');
                    }
                }
                // if this is a data_save node, only show the data save block
                if (node.type === 'data_save') {
                    // hide python-specific groups
                    if (nodeFileInfoGroup) nodeFileInfoGroup.style.display = 'none';
                    if (nodeInputGroup) nodeInputGroup.style.display = 'none';
                    if (nodeOutputGroup) nodeOutputGroup.style.display = 'none';
                    if (consoleGroup) consoleGroup.style.display = 'none';
                    // hide time row for data save nodes
                    if (executionTimeRow) executionTimeRow.style.display = 'none';
                    // hide data save group until we have an execution result (i.e., only show while/after running)
                    if (!executionResult) {
                        // show clearer pre-execution status for data_save nodes
                        setStatus('waiting for python node execution', '#ff9800', 'hourglass_empty');
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
                    return; // stop further python-node ui rendering
                }
                // show/hide and populate 'returns (data out)' for python nodes
                try {
                    if (node.type === 'python_file') {
                        if (!executionResult) {
                            if (pythonReturnsGroup) pythonReturnsGroup.style.display = 'none';
                            if (pythonReturnsContent) pythonReturnsContent.innerHTML = '';
                        } else {
                            if (pythonReturnsGroup) pythonReturnsGroup.style.display = '';
                            if (pythonReturnsContent) {
                                // clear existing
                                pythonReturnsContent.innerHTML = '';
                                const ret = executionResult.return_value;

                                // helper: create a single return row with name, value, and actions on the right (type tag + open icon)
                                const makeRow = (labelText, value) => {
                                    // outer container for a variable row (with border)
                                    const row = document.createElement('div');
                                    row.style.display = 'flex';
                                    row.style.flexDirection = 'column';
                                    row.style.gap = '6px';
                                    row.style.padding = '8px 10px';
                                    row.style.borderRadius = '6px';
                                    row.style.border = '1px solid var(--border-color)';
                                    row.style.background = 'var(--surface-color)';
                                    row.style.marginBottom = '8px';

                                    // header (name on left, actions on right)
                                    const header = document.createElement('div');
                                    header.style.display = 'flex';
                                    header.style.alignItems = 'center';
                                    header.style.gap = '8px';

                                    const nameEl = document.createElement('span');
                                    nameEl.style.color = '#c8e6c9';
                                    nameEl.style.minWidth = '120px';
                                    nameEl.style.fontWeight = '600';
                                    nameEl.textContent = String(labelText);

                                    const headerSpacer = document.createElement('div');
                                    headerSpacer.style.flex = '1 1 auto';

                                    const actions = document.createElement('div');
                                    actions.style.display = 'flex';
                                    actions.style.alignItems = 'center';
                                    actions.style.gap = '8px';

                                    // helper to infer simple type name
                                    const typeOfValue = (val) => {
                                        if (val === null) return 'null';
                                        if (typeof val === 'undefined') return 'undefined';
                                        if (Array.isArray(val)) return 'array';
                                        if (typeof val === 'number') return Number.isInteger(val) ? 'integer' : 'float';
                                        if (typeof val === 'string') return 'string';
                                        if (typeof val === 'boolean') return 'boolean';
                                        if (val && typeof val === 'object') return 'object';
                                        return typeof val;
                                    };

                                    // type tag
                                    const typeText = typeOfValue(value);
                                    const typeTag = document.createElement('span');
                                    typeTag.className = 'dm_type_tag';
                                    // minimal inline styling so it works without data_matrix css
                                    typeTag.style.padding = '2px 6px';
                                    typeTag.style.borderRadius = '12px';
                                    typeTag.style.fontSize = '0.75rem';
                                    typeTag.style.textTransform = 'lowercase';
                                    typeTag.style.background = 'rgba(255,255,255,0.08)';
                                    typeTag.style.border = '1px solid rgba(255,255,255,0.12)';
                                    typeTag.style.color = 'var(--on-surface)';
                                    typeTag.textContent = typeText;

                                    // open icon button
                                    const openBtn = document.createElement('button');
                                    openBtn.title = 'open value in full screen';
                                    openBtn.style.display = 'inline-flex';
                                    openBtn.style.alignItems = 'center';
                                    openBtn.style.justifyContent = 'center';
                                    openBtn.style.padding = '2px 4px';
                                    openBtn.style.borderRadius = '4px';
                                    openBtn.style.border = '1px solid var(--border-color)';
                                    openBtn.style.background = 'var(--surface-color)';
                                    openBtn.style.cursor = 'pointer';
                                    openBtn.style.color = '#fff';
                                    const icon = document.createElement('span');
                                    icon.className = 'material-icons';
                                    icon.textContent = 'open_in_new';
                                    icon.style.fontSize = '14px';
                                    icon.style.color = '#fff';
                                    openBtn.appendChild(icon);

                                    // hover effect for button color
                                    openBtn.addEventListener('mouseenter', () => {
                                        openBtn.style.background = 'rgba(255,255,255,0.12)';
                                        openBtn.style.borderColor = 'rgba(255,255,255,0.18)';
                                    });
                                    openBtn.addEventListener('mouseleave', () => {
                                        openBtn.style.background = 'var(--surface-color)';
                                        openBtn.style.borderColor = 'var(--border-color)';
                                    });

                                    // open a full screen variable viewer similar to data matrix
                                    openBtn.addEventListener('click', () => {
                                        // build overlay
                                        let overlay = document.getElementById('variable_detail_overlay');
                                        if (!overlay) {
                                            overlay = document.createElement('div');
                                            overlay.id = 'variable_detail_overlay';
                                            overlay.style.position = 'fixed';
                                            overlay.style.inset = '0';
                                            overlay.style.zIndex = '10000';
                                            overlay.style.background = 'var(--background-color, #111)';
                                            overlay.style.color = 'var(--on-surface, #fff)';
                                            overlay.style.display = 'flex';
                                            overlay.style.flexDirection = 'column';
                                            overlay.style.padding = '16px';
                                            document.body.appendChild(overlay);
                                        }
                                        overlay.innerHTML = '';

                                        // header/meta block
                                        const top = document.createElement('div');
                                        top.style.display = 'flex';
                                        top.style.alignItems = 'flex-start';
                                        top.style.justifyContent = 'space-between';
                                        top.style.gap = '12px';
                                        top.style.marginBottom = '12px';

                                        const meta = document.createElement('div');
                                        meta.style.display = 'grid';
                                        meta.style.gridTemplateColumns = '160px 1fr';
                                        meta.style.rowGap = '6px';
                                        meta.style.columnGap = '10px';

                                        const addMeta = (label, valueNode) => {
                                            const l = document.createElement('div');
                                            l.textContent = label;
                                            l.style.opacity = '0.8';
                                            const v = document.createElement('div');
                                            v.appendChild(valueNode);
                                            meta.appendChild(l);
                                            meta.appendChild(v);
                                        };

                                        const nodeName = (node && node.name) ? node.name : 'python node';
                                        addMeta('data name', document.createTextNode(nodeName));
                                        addMeta('python variable', document.createTextNode(String(labelText)));
                                        const typeWrap = document.createElement('div');
                                        const typeTag2 = typeTag.cloneNode(true);
                                        typeWrap.appendChild(typeTag2);
                                        addMeta('type', typeWrap);

                                        const closeBtn = document.createElement('button');
                                        closeBtn.className = 'btn btn_secondary';
                                        closeBtn.style.display = 'inline-flex';
                                        closeBtn.style.alignItems = 'center';
                                        closeBtn.style.gap = '6px';
                                        closeBtn.style.padding = '6px 10px';
                                        closeBtn.style.border = '1px solid var(--border-color)';
                                        closeBtn.style.background = 'var(--surface-color)';
                                        const closeIcon = document.createElement('span');
                                        closeIcon.className = 'material-icons';
                                        closeIcon.textContent = 'close';
                                        const closeLabel = document.createElement('span');
                                        closeLabel.textContent = 'close';
                                        closeBtn.appendChild(closeIcon);
                                        closeBtn.appendChild(closeLabel);
                                        closeBtn.addEventListener('click', () => {
                                            if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
                                        });

                                        top.appendChild(meta);
                                        top.appendChild(closeBtn);

                                        // content block
                                        const bottom = document.createElement('div');
                                        bottom.style.flex = '1 1 auto';
                                        bottom.style.background = '#1a1a1a';
                                        bottom.style.border = '1px solid rgba(255,255,255,0.08)';
                                        bottom.style.borderRadius = '8px';
                                        bottom.style.padding = '12px';
                                        bottom.style.overflow = 'auto';
                                        const pre = document.createElement('pre');
                                        pre.style.whiteSpace = 'pre-wrap';
                                        pre.style.wordBreak = 'break-word';
                                        try { pre.textContent = typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value); }
                                        catch(_) { pre.textContent = String(value); }
                                        bottom.appendChild(pre);

                                        overlay.appendChild(top);
                                        overlay.appendChild(bottom);
                                    });

                                    actions.appendChild(typeTag);
                                    actions.appendChild(openBtn);

                                    header.appendChild(nameEl);
                                    header.appendChild(headerSpacer);
                                    header.appendChild(actions);

                                    // value row (clamped to 3 lines with ellipsis)
                                    const valueEl = document.createElement('div');
                                    valueEl.style.fontFamily = 'monospace';
                                    valueEl.style.fontSize = '0.85rem';
                                    valueEl.style.color = '#ffa726';
                                    valueEl.style.display = '-webkit-box';
                                    valueEl.style.webkitBoxOrient = 'vertical';
                                    valueEl.style.webkitLineClamp = '3';
                                    valueEl.style.overflow = 'hidden';
                                    valueEl.style.whiteSpace = 'pre-wrap';
                                    valueEl.style.wordBreak = 'break-word';
                                    try { valueEl.textContent = typeof value === 'string' ? value : JSON.stringify(value, null, 2); }
                                    catch(_) { valueEl.textContent = String(value); }

                                    row.appendChild(header);
                                    row.appendChild(valueEl);

                                    pythonReturnsContent.appendChild(row);
                                    return { row, nameEl, valueEl };
                                };

                                // assign a unique render key to prevent duplicate async renders
                                const renderKey = `${node.id}_${Date.now()}_${Math.random().toString(36).slice(2)}`;
                                try { pythonReturnsContent.dataset.renderKey = renderKey; } catch(_) {}
                                const isStale = () => {
                                    try { return pythonReturnsContent.dataset.renderKey !== renderKey; } catch(_) { return false; }
                                };
                                const safeMakeRow = (labelText, value) => {
                                    if (isStale()) return { row: null, nameEl: { textContent: '' }, valueEl: null };
                                    return makeRow(labelText, value);
                                };

                                // helper: analyze this node's python to infer variable names for tuple/list/primitive
                                const fetchReturnVariableInfo = async () => {
                                    try {
                                        if (!node.pythonFile) return { groups: [], flat: [] };
                                        const resp = await fetch('/api/analyze-python-function', {
                                            method: 'POST',
                                            headers: { 'Content-Type': 'application/json' },
                                            body: JSON.stringify({ python_file: node.pythonFile })
                                        });
                                        const info = await resp.json();
                                        const returns = Array.isArray(info.returns) ? info.returns : [];
                                        // group return items by line so tuple elements from the same return are together
                                        const groupsMap = new Map();
                                        returns.forEach(it => {
                                            const ln = (it && typeof it.line === 'number') ? it.line : -1;
                                            if (!groupsMap.has(ln)) groupsMap.set(ln, []);
                                            groupsMap.get(ln).push(it);
                                        });
                                        const groups = Array.from(groupsMap.values());
                                        return { groups, flat: returns };
                                    } catch(_) { return { groups: [], flat: [] }; }
                                };

                                (async () => {
                                    if (ret == null) {
                                        if (!isStale()) {
                                            const row = document.createElement('div');
                                            row.textContent = 'no variables returned';
                                            pythonReturnsContent.appendChild(row);
                                        }
                                        return;
                                    }

                                    // dict: show each key/value; keys are treated as variable names
                                    if (typeof ret === 'object' && !Array.isArray(ret)) {
                                        const entries = Object.entries(ret);
                                        if (entries.length === 0) {
                                            if (!isStale()) {
                                                const row = document.createElement('div');
                                                row.textContent = 'no variables returned';
                                                pythonReturnsContent.appendChild(row);
                                            }
                                        } else {
                                            entries.forEach(([key, val]) => { if (!isStale()) safeMakeRow(key, val); });
                                        }
                                        return;
                                    }

                                    // for arrays/tuples or primitive values, use analyzer to label by variable names from the script
                                    const { groups, flat } = await fetchReturnVariableInfo();

                                    if (isStale()) return; // abort if a newer render started

                                    // arrays/tuples should be shown as a single variable block, not split per item
                                    if (Array.isArray(ret)) {
                                        // if exactly one variable is referenced in the return expression, use its name; otherwise use 'return_value'
                                        const onlyVarsForArray = flat.filter(x => x && x.type === 'variable');
                                        const arrayLabel = (onlyVarsForArray.length === 1 && onlyVarsForArray[0].name)
                                            ? onlyVarsForArray[0].name
                                            : 'return_value';
                                        safeMakeRow(arrayLabel, ret);
                                        return;
                                    }

                                    // primitive: if exactly one variable is reported, use that name; else use 'return_value'
                                    const onlyVars = flat.filter(x => x && x.type === 'variable');
                                    const label = (onlyVars.length === 1 && onlyVars[0].name) ? onlyVars[0].name : 'return_value';
                                    safeMakeRow(label, ret);
                                })();
                            }
                        }
                    } else {
                        if (pythonReturnsGroup) pythonReturnsGroup.style.display = 'none';
                    }
                } catch(_) {}
                if (executionResult) {
                    const _rt = executionResult.runtime || 0;
                    executionTimeText.textContent = `${(_rt/1000).toFixed(3)}s`;
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
                        if (consoleLogEl) {
                            const rawOutput = executionResult.output || '';
                            const lines = rawOutput.split(/\r?\n/).filter(l => l.trim().length > 0);
                            consoleLogEl.textContent = lines.length ? lines.join('\n') : 'no console output';
                        }
                    } else {
                        if (nodeInputContent) nodeInputContent.textContent = 'execution failed';
                        if (nodeOutputContent) nodeOutputContent.textContent = 'execution failed';
                        if (consoleLogEl) consoleLogEl.textContent = executionResult.error || 'unknown error';
                    }
                } else {
                    if (nodeInputContent) nodeInputContent.textContent = 'no inputs - node not executed';
                    if (nodeOutputContent) nodeOutputContent.textContent = 'no returns - node not executed';
                    if (consoleLogEl) consoleLogEl.textContent = 'no console output - node not executed';
                }
            }
        } else if (selection.nodes.length > 1) {
            if (executionStatusGroup) executionStatusGroup.style.display = '';
            // restore neutral styling for multi-select
            if (executionStatusText) executionStatusText.style.color = '';
            if (executionStatusIcon) executionStatusIcon.style.color = 'var(--on-surface)';
            if (executionTimeGroup) executionTimeGroup.style.display = '';
            // progress should only be visible when no nodes are selected
            if (progressGroup) progressGroup.style.display = 'none';
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
            if (consoleLogEl) consoleLogEl.textContent = 'select a single node to view console output';
        } else {
            if (executionStatusGroup) executionStatusGroup.style.display = '';
            // restore neutral styling for no selection; let global status control the message
            if (executionStatusText) executionStatusText.style.color = '';
            if (executionStatusIcon) executionStatusIcon.style.color = 'var(--on-surface)';
            // when selecting an if condition (if->python link), hide progress
            let hideProgressForIfLink = false;
            let isAnyLinkSelected = false;
            try {
                if (selection && selection.link) {
                    isAnyLinkSelected = true;
                    const s = this.state.getNode(selection.link.source);
                    const t = this.state.getNode(selection.link.target);
                    hideProgressForIfLink = !!(s && t && s.type === 'if_node' && t.type === 'python_file');
                }
            } catch(_) { hideProgressForIfLink = false; }
            if (progressGroup) progressGroup.style.display = hideProgressForIfLink ? 'none' : '';
            if (nodeFileInfoGroup) nodeFileInfoGroup.style.display = 'none';
            if (nodeInputGroup) nodeInputGroup.style.display = 'none';
            if (nodeOutputGroup) nodeOutputGroup.style.display = 'none';
            if (consoleGroup) consoleGroup.style.display = 'none';
            if (dataSaveGroup) dataSaveGroup.style.display = 'none';
            const app = window.flowchartApp;
            const isRunning = !!(app && app._elapsedTimer);
            const hasLast = !!(app && (app.lastExecutionElapsedMs || app.lastExecutionElapsedMs === 0));
            // hide execution time row when a link (e.g., if condition) is selected
            if (executionTimeRow) executionTimeRow.style.display = isAnyLinkSelected ? 'none' : ((isRunning || hasLast) ? 'flex' : 'none');
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
		// format path with line breaks and small indentation after each directory separator
		// all comments in lower case
		const formatPathForDisplay = (pathValue) => {
			try {
				const normalized = String(pathValue).replace(/\\/g, '/');
				const escaped = normalized
					.replace(/&/g, '&amp;')
					.replace(/</g, '&lt;')
					.replace(/>/g, '&gt;')
					.replace(/\"/g, '&quot;')
					.replace(/'/g, '&#39;');
				return escaped.replace(/\//g, '/<br>&nbsp;&nbsp;');
			} catch (_) {
				return String(pathValue);
			}
		};
		const formattedPath = formatPathForDisplay(pythonFile);
        if (pythonFile === 'not assigned') {
            container.innerHTML = `
                <div class="info_empty">
                    no python file assigned
                </div>
            `;
            return;
        }
        const funcNameId = `function_name_value_${node.id}`;
        const totalLinesId = `total_lines_value_${node.id}`;
        container.innerHTML = `
            <div id="node_file_details_card" class="data_save_details_card">
                <div class="data_save_details_grid">
                    <div class="data_save_field">
                        <div class="data_save_label">file path</div>
						<div id="node_file_path_${node.id}" class="data_save_value data_save_value_monospace">${formattedPath}</div>
                    </div>
                    <div class="data_save_field">
                        <div class="data_save_label">function</div>
                        <div id="${funcNameId}" class="data_save_value data_save_value_monospace">analyzing...</div>
                    </div>
                    <div class="data_save_field">
                        <div class="data_save_label">total lines</div>
                        <div id="${totalLinesId}" class="data_save_value">-</div>
                    </div>
                </div>
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
            const nameEl = document.getElementById(`function_name_value_${nodeId}`);
            const linesEl = document.getElementById(`total_lines_value_${nodeId}`);
            if (result.success) {
                const totalLines = (typeof result.total_lines === 'number') ? result.total_lines : null;
                const functionName = result.function_name || 'unknown';
                if (nameEl) nameEl.textContent = functionName;
                if (linesEl) linesEl.textContent = (totalLines !== null ? totalLines : '-');
                // legacy fallback container handling if present
                const legacy = document.getElementById(`function_info_${nodeId}`);
                if (legacy && !legacy.children.length) {
                    legacy.innerHTML = `
                        <div class="data_save_field">
                            <div class="data_save_label">function</div>
                            <div class="data_save_value data_save_value_monospace">${functionName}</div>
                        </div>
                        <div class="data_save_field">
                            <div class="data_save_label">total lines</div>
                            <div class="data_save_value">${totalLines !== null ? totalLines : '-'}</div>
                        </div>
                    `;
                }
            } else {
                if (nameEl) nameEl.textContent = 'analysis failed';
                const legacy = document.getElementById(`function_info_${nodeId}`);
                if (legacy) legacy.textContent = 'function analysis failed';
            }
        } catch (error) {
            const nameEl = document.getElementById(`function_name_value_${nodeId}`);
            if (nameEl) nameEl.textContent = 'unable to analyze function';
            const legacy = document.getElementById(`function_info_${nodeId}`);
            if (legacy) legacy.textContent = 'unable to analyze function';
        }
    };
})();


