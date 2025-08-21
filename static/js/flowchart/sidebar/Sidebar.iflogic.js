// if node related variable analysis and condition builder
(function(){
    if (!window.Sidebar) return;

    // close all dropdown menus in the document except the provided one
    Sidebar.prototype._closeAllDropdownMenus = function(exceptMenu) {
        const menus = document.querySelectorAll('.dropdown_menu');
        menus.forEach((menu) => {
            if (menu === exceptMenu) return;
            // remove class-based open state
            menu.classList.remove('show');
            // clear any inline display overrides to prevent conflicts with css rules
            menu.style.display = '';
        });
    };

    Sidebar.prototype.initializeIfConditionBuilder = function(link) {
        const addBtn = document.getElementById('if_add_condition_btn');
        if (!addBtn) return;
        this.renderIfConditions(link);
        const combinerContainer = document.getElementById('if_combiner_container');
        if (combinerContainer) {
            const existing = this.getIfConditionsForLink(link);
            combinerContainer.style.display = existing.length === 0 ? 'none' : 'block';
        }
        // setup custom dropdowns
        this.setupIfVariablesDropdown();
        this.setupIfOperatorDropdown();
        // enforce disabled state until all inputs are filled
        const varInput = document.getElementById('if_variables_dropdown');
        const opInput = document.getElementById('if_operator_dropdown');
        const valueInput = document.getElementById('if_compare_value_input');
        this.updateIfAddConditionButtonState();
        const self = this;
        if (valueInput) {
            valueInput.addEventListener('input', function(){ self.updateIfAddConditionButtonState(); });
        }
        addBtn.onclick = () => {
            const varDropdown = document.getElementById('if_variables_dropdown');
            const operatorDropdown = document.getElementById('if_operator_dropdown');
            const valueInput = document.getElementById('if_compare_value_input');
            const combinerDropdown = document.getElementById('if_condition_combiner');
            const variable = varDropdown.dataset.value || '';
            const operator = operatorDropdown.dataset.value || '';
            const compareValue = valueInput.value;
            const existingBefore = this.getIfConditionsForLink(link);
            const combiner = existingBefore.length === 0 ? undefined : (combinerDropdown.value || 'and');
            if (!variable || !operator) {
                this.showError('select a variable and operator');
                return;
            }
            const existing = this.getIfConditionsForLink(link);
            const newCondition = existing.length === 0 ? { variable, operator, value: compareValue } : { variable, operator, value: compareValue, combiner };
            const updated = [...existing, newCondition];
            this.setIfConditionsForLink(link, updated);
            valueInput.value = '';
            this.renderIfConditions(link);
            if (combinerContainer) combinerContainer.style.display = 'block';
            this.showSuccess('condition added');
            this.updateIfAddConditionButtonState();
        };
    };

    Sidebar.prototype.updateIfAddConditionButtonState = function() {
        const addBtn = document.getElementById('if_add_condition_btn');
        const varInput = document.getElementById('if_variables_dropdown');
        const opInput = document.getElementById('if_operator_dropdown');
        const valueInput = document.getElementById('if_compare_value_input');
        if (!addBtn || !varInput || !opInput || !valueInput) return;
        const hasVar = !!(varInput.dataset && varInput.dataset.value);
        const hasOp = !!(opInput.dataset && opInput.dataset.value);
        const hasVal = String(valueInput.value || '').trim().length > 0;
        const enabled = hasVar && hasOp && hasVal;
        addBtn.disabled = !enabled;
        addBtn.style.opacity = enabled ? '' : '0.6';
        addBtn.style.cursor = enabled ? '' : 'not-allowed';
    };

    Sidebar.prototype.setupIfVariablesDropdown = function() {
        const input = document.getElementById('if_variables_dropdown');
        const menu = document.getElementById('if_variables_dropdown_menu');
        if (!input || !menu) return;
        const container = input.closest('.dropdown_container');
        const openMenu = () => {
            this._closeAllDropdownMenus(menu);
            // ensure no inline style prevents css class from taking effect
            menu.style.display = '';
            const D = window.SidebarDropdowns;
            if (D) D.open(menu); else menu.classList.add('show');
        };
        const closeMenu = () => {
            const D = window.SidebarDropdowns;
            if (D) D.close(menu); else menu.classList.remove('show');
        };
        input.addEventListener('click', (e) => { e.stopPropagation(); openMenu(); });
        document.addEventListener('click', (e) => {
            if (!container.contains(e.target)) closeMenu();
        });
        // items are populated when variables are loaded
        menu.addEventListener('click', (e) => {
            const item = e.target.closest('[data-value]');
            if (!item) return;
            input.value = item.dataset.label || item.dataset.value;
            input.dataset.value = item.dataset.value;
            closeMenu();
            if (typeof this.updateIfAddConditionButtonState === 'function') this.updateIfAddConditionButtonState();
        });
    };

    Sidebar.prototype.setupIfOperatorDropdown = function() {
        const input = document.getElementById('if_operator_dropdown');
        const menu = document.getElementById('if_operator_dropdown_menu');
        if (!input || !menu) return;
        const container = input.closest('.dropdown_container');
        const openMenu = () => {
            this._closeAllDropdownMenus(menu);
            // ensure no inline style prevents css class from taking effect
            menu.style.display = '';
            const D = window.SidebarDropdowns;
            if (D) D.open(menu); else menu.classList.add('show');
        };
        const closeMenu = () => {
            const D = window.SidebarDropdowns;
            if (D) D.close(menu); else menu.classList.remove('show');
        };
        input.addEventListener('click', (e) => { e.stopPropagation(); openMenu(); });
        document.addEventListener('click', (e) => {
            if (!container.contains(e.target)) closeMenu();
        });
		const operators = [
			{ value: '==', label: 'equals' },
			{ value: '===', label: 'strictly equals' },
			{ value: '>', label: 'greater than' },
			{ value: '<', label: 'less than' },
			{ value: '>=', label: 'greater than or equal' },
			{ value: '<=', label: 'less than or equal' },
			// array length operators
			{ value: 'len==', label: 'array length ==' },
			{ value: 'len<', label: 'array length less than' },
			{ value: 'len>', label: 'array length greater than' }
		];
        menu.innerHTML = operators.map(op => `
            <div class="dropdown_item" data-value="${op.value}" data-label="${op.label}" style="display:flex; align-items:center; gap:8px; justify-content: space-between;">
                <span style="font-family: monospace;">${op.value}</span>
                <span style="opacity:0.8;">${op.label}</span>
            </div>
        `).join('');
        menu.addEventListener('click', (e) => {
            const item = e.target.closest('[data-value]');
            if (!item) return;
            // show symbol and description in the input for clarity
            input.value = `${item.dataset.value} ${item.dataset.label}`;
            input.dataset.value = item.dataset.value;
            closeMenu();
            if (typeof this.updateIfAddConditionButtonState === 'function') this.updateIfAddConditionButtonState();
        });
    };

    Sidebar.prototype.getIfConditionsForLink = function(link) {
        const existingLink = this.state.getLink(link.source, link.target);
        return (existingLink && existingLink.conditions && Array.isArray(existingLink.conditions)) ? existingLink.conditions : [];
    };

    Sidebar.prototype.setIfConditionsForLink = function(link, conditions) {
        this.state.updateLink(link.source, link.target, { conditions });
    };

    Sidebar.prototype.removeIfCondition = function(link, index) {
        const existing = this.getIfConditionsForLink(link);
        if (index < 0 || index >= existing.length) return;
        existing.splice(index, 1);
        this.setIfConditionsForLink(link, [...existing]);
        this.renderIfConditions(link);
        // hide combiner when there are no active conditions
        const combinerContainer = document.getElementById('if_combiner_container');
        if (combinerContainer) {
            combinerContainer.style.display = existing.length === 0 ? 'none' : 'block';
        }
        this.showSuccess('condition removed');
    };

    Sidebar.prototype.renderIfConditions = function(link) {
        // new location for active conditions
        const container = document.getElementById('active_if_conditions_list') || document.getElementById('if_conditions_list');
        const section = document.getElementById('if_active_conditions_section');
        if (!container) return;
        const conditions = this.getIfConditionsForLink(link);
        container.innerHTML = '';
        if (!conditions.length) {
            const empty = document.createElement('div');
            empty.style.cssText = 'text-align:center; opacity:.7; padding: 8px; font-size:.85em;';
            empty.textContent = 'no conditions yet';
            container.appendChild(empty);
        if (section) { const V = window.SidebarVisibility; if (V) V.hide(section); else section.style.display = 'none'; }
            return;
        }
        if (section) { const V = window.SidebarVisibility; if (V) V.show(section, 'block'); else section.style.display = 'block'; }
        conditions.forEach((c, idx) => {
            const row = document.createElement('div');
            row.style.cssText = 'display:flex; align-items:center; gap:8px; background: var(--surface); border:1px solid var(--border-color); border-radius:4px; padding:8px; margin-bottom:6px;';
            const text = document.createElement('div');
            text.style.cssText = 'font-family: monospace; font-size:.9em; flex:1;';
            const prefix = idx === 0 ? '' : (c.combiner || 'and');
            text.textContent = `${prefix} ${c.variable} ${c.operator} ${c.value}`.trim();
            const del = document.createElement('button');
            del.className = 'btn btn_danger';
            del.innerHTML = '<span class="material-icons" style="font-size:16px;">delete</span>';
            del.style.cssText = 'padding:4px 8px;';
            del.addEventListener('click', () => this.removeIfCondition(link, idx));
            row.appendChild(text);
            row.appendChild(del);
            container.appendChild(row);
        });
    };

    Sidebar.prototype.populateConnectionNodeVariables = async function(link) {
        const sourceNode = this.state.getNode(link.source);
        const targetNode = this.state.getNode(link.target);
        if (!sourceNode || !targetNode) {
            this.showIfVariablesError('could not find connected nodes');
            return;
        }
        let ifNode, pythonNode;
        if (sourceNode.type === 'if_node' && targetNode.type === 'python_file') {
            ifNode = sourceNode; pythonNode = targetNode;
        } else if (sourceNode.type === 'python_file' && targetNode.type === 'if_node') {
            ifNode = targetNode; pythonNode = sourceNode;
        } else {
            this.showIfVariablesError('connection must be between if node and python node');
            return;
        }
        this.showIfVariablesState('loading');
        try {
            const ifNodeVariables = await this.getIfNodeVariables(ifNode);
            if (ifNodeVariables.length === 0) {
                this.showIfVariablesState('empty');
                return;
            }
            this.displayConnectionNodeVariables(ifNodeVariables, ifNode.name);
        } catch (error) {
            console.error('error populating connection node variables:', error);
            this.showIfVariablesError('failed to get if node variables');
        }
    };

    Sidebar.prototype.getIfNodeVariables = async function(ifNode) {
        const incomingLinks = this.state.links.filter(link => link.target === ifNode.id);
        const pythonNodes = [];
        for (const link of incomingLinks) {
            const sourceNode = this.state.getNode(link.source);
            if (sourceNode && sourceNode.pythonFile) {
                pythonNodes.push(sourceNode);
            }
        }
        if (pythonNodes.length === 0) {
            return [];
        }
        const allVariables = [];
        for (const pythonNode of pythonNodes) {
            const response = await fetch('/api/analyze-python-function', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ python_file: pythonNode.pythonFile })
            });
            const data = await response.json();
            if ((data.status === 'success' || data.success === true) && data.returns && data.returns.length > 0) {
                data.returns.forEach(returnVar => {
                    allVariables.push({
                        ...returnVar,
                        sourceNode: pythonNode.name,
                        sourceFile: pythonNode.pythonFile
                    });
                });
            }
        }
        return allVariables;
    };

    Sidebar.prototype.showIfVariablesState = function(state) {
        const states = ['loading', 'list', 'error', 'empty'];
        const V = window.SidebarVisibility;
        states.forEach(s => {
            const div = document.getElementById(`if_variables_${s}`);
            if (!div) return;
            if (V) V.setVisible(div, s === state, 'block'); else div.style.display = s === state ? 'block' : 'none';
        });
    };

    Sidebar.prototype.showIfVariablesError = function(message) {
        document.getElementById('if_variables_error_message').textContent = message;
        this.showIfVariablesState('error');
    };

    Sidebar.prototype.displayConnectionNodeVariables = function(variables) {
        const input = document.getElementById('if_variables_dropdown');
        const menu = document.getElementById('if_variables_dropdown_menu');
        if (!input || !menu) return;
        if (!variables || variables.length === 0) {
            this.showIfVariablesState('empty');
            return;
        }
        menu.innerHTML = variables.map(v => `
            <div class="dropdown_item" data-value="${v.name}" data-label="${v.name}" style="font-family: monospace;">
                ${v.name}
            </div>
        `).join('');
        // reset selection placeholder
        input.value = '';
        input.dataset.value = '';
        if (typeof this.updateIfAddConditionButtonState === 'function') this.updateIfAddConditionButtonState();
        this.showIfVariablesState('list');
    };

    Sidebar.prototype.analyzeIfConnectionVariables = async function(link) {
        this.showIfVariablesState('loading');
        const pythonNode = this.state.getNode(link.source);
        const ifNode = this.state.getNode(link.target);
        if (!pythonNode || !ifNode) {
            this.showIfVariablesError('could not find connected nodes');
            return;
        }
        if (pythonNode.type !== 'python_file') {
            this.showIfVariablesError('source node must be a python node');
            return;
        }
        if (ifNode.type !== 'if_node') {
            this.showIfVariablesError('target node must be an if node');
            return;
        }
        if (!pythonNode.pythonFile) {
            this.showIfVariablesError('python node must have a file assigned');
            return;
        }
        try {
            const response = await fetch('/api/analyze-python-function', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ python_file: pythonNode.pythonFile })
            });
            const data = await response.json();
            if (data.status === 'success') {
                this.displayIfVariables(data.returns || []);
            } else {
                this.showIfVariablesError(data.message || 'failed to analyze python node');
            }
        } catch (error) {
            console.error('error analyzing if connection variables:', error);
            this.showIfVariablesError('failed to connect to analysis service');
        }
    };

    Sidebar.prototype.analyzeIfNodeVariables = async function(ifNode) {
        this.showIfNodeVariablesState('loading');
        const incomingLinks = this.state.links.filter(link => link.target === ifNode.id);
        const pythonNodes = [];
        for (const link of incomingLinks) {
            const sourceNode = this.state.getNode(link.source);
            if (sourceNode && sourceNode.pythonFile) {
                pythonNodes.push(sourceNode);
            }
        }
        if (pythonNodes.length === 0) {
            this.showIfNodeVariablesState('empty');
            return;
        }
        try {
            const allVariables = [];
            for (const pythonNode of pythonNodes) {
                const response = await fetch('/api/analyze-python-function', {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ python_file: pythonNode.pythonFile })
                });
                const data = await response.json();
                if ((data.status === 'success' || data.success === true) && data.returns && data.returns.length > 0) {
                    data.returns.forEach(returnVar => {
                        allVariables.push({
                            ...returnVar,
                            sourceNode: pythonNode.name,
                            sourceFile: pythonNode.pythonFile
                        });
                    });
                }
            }
            this.displayIfNodeVariables(allVariables);
        } catch (error) {
            console.error('error analyzing if node variables:', error);
            this.showIfNodeVariablesError('failed to connect to analysis service');
        }
    };

    Sidebar.prototype.showIfNodeVariablesState = function(state) {
        const V = window.SidebarVisibility;
        const states = ['loading', 'list', 'error', 'empty'];
        states.forEach(s => {
            const div = document.getElementById(`if_node_variables_${s}`);
            if (!div) return;
            if (V) V.setVisible(div, s === state, 'block'); else div.style.display = s === state ? 'block' : 'none';
        });
        const contentDiv = document.getElementById('if_node_variables_content');
        if (contentDiv) { if (V) V.setVisible(contentDiv, state === 'list', 'block'); else contentDiv.style.display = state === 'list' ? 'block' : 'none'; }
    };

    Sidebar.prototype.showIfNodeVariablesError = function(message) {
        document.getElementById('if_node_variables_error_message').textContent = message;
        this.showIfNodeVariablesState('error');
    };

    Sidebar.prototype.displayIfVariables = function(returns) {
        const listDiv = document.getElementById('if_variables_list');
        const loadingDiv = document.getElementById('if_variables_loading');
        const errorDiv = document.getElementById('if_variables_error');
        const emptyDiv = document.getElementById('if_variables_empty');
        // the original code uses a simplified dropdown now; keep this for compatibility
        // do nothing here to avoid changing ui
    };

    Sidebar.prototype.displayIfNodeVariables = function(variables) {
        const contentDiv = document.getElementById('if_node_variables_content');
        if (!variables || variables.length === 0) {
            this.showIfNodeVariablesState('empty');
            return;
        }
        contentDiv.innerHTML = '';
        const groupedVariables = {};
        variables.forEach(variable => {
            const sourceNode = variable.sourceNode;
            if (!groupedVariables[sourceNode]) {
                groupedVariables[sourceNode] = [];
            }
            groupedVariables[sourceNode].push(variable);
        });
        Object.keys(groupedVariables).forEach(sourceNodeName => {
            const nodeVariables = groupedVariables[sourceNodeName];
            nodeVariables.forEach(variable => {
                const item = document.createElement('div');
                item.style.cssText = `
                    background: var(--surface-color);
                    border: 1px solid var(--border-color);
                    border-radius: 4px;
                    padding: 8px 10px;
                    margin-bottom: 4px;
                    display: flex;
                    align-items: center;
                    gap: 8px;
                `;
                let icon = 'label';
                let iconColor = '#4caf50';
                let typeText = variable.type || 'unknown';
                switch (variable.type) {
                    case 'constant':
                        icon = 'looks_one';
                        iconColor = '#2196f3';
                        break;
                    case 'list':
                        icon = 'list';
                        iconColor = '#9c27b0';
                        break;
                    case 'dict':
                        icon = 'data_object';
                        iconColor = '#ff5722';
                        break;
                    case 'function_call':
                        icon = 'functions';
                        iconColor = '#607d8b';
                        break;
                    case 'expression':
                        icon = 'calculate';
                        iconColor = '#795548';
                        break;
                }
                item.innerHTML = `
                    <span class="material-icons" style="font-size: 16px; color: ${iconColor};">${icon}</span>
                    <span style="font-family: monospace; font-weight: 500;">${variable.name || 'unknown'}</span>
                    <span style="font-size: 0.75rem; opacity: 0.7; margin-left: auto;">${typeText}</span>
                `;
                contentDiv.appendChild(item);
            });
        });
        this.showIfNodeVariablesState('list');
    };
})();


