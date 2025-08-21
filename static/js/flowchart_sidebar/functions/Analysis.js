// shared variable analysis for python↔python links and details formatting
(function(){
    if (!window.Sidebar) return;

    Sidebar.prototype.analyzeConnectionVariables = async function(link, sourceNode, targetNode) {
        const loadingDiv = document.getElementById('variables_loading');
        const listDiv = document.getElementById('variables_list');
        const errorDiv = document.getElementById('variables_error');
        const emptyDiv = document.getElementById('variables_empty');
        this.showVariablesState('loading');
        if (!sourceNode || !targetNode || !sourceNode.pythonFile || !targetNode.pythonFile) {
            this.showVariablesError('both nodes must have python files assigned');
            return;
        }
        try {
            const response = await fetch('/api/analyze-connection', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    source_node_id: link.source,
                    target_node_id: link.target,
                    flowchart_name: this.state.storage.getCurrentFlowchart()
                })
            });
            const data = await response.json();
            if (data.status === 'success') {
                this.displayVariables(data.analysis.shared_variables);
            } else {
                this.showVariablesError(data.message || 'analysis failed');
            }
        } catch (error) {
            console.error('error analyzing connection:', error);
            this.showVariablesError('failed to connect to analysis service');
        }
    };

    Sidebar.prototype.analyzeArgumentCoverageForLink = async function(link, sourceNode, targetNode) {
        const listDiv = document.getElementById('variables_list');
        this.showVariablesState('loading');
        if (!sourceNode?.pythonFile || !targetNode?.pythonFile) {
            this.showVariablesError('both nodes must have python files assigned');
            return;
        }
        try {
            const [srcResp, tgtResp] = await Promise.all([
                fetch('/api/analyze-python-function', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ python_file: sourceNode.pythonFile }) }),
                fetch('/api/analyze-python-function', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ python_file: targetNode.pythonFile }) })
            ]);
            const [srcData, tgtData] = [await srcResp.json(), await tgtResp.json()];
            if (!srcData.success || !tgtData.success) {
                this.showVariablesError('failed to analyze functions');
                return;
            }
            const sourceReturns = [];
            (srcData.returns || []).forEach(r => {
                if (!r) return;
                if (r.type === 'variable' && typeof r.name === 'string') {
                    sourceReturns.push(r.name);
                } else if (r.type === 'tuple' && Array.isArray(r.items)) {
                    r.items.forEach(it => { if (it && typeof it.name === 'string') sourceReturns.push(it.name); });
                } else if (r.type === 'dict' && Array.isArray(r.items)) {
                    r.items.forEach(it => { if (it && typeof it.key === 'string') sourceReturns.push(it.key); });
                }
            });
            const sourceReturnSet = new Set(sourceReturns);
            let targetArgs = Array.isArray(tgtData.formal_parameters) ? [...tgtData.formal_parameters] : [];
            targetArgs = targetArgs.filter(n => typeof n === 'string' && n !== 'self' && n !== 'cls');
            listDiv.innerHTML = '';
            if (!targetArgs || targetArgs.length === 0) {
                this.showVariablesState('empty');
                return;
            }
            let hasMissing = false;
            targetArgs.forEach(arg => {
                const item = document.createElement('div');
                item.style.cssText = `
                    background: var(--surface-color);
                    border: 1px solid var(--border-color);
                    border-radius: 4px;
                    padding: 8px 10px;
                    margin-bottom: 6px;
                    display: flex;
                    align-items: center;
                    gap: 8px;
                `;
                const isCovered = sourceReturnSet.has(arg);
                const color = isCovered ? '#4caf50' : '#f44336';
                const icon = isCovered ? 'check_circle' : 'cancel';
                const statusText = isCovered ? 'provided by source' : 'not provided by source';
                item.innerHTML = `
                    <span class="material-icons" style="font-size: 16px; color: ${color};">${icon}</span>
                    <span style="font-family: monospace; font-weight: 600; color: ${color};">${arg}</span>
                    <span style="font-size: 0.75rem; opacity: 0.7; margin-left: auto;">${statusText}</span>
                `;
                listDiv.appendChild(item);
                if (!isCovered) hasMissing = true;
            });
            this.showVariablesState('list');
            if (this.state && typeof this.state.emit === 'function') {
                this.state.emit('clearNodeCoverageAlerts');
                this.state.emit('updateLinkCoverageAlert', { sourceId: sourceNode.id, targetId: targetNode.id, hasMissing });
            }
        } catch (e) {
            console.error('error analyzing argument coverage:', e);
            this.showVariablesError('network error');
        }
    };

    Sidebar.prototype.showVariablesState = function(state) {
        const V = window.SidebarVisibility;
        const states = ['loading', 'list', 'error', 'empty'];
        states.forEach(s => {
            const div = document.getElementById(`variables_${s}`);
            if (!div) return;
            if (V) V.setVisible(div, s === state, 'block'); else div.style.display = s === state ? 'block' : 'none';
        });
    };

    Sidebar.prototype.showVariablesError = function(message) {
        document.getElementById('variables_error_message').textContent = message;
        this.showVariablesState('error');
    };

    Sidebar.prototype.displayVariables = function(variables) {
        const listDiv = document.getElementById('variables_list');
        if (!variables || variables.length === 0) { this.showVariablesState('empty'); return; }
        listDiv.innerHTML = '';
        variables.forEach(variable => {
            const item = document.createElement('div');
            item.style.cssText = `
                background: var(--surface-color);
                border: 1px solid var(--border-color);
                border-radius: 4px;
                padding: 8px 10px;
                margin-bottom: 6px;
            `;
            // name row
            const nameRow = document.createElement('div');
            nameRow.style.cssText = 'display:flex; align-items:center; gap:8px; margin-bottom:4px;';
            const nameEl = document.createElement('span');
            nameEl.textContent = variable.name || '-';
            nameEl.style.cssText = 'font-family: monospace; font-weight: 600;';
            nameRow.appendChild(nameEl);
            item.appendChild(nameRow);
            // tags row
            const tagsRow = document.createElement('div');
            tagsRow.style.cssText = 'display:flex; align-items:center; gap:6px; flex-wrap: wrap; margin-bottom:6px;';
            const typeChip = document.createElement('span');
            typeChip.textContent = this.formatVariableType(variable.type);
            typeChip.style.cssText = 'font-size: 0.72rem; opacity: 0.85; padding: 2px 6px; border-radius: 10px; background: rgba(255,255,255,0.06); border: 1px solid var(--border-color);';
            tagsRow.appendChild(typeChip);
            if (variable.confidence) {
                const confChip = document.createElement('span');
                confChip.textContent = String(variable.confidence);
                confChip.style.cssText = 'font-size: 0.72rem; opacity: 0.85; padding: 2px 6px; border-radius: 10px; background: rgba(255,255,255,0.06); border: 1px solid var(--border-color);';
                tagsRow.appendChild(confChip);
            }
            item.appendChild(tagsRow);
            // details row
            const detailsText = this.formatVariableDetails(variable);
            if (detailsText) {
                const detailsEl = document.createElement('div');
                detailsEl.textContent = detailsText;
                detailsEl.style.cssText = 'font-size: 0.78rem; opacity: 0.8;';
                item.appendChild(detailsEl);
            }
            listDiv.appendChild(item);
        });
        this.showVariablesState('list');
    };

    Sidebar.prototype.formatVariableType = function(type) {
        const typeMap = {
            'function_import': 'function import',
            'variable_import': 'variable import',
            'defined_and_used': 'defined → used',
            'common_assignment': 'common variable',
            'parameter_match': 'parameter match'
        };
        return typeMap[type] || type;
    };

    Sidebar.prototype.formatVariableDetails = function(variable) {
        const details = [];
        if (variable.source_line) details.push(`defined: line ${variable.source_line}`);
        if (variable.target_line) details.push(`used: line ${variable.target_line}`);
        if (variable.target_function) details.push(`used in function: ${variable.target_function}`);
        if (variable.parameters && variable.parameters.length > 0) details.push(`parameters: ${variable.parameters.join(', ')}`);
        if (variable.returns && variable.returns.length > 0) details.push(`returns: ${variable.returns.join(', ')}`);
        if (variable.value_type && variable.value_type !== 'unknown') details.push(`type: ${variable.value_type}`);
        return details.join(' • ');
    };
})();
