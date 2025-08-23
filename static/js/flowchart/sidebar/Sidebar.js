// sidebar constants and configuration
window.SidebarConstants = {
    ids: {
        propertiesSidebar: 'properties_sidebar',
        runFeedBar: 'run_feed_bar',
        startButtonContainer: 'start_button_container',
        toggleSidebarBtn: 'toggle_sidebar_btn',
        propertiesHeader: 'properties_header',
        propertiesHeaderText: 'properties_header_text',
        footerContainer: null,
        footerDeleteBtn: 'sidebar_delete_btn',
        defaultPanel: 'default_properties',
        singlePanel: 'single_node_properties',
        multiPanel: 'multi_select_properties',
        groupPanel: 'group_properties',
        linkPanel: 'link_properties',
        annotationPanel: 'annotation_properties',
        executionPanel: 'run_execution_properties'
    },
    classes: {
        mainContent: 'main_content',
        sidebarCollapsed: 'sidebar_collapsed'
    },
    icons: {
        collapse: '<span class="material-icons">chevron_right</span>',
        expand: '<span class="material-icons">chevron_left</span>'
    },
    titles: {
        hide: 'hide properties',
        show: 'show properties'
    }
};

// main sidebar class
class Sidebar {
    constructor(stateManager, createNode) {
        this.state = stateManager;
        this.createNode = createNode;

        // initialize core components
        this.initializeCore();

        // initialize controller registry
        this.controllerRegistry = new ControllerRegistry(this);

        // initialize function modules
        this.analysis = new AnalysisFunctions(this);
        this.fileManagement = new FileManagementFunctions(this);
        // ... other function modules

        // setup event listeners
        this.setupEventListeners();
    }

    initializeCore() {
        // basic initialization code
        this.currentView = 'default';
        this.pythonFiles = [];
        this.filteredFiles = [];
        this.flowcharts = [];
        this.filteredFlowcharts = [];

        // cache dom elements
        this.propertiesSidebar = document.getElementById('properties_sidebar');
        this.propertiesTitle = document.getElementById('properties_title');
        this.contentPanels = {
            default: document.getElementById('default_properties'),
            single: document.getElementById('single_node_properties'),
            multi: document.getElementById('multi_select_properties'),
            group: document.getElementById('group_properties'),
            link: document.getElementById('link_properties'),
            annotation: document.getElementById('annotation_properties'),
            execution: document.getElementById('run_execution_properties')
        };

        // footer elements
        this.footerContainer = document.querySelector('.properties_footer');
        this.footerDeleteBtn = document.getElementById('sidebar_delete_btn');
    }

    setupEventListeners() {
        // core event listeners
        this.state.on('selectionChanged', (selection) => {
            this.updateContent(selection);
        });

        this.state.on('updateSidebar', () => this.updateFromState());
        this.state.on('statusUpdate', (message) => {
            this.updateStatus(message);
        });
        this.state.on('modeChanged', () => this.updateFromState());
    }

    updateContent(selection) {
        const mode = this.state.isRunMode ? 'run' : 'build';
        const context = this.getContext(selection);

        console.log('[sidebar] updateContent called:', { 
            mode, 
            context, 
            selection: {
                nodes: selection.nodes,
                annotation: selection.annotation,
                link: selection.link,
                group: selection.group
            }
        });

        // activate appropriate panel
        this.activatePanel(context === 'single' ? 'single' : context);

        if (context === 'single') {
            const nodeId = selection.nodes[0];
            const node = this.createNode.getNode(nodeId);
            if (!node) {
                console.warn('[sidebar] node not found for id:', nodeId);
                return;
            }

            console.log('[sidebar] rendering single node:', { 
                nodeId, 
                nodeType: node.type, 
                nodeName: node.name,
                node: node 
            });

            // use controller registry to render node
            this.controllerRegistry.render(mode, node.type, node);
        } else {
            console.log('[sidebar] rendering context controller:', { mode, context });
            // use selection type controller
            this.controllerRegistry.render(mode, context, selection);
        }
    }

    getContext(selection) {
        if (selection.annotation) return 'annotation';
        if (selection.link) return 'link';
        if (selection.group) return 'group';
        if (selection.nodes && selection.nodes.length === 1) return 'single';
        if (selection.nodes && selection.nodes.length > 1) return 'multi';
        return 'default';
    }

    activatePanel(key) {
        this.hideAllPanels();
        const panel = this.contentPanels[key];
        if (panel) panel.classList.add('active');
    }

    hideAllPanels() {
        Object.values(this.contentPanels).forEach(panel => {
            if (panel) panel.classList.remove('active');
        });
    }

    updateFromState() {
        // update sidebar content based on current state
        if (this.state.selectionHandler) {
            const selectedNodeIds = this.state.selectionHandler.getSelectedNodeIds();
            const selectedLink = this.state.selectionHandler.selectedLink;
            const selectedGroup = this.state.selectionHandler.selectedGroup;
            const selectedAnnotation = this.state.selectionHandler.selectedAnnotation;
            
            const selection = {
                nodes: selectedNodeIds,
                link: selectedLink,
                group: selectedGroup,
                annotation: selectedAnnotation
            };
            
            console.log('[sidebar] updateFromState called with selection:', selection);
            this.updateContent(selection);
        } else {
            console.warn('[sidebar] selectionHandler not available in updateFromState');
            this.updateContent({ nodes: [] });
        }
    }

    updateStatus(message) {
        // update status display if available
        const statusElement = document.getElementById('sidebar_status');
        if (statusElement) {
            statusElement.textContent = message;
        }
    }

    async initializeFlowchartDropdown() {
        // initialize flowchart dropdown if file management is available
        if (this.fileManagement && typeof this.fileManagement.initializeFlowchartDropdown === 'function') {
            await this.fileManagement.initializeFlowchartDropdown();
        }
    }

    // ... other essential methods
}

window.Sidebar = Sidebar;

// unified collapse/expand management for right sidebar
Sidebar.prototype.setCollapsed = function(isCollapsed) {
    try { console.log('[sidebar] setCollapsed called', { isCollapsed }); } catch(_) {}
    const C = window.SidebarConstants || null;
    const propertiesSidebar = document.getElementById(C?.ids?.propertiesSidebar || 'properties_sidebar');
    const mainContent = document.querySelector('.' + ((C && C.classes && C.classes.mainContent) || 'main_content'));
    const runFeedBar = document.getElementById(C?.ids?.runFeedBar || 'run_feed_bar');
    const startButtonContainer = document.getElementById(C?.ids?.startButtonContainer || 'start_button_container');
    const sidebarToggleContainer = document.getElementById('sidebar_toggle_container');
    const toggleSidebarBtn = document.getElementById(C?.ids?.toggleSidebarBtn || 'toggle_sidebar_btn');

    if (!propertiesSidebar) return;

    if (isCollapsed) {
        propertiesSidebar.classList.add('collapsed');
        // ensure hidden when collapsed to avoid initial flash
        propertiesSidebar.style.display = 'none';
        if (mainContent) mainContent.classList.add((C && C.classes && C.classes.sidebarCollapsed) || 'sidebar_collapsed');
        if (runFeedBar) {
            runFeedBar.classList.add((C && C.classes && C.classes.sidebarCollapsed) || 'sidebar_collapsed');
            // ensure run feed bar stays visible in run mode even when sidebar is collapsed
            if (runFeedBar.getAttribute('data-run-mode') === 'true') {
                // use toolbars module if available, otherwise set directly
                if (window.flowchartApp && window.flowchartApp.toolbars && window.flowchartApp.toolbars.setRunFeedBarDisplay) {
                    window.flowchartApp.toolbars.setRunFeedBarDisplay('flex');
                } else {
                    runFeedBar.style.display = 'flex';
                }
            }
        }
        if (startButtonContainer) startButtonContainer.classList.add((C && C.classes && C.classes.sidebarCollapsed) || 'sidebar_collapsed');
        if (sidebarToggleContainer) sidebarToggleContainer.classList.add((C && C.classes && C.classes.sidebarCollapsed) || 'sidebar_collapsed');
        if (toggleSidebarBtn) {
            toggleSidebarBtn.title = (C && C.titles && C.titles.show) || 'show properties';
            toggleSidebarBtn.innerHTML = (C && C.icons && C.icons.expand) || '<span class="material-icons">chevron_left</span>';
        }
    } else {
        propertiesSidebar.classList.remove('collapsed');
        // show when expanded
        propertiesSidebar.style.display = 'flex';
        if (mainContent) mainContent.classList.remove((C && C.classes && C.classes.sidebarCollapsed) || 'sidebar_collapsed');
        if (runFeedBar) {
            runFeedBar.classList.remove((C && C.classes && C.classes.sidebarCollapsed) || 'sidebar_collapsed');
            // ensure run feed bar stays visible in run mode
            if (runFeedBar.getAttribute('data-run-mode') === 'true') {
                // use toolbars module if available, otherwise set directly
                if (window.flowchartApp && window.flowchartApp.toolbars && window.flowchartApp.toolbars.setRunFeedBarDisplay) {
                    window.flowchartApp.toolbars.setRunFeedBarDisplay('flex');
                } else {
                    runFeedBar.style.display = 'flex';
                }
            }
        }
        if (startButtonContainer) startButtonContainer.classList.remove((C && C.classes && C.classes.sidebarCollapsed) || 'sidebar_collapsed');
        if (sidebarToggleContainer) sidebarToggleContainer.classList.remove((C && C.classes && C.classes.sidebarCollapsed) || 'sidebar_collapsed');
        if (toggleSidebarBtn) {
            toggleSidebarBtn.title = (C && C.titles && C.titles.hide) || 'hide properties';
            toggleSidebarBtn.innerHTML = (C && C.icons && C.icons.collapse) || '<span class="material-icons">chevron_right</span>';
        }
    }

    try {
        const finalState = propertiesSidebar.classList.contains('collapsed');
        console.log('[sidebar] setCollapsed complete', { finalCollapsed: finalState });
    } catch(_) {}
};

// url and history handlers for flowchart switching
Sidebar.prototype.setupURLHandlers = function() {
    this.urlManager.setupPopstateHandler(async (flowchartName, displayName) => {
        console.log(`[Sidebar] URL changed to flowchart: ${flowchartName} (${displayName})`);
        const flowchartExists = this.flowcharts.some(f => f.filename === flowchartName);
        if (flowchartExists) {
            // check if we're in run, build, or settings mode and clear execution output if needed
            const currentMode = this.state.currentMode || 'build';
            if (currentMode === 'run' || currentMode === 'build' || currentMode === 'settings') {
                try {
                    if (window.flowchartApp && typeof window.flowchartApp.clearRunModeState === 'function') {
                        window.flowchartApp.clearRunModeState();
                    }
                } catch (clearError) {
                    console.warn('[sidebar-url] failed to clear execution state:', clearError);
                }
            }
            
            if (this.state.saving) await this.state.saving.save(true);
            if (this.state.saving && this.state.saving.storage) {
                this.state.saving.storage.setCurrentFlowchart(flowchartName);
            }
            this.urlManager.setLastAccessedFlowchart(flowchartName);
            const result = this.state.saving ? await this.state.saving.load() : { success: false, message: 'saving not initialized' };
            if (result.success) {
                this.setCurrentFlowchart(displayName || flowchartName.replace('.json',''));
                this.showSuccess(`switched to flowchart: ${displayName}`);
            }
        } else {
            // if url points to a missing flowchart, switch to newest or last accessed
            try {
                const last = localStorage.getItem('last_accessed_flowchart');
                if (last && this.flowcharts.some(f => f.filename === last)) {
                    await this.selectFlowchart(last, last.replace('.json',''));
                    return;
                }
            } catch (_) {}
            if (this.flowcharts.length > 0) {
                const newest = this.flowcharts[0];
                await this.selectFlowchart(newest.filename, newest.name);
            }
        }
    });
};
