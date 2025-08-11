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
        this.setupEventListeners();
        this.setupFormHandlers();
        this.setupFlowchartManagement();
        this.setupURLHandlers();
        this.setupLinkEventHandlers();
        this.initializePythonFileDropdown();
        this.initializeSettings();
        // note: initializeFlowchartDropdown is called from FlowchartBuilder.initializeApp()

        // centralized content engine
        try {
            this.contentEngine = new SidebarContentEngine(this);
        } catch (_) {
            this.contentEngine = null;
        }
    }

}

// cleanup
Sidebar.prototype.destroy = function() {
    // remove event listeners and cleanup
    clearTimeout(this.nodeSaveTimeout);
    clearTimeout(this.groupSaveTimeout);
};

window.Sidebar = Sidebar;


