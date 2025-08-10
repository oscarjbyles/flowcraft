// sidebar component management
class Sidebar {
    constructor(stateManager) {
        this.state = stateManager;
        this.currentView = 'default';
        this.pythonFiles = [];
        this.filteredFiles = [];
        this.flowcharts = [];
        this.filteredFlowcharts = [];
        
        // url management
        this.urlManager = new URLManager();
        
        // cache dom elements
        this.propertiesSidebar = document.getElementById('properties_sidebar');
        this.propertiesTitle = document.getElementById('properties_title'); // may be null if removed
        this.contentPanels = {
            default: document.getElementById('default_properties'),
            single: document.getElementById('single_node_properties'),
            multi: document.getElementById('multi_select_properties'),
            group: document.getElementById('group_properties'),
            link: document.getElementById('link_properties'),
            execution: document.getElementById('run_execution_properties'),
            history: document.getElementById('execution_history_properties')
        };

        // pinned footer container and delete button
        this.footerContainer = document.querySelector('.properties_footer');
        this.footerDeleteBtn = document.getElementById('sidebar_delete_btn');
        if (this.footerDeleteBtn) {
            this.footerDeleteBtn.addEventListener('click', () => this.handleFooterDelete());
        }
        
        // flowchart management elements
        this.flowchartSelector = document.getElementById('flowchart_selector');
        this.flowchartDropdown = document.getElementById('flowchart_dropdown');
        this.createFlowchartModal = document.getElementById('create_flowchart_modal');
        
        // setup event listeners
        this.setupEventListeners();
        this.setupFormHandlers();
        this.setupFlowchartManagement();
        this.setupURLHandlers();
        this.setupLinkEventHandlers();
        this.initializePythonFileDropdown();
        this.initializeSettings();
        // note: initializeFlowchartDropdown is called from FlowchartBuilder.initializeApp()
    }

    initializeSettings() {
        // cache editor dropdown elements
        this.defaultEditorInput = document.getElementById('default_editor_input');
        this.defaultEditorDropdown = document.getElementById('default_editor_dropdown');

        if (!this.defaultEditorInput || !this.defaultEditorDropdown) return;

        // load saved preference from localStorage
        const saved = localStorage.getItem('flowcraft_default_editor');
        if (saved) {
            try {
                const parsed = JSON.parse(saved);
                this.defaultEditorInput.value = parsed.name || parsed.path || 'custom editor';
                this.defaultEditorInput.dataset.path = parsed.path || '';
            } catch (_) {}
        }

        // fetch installed editors
        this.fetchInstalledEditors();

        // open/close behavior
        this.defaultEditorInput.addEventListener('click', (e) => {
            e.stopPropagation();
            this.toggleEditorDropdown();
        });
        document.addEventListener('click', (e) => {
            const container = this.defaultEditorInput.closest('.dropdown_container');
            if (!container.contains(e.target)) {
                this.closeEditorDropdown();
            }
        });
    }

    async fetchInstalledEditors() {
        try {
            const resp = await fetch('/api/editors');
            const data = await resp.json();
            if (data.status === 'success') {
                this.renderEditorsDropdown(data.editors);
                // if no saved value, prefill first editor
                if (!this.defaultEditorInput.value && data.editors.length > 0) {
                    this.setDefaultEditor(data.editors[0]);
                }
            } else {
                this.defaultEditorDropdown.innerHTML = '<div class="dropdown_no_results">failed to detect editors</div>';
            }
        } catch (err) {
            this.defaultEditorDropdown.innerHTML = '<div class="dropdown_no_results">error detecting editors</div>';
        }
    }

    renderEditorsDropdown(editors) {
        if (!Array.isArray(editors) || editors.length === 0) {
            this.defaultEditorDropdown.innerHTML = '<div class="dropdown_no_results">no editors found</div>';
            return;
        }
        const items = editors.map(ed => `
            <div class="dropdown_item" data-name="${ed.name}" data-path="${ed.path}">
                <div class="dropdown_item_content">
                    <div class="dropdown_item_name">${ed.name}</div>
                    <div class="dropdown_item_meta" style="opacity:.7; font-size:.75rem;">${ed.path}</div>
                </div>
            </div>
        `).join('');
        this.defaultEditorDropdown.innerHTML = items;
        this.defaultEditorDropdown.querySelectorAll('.dropdown_item').forEach(item => {
            item.addEventListener('click', () => {
                this.setDefaultEditor({ name: item.dataset.name, path: item.dataset.path });
                this.closeEditorDropdown();
            });
        });
    }

    setDefaultEditor(editor) {
        this.defaultEditorInput.value = editor.name;
        this.defaultEditorInput.dataset.path = editor.path || '';
        localStorage.setItem('flowcraft_default_editor', JSON.stringify(editor));
        this.showSuccess(`default editor set to ${editor.name}`);
    }

    toggleEditorDropdown() {
        this.defaultEditorDropdown.classList.toggle('show');
    }

    closeEditorDropdown() {
        this.defaultEditorDropdown.classList.remove('show');
    }

    setupEventListeners() {
        this.state.on('selectionChanged', (selection) => this.updateContent(selection));
        this.state.on('updateSidebar', () => this.updateFromState());
        this.state.on('statusUpdate', (message) => this.updateStatus(message));
        // ensure sidebar updates when mode changes (e.g., hide delete in run mode)
        this.state.on('modeChanged', () => this.updateFromState());
    }

    setupFormHandlers() {
        // single node form handlers
        document.getElementById('delete_node_from_sidebar').addEventListener('click', () => {
            this.deleteNodeFromSidebar();
        });

        // create python script modal handlers
        const createPyBtn = document.getElementById('create_python_script_btn');
        const createPyModal = document.getElementById('create_python_modal');
        const closeCreatePyModal = document.getElementById('close_create_python_modal');
        const cancelCreatePy = document.getElementById('cancel_create_python');
        const confirmCreatePy = document.getElementById('confirm_create_python');
        const newPythonNameInput = document.getElementById('new_python_name');
        // mini explorer elements
        const miniList = document.getElementById('mini_list');
        const miniBreadcrumb = document.getElementById('mini_breadcrumb');
        const miniUpBtn = document.getElementById('mini_up_btn');
        const miniSelectedPath = document.getElementById('mini_selected_path');
        // optional display element for current working directory (may not exist in dom)
        const miniCwdDisplay = document.getElementById('mini_cwd_display');
        const miniNewFolderBtn = document.getElementById('mini_new_folder_btn');
        let miniCwd = '';

        if (createPyBtn && createPyModal) {
            createPyBtn.addEventListener('click', (e) => {
                e.preventDefault();
                createPyModal.classList.add('show');
                newPythonNameInput.value = '';
                newPythonNameInput.focus();
                // load mini explorer
                this.loadMiniExplorer('');
            });
        }
        if (closeCreatePyModal) {
            closeCreatePyModal.addEventListener('click', () => createPyModal.classList.remove('show'));
        }
        if (cancelCreatePy) {
            cancelCreatePy.addEventListener('click', () => createPyModal.classList.remove('show'));
        }
        if (createPyModal) {
            createPyModal.addEventListener('click', (e) => {
                if (e.target === createPyModal) createPyModal.classList.remove('show');
            });
        }
        if (confirmCreatePy) {
            confirmCreatePy.addEventListener('click', async () => {
                const rawName = (newPythonNameInput.value || '').trim();
                if (!rawName) {
                    this.showError('script name is required');
                    return;
                }
                // ensure .py extension
                const fileName = rawName.toLowerCase().endsWith('.py') ? rawName : `${rawName}.py`;
                try {
                    // create file in nodes/
                    const resp = await fetch('/api/nodes/touch', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ path: (miniSelectedPath?.value || ''), name: fileName })
                    });
                    const data = await resp.json();
                    if (data.status !== 'success') {
                        this.showError(data.message || 'failed to create file');
                        return;
                    }
                    // associate the new file with the selected node
                    const selectedNodes = Array.from(this.state.selectedNodes);
                    if (selectedNodes.length === 1) {
                        const nodeId = selectedNodes[0];
                        const relDir = (miniSelectedPath?.value || '').trim();
                        const relDisplay = (relDir ? `${relDir}/` : '') + fileName;
                        const fullPath = `nodes/${relDisplay}`;
                        this.state.updateNode(nodeId, { pythonFile: fullPath });
                        // update the python file input with display path (relative to nodes/)
                        const input = document.getElementById('python_file');
                        if (input) {
                            input.value = relDisplay;
                            input.dataset.fullPath = fullPath;
                        }
                        // no dropdown reload needed with explorer ui
                        this.showSuccess(`created script: ${fileName}`);
                    }
                    createPyModal.classList.remove('show');
                } catch (err) {
                    this.showError('error creating file');
                }
            });
        }

        // mini explorer wiring
        this.loadMiniExplorer = async (path) => {
            try {
                const resp = await fetch(`/api/nodes/browse?path=${encodeURIComponent(path || '')}`);
                const data = await resp.json();
                if (data.status !== 'success') { miniList.innerHTML = '<div style="padding:10px; opacity:0.7;">failed to load</div>'; return; }
                miniCwd = data.cwd || '';
                // update cwd display if present
                if (miniCwdDisplay) {
                    miniCwdDisplay.textContent = '/' + (miniCwd || '');
                }
                miniSelectedPath.value = miniCwd; // default select current folder
                // render breadcrumb
                miniBreadcrumb.innerHTML = '';
                const rootCrumb = document.createElement('span'); rootCrumb.className = 'mini_breadcrumb_item'; rootCrumb.textContent = 'nodes'; rootCrumb.onclick = () => this.loadMiniExplorer('');
                miniBreadcrumb.appendChild(rootCrumb);
                (data.breadcrumb || []).forEach((b) => {
                    const sep = document.createElement('span'); sep.className = 'mini_breadcrumb_sep'; sep.textContent = '/'; miniBreadcrumb.appendChild(sep);
                    const item = document.createElement('span'); item.className = 'mini_breadcrumb_item'; item.textContent = b.name; item.onclick = () => this.loadMiniExplorer(b.path); miniBreadcrumb.appendChild(item);
                });
                // render only folders
                const folders = (data.entries || []).filter(e => e.is_dir && e.name !== '__pycache__');
                if (folders.length === 0) { miniList.innerHTML = '<div style="padding:10px; opacity:0.7;">no folders</div>'; return; }
                miniList.innerHTML = '';
                folders.forEach(f => {
                    const row = document.createElement('div'); row.className = 'mini_row';
                    row.innerHTML = `<span class="material-icons" style="font-size:16px; opacity:.9;">folder</span><span>${f.name}</span>`;
                    row.onclick = () => this.loadMiniExplorer(f.path);
                    miniList.appendChild(row);
                });
            } catch (_) {
                miniList.innerHTML = '<div style="padding:10px; opacity:0.7;">error loading folders</div>';
            }
        };
        if (miniUpBtn) miniUpBtn.onclick = () => {
            const parent = (miniCwd || '').split('/').filter(Boolean); parent.pop(); this.loadMiniExplorer(parent.join('/'));
        };

        if (miniNewFolderBtn) miniNewFolderBtn.onclick = async () => {
            const name = prompt('new folder name');
            if (!name) return;
            try {
                const resp = await fetch('/api/nodes/mkdir', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ path: miniCwd || '', name })});
                const data = await resp.json();
                if (data.status === 'success') {
                    this.loadMiniExplorer(miniCwd);
                } else {
                    alert(data.message || 'failed to create folder');
                }
            } catch (_) { alert('error creating folder'); }
        };

        // multi-select form handlers
        document.getElementById('create_group_btn').addEventListener('click', () => {
            this.createGroup();
        });
        
        document.getElementById('align_nodes_btn').addEventListener('click', () => {
            this.alignNodes();
        });
        
        document.getElementById('delete_selected_nodes').addEventListener('click', () => {
            this.deleteSelectedNodes();
        });

        // group form handlers
        const saveGroupBtn = document.getElementById('save_group_properties');
        if (saveGroupBtn) {
            saveGroupBtn.addEventListener('click', () => {
                this.saveGroupProperties();
            });
        }
        
        document.getElementById('ungroup_nodes').addEventListener('click', () => {
            this.ungroupNodes();
        });
        
        document.getElementById('delete_group').addEventListener('click', () => {
            this.deleteGroup();
        });

        // real-time form updates
        this.setupRealTimeUpdates();
    }

    setupRealTimeUpdates() {
        // auto-save node properties on input
        const nodeInputs = ['node_name', 'python_file'];
        nodeInputs.forEach(inputId => {
            const input = document.getElementById(inputId);
            if (input) {
                input.addEventListener('input', () => {
                    this.debounceNodeSave();
                });
            }
        });

        // auto-save group properties
        const groupInputs = ['group_name', 'group_description'];
        groupInputs.forEach(inputId => {
            const input = document.getElementById(inputId);
            if (input) {
                input.addEventListener('input', () => {
                    this.debounceGroupSave();
                });
            }
        });
    }

    updateContent(selection) {
        // in run mode, only update the selected node details section
        if (this.state.isRunMode && this.contentPanels.execution.classList.contains('active')) {
            this.updateRunModeNodeDetails(selection);
            // keep footer visibility in sync on selection changes
            this.updateFooterDelete(selection);
            this.updateFooterVisibility(selection);
            return;
        }
        
        this.hideAllPanels();

        if (selection.nodes.length === 1) {
            this.showSingleNodePanel(selection.nodes[0]);
        } else if (selection.nodes.length > 1) {
            this.showMultiSelectPanel(selection.nodes);
        } else if (selection.link) {
            this.showLinkPanel(selection.link);
        } else if (selection.group) {
            this.showGroupPanel(selection.group);
        } else {
            this.showDefaultPanel();
        }

        // ensure footer state updates on any selection change in build mode
        this.updateFooterDelete(selection);
        this.updateFooterVisibility(selection);
    }

    updateFromState() {
        const selection = {
            nodes: Array.from(this.state.selectedNodes),
            link: this.state.selectedLink,
            group: this.state.selectedGroup
        };
        this.updateContent(selection);
        this.updateFooterDelete(selection);
        this.updateFooterVisibility(selection);
    }

    hideAllPanels() {
        Object.values(this.contentPanels).forEach(panel => {
            if (panel) panel.classList.remove('active');
        });
    }

    showDefaultPanel() {
        this.currentView = 'default';
        if (this.propertiesTitle) {
            this.propertiesTitle.textContent = 'properties';
        }
        this.contentPanels.default.classList.add('active');
    }

    showSingleNodePanel(nodeId) {
        const node = this.state.getNode(nodeId);
        if (!node) return;

        this.currentView = 'single';
        if (this.propertiesTitle) {
            this.propertiesTitle.textContent = 'node properties';
        }
        this.contentPanels.single.classList.add('active');

        // populate form fields
        this.populateNodeForm(node);
        // hide delete actions for node selections in run mode
        if (this.state.isRunMode) {
            if (this.footerDeleteBtn) this.footerDeleteBtn.style.display = 'none';
            this.updateFooterVisibility({ nodes: [], link: null, group: null });
        } else {
            this.updateFooterDelete({ nodes: [nodeId], link: null, group: null });
        }
    }

    showMultiSelectPanel(nodeIds) {
        this.currentView = 'multi';
        if (this.propertiesTitle) {
            this.propertiesTitle.textContent = `${nodeIds.length} nodes selected`;
        }
        this.contentPanels.multi.classList.add('active');

        // populate selected nodes list
        this.updateSelectedNodesList(nodeIds);
        if (this.state.isRunMode) {
            if (this.footerDeleteBtn) this.footerDeleteBtn.style.display = 'none';
            this.updateFooterVisibility({ nodes: [], link: null, group: null });
        } else {
            this.updateFooterDelete({ nodes: nodeIds, link: null, group: null });
        }
    }

    showLinkPanel(link) {
        this.currentView = 'link';
        if (this.propertiesTitle) {
            this.propertiesTitle.textContent = 'connection properties';
        }
        this.contentPanels.link.classList.add('active');

        // check if this is an if-to-python connection
        const sourceNode = this.state.getNode(link.source);
        const targetNode = this.state.getNode(link.target);
        const isIfToPythonConnection = sourceNode && targetNode && 
            sourceNode.type === 'if_node' && 
            targetNode.type === 'python_file';

        if (isIfToPythonConnection) {
            // show only delete button for if-to-python connections
            this.showConnectionNodePanel(link);
        } else {
            // show full link properties for regular connections
            this.populateLinkForm(link);
        }
        this.updateFooterDelete({ nodes: [], link, group: null });
    }

    showGroupPanel(group) {
        this.currentView = 'group';
        if (this.propertiesTitle) {
            this.propertiesTitle.textContent = 'group properties';
        }
        this.contentPanels.group.classList.add('active');

        // populate group form
        this.populateGroupForm(group);
        this.updateFooterDelete({ nodes: [], link: null, group });
    }

    updateFooterDelete(selection) {
        if (!this.footerDeleteBtn) return;
        const numNodes = selection.nodes ? selection.nodes.length : 0;

        // in run mode, never show node delete actions
        if (this.state.isRunMode && numNodes > 0) {
            this.footerDeleteBtn.style.display = 'none';
            return;
        }
        if (selection.link) {
            this.footerDeleteBtn.style.display = 'block';
            this.footerDeleteBtn.innerHTML = '<span class="material-icons delete_button_icon_1">delete</span> <span class="delete_button_text_inner">delete connection</span>';
        } else if (selection.group) {
            this.footerDeleteBtn.style.display = 'block';
            this.footerDeleteBtn.innerHTML = '<span class="material-icons delete_button_icon_1">delete</span> <span class="delete_button_text_inner">delete group</span>';
        } else if (numNodes === 1) {
            this.footerDeleteBtn.style.display = 'block';
            this.footerDeleteBtn.innerHTML = '<span class="material-icons delete_button_icon_1">delete</span> <span class="delete_button_text_inner">delete node</span>';
        } else if (numNodes > 1) {
            this.footerDeleteBtn.style.display = 'block';
            this.footerDeleteBtn.innerHTML = `<span class=\"material-icons delete_button_icon_1\">delete</span> <span class=\"delete_button_text_inner\">delete ${numNodes} nodes</span>`;
        } else {
            this.footerDeleteBtn.style.display = 'none';
        }
    }

    // hide footer container entirely when no selection and not in a context that shows delete
    updateFooterVisibility(selection) {
        if (!this.footerContainer) return;
        // determine if there is an actionable control visible
        let shouldShow = false;
        if (this.footerDeleteBtn) {
            // show only when the delete button itself is visible
            shouldShow = this.footerDeleteBtn.style.display !== 'none';
        } else {
            const hasAnySelection = (selection.nodes && selection.nodes.length > 0) || selection.link || selection.group;
            shouldShow = !!hasAnySelection;
        }
        this.footerContainer.style.display = shouldShow ? 'flex' : 'none';
    }

    handleFooterDelete() {
        const selectedNodes = Array.from(this.state.selectedNodes);
        // prevent node deletion in run mode
        if (this.state.isRunMode && selectedNodes.length > 0) {
            this.showError('cannot delete nodes in run mode');
            return;
        }
        if (this.state.selectedLink) {
            this.state.removeLink(this.state.selectedLink.source, this.state.selectedLink.target);
            this.showSuccess('connection deleted');
            return;
        }
        if (this.state.selectedGroup) {
            const name = this.state.selectedGroup.name;
            this.state.removeGroup(this.state.selectedGroup.id);
            this.showSuccess(`deleted group: ${name}`);
            return;
        }
        if (selectedNodes.length === 1) {
            const node = this.state.getNode(selectedNodes[0]);
            this.state.removeNode(selectedNodes[0]);
            this.showSuccess(`deleted node: ${node.name}`);
            return;
        }
        if (selectedNodes.length > 1) {
            let deletedCount = 0;
            selectedNodes.forEach(nodeId => {
                const n = this.state.getNode(nodeId);
                if (n && n.type !== 'input_node') {
                    const success = this.state.removeNode(nodeId);
                    if (success) deletedCount++;
                }
            });
            if (deletedCount > 0) this.showSuccess(`deleted ${deletedCount} node(s)`);
        }
    }

    populateNodeForm(node) {
        document.getElementById('node_name').value = node.name || '';
        const pythonFileInput = document.getElementById('python_file');
        const pythonFile = node.pythonFile || '';
        
        // display path without 'nodes/' prefix, but store full path
        const displayPath = pythonFile.startsWith('nodes/') ? pythonFile.substring(6) : pythonFile;
        pythonFileInput.value = displayPath;
        pythonFileInput.dataset.fullPath = pythonFile;
        
        // hide python file section for if nodes
        const pythonFileSection = pythonFileInput.closest('.form_group');
        if (node.type === 'if_node') {
            pythonFileSection.style.display = 'none';
        } else {
            pythonFileSection.style.display = 'block';
        }
        
        // show/hide arguments and returns sections based on python file
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
    }

    showConnectionNodePanel(link) {
        // hide regular connection sections
        const connectionInfo = document.querySelector('#link_properties .form_group:first-child');
        const sharedVariables = document.querySelector('#link_properties .form_group:nth-child(3)'); // adjusted index due to new section
        const refreshButton = document.getElementById('refresh_variables_btn');
        
        if (connectionInfo) connectionInfo.style.display = 'none';
        if (sharedVariables) sharedVariables.style.display = 'none';
        if (refreshButton) refreshButton.style.display = 'none';
        
        // show the if connection variables section
        const ifVariablesSection = document.getElementById('if_connection_variables_section');
        if (ifVariablesSection) {
            ifVariablesSection.style.display = 'block';
        }
        
        // show the delete button
        const deleteButton = document.getElementById('delete_link_btn');
        if (deleteButton) {
            deleteButton.style.display = 'block';
            deleteButton.style.width = '100%';
        }
        
        // populate the dropdown with variables from the if node
        this.populateConnectionNodeVariables(link);

        // initialize condition builder ui
        this.initializeIfConditionBuilder(link);
    }

    populateLinkForm(link) {
        // show all sections for regular links
        const connectionInfo = document.querySelector('#link_properties .form_group:first-child');
        const sharedVariables = document.querySelector('#link_properties .form_group:nth-child(3)'); // adjusted index
        const refreshButton = document.getElementById('refresh_variables_btn');
        const deleteButton = document.getElementById('delete_link_btn');
        const ifVariablesSection = document.getElementById('if_connection_variables_section');
        
        if (connectionInfo) connectionInfo.style.display = 'block';
        if (sharedVariables) sharedVariables.style.display = 'block';
        if (refreshButton) refreshButton.style.display = 'block';
        if (deleteButton) deleteButton.style.display = 'block';
        if (ifVariablesSection) ifVariablesSection.style.display = 'none';
        
        // get source and target nodes
        const sourceNode = this.state.getNode(link.source);
        const targetNode = this.state.getNode(link.target);
        
        // populate connection info
        document.getElementById('link_source_name').textContent = sourceNode ? sourceNode.name : 'unknown node';
        document.getElementById('link_target_name').textContent = targetNode ? targetNode.name : 'unknown node';
        document.getElementById('link_source_file').textContent = sourceNode ? (sourceNode.pythonFile || 'no file') : 'unknown';
        document.getElementById('link_target_file').textContent = targetNode ? (targetNode.pythonFile || 'no file') : 'unknown';
        
        // analyze variables
        this.analyzeConnectionVariables(link, sourceNode, targetNode);
    }

    populateGroupForm(group) {
        document.getElementById('group_name').value = group.name || '';
        document.getElementById('group_description').value = group.description || '';
        this.updateGroupMembersList(group);
    }

    updateSelectedNodesList(nodeIds) {
        const container = document.getElementById('selected_nodes_list');
        container.innerHTML = '';

        nodeIds.forEach(nodeId => {
            const node = this.state.getNode(nodeId);
            if (node) {
                const item = this.createNodeListItem(node);
                container.appendChild(item);
            }
        });
    }

    updateGroupMembersList(group) {
        const container = document.getElementById('group_members_list');
        container.innerHTML = '';

        const groupNodes = this.state.getGroupNodes(group.id);
        groupNodes.forEach(node => {
            const item = this.createNodeListItem(node);
            container.appendChild(item);
        });
    }

    createNodeListItem(node) {
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

        // add node type icon
        const icon = document.createElement('span');
        icon.className = 'material-icons';
        icon.style.fontSize = '16px';
        icon.textContent = this.getNodeTypeIcon(node.type);
        item.appendChild(icon);

        // add node name
        const name = document.createElement('span');
        name.textContent = node.name;
        name.style.flex = '1';
        item.appendChild(name);

        // hover effect
        item.addEventListener('mouseenter', () => {
            item.style.backgroundColor = 'var(--hover-color)';
            this.state.emit('highlightNode', { nodeId: node.id, highlight: true });
        });

        item.addEventListener('mouseleave', () => {
            item.style.backgroundColor = 'var(--surface-color)';
            this.state.emit('highlightNode', { nodeId: node.id, highlight: false });
        });

        // click to select
        item.addEventListener('click', () => {
            this.state.selectNode(node.id, false);
        });

        return item;
    }

    getNodeTypeIcon(type) {
        const icons = {
            'python_file': 'description',
            'module': 'folder',
            'function': 'functions',
            'class': 'class'
        };
        return icons[type] || 'description';
    }

    // form actions
    saveNodeProperties() {
        const selectedNodes = Array.from(this.state.selectedNodes);
        if (selectedNodes.length !== 1) return;

        const nodeId = selectedNodes[0];
        const pythonFileInput = document.getElementById('python_file');
        const updates = {
            name: document.getElementById('node_name').value.trim(),
            pythonFile: pythonFileInput.dataset.fullPath || pythonFileInput.value.trim()
        };

        // validate
        if (!updates.name) {
            this.showError('node name is required');
            return;
        }

        if (updates.pythonFile && !Validation.validatePythonFilePath(updates.pythonFile)) {
            this.showError('invalid python file path');
            return;
        }

        try {
            this.state.updateNode(nodeId, updates);
            this.showSuccess(`updated node: ${updates.name}`);
        } catch (error) {
            this.showError(error.message);
        }
    }

    deleteNodeFromSidebar() {
        const selectedNodes = Array.from(this.state.selectedNodes);
        if (selectedNodes.length !== 1) return;

        const node = this.state.getNode(selectedNodes[0]);
        this.state.removeNode(selectedNodes[0]);
        this.showSuccess(`deleted node: ${node.name}`);
    }

    createGroup() {
        const selectedNodes = Array.from(this.state.selectedNodes);
        if (selectedNodes.length < 2) {
            this.showError('select at least 2 nodes to create a group');
            return;
        }

        try {
            const group = this.state.createGroup(selectedNodes);
            
            // nodes should stay in their original positions when grouped
            // no need to rearrange them
            
            this.showSuccess(`created group: ${group.name}`);
        } catch (error) {
            this.showError(error.message);
        }
    }

    alignNodes() {
        const selectedNodes = this.state.getSelectedNodes();
        if (selectedNodes.length < 2) {
            this.showError('select at least 2 nodes to align');
            return;
        }

        Geometry.alignNodesHorizontally(selectedNodes);
        this.state.emit('stateChanged');
        this.showSuccess('nodes aligned horizontally');
    }

    deleteSelectedNodes() {
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
        
        // provide appropriate feedback
        if (inputNodeAttempts > 0 && deletedCount === 0) {
            this.showError('input nodes cannot be deleted directly');
        } else if (inputNodeAttempts > 0 && deletedCount > 0) {
            this.showWarning(`deleted ${deletedCount} node(s) - input nodes cannot be deleted directly`);
        } else if (deletedCount > 0) {
            this.showSuccess(`deleted ${deletedCount} node(s)`);
        }
    }

    saveGroupProperties() {
        if (!this.state.selectedGroup) return;

        const updates = {
            name: document.getElementById('group_name').value.trim(),
            description: document.getElementById('group_description').value.trim()
        };

        if (!updates.name) {
            this.showError('group name is required');
            return;
        }

        try {
            this.state.updateGroup(this.state.selectedGroup.id, updates);
            this.showSuccess(`updated group: ${updates.name}`);
        } catch (error) {
            this.showError(error.message);
        }
    }

    ungroupNodes() {
        if (!this.state.selectedGroup) return;

        const groupName = this.state.selectedGroup.name;
        this.state.removeGroup(this.state.selectedGroup.id);
        this.showSuccess(`ungrouped: ${groupName}`);
    }

    deleteGroup() {
        if (!this.state.selectedGroup) return;

        const groupName = this.state.selectedGroup.name;
        this.state.removeGroup(this.state.selectedGroup.id);
        this.showSuccess(`deleted group: ${groupName}`);
    }

    // debounced auto-save
    debounceNodeSave() {
        clearTimeout(this.nodeSaveTimeout);
        this.nodeSaveTimeout = setTimeout(() => {
            this.saveNodeProperties();
        }, 1000);
    }

    debounceGroupSave() {
        clearTimeout(this.groupSaveTimeout);
        this.groupSaveTimeout = setTimeout(() => {
            this.saveGroupProperties();
        }, 1000);
    }

    // feedback methods
    showSuccess(message) {
        this.state.emit('statusUpdate', message);
        this.showToast(message, 'success');
    }

    showError(message) {
        this.state.emit('statusUpdate', `error: ${message}`);
        this.showToast(message, 'error');
    }

    showToast(message, type = 'info') {
        // simple toast notification - could be enhanced
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.textContent = message;
        toast.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            padding: 12px 20px;
            border-radius: 6px;
            color: white;
            font-size: 0.875rem;
            z-index: 10000;
            animation: slideIn 0.3s ease;
        `;

        if (type === 'success') {
            toast.style.backgroundColor = '#4caf50';
        } else if (type === 'error') {
            toast.style.backgroundColor = '#f44336';
        } else {
            toast.style.backgroundColor = '#2196f3';
        }

        document.body.appendChild(toast);

        setTimeout(() => {
            toast.style.animation = 'slideOut 0.3s ease';
            setTimeout(() => document.body.removeChild(toast), 300);
        }, 3000);
    }

    updateStatus(message) {
        const statusElement = document.getElementById('status_text');
        const statusBar = document.querySelector('.status_bar');
        if (!statusElement || !statusBar) return;

        // capture default status text once for reset behavior
        if (!this._defaultStatusTextCaptured) {
            this._defaultStatusText = statusElement.textContent || 'ready';
            this._defaultStatusTextCaptured = true;
        }

        // always set the message text
        statusElement.textContent = message;

        // special handling for warnings (no associated python file)
        const isWarning = /warning:/i.test(message) || /no python file assigned/i.test(message);
        if (isWarning) {
            // apply warning background color and schedule auto reset
            const originalBg = statusBar.style.backgroundColor;
            // set warning background
            statusBar.style.backgroundColor = '#2A0E0E';

            // clear any pending reset
            if (this._statusResetTimeout) {
                clearTimeout(this._statusResetTimeout);
            }

            // auto-reset after 3 seconds
            this._statusResetTimeout = setTimeout(() => {
                statusBar.style.backgroundColor = originalBg || 'var(--surface-color)';
                statusElement.textContent = this._defaultStatusText || 'ready';
                this._statusResetTimeout = null;
            }, 3000);
        }
    }

    // utility methods
    getCurrentView() {
        return this.currentView;
    }

    isVisible() {
        return this.propertiesSidebar.style.display !== 'none';
    }

    // python file selection via popup explorer
    async initializePythonFileDropdown() {
        // cache elements
        const input = document.getElementById('python_file');
        const modal = document.getElementById('select_python_modal');
        const listEl = document.getElementById('fe_list');
        const breadcrumbEl = document.getElementById('fe_breadcrumb');
        const upBtn = document.getElementById('fe_up_btn');
        const cancelBtn = document.getElementById('fe_cancel');
        const confirmBtn = document.getElementById('fe_confirm');
        const closeBtn = document.getElementById('fe_close_btn');
        const cwdDisplay = document.getElementById('fe_cwd_display');

        if (!input || !modal || !listEl || !breadcrumbEl || !upBtn || !cancelBtn || !confirmBtn) return;

        let explorerCwd = '';
        let selectedRelFile = '';

        const renderBreadcrumb = (cwd) => {
            breadcrumbEl.innerHTML = '';
            const root = document.createElement('span');
            root.className = 'mini_breadcrumb_item';
            root.textContent = 'nodes';
            root.onclick = () => loadExplorer('');
            breadcrumbEl.appendChild(root);
            const parts = (cwd || '').split('/').filter(Boolean);
            let accum = [];
            parts.forEach(p => {
                const sep = document.createElement('span'); sep.className = 'mini_breadcrumb_sep'; sep.textContent = '/'; breadcrumbEl.appendChild(sep);
                accum.push(p);
                const item = document.createElement('span'); item.className = 'mini_breadcrumb_item'; item.textContent = p; item.onclick = () => loadExplorer(accum.join('/')); breadcrumbEl.appendChild(item);
            });
        };

        const highlightSelection = () => {
            listEl.querySelectorAll('.mini_row').forEach(row => {
                row.style.background = (row.dataset.type === 'file' && row.dataset.path === selectedRelFile) ? 'var(--hover-color)' : '';
            });
        };

        const loadExplorer = async (path) => {
            try {
                const resp = await fetch(`/api/nodes/browse?path=${encodeURIComponent(path || '')}`);
                const data = await resp.json();
                if (data.status !== 'success') { listEl.innerHTML = '<div style="padding:10px; opacity:0.7;">failed to load</div>'; return; }
                explorerCwd = data.cwd || '';
                if (cwdDisplay) cwdDisplay.textContent = '/' + (explorerCwd || '');
                selectedRelFile = '';
                renderBreadcrumb(explorerCwd);
                // separate folders and .py files
                const folders = (data.entries || []).filter(e => e.is_dir && e.name !== '__pycache__');
                const files = (data.entries || []).filter(e => !e.is_dir && e.ext === '.py');
                listEl.innerHTML = '';
                if (folders.length === 0 && files.length === 0) {
                    listEl.innerHTML = '<div style="padding:10px; opacity:0.7;">empty</div>';
                    return;
                }
                folders.forEach(f => {
                    const row = document.createElement('div'); row.className = 'mini_row'; row.dataset.type = 'dir'; row.dataset.path = f.path;
                    row.innerHTML = `<span class="material-icons" style="font-size:16px; opacity:.9;">folder</span><span>${f.name}</span>`;
                    row.onclick = () => loadExplorer(f.path);
                    listEl.appendChild(row);
                });
                files.forEach(file => {
                    const row = document.createElement('div'); row.className = 'mini_row'; row.dataset.type = 'file'; row.dataset.path = file.path;
                    row.innerHTML = `<span class="material-icons" style="font-size:16px; opacity:.9;">description</span><span>${file.name}</span><span style="margin-left:auto; opacity:.7; font-family:monospace;">/${file.path}</span>`;
                    row.onclick = () => { selectedRelFile = file.path; highlightSelection(); };
                    listEl.appendChild(row);
                });
            } catch (_) {
                listEl.innerHTML = '<div style="padding:10px; opacity:0.7;">error loading</div>';
            }
        };

        // wire buttons
        upBtn.onclick = () => { const parent = (explorerCwd || '').split('/').filter(Boolean); parent.pop(); loadExplorer(parent.join('/')); };
        const closeModal = () => { modal.classList.remove('show'); };
        cancelBtn.onclick = closeModal;
        if (closeBtn) closeBtn.onclick = closeModal;
        confirmBtn.onclick = () => {
            if (!selectedRelFile) { this.showError('select a python file'); return; }
            // set input and update node
            input.value = selectedRelFile; // relative to nodes/
            input.dataset.fullPath = `nodes/${selectedRelFile}`;
            closeModal();
            this.debounceNodeSave();
        };
        modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });

        // open explorer on input click
        input.addEventListener('click', (e) => {
            e.stopPropagation();
            modal.classList.add('show');
            loadExplorer('');
        });
        // close on outside click of container handled above
    }

    async loadPythonFiles() {
        try {
            const response = await fetch('/api/python-files');
            const data = await response.json();
            
            if (data.status === 'success') {
                this.pythonFiles = data.files;
                this.filteredFiles = [...this.pythonFiles];
                this.updateDropdownMenu();
            } else {
                console.error('failed to load python files:', data.message);
                this.showDropdownError('failed to load files');
            }
        } catch (error) {
            console.error('error loading python files:', error);
            this.showDropdownError('error loading files');
        }
    }

    setupDropdownEvents() {
        const input = document.getElementById('python_file');
        const dropdown = document.getElementById('python_file_dropdown');
        const container = input.closest('.dropdown_container');

        // click to toggle dropdown
        input.addEventListener('click', (e) => {
            e.stopPropagation();
            this.toggleDropdown();
        });

        // search functionality
        input.addEventListener('input', () => {
            this.filterFiles(input.value);
        });

        // close dropdown when clicking outside
        document.addEventListener('click', (e) => {
            if (!container.contains(e.target)) {
                this.closeDropdown();
            }
        });

        // keyboard navigation
        input.addEventListener('keydown', (e) => {
            this.handleKeyboardNavigation(e);
        });
    }

    toggleDropdown() {
        const dropdown = document.getElementById('python_file_dropdown');
        const input = document.getElementById('python_file');
        
        if (dropdown.classList.contains('show')) {
            this.closeDropdown();
        } else {
            this.openDropdown();
            input.removeAttribute('readonly');
            input.focus();
        }
    }

    openDropdown() {
        const dropdown = document.getElementById('python_file_dropdown');
        dropdown.classList.add('show');
        this.updateDropdownMenu();
    }

    closeDropdown() {
        const dropdown = document.getElementById('python_file_dropdown');
        const input = document.getElementById('python_file');
        dropdown.classList.remove('show');
        input.setAttribute('readonly', 'true');
    }

    filterFiles(searchTerm) {
        const term = searchTerm.toLowerCase();
        this.filteredFiles = this.pythonFiles.filter(file => 
            file.name.toLowerCase().includes(term) || 
            file.filename.toLowerCase().includes(term)
        );
        this.updateDropdownMenu();
    }

    updateDropdownMenu() {
        const dropdown = document.getElementById('python_file_dropdown');
        
        if (this.filteredFiles.length === 0) {
            dropdown.innerHTML = '<div class="dropdown_no_results">no files found</div>';
            return;
        }

        const items = this.filteredFiles.map(file => {
            // remove 'nodes/' prefix from displayed path
            const displayPath = file.path.startsWith('nodes/') ? file.path.substring(6) : file.path;
            return `
                <div class="dropdown_item" data-path="${file.path}" data-display-path="${displayPath}" data-name="${file.name}">
                    ${displayPath}
                </div>
            `;
        }).join('');

        dropdown.innerHTML = items;

        // add click handlers
        dropdown.querySelectorAll('.dropdown_item').forEach(item => {
            item.addEventListener('click', () => {
                this.selectFile(item.dataset.path, item.dataset.displayPath, item.dataset.name);
            });
        });
    }

    selectFile(path, displayPath, name) {
        const input = document.getElementById('python_file');
        input.value = displayPath; // use display path without 'nodes/'
        input.dataset.fullPath = path; // store full path for backend use
        this.closeDropdown();
        
        // trigger save
        this.debounceNodeSave();
    }

    showDropdownError(message) {
        const dropdown = document.getElementById('python_file_dropdown');
        dropdown.innerHTML = `<div class="dropdown_no_results">${message}</div>`;
    }

    handleKeyboardNavigation(e) {
        const dropdown = document.getElementById('python_file_dropdown');
        const items = dropdown.querySelectorAll('.dropdown_item');
        
        if (items.length === 0) return;

        let currentIndex = -1;
        items.forEach((item, index) => {
            if (item.classList.contains('selected')) {
                currentIndex = index;
            }
        });

        switch (e.key) {
            case 'ArrowDown':
                e.preventDefault();
                currentIndex = Math.min(currentIndex + 1, items.length - 1);
                this.highlightItem(items, currentIndex);
                break;
            case 'ArrowUp':
                e.preventDefault();
                currentIndex = Math.max(currentIndex - 1, 0);
                this.highlightItem(items, currentIndex);
                break;
            case 'Enter':
                e.preventDefault();
                if (currentIndex >= 0) {
                    const item = items[currentIndex];
                    this.selectFile(item.dataset.path, item.dataset.name);
                }
                break;
            case 'Escape':
                this.closeDropdown();
                break;
        }
    }

    highlightItem(items, index) {
        items.forEach(item => item.classList.remove('selected'));
        if (items[index]) {
            items[index].classList.add('selected');
            items[index].scrollIntoView({ block: 'nearest' });
        }
    }

    // flowchart management
    setupFlowchartManagement() {
        // create flowchart button
        document.getElementById('create_flowchart_btn').addEventListener('click', () => {
            this.showCreateFlowchartModal();
        });



        // export button
        document.getElementById('export_btn').addEventListener('click', () => {
            this.exportCurrentFlowchart();
        });

        // modal events
        document.getElementById('close_create_modal').addEventListener('click', () => {
            this.hideCreateFlowchartModal();
        });

        document.getElementById('cancel_create_flowchart').addEventListener('click', () => {
            this.hideCreateFlowchartModal();
        });

        document.getElementById('confirm_create_flowchart').addEventListener('click', () => {
            this.createNewFlowchart();
        });

        // close modal on overlay click
        this.createFlowchartModal.addEventListener('click', (e) => {
            if (e.target === this.createFlowchartModal) {
                this.hideCreateFlowchartModal();
            }
        });

        // enter key in name input
        document.getElementById('new_flowchart_name').addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                this.createNewFlowchart();
            }
        });

        // if requested via url param, auto-open the create flowchart modal
        try {
            const params = new URLSearchParams(window.location.search);
            if (params.get('openCreateFlowchart') === '1') {
                this.showCreateFlowchartModal();
                // remove the param from url without reloading
                params.delete('openCreateFlowchart');
                const newQuery = params.toString();
                const newUrl = window.location.pathname + (newQuery ? `?${newQuery}` : '');
                window.history.replaceState(null, '', newUrl);
            }
        } catch (_) {}
    }

    async initializeFlowchartDropdown() {
        await this.loadFlowcharts();
        this.setupFlowchartDropdownEvents();
        
        // get flowchart from URL or use default
        const flowchartFromURL = this.urlManager.getFlowchartFromURL();
        const displayName = this.urlManager.getFlowchartDisplayName();
        
        console.log(`[Sidebar] Initializing with flowchart from URL: ${flowchartFromURL} (${displayName})`);
        
        // check if the flowchart from URL exists
        const flowchartExists = this.flowcharts.some(f => f.filename === flowchartFromURL);
        
        if (flowchartExists) {
            // use flowchart from URL
            this.state.storage.setCurrentFlowchart(flowchartFromURL);
            this.setCurrentFlowchart(displayName);
        } else {
            // fallback to default and update URL
            console.warn(`[Sidebar] Flowchart ${flowchartFromURL} not found, falling back to default`);
            this.state.storage.setCurrentFlowchart('default.json');
            this.setCurrentFlowchart('default');
            this.urlManager.updateFlowchartInURL('default.json');
        }
    }

    async loadFlowcharts() {
        try {
            const result = await this.state.storage.listFlowcharts();
            
            if (result.success) {
                this.flowcharts = result.flowcharts;
                this.filteredFlowcharts = [...this.flowcharts];
                this.updateFlowchartDropdownMenu();
            } else {
                console.error('failed to load flowcharts:', result.message);
                this.showFlowchartDropdownError('failed to load flowcharts');
            }
        } catch (error) {
            console.error('error loading flowcharts:', error);
            this.showFlowchartDropdownError('error loading flowcharts');
        }
    }

    setupFlowchartDropdownEvents() {
        const container = this.flowchartSelector.closest('.dropdown_container');

        // click to toggle dropdown
        this.flowchartSelector.addEventListener('click', (e) => {
            e.stopPropagation();
            this.toggleFlowchartDropdown();
        });

        // close dropdown when clicking outside
        document.addEventListener('click', (e) => {
            if (!container.contains(e.target)) {
                this.closeFlowchartDropdown();
            }
        });
    }

    toggleFlowchartDropdown() {
        if (this.flowchartDropdown.classList.contains('show')) {
            this.closeFlowchartDropdown();
        } else {
            this.openFlowchartDropdown();
        }
    }

    openFlowchartDropdown() {
        this.flowchartDropdown.classList.add('show');
        this.updateFlowchartDropdownMenu();
    }

    closeFlowchartDropdown() {
        this.flowchartDropdown.classList.remove('show');
    }

    updateFlowchartDropdownMenu() {
        if (this.filteredFlowcharts.length === 0) {
            this.flowchartDropdown.innerHTML = '<div class="dropdown_no_results">no flowcharts found</div>';
            return;
        }

        const items = this.filteredFlowcharts.map(flowchart => `
            <div class="dropdown_item" data-name="${flowchart.name}" data-filename="${flowchart.filename}">
                <div class="dropdown_item_content">
                    <div class="dropdown_item_name">${flowchart.name}</div>
                </div>
                <button class="dropdown_delete_btn" data-filename="${flowchart.filename}" data-name="${flowchart.name}" title="delete flowchart">
                    <span class="material-icons">delete</span>
                </button>
            </div>
        `).join('');

        this.flowchartDropdown.innerHTML = items;

        // add click handlers for selection
        this.flowchartDropdown.querySelectorAll('.dropdown_item').forEach(item => {
            item.addEventListener('click', (e) => {
                // don't trigger selection if clicking delete button
                if (!e.target.closest('.dropdown_delete_btn')) {
                    this.selectFlowchart(item.dataset.filename, item.dataset.name);
                }
            });
        });

        // add click handlers for delete buttons
        this.flowchartDropdown.querySelectorAll('.dropdown_delete_btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.deleteFlowchart(btn.dataset.filename, btn.dataset.name);
            });
        });
    }

    async selectFlowchart(filename, name) {
        this.closeFlowchartDropdown();
        
        try {
            // save current flowchart first
            await this.state.save(true);
            
            // switch to new flowchart
            this.state.storage.setCurrentFlowchart(filename);
            const result = await this.state.load();
            
            if (result.success) {
                this.setCurrentFlowchart(name);
                // update URL to reflect new flowchart
                this.urlManager.updateFlowchartInURL(filename);
                this.showSuccess(`switched to flowchart: ${name}`);
            } else {
                this.showError(`failed to load flowchart: ${result.message}`);
            }
        } catch (error) {
            this.showError(`error switching flowchart: ${error.message}`);
        }
    }

    setCurrentFlowchart(name) {
        this.flowchartSelector.value = name;
    }

    showFlowchartDropdownError(message) {
        this.flowchartDropdown.innerHTML = `<div class="dropdown_no_results">${message}</div>`;
    }

    // modal management
    showCreateFlowchartModal() {
        this.createFlowchartModal.classList.add('show');
        document.getElementById('new_flowchart_name').value = '';
        document.getElementById('new_flowchart_name').focus();
    }

    hideCreateFlowchartModal() {
        this.createFlowchartModal.classList.remove('show');
    }

    async createNewFlowchart() {
        const name = document.getElementById('new_flowchart_name').value.trim();
        
        if (!name) {
            this.showError('flowchart name is required');
            return;
        }

        try {
            const result = await this.state.storage.createFlowchart(name);
            
            if (result.success) {
                this.hideCreateFlowchartModal();
                await this.loadFlowcharts();
                // selectFlowchart will automatically update the URL
                await this.selectFlowchart(result.flowchart.filename, result.flowchart.name);
                this.showSuccess(result.message);
            } else {
                this.showError(result.message);
            }
        } catch (error) {
            this.showError(`error creating flowchart: ${error.message}`);
        }
    }

    async deleteFlowchart(filename, name) {
        // confirm deletion
        if (!confirm(`are you sure you want to delete the flowchart "${name}"? this action cannot be undone.`)) {
            return;
        }

        try {
            const result = await this.state.storage.deleteFlowchart(filename);
            
            if (result.success) {
                // reload flowcharts list
                await this.loadFlowcharts();
                
                // if we deleted the current flowchart, switch to default
                if (this.state.storage.getCurrentFlowchart() === filename) {
                    this.state.storage.setCurrentFlowchart('default.json');
                    const loadResult = await this.state.load();
                    if (loadResult.success) {
                        this.setCurrentFlowchart('default');
                        this.urlManager.updateFlowchartInURL('default.json');
                    }
                }
                
                this.showSuccess(result.message);
            } else {
                this.showError(result.message);
            }
        } catch (error) {
            this.showError(`error deleting flowchart: ${error.message}`);
        }
    }



    exportCurrentFlowchart() {
        try {
            const data = this.state.exportData();
            this.state.storage.exportAsJson(data);
            this.showSuccess('flowchart exported successfully');
        } catch (error) {
            this.showError(`error exporting flowchart: ${error.message}`);
        }
    }

    // url management
    setupURLHandlers() {
        // handle browser back/forward navigation
        this.urlManager.setupPopstateHandler(async (flowchartName, displayName) => {
            console.log(`[Sidebar] URL changed to flowchart: ${flowchartName} (${displayName})`);
            
            // check if flowchart exists
            const flowchartExists = this.flowcharts.some(f => f.filename === flowchartName);
            
            if (flowchartExists) {
                // save current flowchart first
                await this.state.save(true);
                
                // switch to flowchart from URL
                this.state.storage.setCurrentFlowchart(flowchartName);
                const result = await this.state.load();
                
                if (result.success) {
                    this.setCurrentFlowchart(displayName);
                    this.showSuccess(`switched to flowchart: ${displayName}`);
                }
            } else {
                // fallback to default
                this.state.storage.setCurrentFlowchart('default.json');
                this.setCurrentFlowchart('default');
                this.urlManager.updateFlowchartInURL('default.json');
            }
        });
    }

    // cleanup
    destroy() {
        // remove event listeners and cleanup
        clearTimeout(this.nodeSaveTimeout);
        clearTimeout(this.groupSaveTimeout);
    }

    // variable analysis functionality
    async analyzeConnectionVariables(link, sourceNode, targetNode) {
        const loadingDiv = document.getElementById('variables_loading');
        const listDiv = document.getElementById('variables_list');
        const errorDiv = document.getElementById('variables_error');
        const emptyDiv = document.getElementById('variables_empty');

        // show loading state
        this.showVariablesState('loading');

        // check if both nodes have python files
        if (!sourceNode || !targetNode || !sourceNode.pythonFile || !targetNode.pythonFile) {
            this.showVariablesError('both nodes must have python files assigned');
            return;
        }

        try {
            const response = await fetch('/api/analyze-connection', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
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
    }

    async analyzeIfConnectionVariables(link) {
        // show loading state
        this.showIfVariablesState('loading');

        // get the python node (source) and if node (target)
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
            // analyze the python node's return values
            const response = await fetch('/api/analyze-python-function', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    python_file: pythonNode.pythonFile
                })
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
    }

    async analyzeIfNodeVariables(ifNode) {
        // show loading state
        this.showIfNodeVariablesState('loading');

        // find all python nodes that connect to this if node
        const incomingLinks = this.state.links.filter(link => link.target === ifNode.id);
        const pythonNodes = [];

        console.log('analyzing if node variables for:', ifNode.name);
        console.log('incoming links:', incomingLinks);

        for (const link of incomingLinks) {
            const sourceNode = this.state.getNode(link.source);
            console.log('source node:', sourceNode);
            
            // check if it's a python node (either python_file type or has pythonFile property)
            if (sourceNode && sourceNode.pythonFile) {
                console.log('found python node:', sourceNode.name, 'type:', sourceNode.type);
                pythonNodes.push(sourceNode);
            }
        }

        console.log('python nodes found:', pythonNodes.length);

        if (pythonNodes.length === 0) {
            this.showIfNodeVariablesState('empty');
            return;
        }

        try {
            // analyze all connected python nodes
            const allVariables = [];
            
            for (const pythonNode of pythonNodes) {
                console.log('analyzing python node:', pythonNode.name, 'file:', pythonNode.pythonFile);
                
                const response = await fetch('/api/analyze-python-function', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        python_file: pythonNode.pythonFile
                    })
                });

                const data = await response.json();
                console.log('api response for', pythonNode.name, ':', data);
                console.log('data.status:', data.status);
                console.log('data.success:', data.success);
                console.log('data.returns:', data.returns);
                console.log('data.returns type:', typeof data.returns);
                console.log('data.returns length:', data.returns ? data.returns.length : 'undefined');
                if (data.returns && data.returns.length > 0) {
                    console.log('first return item:', data.returns[0]);
                }

                if ((data.status === 'success' || data.success === true) && data.returns && data.returns.length > 0) {
                    console.log('found returns for', pythonNode.name, ':', data.returns);
                    // add source node info to each variable
                    data.returns.forEach(returnVar => {
                        console.log('processing return var:', returnVar);
                        allVariables.push({
                            ...returnVar,
                            sourceNode: pythonNode.name,
                            sourceFile: pythonNode.pythonFile
                        });
                    });
                } else {
                    console.log('no returns found for', pythonNode.name, '- status:', data.status, 'success:', data.success, 'returns:', data.returns);
                }
            }

            console.log('all variables collected:', allVariables);

            this.displayIfNodeVariables(allVariables);
        } catch (error) {
            console.error('error analyzing if node variables:', error);
            this.showIfNodeVariablesError('failed to connect to analysis service');
        }
    }

    async populateConnectionNodeVariables(link) {
        // get both nodes to determine the connection direction
        const sourceNode = this.state.getNode(link.source);
        const targetNode = this.state.getNode(link.target);

        if (!sourceNode || !targetNode) {
            this.showIfVariablesError('could not find connected nodes');
            return;
        }

        let ifNode, pythonNode;

        // determine which is the if node and which is the python node
        if (sourceNode.type === 'if_node' && targetNode.type === 'python_file') {
            // connection: IF node → Python node
            ifNode = sourceNode;
            pythonNode = targetNode;
        } else if (sourceNode.type === 'python_file' && targetNode.type === 'if_node') {
            // connection: Python node → IF node
            ifNode = targetNode;
            pythonNode = sourceNode;
        } else {
            this.showIfVariablesError('connection must be between if node and python node');
            return;
        }

        // show loading state
        this.showIfVariablesState('loading');

        try {
            // get all variables available to the if node
            const ifNodeVariables = await this.getIfNodeVariables(ifNode);
            
            if (ifNodeVariables.length === 0) {
                this.showIfVariablesState('empty');
                return;
            }

            // populate the dropdown with if node variables
            this.displayConnectionNodeVariables(ifNodeVariables, ifNode.name);
        } catch (error) {
            console.error('error populating connection node variables:', error);
            this.showIfVariablesError('failed to get if node variables');
        }
    }

    async getIfNodeVariables(ifNode) {
        // find all python nodes that connect to this if node
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

        // analyze all connected python nodes
        const allVariables = [];
        
        for (const pythonNode of pythonNodes) {
            const response = await fetch('/api/analyze-python-function', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    python_file: pythonNode.pythonFile
                })
            });

            const data = await response.json();

            if ((data.status === 'success' || data.success === true) && data.returns && data.returns.length > 0) {
                // add source node info to each variable
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
    }

    showVariablesState(state) {
        const states = ['loading', 'list', 'error', 'empty'];
        states.forEach(s => {
            const div = document.getElementById(`variables_${s}`);
            if (div) {
                div.style.display = s === state ? 'block' : 'none';
            }
        });
    }

    showIfVariablesState(state) {
        const states = ['loading', 'list', 'error', 'empty'];
        states.forEach(s => {
            const div = document.getElementById(`if_variables_${s}`);
            if (div) {
                div.style.display = s === state ? 'block' : 'none';
            }
        });
    }

    showIfNodeVariablesState(state) {
        const states = ['loading', 'list', 'error', 'empty'];
        states.forEach(s => {
            const div = document.getElementById(`if_node_variables_${s}`);
            if (div) {
                div.style.display = s === state ? 'block' : 'none';
            }
        });
        
        // also show/hide the content div for list state
        const contentDiv = document.getElementById('if_node_variables_content');
        if (contentDiv) {
            contentDiv.style.display = state === 'list' ? 'block' : 'none';
        }
    }

    showVariablesError(message) {
        document.getElementById('variables_error_message').textContent = message;
        this.showVariablesState('error');
    }

    showIfVariablesError(message) {
        document.getElementById('if_variables_error_message').textContent = message;
        this.showIfVariablesState('error');
    }

    showIfNodeVariablesError(message) {
        document.getElementById('if_node_variables_error_message').textContent = message;
        this.showIfNodeVariablesState('error');
    }

    displayVariables(variables) {
        const listDiv = document.getElementById('variables_list');
        
        if (!variables || variables.length === 0) {
            this.showVariablesState('empty');
            return;
        }

        listDiv.innerHTML = '';
        
        variables.forEach(variable => {
            const variableDiv = document.createElement('div');
            variableDiv.className = 'variable_item';
            
            const nameDiv = document.createElement('div');
            nameDiv.className = 'variable_name';
            nameDiv.textContent = variable.name;
            
            const tagsDiv = document.createElement('div');
            tagsDiv.style.marginBottom = '4px';
            
            // add type tag
            const typeSpan = document.createElement('span');
            typeSpan.className = 'variable_type';
            typeSpan.textContent = this.formatVariableType(variable.type);
            tagsDiv.appendChild(typeSpan);
            
            // add confidence tag if present
            if (variable.confidence) {
                const confidenceSpan = document.createElement('span');
                confidenceSpan.className = `variable_confidence confidence_${variable.confidence}`;
                confidenceSpan.textContent = variable.confidence;
                tagsDiv.appendChild(confidenceSpan);
            }
            
            // add details
            const detailsDiv = document.createElement('div');
            detailsDiv.className = 'variable_details';
            detailsDiv.innerHTML = this.formatVariableDetails(variable);
            
            variableDiv.appendChild(nameDiv);
            variableDiv.appendChild(tagsDiv);
            if (detailsDiv.innerHTML) {
                variableDiv.appendChild(detailsDiv);
            }
            
            listDiv.appendChild(variableDiv);
        });
        
        this.showVariablesState('list');
    }

    displayIfNodeVariables(variables) {
        console.log('displayIfNodeVariables called with:', variables);
        
        const contentDiv = document.getElementById('if_node_variables_content');
        console.log('contentDiv found:', contentDiv);
        
        if (!variables || variables.length === 0) {
            console.log('no variables to display, showing empty state');
            this.showIfNodeVariablesState('empty');
            return;
        }

        console.log('clearing content div');
        contentDiv.innerHTML = '';
        
        // group variables by source node
        const groupedVariables = {};
        variables.forEach(variable => {
            const sourceNode = variable.sourceNode;
            if (!groupedVariables[sourceNode]) {
                groupedVariables[sourceNode] = [];
            }
            groupedVariables[sourceNode].push(variable);
        });
        
        console.log('grouped variables:', groupedVariables);
        
        // create sections for each source node
        Object.keys(groupedVariables).forEach(sourceNodeName => {
            const nodeVariables = groupedVariables[sourceNodeName];
            console.log('creating section for source node:', sourceNodeName, 'with variables:', nodeVariables);
            
            // create source node header
            const sourceHeader = document.createElement('div');
            sourceHeader.style.cssText = `
                font-size: 0.9em;
                font-weight: 500;
                color: var(--primary-color);
                margin: 12px 0 8px 0;
                padding-bottom: 4px;
                border-bottom: 1px solid var(--border-color);
            `;
            sourceHeader.textContent = `from: ${sourceNodeName}`;
            contentDiv.appendChild(sourceHeader);
            console.log('added source header for:', sourceNodeName);
            
            // create variable list items consistent with python returns styling
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
                    default:
                        icon = 'label';
                        iconColor = '#4caf50';
                }

                item.innerHTML = `
                    <span class="material-icons" style="font-size: 16px; color: ${iconColor};">${icon}</span>
                    <span style="font-family: monospace; font-weight: 500;">${variable.name}</span>
                    <span style="font-size: 0.75rem; opacity: 0.7; margin-left: auto;">${typeText}</span>
                `;

                contentDiv.appendChild(item);
            });
        });
        
        this.showIfNodeVariablesState('list');
    }

    displayIfVariables(returns) {
        const dropdown = document.getElementById('if_variables_dropdown');
        
        if (!returns || returns.length === 0) {
            this.showIfVariablesState('empty');
            return;
        }

        // clear existing options
        dropdown.innerHTML = '<option value="">select a variable</option>';
        
        // add options for each return variable (names only)
        returns.forEach(returnVar => {
            const option = document.createElement('option');
            option.value = returnVar.name;
            option.textContent = returnVar.name;
            dropdown.appendChild(option);
        });
        
        // no details panel behavior
        dropdown.onchange = () => {};
        
        this.showIfVariablesState('list');
    }

    displayConnectionNodeVariables(variables, ifNodeName) {
        const dropdown = document.getElementById('if_variables_dropdown');
        
        if (!variables || variables.length === 0) {
            this.showIfVariablesState('empty');
            return;
        }

        // clear existing options
        dropdown.innerHTML = '<option value="">select a variable from if node</option>';
        
        // simplify: flat list showing just names
        variables.forEach(variable => {
            const option = document.createElement('option');
            option.value = variable.name;
            option.textContent = variable.name;
            dropdown.appendChild(option);
        });
        
        // no extra details behavior
        dropdown.onchange = () => {};
        
        this.showIfVariablesState('list');
    }

    // if condition builder
    initializeIfConditionBuilder(link) {
        const addBtn = document.getElementById('if_add_condition_btn');
        if (!addBtn) return;

        // prefill existing
        this.renderIfConditions(link);

        // hide combiner for first condition
        const combinerContainer = document.getElementById('if_combiner_container');
        if (combinerContainer) {
            const existing = this.getIfConditionsForLink(link);
            combinerContainer.style.display = existing.length === 0 ? 'none' : 'block';
        }

        // handlers
        addBtn.onclick = () => {
            const varDropdown = document.getElementById('if_variables_dropdown');
            const operatorDropdown = document.getElementById('if_operator_dropdown');
            const valueInput = document.getElementById('if_compare_value_input');
            const combinerDropdown = document.getElementById('if_condition_combiner');

            const variable = varDropdown.value;
            const operator = operatorDropdown.value;
            const compareValue = valueInput.value;
            // first condition should not use a combiner
            const existingBefore = this.getIfConditionsForLink(link);
            const combiner = existingBefore.length === 0 ? undefined : (combinerDropdown.value || 'and');

            if (!variable || !operator) {
                this.showError('select a variable and operator');
                return;
            }

            // read current conditions from state
            const existing = this.getIfConditionsForLink(link);
            const newCondition = existing.length === 0 ? { variable, operator, value: compareValue } : { variable, operator, value: compareValue, combiner };
            const updated = [...existing, newCondition];
            this.setIfConditionsForLink(link, updated);

            // reset value input for convenience
            valueInput.value = '';

            // re-render list
            this.renderIfConditions(link);
            // show combiner after first condition is added
            if (combinerContainer) combinerContainer.style.display = 'block';
            this.showSuccess('condition added');
        };
    }

    getIfConditionsForLink(link) {
        const existingLink = this.state.getLink(link.source, link.target);
        return (existingLink && existingLink.conditions && Array.isArray(existingLink.conditions)) ? existingLink.conditions : [];
    }

    setIfConditionsForLink(link, conditions) {
        this.state.updateLink(link.source, link.target, { conditions });
    }

    removeIfCondition(link, index) {
        const existing = this.getIfConditionsForLink(link);
        if (index < 0 || index >= existing.length) return;
        existing.splice(index, 1);
        this.setIfConditionsForLink(link, [...existing]);
        this.renderIfConditions(link);
        this.showSuccess('condition removed');
    }

    renderIfConditions(link) {
        const container = document.getElementById('if_conditions_list');
        if (!container) return;
        const conditions = this.getIfConditionsForLink(link);
        container.innerHTML = '';

        if (!conditions.length) {
            const empty = document.createElement('div');
            empty.style.cssText = 'text-align:center; opacity:.7; padding: 8px; font-size:.85em;';
            empty.textContent = 'no conditions yet';
            container.appendChild(empty);
            return;
        }

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
    }

    formatVariableType(type) {
        const typeMap = {
            'function_import': 'function import',
            'variable_import': 'variable import',
            'defined_and_used': 'defined → used',
            'common_assignment': 'common variable',
            'parameter_match': 'parameter match'
        };
        return typeMap[type] || type;
    }

    formatVariableDetails(variable) {
        const details = [];
        
        if (variable.source_line) {
            details.push(`defined: line ${variable.source_line}`);
        }
        
        if (variable.target_line) {
            details.push(`used: line ${variable.target_line}`);
        }
        
        if (variable.target_function) {
            details.push(`used in function: ${variable.target_function}`);
        }
        
        if (variable.parameters && variable.parameters.length > 0) {
            details.push(`parameters: ${variable.parameters.join(', ')}`);
        }
        
        if (variable.returns && variable.returns.length > 0) {
            details.push(`returns: ${variable.returns.join(', ')}`);
        }
        
        if (variable.value_type && variable.value_type !== 'unknown') {
            details.push(`type: ${variable.value_type}`);
        }
        
        return details.join(' • ');
    }

    setupLinkEventHandlers() {
        // refresh variables button
        const refreshBtn = document.getElementById('refresh_variables_btn');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', () => {
                if (this.state.selectedLink) {
                    const sourceNode = this.state.getNode(this.state.selectedLink.source);
                    const targetNode = this.state.getNode(this.state.selectedLink.target);
                    this.analyzeConnectionVariables(this.state.selectedLink, sourceNode, targetNode);
                }
            });
        }

        // delete link button
        const deleteLinkBtn = document.getElementById('delete_link_btn');
        if (deleteLinkBtn) {
            deleteLinkBtn.addEventListener('click', () => {
                if (this.state.selectedLink) {
                    this.state.removeLink(this.state.selectedLink.source, this.state.selectedLink.target);
                    this.showSuccess('connection deleted');
                }
            });
        }
    }

    updateRunModeNodeDetails(selection) {
        const nodeFileContent = document.getElementById('node_file_content');
        const executionTimeRow = document.getElementById('execution_time_row');
        const executionTimeGroup = document.getElementById('execution_time_group');
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
        
        if (selection.nodes.length === 1) {
            // show all detailed groups in single selection
            if (executionStatusGroup) executionStatusGroup.style.display = '';
            if (executionTimeGroup) executionTimeGroup.style.display = '';
            if (nodeFileInfoGroup) nodeFileInfoGroup.style.display = '';
            if (nodeInputGroup) nodeInputGroup.style.display = '';
            if (nodeOutputGroup) nodeOutputGroup.style.display = '';
            if (consoleGroup) consoleGroup.style.display = '';
            if (failureInfo) failureInfo.style.display = 'none';
            const nodeId = selection.nodes[0];
            const node = this.state.getNode(nodeId);
            
            if (node) {
                // hide global progress when a python node is selected
                if (progressGroup) {
                    if (node.type === 'python_file') {
                        progressGroup.style.display = 'none';
                    } else {
                        progressGroup.style.display = '';
                    }
                }
                // show simplified file info
                this.displayNodeFileInfo(node, nodeFileContent);
                
                // check if we have execution results for this node
                const executionResult = window.flowchartApp?.nodeExecutionResults?.get(nodeId);
                
                if (executionResult) {
                    // show execution time row
                    if (executionTimeRow) executionTimeRow.style.display = 'flex';
                    const _rt = executionResult.runtime || 0;
                    executionTimeText.textContent = `${_rt}ms (${(_rt/1000).toFixed(3)}s)`;
                    executionTimestamp.textContent = executionResult.timestamp;
                    
                    if (executionResult.success) {
                        // populate input section
                        if (nodeInputContent) {
                            if (executionResult.input_args && Object.keys(executionResult.input_args).length > 0) {
                                nodeInputContent.textContent = JSON.stringify(executionResult.input_args, null, 2);
                            } else {
                                nodeInputContent.textContent = 'no inputs';
                            }
                        }
                        
                        // populate output section
                        if (nodeOutputContent) {
                            if (executionResult.return_value !== null && executionResult.return_value !== undefined) {
                                nodeOutputContent.textContent = JSON.stringify(executionResult.return_value, null, 2);
                            } else {
                                nodeOutputContent.textContent = 'no returns';
                            }
                        }
                        
                        // populate console section with a new block per line of output
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
                    // hide execution time row
                    if (executionTimeRow) executionTimeRow.style.display = 'none';
                    
                    // clear outputs
                    if (nodeInputContent) nodeInputContent.textContent = 'no inputs - node not executed';
                    if (nodeOutputContent) nodeOutputContent.textContent = 'no returns - node not executed';
                    consoleContent.textContent = 'no console output - node not executed';
                }
            }
        } else if (selection.nodes.length > 1) {
            // show status + progress + minimal guidance
            if (executionStatusGroup) executionStatusGroup.style.display = '';
            if (executionTimeGroup) executionTimeGroup.style.display = '';
            if (progressGroup) progressGroup.style.display = '';
            if (nodeFileInfoGroup) nodeFileInfoGroup.style.display = '';
            if (nodeInputGroup) nodeInputGroup.style.display = 'none';
            if (nodeOutputGroup) nodeOutputGroup.style.display = 'none';
            if (consoleGroup) consoleGroup.style.display = 'none';
            if (failureInfo) failureInfo.style.display = 'none';
            nodeFileContent.innerHTML = `
                <div style="margin-bottom: 8px;">
                    <strong>${selection.nodes.length} nodes selected</strong>
                </div>
                <div style="font-size: 0.8em; opacity: 0.8;">
                    select a single node to view file details
                </div>
            `;
            
            // hide execution time row
            if (executionTimeRow) executionTimeRow.style.display = 'none';
            
            // show general output
            if (nodeInputContent) nodeInputContent.textContent = 'select a single node to view inputs';
            if (nodeOutputContent) nodeOutputContent.textContent = 'select a single node to view returns';
            consoleContent.textContent = 'select a single node to view console output';
            
        } else {
            // nothing selected: only show execution status and progress, hide everything else
            if (executionStatusGroup) executionStatusGroup.style.display = '';
            if (executionTimeGroup) executionTimeGroup.style.display = '';
            if (progressGroup) progressGroup.style.display = '';
            if (nodeFileInfoGroup) nodeFileInfoGroup.style.display = 'none';
            if (nodeInputGroup) nodeInputGroup.style.display = 'none';
            if (nodeOutputGroup) nodeOutputGroup.style.display = 'none';
            if (consoleGroup) consoleGroup.style.display = 'none';

            // keep total time visible while running or after completion
            const app = window.flowchartApp;
            const isRunning = !!(app && app._elapsedTimer);
            const hasLast = !!(app && (app.lastExecutionElapsedMs || app.lastExecutionElapsedMs === 0));
            if (executionTimeRow && (isRunning || hasLast)) executionTimeRow.style.display = 'flex';

            // update global progress if available
            if (progressText && window.flowchartApp) {
                const order = window.flowchartApp.calculateNodeOrder ? window.flowchartApp.calculateNodeOrder() : [];
                const total = order.length;
                const executed = window.flowchartApp.nodeExecutionResults ? window.flowchartApp.nodeExecutionResults.size : 0;
                progressText.textContent = `${executed} of ${total}`;
            }

            // show failure block if last run failed and we know which node
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
    }

    displayNodeFileInfo(node, container) {
        const pythonFile = node.pythonFile || 'not assigned';
        
        if (pythonFile === 'not assigned') {
            container.innerHTML = `
                <div style="font-size: 0.8em; opacity: 0.8; text-align: center; padding: 20px;">
                    no python file assigned
                </div>
            `;
            return;
        }
        
        // show file path
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
        
        // fetch function information asynchronously
        this.fetchFunctionInfo(pythonFile, node.id);
    }

    async fetchFunctionInfo(pythonFile, nodeId) {
        try {
            const response = await fetch('/api/analyze-python-function', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    python_file: pythonFile
                })
            });
            
            const result = await response.json();
            const infoElement = document.getElementById(`function_info_${nodeId}`);
            
            if (result.success && infoElement) {
                // count total lines in file by reading it
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
    }

    async analyzeNodeFunction(node) {
        // show loading state
        this.showArgumentsLoading();
        this.showReturnsLoading();
        
        try {
            const response = await fetch('/api/analyze-python-function', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    python_file: node.pythonFile
                })
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
    }

    showArgumentsLoading() {
        document.getElementById('arguments_loading').style.display = 'block';
        document.getElementById('arguments_content').style.display = 'none';
        document.getElementById('arguments_empty').style.display = 'none';
    }

    showReturnsLoading() {
        document.getElementById('returns_loading').style.display = 'block';
        document.getElementById('returns_content').style.display = 'none';
        document.getElementById('returns_empty').style.display = 'none';
    }

    populateArguments(formalParams, inputVars) {
        const argumentsContent = document.getElementById('arguments_content');
        const allArguments = [...formalParams, ...inputVars];
        
        if (allArguments.length === 0) {
            document.getElementById('arguments_loading').style.display = 'none';
            document.getElementById('arguments_empty').style.display = 'block';
            return;
        }

        argumentsContent.innerHTML = '';
        
        // add formal parameters (from previous nodes)
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

        // add input variables (from input() calls)
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
    }

    populateReturns(returns) {
        const returnsContent = document.getElementById('returns_content');
        
        if (returns.length === 0) {
            document.getElementById('returns_loading').style.display = 'none';
            document.getElementById('returns_empty').style.display = 'block';
            return;
        }

        returnsContent.innerHTML = '';
        
        returns.forEach((returnItem, index) => {
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

            let icon = 'output';
            let iconColor = '#ff9800';
            let displayText = returnItem.name || 'unknown';
            let typeText = returnItem.type || 'unknown';

            // customize based on return type
            switch (returnItem.type) {
                case 'variable':
                    icon = 'label';
                    iconColor = '#4caf50';
                    break;
                case 'constant':
                    icon = 'looks_one';
                    iconColor = '#2196f3';
                    displayText = returnItem.value;
                    typeText = returnItem.data_type;
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
                <span style="font-family: monospace; font-weight: 500;">${displayText}</span>
                <span style="font-size: 0.75rem; opacity: 0.7; margin-left: auto;">${typeText}</span>
            `;
            returnsContent.appendChild(item);
        });

        document.getElementById('returns_loading').style.display = 'none';
        document.getElementById('returns_content').style.display = 'block';
    }

    showArgumentsError(message) {
        document.getElementById('arguments_loading').style.display = 'none';
        document.getElementById('arguments_content').innerHTML = `
            <div style="text-align: center; padding: 20px; color: #f44336;">
                <span class="material-icons" style="font-size: 16px; margin-bottom: 4px;">error</span>
                <p style="font-size: 0.8em;">${message}</p>
            </div>
        `;
        document.getElementById('arguments_content').style.display = 'block';
    }

    showReturnsError(message) {
        document.getElementById('returns_loading').style.display = 'none';
        document.getElementById('returns_content').innerHTML = `
            <div style="text-align: center; padding: 20px; color: #f44336;">
                <span class="material-icons" style="font-size: 16px; margin-bottom: 4px;">error</span>
                <p style="font-size: 0.8em;">${message}</p>
            </div>
        `;
        document.getElementById('returns_content').style.display = 'block';
    }
}

window.Sidebar = Sidebar;