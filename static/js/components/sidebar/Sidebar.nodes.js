// node and group property panels: populate and save
(function(){
    if (!window.Sidebar) return;

    Sidebar.prototype.populateNodeForm = function(node) {
        document.getElementById('node_name').value = node.name || '';
        const pythonFileInput = document.getElementById('python_file');
        const pythonFile = node.pythonFile || '';
        const displayPath = pythonFile.startsWith('nodes/') ? pythonFile.substring(6) : pythonFile;
        pythonFileInput.value = displayPath;
        pythonFileInput.dataset.fullPath = pythonFile;
        const pythonFileSection = pythonFileInput.closest('.form_group');
        if (node.type === 'if_node') {
            pythonFileSection.style.display = 'none';
        } else {
            pythonFileSection.style.display = 'block';
        }
        const argumentsSection = document.getElementById('arguments_section');
        const returnsSection = document.getElementById('returns_section');
        const ifVariablesSection = document.getElementById('if_node_variables_section');
        if (node.pythonFile && node.type !== 'if_node') {
            argumentsSection.style.display = 'block';
            returnsSection.style.display = 'block';
            ifVariablesSection.style.display = 'none';
            this.analyzeNodeFunction(node);
        } else if (node.type === 'if_node') {
            argumentsSection.style.display = 'none';
            returnsSection.style.display = 'none';
            ifVariablesSection.style.display = 'block';
            this.analyzeIfNodeVariables(node);
        } else {
            argumentsSection.style.display = 'none';
            returnsSection.style.display = 'none';
            ifVariablesSection.style.display = 'none';
        }
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

    Sidebar.prototype.saveNodeProperties = function() {
        const selectedNodes = Array.from(this.state.selectedNodes);
        if (selectedNodes.length !== 1) return;
        const nodeId = selectedNodes[0];
        const pythonFileInput = document.getElementById('python_file');
        const updates = {
            name: document.getElementById('node_name').value.trim(),
            pythonFile: pythonFileInput.dataset.fullPath || pythonFileInput.value.trim()
        };
        if (!updates.name) { this.showError('node name is required'); return; }
        if (updates.pythonFile && !Validation.validatePythonFilePath(updates.pythonFile)) { this.showError('invalid python file path'); return; }
        try {
            this.state.updateNode(nodeId, updates);
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
        document.getElementById('group_description').value = group.description || '';
        this.updateGroupMembersList(group);
    };

    Sidebar.prototype.saveGroupProperties = function() {
        if (!this.state.selectedGroup) return;
        const updates = {
            name: document.getElementById('group_name').value.trim(),
            description: document.getElementById('group_description').value.trim()
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
                body: JSON.stringify({ python_file: node.pythonFile })
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
        document.getElementById('arguments_loading').style.display = 'block';
        document.getElementById('arguments_content').style.display = 'none';
        document.getElementById('arguments_empty').style.display = 'none';
    };

    Sidebar.prototype.showReturnsLoading = function() {
        document.getElementById('returns_loading').style.display = 'block';
        document.getElementById('returns_content').style.display = 'none';
        document.getElementById('returns_empty').style.display = 'none';
    };

    Sidebar.prototype.populateArguments = function(formalParams, inputVars) {
        const argumentsContent = document.getElementById('arguments_content');
        const allArguments = [...formalParams, ...inputVars];
        if (allArguments.length === 0) {
            document.getElementById('arguments_loading').style.display = 'none';
            document.getElementById('arguments_empty').style.display = 'block';
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
        document.getElementById('arguments_loading').style.display = 'none';
        document.getElementById('arguments_content').style.display = 'block';
    };

    Sidebar.prototype.populateReturns = function(returns) {
        const returnsContent = document.getElementById('returns_content');
        if (returns.length === 0) {
            document.getElementById('returns_loading').style.display = 'none';
            document.getElementById('returns_empty').style.display = 'block';
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
        document.getElementById('returns_loading').style.display = 'none';
        document.getElementById('returns_content').style.display = 'block';
    };

    Sidebar.prototype.showArgumentsError = function(message) {
        document.getElementById('arguments_loading').style.display = 'none';
        document.getElementById('arguments_content').innerHTML = `
            <div style="text-align: center; padding: 20px; color: #f44336;">
                <span class="material-icons" style="font-size: 16px; margin-bottom: 4px;">error</span>
                <p style="font-size: 0.8em;">${message}</p>
            </div>
        `;
        document.getElementById('arguments_content').style.display = 'block';
    };

    Sidebar.prototype.showReturnsError = function(message) {
        document.getElementById('returns_loading').style.display = 'none';
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


