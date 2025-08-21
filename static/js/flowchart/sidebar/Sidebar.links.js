// link panel population and variable analysis (shared and if→python)
(function(){
    if (!window.Sidebar) return;

    Sidebar.prototype.populateLinkForm = function(link) {
        const connectionInfo = document.querySelector('#link_properties .form_group:first-child');
        const sharedVariablesEl = document.getElementById('shared_variables_container');
        const sharedVariablesGroup = sharedVariablesEl ? sharedVariablesEl.closest('.form_group') : null;
        const refreshButton = document.getElementById('refresh_variables_btn');
        const deleteButton = document.getElementById('delete_link_btn');
        const ifVariablesSection = document.getElementById('if_connection_variables_section');
        const activeIfSection = document.getElementById('if_active_conditions_section');
        
        const V = window.SidebarVisibility;
        if (V) {
            if (connectionInfo) V.show(connectionInfo, 'block');
            if (sharedVariablesGroup) V.show(sharedVariablesGroup, 'block');
            if (refreshButton) V.show(refreshButton, 'block');
            if (deleteButton) V.show(deleteButton, 'block');
            if (ifVariablesSection) V.hide(ifVariablesSection);
            if (activeIfSection) V.hide(activeIfSection);
        } else {
            if (connectionInfo) connectionInfo.style.display = 'block';
            if (sharedVariablesGroup) sharedVariablesGroup.style.display = 'block';
            if (refreshButton) refreshButton.style.display = 'block';
            if (deleteButton) deleteButton.style.display = 'block';
            if (ifVariablesSection) ifVariablesSection.style.display = 'none';
            if (activeIfSection) activeIfSection.style.display = 'none';
        }
        
        const sourceNode = this.state.getNode(link.source);
        const targetNode = this.state.getNode(link.target);
        
        document.getElementById('link_source_name').textContent = sourceNode ? sourceNode.name : 'unknown node';
        document.getElementById('link_target_name').textContent = targetNode ? targetNode.name : 'unknown node';
        document.getElementById('link_source_file').textContent = sourceNode ? (sourceNode.pythonFile || 'no file') : 'unknown';
        document.getElementById('link_target_file').textContent = targetNode ? (targetNode.pythonFile || 'no file') : 'unknown';
        
        if (sourceNode && targetNode && sourceNode.type === 'python_file' && targetNode.type === 'python_file') {
            this.analyzeArgumentCoverageForLink(link, sourceNode, targetNode);
        } else {
            this.analyzeConnectionVariables(link, sourceNode, targetNode);
        }
    };

    Sidebar.prototype.showConnectionNodePanel = function(link) {
        const connectionInfo = document.querySelector('#link_properties .form_group:first-child');
        const sharedVariablesEl = document.getElementById('shared_variables_container');
        const sharedVariablesGroup = sharedVariablesEl ? sharedVariablesEl.closest('.form_group') : null;
        const refreshButton = document.getElementById('refresh_variables_btn');
        const activeIfSection = document.getElementById('if_active_conditions_section');
        
        const V = window.SidebarVisibility;
        if (V) {
            if (connectionInfo) V.hide(connectionInfo);
            if (sharedVariablesGroup) V.hide(sharedVariablesGroup);
            if (refreshButton) V.hide(refreshButton);
            if (activeIfSection) V.hide(activeIfSection);
        } else {
            if (connectionInfo) connectionInfo.style.display = 'none';
            if (sharedVariablesGroup) sharedVariablesGroup.style.display = 'none';
            if (refreshButton) refreshButton.style.display = 'none';
            if (activeIfSection) activeIfSection.style.display = 'none';
        }
        
        const ifVariablesSection = document.getElementById('if_connection_variables_section');
        if (ifVariablesSection) { const V2 = window.SidebarVisibility; if (V2) V2.show(ifVariablesSection, 'block'); else ifVariablesSection.style.display = 'block'; }
        const deleteButton = document.getElementById('delete_link_btn');
        if (deleteButton) { const V2 = window.SidebarVisibility; if (V2) V2.show(deleteButton, 'block'); else deleteButton.style.display = 'block'; deleteButton.style.width = '100%'; }
        this.populateConnectionNodeVariables(link);
        this.initializeIfConditionBuilder(link);
        // render existing conditions into the new section
        this.renderIfConditions(link);

        // when in run mode, show explanation for evaluated result
        try {
            if (this.state.isRunMode) {
                const linkObj = this.state.getLink(link.source, link.target) || link;
                const rcond = linkObj && linkObj.runtime_condition;
                const rdetails = linkObj && linkObj.runtime_details;
                // insert or update a run-mode explanation block under the builder
                let explainGroup = document.getElementById('if_runtime_explain_group');
                if (!explainGroup) {
                    // create the group right after the condition builder group
                    const container = document.querySelector('#link_properties .sidebar_content');
                    if (container) {
                        explainGroup = document.createElement('div');
                        explainGroup.className = 'form_group';
                        explainGroup.id = 'if_runtime_explain_group';
                        explainGroup.innerHTML = `
                            <label class="form_label">why this arm ${rcond === 'true' ? 'ran' : 'did not run'}</label>
                            <div id="if_runtime_explain" style="background: var(--surface-variant); border: 1px solid var(--border-color); border-radius: 4px; padding: 12px;"></div>
                        `;
                        // place after the active conditions section if present
                        const after = document.getElementById('if_active_conditions_section');
                        if (after && after.parentElement === container) {
                            container.insertBefore(explainGroup, after.nextSibling);
                        } else {
                            container.appendChild(explainGroup);
                        }
                    }
                }
                if (explainGroup) {
                    const explain = document.getElementById('if_runtime_explain');
                    if (explain) {
                        if (!rcond) {
                            explain.innerHTML = '<div style="opacity:.75;">no runtime result yet. start execution to evaluate the condition.</div>';
                        } else {
                            // build a small summary using saved variables and per-condition results
                            const statusRow = `
                                <div style="display:flex; align-items:center; gap:8px; margin-bottom:8px;">
                                    <span class="material-icons" style="font-size:18px; color:${rcond === 'true' ? '#4caf50' : '#f44336'};">${rcond === 'true' ? 'check_circle' : 'cancel'}</span>
                                    <strong style="text-transform: lowercase;">condition ${rcond === 'true' ? 'true' : 'false'}</strong>
                                </div>
                            `;
                            const vars = (rdetails && rdetails.variables) || {};
                            const conds = Array.isArray(rdetails && rdetails.conditions) ? rdetails.conditions : [];
                            const varsRows = Object.keys(vars).length
                                ? `
                                    <div style="margin-top:6px;">
                                        <div style="opacity:.8; font-size:.85em; margin-bottom:6px;">variables at evaluation</div>
                                        <div style="font-family: monospace; white-space: pre-wrap; background: rgba(255,255,255,0.06); border-radius:4px; padding:8px;">${this._prettyJson(vars)}</div>
                                    </div>
                                  `
                                : `<div style="margin-top:6px; opacity:.75;">no variables were available</div>`;
                            const condRows = conds.length
                                ? `
                                    <div style="margin-top:10px;">
                                        <div style="opacity:.8; font-size:.85em; margin-bottom:6px;">condition checks</div>
                                        ${conds.map((c, idx) => {
                                            const comb = idx === 0 ? '' : (c.combiner || 'and');
                                            const leftStr = (typeof c.left === 'string') ? `'${c.left}'` : c.left;
                                            const rightStr = (typeof c.value === 'string') ? `'${c.value}'` : c.value;
                                            return `
                                                <div style="display:flex; align-items:center; gap:6px;">
                                                    <span style="opacity:.7; width:28px; text-align:right;">${comb}</span>
                                                    <code style="font-family:monospace;">${c.variable} ${c.operator} ${rightStr}</code>
                                                    <span class="material-icons" style="font-size:16px; color:${c.result ? '#4caf50' : '#f44336'};">${c.result ? 'check' : 'close'}</span>
                                                    <span style="opacity:.7; font-size:.8em;">(${leftStr})</span>
                                                </div>
                                            `;
                                        }).join('')}
                                    </div>
                                  `
                                : '';
                            explain.innerHTML = `${statusRow}${varsRows}${condRows}`;
                        }
                    }
                }
            }
        } catch(_) {}
    };

    // helper to pretty print json in a stable compact way
    Sidebar.prototype._prettyJson = function(obj) {
        try {
            return JSON.stringify(obj, null, 2);
        } catch (_) {
            return String(obj);
        }
    };

    Sidebar.prototype.setupLinkEventHandlers = function() {
        const refreshBtn = document.getElementById('refresh_variables_btn');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', () => {
                if (!this.state.selectedLink) return;
                const sourceNode = this.state.getNode(this.state.selectedLink.source);
                const targetNode = this.state.getNode(this.state.selectedLink.target);
                // if both endpoints are python nodes, refresh the argument coverage view; otherwise refresh shared variables
                if (sourceNode && targetNode && sourceNode.type === 'python_file' && targetNode.type === 'python_file') {
                    this.analyzeArgumentCoverageForLink(this.state.selectedLink, sourceNode, targetNode);
                } else {
                    this.analyzeConnectionVariables(this.state.selectedLink, sourceNode, targetNode);
                }
            });
        }
        const deleteLinkBtn = document.getElementById('delete_link_btn');
        if (deleteLinkBtn) {
            deleteLinkBtn.addEventListener('click', () => {
                if (this.state.selectedLink) {
                    this.state.removeLink(this.state.selectedLink.source, this.state.selectedLink.target);
                    this.showSuccess('connection deleted');
                }
            });
        }
    };

    // run-mode: render explanation card in the execution panel for if→python link selection
    Sidebar.prototype.renderIfRuntimeExplainRun = function(link) {
        const container = document.querySelector('#run_execution_properties .sidebar_content');
        if (!container) return;
        let group = document.getElementById('if_runtime_explain_run_group');
        if (!group) {
            group = document.createElement('div');
            group.id = 'if_runtime_explain_run_group';
            group.className = 'form_group';
            // insert the explanation directly after the execution status section
            // all comments in lower case
            const statusGroup = document.getElementById('execution_status')?.closest('.form_group');
            if (statusGroup && statusGroup.parentElement === container) {
                container.insertBefore(group, statusGroup.nextSibling);
            } else {
                // fallback: place as the second visible form group
                const firstEl = container.firstElementChild;
                if (firstEl && firstEl.nextElementSibling) {
                    container.insertBefore(group, firstEl.nextElementSibling);
                } else {
                    container.appendChild(group);
                }
            }
        }
        const linkObj = this.state.getLink(link.source, link.target) || link;
        const rcond = linkObj && linkObj.runtime_condition;
        const rdetails = linkObj && linkObj.runtime_details;
        const title = `why this arm ${rcond === 'true' ? 'ran' : 'did not run'}`;
        const header = `<label class="form_label">${title}</label>`;
        let body = '<div style="opacity:.75;">no runtime result yet. start execution to evaluate the condition.</div>';
        if (rcond) {
            const vars = (rdetails && rdetails.variables) || {};
            const conds = Array.isArray(rdetails && rdetails.conditions) ? rdetails.conditions : [];
            const statusRow = `
                <div style="display:flex; align-items:center; gap:8px; margin-bottom:8px;">
                    <span class="material-icons" style="font-size:18px; color:${rcond === 'true' ? '#4caf50' : '#f44336'};">${rcond === 'true' ? 'check_circle' : 'cancel'}</span>
                    <strong style="text-transform: lowercase;">condition ${rcond === 'true' ? 'true' : 'false'}</strong>
                </div>`;
            const varsRows = Object.keys(vars).length
                ? `
                    <div style="margin-top:6px;">
                        <div style="opacity:.8; font-size:.85em; margin-bottom:6px;">variables at evaluation</div>
                        <div style="font-family: monospace; white-space: pre-wrap; background: rgba(255,255,255,0.06); border-radius:4px; padding:8px;">${this._prettyJson(vars)}</div>
                    </div>`
                : `<div style="margin-top:6px; opacity:.75;">no variables were available</div>`;
            const condRows = conds.length
                ? `
                    <div style="margin-top:10px;">
                        <div style="opacity:.8; font-size:.85em; margin-bottom:6px;">condition checks</div>
                        ${conds.map((c, idx) => {
                            const comb = idx === 0 ? '' : (c.combiner || 'and');
                            const leftStr = (typeof c.left === 'string') ? `'${c.left}'` : c.left;
                            const rightStr = (typeof c.value === 'string') ? `'${c.value}'` : c.value;
                            return `
                                <div style="display:flex; align-items:center; gap:6px;">
                                    <span style="opacity:.7; width:28px; text-align:right;">${comb}</span>
                                    <code style="font-family:monospace;">${c.variable} ${c.operator} ${rightStr}</code>
                                    <span class="material-icons" style="font-size:16px; color:${c.result ? '#4caf50' : '#f44336'};">${c.result ? 'check' : 'close'}</span>
                                    <span style="opacity:.7; font-size:.8em;">(${leftStr})</span>
                                </div>`;
                        }).join('')}
                    </div>`
                : '';
            body = `${statusRow}${varsRows}${condRows}`;
        }
        group.innerHTML = `${header}<div style="background: var(--surface-variant); border-radius: 4px; padding: 12px;">${body}</div>`;
    };

    Sidebar.prototype.clearIfRuntimeExplainRun = function() {
        const group = document.getElementById('if_runtime_explain_run_group');
        if (group && group.parentElement) {
            group.parentElement.removeChild(group);
        }
    };
})();


