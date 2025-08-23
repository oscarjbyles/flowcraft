// sidebar component management
(function(){
    'use strict';
    if (window.Sidebar) { return; }

class Sidebar {
    constructor(stateManager, createNode) {
        this.state = stateManager;
        this.createNode = createNode;

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
            annotation: document.getElementById('annotation_properties'),
            execution: document.getElementById('run_execution_properties'),
            history: null
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
        if (typeof this.setupEventListeners === 'function') {
            this.setupEventListeners();
        }
        if (typeof this.setupFormHandlers === 'function') {
            this.setupFormHandlers();
        }
        if (typeof this.setupFlowchartManagement === 'function') {
            this.setupFlowchartManagement();
        }
        if (typeof this.setupURLHandlers === 'function') {
            this.setupURLHandlers();
        }
        if (typeof this.setupLinkEventHandlers === 'function') {
            this.setupLinkEventHandlers();
        }
        if (typeof this.initializePythonFileDropdown === 'function') {
            this.initializePythonFileDropdown();
        }
        // note: initializeFlowchartDropdown is called from Index.js initializeApp()

        // centralized content engine
        try {
            this.contentEngine = new SidebarContentEngine(this);
        } catch (_) {
            this.contentEngine = null;
        }

        // controller registry for node type and mode specific controllers
        try {
            this.controllerRegistry = new ControllerRegistry(this);
        } catch (_) {
            this.controllerRegistry = null;
        }
        
        // ensure all setup methods are called once they become available
        this.ensureSetupMethodsCalled();
        
        // schedule additional checks for setup methods that might load later
        setTimeout(() => this.ensureSetupMethodsCalled(), 100);
        setTimeout(() => this.ensureSetupMethodsCalled(), 500);
    }

}

// ensure all setup methods are called once they become available
Sidebar.prototype.ensureSetupMethodsCalled = function() {
    const setupMethods = [
        'setupEventListeners',
        'setupFormHandlers', 
        'setupFlowchartManagement',
        'setupURLHandlers',
        'setupLinkEventHandlers',
        'initializePythonFileDropdown'
    ];
    
    setupMethods.forEach(methodName => {
        if (typeof this[methodName] === 'function' && !this[`_${methodName}Called`]) {
            this[methodName]();
            this[`_${methodName}Called`] = true;
        }
    });
};

// cleanup
Sidebar.prototype.destroy = function() {
    // remove event listeners and cleanup
    clearTimeout(this.nodeSaveTimeout);
    clearTimeout(this.groupSaveTimeout);
};

window.Sidebar = Sidebar;
})();

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


