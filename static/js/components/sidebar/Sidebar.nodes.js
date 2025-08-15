// node and group property panels: populate and save
(function(){
    if (!window.Sidebar) return;

    // normalize a python path for api calls: strip any leading 'nodes/' segments
    function normalizePythonPathForApi(path) {
        try { return (path || '').replace(/\\/g, '/').replace(/^(?:nodes\/)*/i, ''); } catch (_) { return path || ''; }
    }

    // helper to compare css colors (rgb vs hex)
    Sidebar.prototype.colorsEqual = function(a, b){
        try {
            const toRgb = (c) => {
                const ctx = document.createElement('canvas').getContext('2d');
                ctx.fillStyle = '#000';
                ctx.fillStyle = c;
                return ctx.fillStyle; // normalized rgb(a,b,c)
            };
            return toRgb(a) === toRgb(b);
        } catch(_) { return a === b; }
    };

    Sidebar.prototype.populateNodeForm = function(node) {
        // defer visibility decisions to the centralized content engine
        if (this.contentEngine) {
            this.contentEngine.apply({ nodes: [node.id], link: null, group: null, annotation: null });
            return;
        }
        // legacy fallback will not be used in normal flow
    };

    Sidebar.prototype.updateSelectedNodesList = function(nodeIds) {
        const container = document.getElementById('selected_nodes_list');
        container.innerHTML = '';
        nodeIds.forEach(nodeId => {
            const node = this.state.getNode(nodeId);
            if (node) {
                const item = this.createNodeListItem(node);
                container.appendChild(item);
            }
        });
    };

    Sidebar.prototype.updateGroupMembersList = function(group) {
        const container = document.getElementById('group_members_list');
        container.innerHTML = '';
        const groupNodes = this.state.getGroupNodes(group.id);
        groupNodes.forEach(node => {
            const item = this.createNodeListItem(node);
            container.appendChild(item);
        });
    };

    Sidebar.prototype.createNodeListItem = function(node) {
        const item = document.createElement('div');
        item.className = 'node-list-item';
        item.style.cssText = `
            padding: 8px 12px; 
            margin: 4px 0; 
            background: var(--surface-color); 
            border-radius: 6px; 
            font-size: 0.875rem;
            display: flex;
            align-items: center;
            gap: 8px;
            cursor: pointer;
            transition: background-color 0.2s ease;
        `;
        const icon = document.createElement('span');
        icon.className = 'material-icons';
        icon.style.fontSize = '16px';
        icon.textContent = this.getNodeTypeIcon(node.type);
        item.appendChild(icon);
        const name = document.createElement('span');
        name.textContent = node.name;
        name.style.flex = '1';
        item.appendChild(name);
        item.addEventListener('mouseenter', () => {
            item.style.backgroundColor = 'var(--hover-color)';
            this.state.emit('highlightNode', { nodeId: node.id, highlight: true });
        });
        item.addEventListener('mouseleave', () => {
            item.style.backgroundColor = 'var(--surface-color)';
            this.state.emit('highlightNode', { nodeId: node.id, highlight: false });
        });
        item.addEventListener('click', () => {
            this.state.selectNode(node.id, false);
        });
        return item;
    };

    Sidebar.prototype.getNodeTypeIcon = function(type) {
        const icons = {
            'python_file': 'description',
            'module': 'folder',
            'function': 'functions',
            'class': 'class'
        };
        return icons[type] || 'description';
    };

    Sidebar.prototype.saveNodeProperties = async function() {
        const selectedNodes = Array.from(this.state.selectedNodes);
        if (selectedNodes.length !== 1) return;
        const nodeId = selectedNodes[0];
        const pythonFileInput = document.getElementById('python_file');
        const updates = {
            name: document.getElementById('node_name').value.trim(),
            // persist without the leading nodes/ prefix; backend will resolve under project root
            pythonFile: (function(inp){
                const raw = (inp && (inp.dataset.fullPath || inp.value) || '').trim();
                const normalized = raw.replace(/\\/g, '/');
                if (!normalized) return '';
                const noPrefix = normalized.replace(/^(?:nodes\/)*/i, '');
                return noPrefix;
            })(pythonFileInput)
        };
        if (!updates.name) { this.showError('node name is required'); return; }
        if (updates.pythonFile && !Validation.validatePythonFilePath(updates.pythonFile)) { this.showError('invalid python file path'); return; }
        try {
            await this.state.updateNode(nodeId, updates);
            this.showSuccess(`updated node: ${updates.name}`);
        } catch (error) {
            this.showError(error.message);
        }
    };

    Sidebar.prototype.deleteNodeFromSidebar = function() {
        const selectedNodes = Array.from(this.state.selectedNodes);
        if (selectedNodes.length !== 1) return;
        const node = this.state.getNode(selectedNodes[0]);
        this.state.removeNode(selectedNodes[0]);
        this.showSuccess(`deleted node: ${node.name}`);
    };

    Sidebar.prototype.createGroup = function() {
        const selectedNodes = Array.from(this.state.selectedNodes);
        if (selectedNodes.length < 2) { this.showError('select at least 2 nodes to create a group'); return; }
        try {
            const group = this.state.createGroup(selectedNodes);
            this.showSuccess(`created group: ${group.name}`);
        } catch (error) {
            this.showError(error.message);
        }
    };

    Sidebar.prototype.alignNodes = function() {
        const selectedNodes = this.state.getSelectedNodes();
        if (selectedNodes.length < 2) { this.showError('select at least 2 nodes to align'); return; }
        Geometry.alignNodesHorizontally(selectedNodes);
        this.state.emit('stateChanged');
        this.showSuccess('nodes aligned horizontally');
    };

    Sidebar.prototype.deleteSelectedNodes = function() {
        const selectedNodes = Array.from(this.state.selectedNodes);
        if (selectedNodes.length === 0) return;
        let deletedCount = 0;
        let inputNodeAttempts = 0;
        selectedNodes.forEach(nodeId => {
            const node = this.state.getNode(nodeId);
            if (node && node.type === 'input_node') {
                inputNodeAttempts++;
            } else {
                const success = this.state.removeNode(nodeId);
                if (success) deletedCount++;
            }
        });
        if (inputNodeAttempts > 0 && deletedCount === 0) {
            this.showError('input nodes cannot be deleted directly');
        } else if (inputNodeAttempts > 0 && deletedCount > 0) {
            this.showWarning(`deleted ${deletedCount} node(s) - input nodes cannot be deleted directly`);
        } else if (deletedCount > 0) {
            this.showSuccess(`deleted ${deletedCount} node(s)`);
        }
    };

    Sidebar.prototype.populateGroupForm = function(group) {
        document.getElementById('group_name').value = group.name || '';
        this.updateGroupMembersList(group);
        // build/update color palette on every render to avoid stale handlers
        const palette = document.getElementById('group_color_palette');
        if (palette) {
            palette.innerHTML = '';
            const colors = [
                '#ff5252', '#ff9800', '#ffeb3b', '#4caf50', '#00bcd4', '#2196f3',
                '#3f51b5', '#9c27b0', '#e91e63', '#8bc34a', '#00e676', '#ff4081'
            ];
            const currentGroupId = (this.state && this.state.selectedGroup ? this.state.selectedGroup.id : group.id);
            colors.forEach(color => {
                const swatch = document.createElement('button');
                swatch.type = 'button';
                swatch.className = 'color_swatch';
                swatch.style.backgroundColor = color;
                swatch.setAttribute('aria-label', `choose ${color}`);
                swatch.addEventListener('click', () => {
                    const gid = (this.state && this.state.selectedGroup ? this.state.selectedGroup.id : currentGroupId);
                    try {
                        this.state.updateGroup(gid, { color });
                        this.showSuccess('updated group colour');
                        const updated = this.state.getGroup(gid);
                        this.populateGroupForm(updated);
                    } catch (e) {
                        this.showError('failed to update group colour');
                    }
                });
                // mark active
                if (group && group.color && this.colorsEqual(color, group.color)) {
                    swatch.classList.add('active');
                }
                palette.appendChild(swatch);
            });
        }
    };

    Sidebar.prototype.saveGroupProperties = function() {
        if (!this.state.selectedGroup) return;
        const updates = {
            name: document.getElementById('group_name').value.trim(),
            // description removed from ui
        };
        if (!updates.name) { this.showError('group name is required'); return; }
        try {
            this.state.updateGroup(this.state.selectedGroup.id, updates);
            this.showSuccess(`updated group: ${updates.name}`);
        } catch (error) {
            this.showError(error.message);
        }
    };

    Sidebar.prototype.ungroupNodes = function() {
        if (!this.state.selectedGroup) return;
        const groupName = this.state.selectedGroup.name;
        this.state.removeGroup(this.state.selectedGroup.id);
        this.showSuccess(`ungrouped: ${groupName}`);
    };

    Sidebar.prototype.deleteGroup = function() {
        if (!this.state.selectedGroup) return;
        const groupName = this.state.selectedGroup.name;
        this.state.removeGroup(this.state.selectedGroup.id);
        this.showSuccess(`deleted group: ${groupName}`);
    };

    // analysis of a single node's function (args/returns)
    Sidebar.prototype.analyzeNodeFunction = async function(node) {
        this.showArgumentsLoading();
        this.showReturnsLoading();
        try {
            const response = await fetch('/api/analyze-python-function', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ python_file: normalizePythonPathForApi(node.pythonFile) })
            });
            const result = await response.json();
            if (result.success) {
                this.populateArguments(result.formal_parameters || [], result.input_variable_names || []);
                this.populateReturns(result.returns || []);
            } else {
                this.showArgumentsError('failed to analyze function');
                this.showReturnsError('failed to analyze function');
            }
        } catch (error) {
            console.error('error analyzing node function:', error);
            this.showArgumentsError('network error');
            this.showReturnsError('network error');
        }
    };

    Sidebar.prototype.showArgumentsLoading = function() {
        const V = window.SidebarVisibility;
        if (V) {
            V.show('arguments_loading', 'block');
            V.hide('arguments_content');
            V.hide('arguments_empty');
        } else {
            document.getElementById('arguments_loading').style.display = 'block';
            document.getElementById('arguments_content').style.display = 'none';
            document.getElementById('arguments_empty').style.display = 'none';
        }
    };

    Sidebar.prototype.showReturnsLoading = function() {
        const V = window.SidebarVisibility;
        if (V) {
            V.show('returns_loading', 'block');
            V.hide('returns_content');
            V.hide('returns_empty');
        } else {
            document.getElementById('returns_loading').style.display = 'block';
            document.getElementById('returns_content').style.display = 'none';
            document.getElementById('returns_empty').style.display = 'none';
        }
    };

    Sidebar.prototype.populateArguments = function(formalParams, inputVars) {
        const V = window.SidebarVisibility;
        const argumentsContent = document.getElementById('arguments_content');
        const allArguments = [...formalParams, ...inputVars];
        if (allArguments.length === 0) {
            if (V) { V.hide('arguments_loading'); V.show('arguments_empty', 'block'); }
            else { document.getElementById('arguments_loading').style.display = 'none'; document.getElementById('arguments_empty').style.display = 'block'; }
            return;
        }
        argumentsContent.innerHTML = '';
        formalParams.forEach(param => {
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
            item.innerHTML = `
                <span class="material-icons" style="font-size: 16px; color: #4caf50;">input</span>
                <span style="font-family: monospace; font-weight: 500;">${param}</span>
                <span style="font-size: 0.75rem; opacity: 0.7; margin-left: auto;">from previous nodes</span>
            `;
            argumentsContent.appendChild(item);
        });
        inputVars.forEach(param => {
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
            item.innerHTML = `
                <span class="material-icons" style="font-size: 16px; color: #2196f3;">keyboard</span>
                <span style="font-family: monospace; font-weight: 500;">${param}</span>
                <span style="font-size: 0.75rem; opacity: 0.7; margin-left: auto;">from input() calls</span>
            `;
            argumentsContent.appendChild(item);
        });
        if (V) { V.hide('arguments_loading'); V.show('arguments_content', 'block'); }
        else { document.getElementById('arguments_loading').style.display = 'none'; document.getElementById('arguments_content').style.display = 'block'; }
    };

    Sidebar.prototype.populateReturns = function(returns) {
        const V = window.SidebarVisibility;
        const returnsContent = document.getElementById('returns_content');
        if (returns.length === 0) {
        if (V) { V.hide('returns_loading'); V.show('returns_empty', 'block'); }
        else { document.getElementById('returns_loading').style.display = 'none'; document.getElementById('returns_empty').style.display = 'block'; }
            return;
        }
        returnsContent.innerHTML = '';
        returns.forEach((returnItem) => {
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
                user-select: none;
                cursor: grab;
            `;
            let icon = 'output';
            let iconColor = '#ff9800';
            let displayText = returnItem.name || 'unknown';
            let typeText = returnItem.type || 'unknown';
            switch (returnItem.type) {
                case 'variable':
                    icon = 'label'; iconColor = '#4caf50'; break;
                case 'constant':
                    icon = 'looks_one'; iconColor = '#2196f3'; displayText = returnItem.value; typeText = returnItem.data_type; break;
                case 'list':
                    icon = 'list'; iconColor = '#9c27b0'; break;
                case 'dict':
                    icon = 'data_object'; iconColor = '#ff5722'; break;
                case 'function_call':
                    icon = 'functions'; iconColor = '#607d8b'; break;
                case 'expression':
                    icon = 'calculate'; iconColor = '#795548'; break;
            }
            item.innerHTML = `
                <span class="material-icons" style="font-size: 16px; color: ${iconColor};">${icon}</span>
                <span style="font-family: monospace; font-weight: 500;">${displayText}</span>
                <span style="font-size: 0.75rem; opacity: 0.7; margin-left: auto;">${typeText}</span>
            `;
            // start drag to create a data_save node when dropped on canvas
            item.addEventListener('mousedown', (e) => {
                if (e.button !== 0) return; // only left click
                e.preventDefault();
                this.startReturnVariableDrag(e, { displayText, raw: returnItem });
            });
            returnsContent.appendChild(item);
        });
        if (V) { V.hide('returns_loading'); V.show('returns_content', 'block'); }
        else { document.getElementById('returns_loading').style.display = 'none'; document.getElementById('returns_content').style.display = 'block'; }
    };

    // input node: populate inputs list with variable names and their line numbers from associated python script
    Sidebar.prototype.populateInputNodeInputs = async function(node) {
        if (!this._inputNodeInputsReqId) this._inputNodeInputsReqId = 0;
        const reqId = ++this._inputNodeInputsReqId;
        const loading = document.getElementById('input_node_inputs_loading');
        const content = document.getElementById('input_node_inputs_content');
        const empty = document.getElementById('input_node_inputs_empty');
        const errorDiv = document.getElementById('input_node_inputs_error');
        const errorMsg = document.getElementById('input_node_inputs_error_message');

        // reset visibility
        if (loading) loading.style.display = 'block';
        if (content) { content.style.display = 'none'; content.innerHTML = ''; }
        if (empty) empty.style.display = 'none';
        if (errorDiv) errorDiv.style.display = 'none';

        if (!node || !node.pythonFile) {
            if (loading) loading.style.display = 'none';
            if (empty) empty.style.display = 'block';
            return;
        }

        try {
            const response = await fetch('/api/analyze-python-function', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ python_file: normalizePythonPathForApi(node.pythonFile) })
            });
            const result = await response.json();
            if (reqId !== this._inputNodeInputsReqId) return;
            const details = result && (result.input_variable_details || []);

            if (!result || result.success === false) {
                if (loading) loading.style.display = 'none';
                if (errorDiv) errorDiv.style.display = 'block';
                if (errorMsg) errorMsg.textContent = (result && (result.error || 'failed to analyze inputs')) || 'failed to analyze inputs';
                return;
            }

            const unique = [];
            const seen = new Set();
            (Array.isArray(details) ? details : []).forEach((d) => {
                const key = `${d.name}::${d.line}`;
                if (!seen.has(key)) { seen.add(key); unique.push(d); }
            });
            if (unique.length === 0) {
                if (loading) loading.style.display = 'none';
                if (empty) empty.style.display = 'block';
                return;
            }

            // render items
            unique.forEach((item) => {
                const row = document.createElement('div');
                row.style.cssText = `
                    background: var(--surface-color);
                    border: 1px solid var(--border-color);
                    border-radius: 4px;
                    padding: 8px 10px;
                    margin-bottom: 4px;
                    display: flex;
                    align-items: center;
                    gap: 8px;
                `;
                row.innerHTML = `
                    <span class="material-icons" style="font-size: 16px; color: #2196f3;">keyboard</span>
                    <span style="font-family: monospace; font-weight: 500;">${item.name}</span>
                    <span style="font-size: 0.75rem; opacity: 0.7; margin-left: auto;">line ${item.line}</span>
                `;
                content.appendChild(row);
            });

            if (loading) loading.style.display = 'none';
            if (content) content.style.display = 'block';
        } catch (err) {
            if (reqId !== this._inputNodeInputsReqId) return;
            if (loading) loading.style.display = 'none';
            if (errorDiv) errorDiv.style.display = 'block';
            if (errorMsg) errorMsg.textContent = 'network error';
        }
    };

    // data save: populate dropdown with variables from associated python node's returns
    Sidebar.prototype.populateDataSaveVariables = async function(node) {
        if (!this._dataSaveVarReqId) this._dataSaveVarReqId = 0;
        const reqId = ++this._dataSaveVarReqId;
        const dropdown = document.getElementById('data_save_variable_dropdown');
        const errorDiv = document.getElementById('data_save_variable_error');
        if (!dropdown) return;
        // clear
        dropdown.innerHTML = '<option value="">select a variable</option>';
        if (errorDiv) errorDiv.style.display = 'none';
        // compute preferred name from node.dataSource (drag payload)
        const preferredName = (() => {
            try {
                const v = node && node.dataSource && node.dataSource.variable;
                if (!v) return '';
                return v.name || (v.type === 'constant' ? String(v.value) : v.type || 'value');
            } catch (_) { return ''; }
        })();

        try {
            // find associated python node via incoming/outgoing links
            let pythonNode = null;
            const partner = this.state.getDependencies ? null : null; // placeholder safeguard
            // search links to find a python_file connected to this data_save node
            for (const link of this.state.links) {
                if (link.source === node.id) {
                    const n = this.state.getNode(link.target);
                    if (n && n.type === 'python_file') { pythonNode = n; break; }
                } else if (link.target === node.id) {
                    const n = this.state.getNode(link.source);
                    if (n && n.type === 'python_file') { pythonNode = n; break; }
                }
            }
            if (!pythonNode || !pythonNode.pythonFile) {
                if (errorDiv) { errorDiv.textContent = 'no associated python node found'; errorDiv.style.display = 'block'; }
                return;
            }
            const resp = await fetch('/api/analyze-python-function', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ python_file: normalizePythonPathForApi(pythonNode.pythonFile) })
            });
            const data = await resp.json();
            if (reqId !== this._dataSaveVarReqId) return;
            if (!data || data.success === false) {
                if (errorDiv) { errorDiv.textContent = (data && data.error) || 'failed to analyze python function'; errorDiv.style.display = 'block'; }
                return;
            }
            const returns = Array.isArray(data.returns) ? data.returns : [];
            if (returns.length === 0) {
                if (errorDiv) { errorDiv.textContent = 'python node has no return variables'; errorDiv.style.display = 'block'; }
                return;
            }
            const seen = new Set();
            returns.forEach((ret) => {
                const name = ret.name || (ret.type === 'constant' ? String(ret.value) : ret.type || 'value');
                if (seen.has(name)) return; seen.add(name);
                const opt = document.createElement('option');
                opt.value = name;
                opt.textContent = name;
                dropdown.appendChild(opt);
            });
            // apply prefill from drag-and-drop source
            if (preferredName && seen.has(preferredName)) {
                dropdown.value = preferredName;
            }

            // persist selection to the data_save node so downstream logic saves the correct single variable
            dropdown.onchange = async () => {
                const selectedName = dropdown.value || '';
                try {
                    const current = this.state.getNode(node.id);
                    const origin = (current && current.dataSource && current.dataSource.origin) || 'returns';
                    const newDataSource = { origin, variable: selectedName ? { name: selectedName } : null };
                    await this.state.updateNode(node.id, { dataSource: newDataSource });
                } catch (e) {
                    console.warn('failed to update data_save selection:', e);
                }
            };
        } catch (e) {
            if (reqId !== this._dataSaveVarReqId) return;
            if (errorDiv) { errorDiv.textContent = 'network error'; errorDiv.style.display = 'block'; }
        }
    };

    // data save: name data removed from ui; no initialization needed

    Sidebar.prototype.showArgumentsError = function(message) {
        const V = window.SidebarVisibility;
        if (V) V.hide('arguments_loading'); else document.getElementById('arguments_loading').style.display = 'none';
        document.getElementById('arguments_content').innerHTML = `
            <div style="text-align: center; padding: 20px; color: #f44336;">
                <span class="material-icons" style="font-size: 16px; margin-bottom: 4px;">error</span>
                <p style="font-size: 0.8em;">${message}</p>
            </div>
        `;
        document.getElementById('arguments_content').style.display = 'block';
    };

    Sidebar.prototype.showReturnsError = function(message) {
        const V = window.SidebarVisibility;
        if (V) V.hide('returns_loading'); else document.getElementById('returns_loading').style.display = 'none';
        document.getElementById('returns_content').innerHTML = `
            <div style="text-align: center; padding: 20px; color: #f44336;">
                <span class="material-icons" style="font-size: 16px; margin-bottom: 4px;">error</span>
                <p style="font-size: 0.8em;">${message}</p>
            </div>
        `;
        document.getElementById('returns_content').style.display = 'block';
    };

    // start a sidebar-driven drag that creates a data_save node when dropped on the canvas
    Sidebar.prototype.startReturnVariableDrag = function(event, payload) {
        // floating ghost label matching the data_save color and shape
        const ghost = document.createElement('div');
        ghost.style.cssText = `
            position: fixed;
            left: 0; top: 0;
            transform: translate(${event.clientX}px, ${event.clientY}px);
            pointer-events: none;
            background: rgb(62, 32, 0);
            color: #000000;
            font-weight: 600;
            padding: 6px 12px;
            border-radius: 9999px;
            z-index: 2000;
            box-shadow: 0 2px 6px rgba(0,0,0,0.35);
        `;
        ghost.textContent = payload.displayText || 'data save';
        document.body.appendChild(ghost);

        const move = (e) => {
            ghost.style.transform = `translate(${e.clientX}px, ${e.clientY}px)`;
            const canvas = document.getElementById('flowchart_canvas');
            if (!canvas) return;
            const rect = canvas.getBoundingClientRect();
            const over = e.clientX >= rect.left && e.clientX <= rect.right && e.clientY >= rect.top && e.clientY <= rect.bottom;
            if (over) {
                const localX = e.clientX - rect.left;
                const localY = e.clientY - rect.top;
                const world = this.state.transform.invert([localX, localY]);
                const name = payload.displayText || 'data save';
                const width = Geometry.getDataSaveNodeWidth ? Geometry.getDataSaveNodeWidth(name) : 120;
                this.state.emit('updateSnapPreview', { x: world[0], y: world[1], width, height: 60 });
            } else {
                this.state.emit('clearSnapPreview');
            }
        };

        const up = (e) => {
            document.removeEventListener('mousemove', move);
            document.removeEventListener('mouseup', up);
            if (ghost && ghost.parentNode) ghost.parentNode.removeChild(ghost);

            const canvas = document.getElementById('flowchart_canvas');
            if (!canvas) { this.state.emit('clearSnapPreview'); return; }
            const rect = canvas.getBoundingClientRect();
            const over = e.clientX >= rect.left && e.clientX <= rect.right && e.clientY >= rect.top && e.clientY <= rect.bottom;
            if (!over) { this.state.emit('clearSnapPreview'); return; }

            const localX = e.clientX - rect.left;
            const localY = e.clientY - rect.top;
            const [wx, wy] = this.state.transform.invert([localX, localY]);

            try {
                const nodeName = payload.displayText || 'data save';
                const node = this.state.addNode({
                    x: wx,
                    y: wy,
                    name: nodeName,
                    type: 'data_save',
                    dataSource: { origin: 'returns', variable: payload.raw || null }
                });
                // find the currently selected python node (source of returns) and connect
                // prefer: selected node if it's python_file; fallback: none (skip)
                let sourcePythonNode = null;
                const selected = Array.from(this.state.selectedNodes);
                if (selected.length === 1) {
                    const n = this.state.getNode(selected[0]);
                    if (n && n.type === 'python_file') sourcePythonNode = n;
                }
                // create a non-selectable link from python node to the new data_save node
                if (sourcePythonNode) {
                    try {
                        const link = this.state.addLink(sourcePythonNode.id, node.id);
                        if (link) {
                            link.selectable = false; // enforce non-selectable
                            link.style = 'dashed';    // dotted/dashed style
                            // force immediate render update for both endpoints
                            this.state.emit('updateLinksForNode', sourcePythonNode.id);
                            this.state.emit('updateLinksForNode', node.id);
                            this.state.emit('updateLinkStyles');
                        }
                    } catch (_) { /* ignore if blocked by validation */ }
                }
                this.state.emit('statusUpdate', `created data save: ${node.name}`);
            } catch (err) {
                this.state.emit('statusUpdate', `error creating data save: ${err.message}`);
            }
            this.state.emit('clearSnapPreview');
        };

        document.addEventListener('mousemove', move);
        document.addEventListener('mouseup', up);
    };
})();


