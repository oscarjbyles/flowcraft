// sidebar component management - es6 class implementation
(function(){
    'use strict';
    if (window.Sidebar) { return; }

class Sidebar extends EventEmitter {
    constructor(stateManager) {
        super();
        this.state = stateManager;
        this.currentView = 'default';
        this.pythonFiles = [];
        this.filteredFiles = [];
        this.flowcharts = [];
        this.filteredFlowcharts = [];
        
        // url management
        this.urlManager = new URLManager();
        
        // cache dom elements
        this.initializeDOMElements();
        
        // setup handlers
        this.setupEventListeners();
        this.setupFormHandlers();
        this.setupFlowchartManagement();
        this.setupURLHandlers();
        this.setupLinkEventHandlers();
        this.initializePythonFileDropdown();
        
        // timers
        this.nodeSaveTimeout = null;
        this.groupSaveTimeout = null;
    }

    initializeDOMElements() {
        this.propertiesSidebar = document.getElementById('properties_sidebar');
        this.propertiesTitle = document.getElementById('properties_title');
        
        this.contentPanels = {
            default: document.getElementById('default_properties'),
            single: document.getElementById('single_node_properties'),
            multi: document.getElementById('multi_select_properties'),
            group: document.getElementById('group_properties'),
            link: document.getElementById('link_properties'),
            annotation: document.getElementById('annotation_properties'),
            execution: document.getElementById('run_execution_properties'),
            history: null
        };

        // footer elements
        this.footerContainer = document.querySelector('.properties_footer');
        this.footerDeleteBtn = document.getElementById('sidebar_delete_btn');
        if (this.footerDeleteBtn) {
            this.footerDeleteBtn.addEventListener('click', () => this.handleFooterDelete());
        }
        
        // flowchart management elements
        this.flowchartSelector = document.getElementById('flowchart_selector');
        this.flowchartDropdown = document.getElementById('flowchart_dropdown');
        this.createFlowchartModal = document.getElementById('create_flowchart_modal');
    }

    setupEventListeners() {
        // state change listeners
        this.state.on('selectionChanged', (selection) => {
            this.handleSelectionChanged(selection);
        });
        
        this.state.on('nodeUpdated', (node) => {
            if (this.currentView === 'single' && this.state.selectedNodes.has(node.id)) {
                this.updateSingleNodePanel(node);
            }
        });
        
        this.state.on('groupUpdated', (group) => {
            if (this.currentView === 'group' && this.state.selectedGroup?.id === group.id) {
                this.updateGroupPanel(group);
            }
        });
        
        this.state.on('linkUpdated', (link) => {
            if (this.currentView === 'link' && this.state.selectedLink) {
                this.updateLinkPanel(link);
            }
        });
        
        this.state.on('annotationUpdated', (annotation) => {
            if (this.currentView === 'annotation' && this.state.selectedAnnotation?.id === annotation.id) {
                this.updateAnnotationPanel(annotation);
            }
        });
        
        this.state.on('updateSidebar', () => {
            this.updateView();
        });
    }

    setupFormHandlers() {
        // node name input
        const nodeNameInput = document.getElementById('node_name');
        if (nodeNameInput) {
            nodeNameInput.addEventListener('input', (e) => {
                this.handleNodeNameChange(e.target.value);
            });
        }
        
        // python file dropdown
        const pythonFileInput = document.getElementById('python_file');
        if (pythonFileInput) {
            pythonFileInput.addEventListener('change', (e) => {
                this.handlePythonFileChange(e.target.value);
            });
        }
        
        // group name input
        const groupNameInput = document.getElementById('group_name');
        if (groupNameInput) {
            groupNameInput.addEventListener('input', (e) => {
                this.handleGroupNameChange(e.target.value);
            });
        }
        
        // annotation text input
        const annotationTextInput = document.getElementById('annotation_text_input');
        if (annotationTextInput) {
            annotationTextInput.addEventListener('input', (e) => {
                this.handleAnnotationTextChange(e.target.value);
            });
        }
    }

    setupFlowchartManagement() {
        // flowchart selector click
        if (this.flowchartSelector) {
            this.flowchartSelector.addEventListener('click', () => {
                this.toggleFlowchartDropdown();
            });
        }
        
        // create flowchart button
        const createBtn = document.getElementById('create_flowchart_btn');
        if (createBtn) {
            createBtn.addEventListener('click', () => {
                this.showCreateFlowchartModal();
            });
        }
    }

    setupURLHandlers() {
        // handle url changes
        if (this.urlManager) {
            this.urlManager.on('flowchartChanged', (flowchartName) => {
                this.loadFlowchart(flowchartName);
            });
        }
    }

    setupLinkEventHandlers() {
        // refresh variables button
        const refreshBtn = document.getElementById('refresh_variables_btn');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', () => {
                this.refreshLinkVariables();
            });
        }
    }

    initializePythonFileDropdown() {
        this.loadPythonFiles();
    }

    // view management
    handleSelectionChanged(selection) {
        const { nodes, link, group, annotation } = selection;
        
        if (annotation) {
            this.showAnnotationPanel(annotation);
        } else if (group) {
            this.showGroupPanel(group);
        } else if (link) {
            this.showLinkPanel(link);
        } else if (nodes && nodes.length > 1) {
            this.showMultiSelectPanel(nodes);
        } else if (nodes && nodes.length === 1) {
            const node = this.state.getNode(nodes[0]);
            this.showSingleNodePanel(node);
        } else {
            this.showDefaultPanel();
        }
    }

    showDefaultPanel() {
        this.currentView = 'default';
        this.hideAllPanels();
        if (this.contentPanels.default) {
            this.contentPanels.default.classList.add('active');
        }
        this.updateFooterButtons();
    }

    showSingleNodePanel(node) {
        this.currentView = 'single';
        this.hideAllPanels();
        if (this.contentPanels.single) {
            this.contentPanels.single.classList.add('active');
        }
        this.updateSingleNodePanel(node);
        this.updateFooterButtons();
    }

    showMultiSelectPanel(nodeIds) {
        this.currentView = 'multi';
        this.hideAllPanels();
        if (this.contentPanels.multi) {
            this.contentPanels.multi.classList.add('active');
        }
        this.updateMultiSelectPanel(nodeIds);
        this.updateFooterButtons();
    }

    showLinkPanel(link) {
        this.currentView = 'link';
        this.hideAllPanels();
        if (this.contentPanels.link) {
            this.contentPanels.link.classList.add('active');
        }
        this.updateLinkPanel(link);
        this.updateFooterButtons();
    }

    showGroupPanel(group) {
        this.currentView = 'group';
        this.hideAllPanels();
        if (this.contentPanels.group) {
            this.contentPanels.group.classList.add('active');
        }
        this.updateGroupPanel(group);
        this.updateFooterButtons();
    }

    showAnnotationPanel(annotation) {
        this.currentView = 'annotation';
        this.hideAllPanels();
        if (this.contentPanels.annotation) {
            this.contentPanels.annotation.classList.add('active');
        }
        this.updateAnnotationPanel(annotation);
        this.updateFooterButtons();
    }

    hideAllPanels() {
        Object.values(this.contentPanels).forEach(panel => {
            if (panel) {
                panel.classList.remove('active');
            }
        });
    }

    updateView() {
        const selection = {
            nodes: Array.from(this.state.selectedNodes),
            link: this.state.selectedLink,
            group: this.state.selectedGroup,
            annotation: this.state.selectedAnnotation
        };
        this.handleSelectionChanged(selection);
    }

    // panel update methods
    updateSingleNodePanel(node) {
        if (!node) return;
        
        // update node name
        const nameInput = document.getElementById('node_name');
        if (nameInput) {
            nameInput.value = node.name || '';
        }
        
        // update python file
        const pythonFileInput = document.getElementById('python_file');
        if (pythonFileInput) {
            pythonFileInput.value = node.pythonFile || '';
            pythonFileInput.dataset.value = node.pythonFile || '';
        }
        
        // show/hide sections based on node type
        this.updateNodeTypeSpecificSections(node);
        
        // update arguments and returns if python node
        if (node.type === 'python_file') {
            this.updateNodeArguments(node);
            this.updateNodeReturns(node);
        }
        
        // update input values if input node
        if (node.type === 'input_node') {
            this.updateInputNodeValues(node);
        }
        
        // update data save variables if data save node
        if (node.type === 'data_save') {
            this.updateDataSaveVariables(node);
        }
    }

    updateMultiSelectPanel(nodeIds) {
        const listEl = document.getElementById('selected_nodes_list');
        if (!listEl) return;
        
        listEl.innerHTML = '';
        nodeIds.forEach(nodeId => {
            const node = this.state.getNode(nodeId);
            if (node) {
                const item = document.createElement('div');
                item.className = 'selected_node_item';
                item.textContent = node.name;
                listEl.appendChild(item);
            }
        });
    }

    updateLinkPanel(link) {
        if (!link) return;
        
        const sourceNode = this.state.getNode(link.source);
        const targetNode = this.state.getNode(link.target);
        
        // update source/target display
        const sourceNameEl = document.getElementById('link_source_name');
        const targetNameEl = document.getElementById('link_target_name');
        const sourceFileEl = document.getElementById('link_source_file');
        const targetFileEl = document.getElementById('link_target_file');
        
        if (sourceNameEl) sourceNameEl.textContent = sourceNode?.name || 'unknown';
        if (targetNameEl) targetNameEl.textContent = targetNode?.name || 'unknown';
        if (sourceFileEl) sourceFileEl.textContent = sourceNode?.pythonFile || '';
        if (targetFileEl) targetFileEl.textContent = targetNode?.pythonFile || '';
        
        // show if-python connection options if applicable
        if (sourceNode?.type === 'if_node' && targetNode?.type === 'python_file') {
            this.showIfConnectionOptions(link);
        }
        
        // analyze shared variables
        this.analyzeLinkVariables(link);
    }

    updateGroupPanel(group) {
        if (!group) return;
        
        // update group name
        const nameInput = document.getElementById('group_name');
        if (nameInput) {
            nameInput.value = group.name || '';
        }
        
        // update color palette
        this.updateGroupColorPalette(group.color);
        
        // update members list
        this.updateGroupMembers(group.nodeIds);
    }

    updateAnnotationPanel(annotation) {
        if (!annotation) return;
        
        // update text
        const textInput = document.getElementById('annotation_text_input');
        if (textInput) {
            textInput.value = annotation.text || '';
        }
        
        // update font size
        const fontSizeInput = document.getElementById('annotation_font_size_input');
        if (fontSizeInput) {
            fontSizeInput.value = annotation.fontSize || 14;
        }
    }

    updateFooterButtons() {
        // hide all delete buttons
        const deleteButtons = [
            'sidebar_delete_btn',
            'delete_node_from_sidebar',
            'delete_selected_nodes',
            'delete_link_btn',
            'delete_group'
        ];
        
        deleteButtons.forEach(id => {
            const btn = document.getElementById(id);
            if (btn) btn.style.display = 'none';
        });
        
        // show appropriate delete button
        switch (this.currentView) {
            case 'single':
                const btn = document.getElementById('delete_node_from_sidebar');
                if (btn) btn.style.display = 'block';
                break;
            case 'multi':
                const multiBtn = document.getElementById('delete_selected_nodes');
                if (multiBtn) multiBtn.style.display = 'block';
                break;
            case 'link':
                const linkBtn = document.getElementById('delete_link_btn');
                if (linkBtn) linkBtn.style.display = 'block';
                break;
            case 'group':
                const groupBtn = document.getElementById('delete_group');
                if (groupBtn) groupBtn.style.display = 'block';
                break;
            case 'annotation':
                const annotBtn = document.getElementById('sidebar_delete_btn');
                if (annotBtn) annotBtn.style.display = 'block';
                break;
        }
    }

    // form handlers
    handleNodeNameChange(value) {
        clearTimeout(this.nodeSaveTimeout);
        this.nodeSaveTimeout = setTimeout(() => {
            const nodeId = Array.from(this.state.selectedNodes)[0];
            if (nodeId) {
                this.state.updateNode(nodeId, { name: value });
            }
        }, 500);
    }

    handlePythonFileChange(value) {
        const nodeId = Array.from(this.state.selectedNodes)[0];
        if (nodeId) {
            this.state.updateNode(nodeId, { pythonFile: value });
        }
    }

    handleGroupNameChange(value) {
        clearTimeout(this.groupSaveTimeout);
        this.groupSaveTimeout = setTimeout(() => {
            if (this.state.selectedGroup) {
                this.state.updateGroup(this.state.selectedGroup.id, { name: value });
            }
        }, 500);
    }

    handleAnnotationTextChange(value) {
        if (this.state.selectedAnnotation) {
            this.state.updateAnnotation(this.state.selectedAnnotation.id, { text: value });
        }
    }

    handleFooterDelete() {
        switch (this.currentView) {
            case 'single':
                const nodeId = Array.from(this.state.selectedNodes)[0];
                if (nodeId) this.state.removeNode(nodeId);
                break;
            case 'multi':
                const nodeIds = Array.from(this.state.selectedNodes);
                nodeIds.forEach(id => this.state.removeNode(id));
                break;
            case 'link':
                if (this.state.selectedLink) {
                    this.state.removeLink(
                        this.state.selectedLink.source,
                        this.state.selectedLink.target
                    );
                }
                break;
            case 'group':
                if (this.state.selectedGroup) {
                    this.state.removeGroup(this.state.selectedGroup.id);
                }
                break;
            case 'annotation':
                if (this.state.selectedAnnotation) {
                    this.state.removeAnnotation(this.state.selectedAnnotation.id);
                }
                break;
        }
    }

    // collapsed state management
    setCollapsed(isCollapsed) {
        const mainContent = document.querySelector('.main_content');
        const runFeedBar = document.getElementById('run_feed_bar');
        const startButtonContainer = document.getElementById('start_button_container');
        const sidebarToggleContainer = document.getElementById('sidebar_toggle_container');
        const toggleSidebarBtn = document.getElementById('toggle_sidebar_btn');

        if (!this.propertiesSidebar) return;

        if (isCollapsed) {
            this.propertiesSidebar.classList.add('collapsed');
            this.propertiesSidebar.style.display = 'none';
            if (mainContent) mainContent.classList.add('sidebar_collapsed');
            if (runFeedBar) {
                runFeedBar.classList.add('sidebar_collapsed');
                if (runFeedBar.getAttribute('data-run-mode') === 'true') {
                    runFeedBar.style.display = 'flex';
                }
            }
            if (startButtonContainer) startButtonContainer.classList.add('sidebar_collapsed');
            if (sidebarToggleContainer) sidebarToggleContainer.classList.add('sidebar_collapsed');
            if (toggleSidebarBtn) {
                toggleSidebarBtn.title = 'show properties';
                toggleSidebarBtn.innerHTML = '<span class="material-icons">chevron_left</span>';
            }
        } else {
            this.propertiesSidebar.classList.remove('collapsed');
            this.propertiesSidebar.style.display = 'flex';
            if (mainContent) mainContent.classList.remove('sidebar_collapsed');
            if (runFeedBar) {
                runFeedBar.classList.remove('sidebar_collapsed');
                if (runFeedBar.getAttribute('data-run-mode') === 'true') {
                    runFeedBar.style.display = 'flex';
                }
            }
            if (startButtonContainer) startButtonContainer.classList.remove('sidebar_collapsed');
            if (sidebarToggleContainer) sidebarToggleContainer.classList.remove('sidebar_collapsed');
            if (toggleSidebarBtn) {
                toggleSidebarBtn.title = 'hide properties';
                toggleSidebarBtn.innerHTML = '<span class="material-icons">chevron_right</span>';
            }
        }
    }

    // placeholder methods for specialized functionality
    updateNodeTypeSpecificSections(node) {
        // implemented in specialized modules
    }

    updateNodeArguments(node) {
        // implemented in specialized modules
    }

    updateNodeReturns(node) {
        // implemented in specialized modules
    }

    updateInputNodeValues(node) {
        // implemented in specialized modules
    }

    updateDataSaveVariables(node) {
        // implemented in specialized modules
    }

    showIfConnectionOptions(link) {
        // implemented in specialized modules
    }

    analyzeLinkVariables(link) {
        // implemented in specialized modules
    }

    updateGroupColorPalette(color) {
        // implemented in specialized modules
    }

    updateGroupMembers(nodeIds) {
        // implemented in specialized modules
    }

    toggleFlowchartDropdown() {
        // implemented in specialized modules
    }

    showCreateFlowchartModal() {
        // implemented in specialized modules
    }

    loadFlowchart(flowchartName) {
        // implemented in specialized modules
    }

    loadPythonFiles() {
        // implemented in specialized modules
    }

    refreshLinkVariables() {
        // implemented in specialized modules
    }

    // cleanup
    destroy() {
        clearTimeout(this.nodeSaveTimeout);
        clearTimeout(this.groupSaveTimeout);
        this.removeAllListeners();
    }
}

window.Sidebar = Sidebar;
})();
