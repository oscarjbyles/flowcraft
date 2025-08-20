/**
 * multirun page class
 * handles sidebar functionality and url variable passing
 */
class MultirunPage {
    constructor() {
        this.sidebar = null;
        this.urlParams = new URLSearchParams(window.location.search);
        this.flowchartId = this.urlParams.get('flowchart_id');
        this.flowchartName = this.urlParams.get('flowchart_name');
    }

    /**
     * initialize the multirun page
     */
    init() {
        this.initializeSidebar();
        this.setupEventListeners();
        this.updateBreadcrumb();
    }

    /**
     * initialize sidebar with variable passing support
     */
    initializeSidebar() {
        // create sidebar instance with url parameters
        this.sidebar = new Sidebar({
            target: '#sidebar',
            flowchartId: this.flowchartId,
            flowchartName: this.flowchartName,
            page: 'multirun'
        });

        // initialize sidebar
        this.sidebar.init();
    }

    /**
     * setup event listeners
     */
    setupEventListeners() {
        // listen for sidebar events
        if (this.sidebar) {
            this.sidebar.on('variableChange', (data) => {
                this.handleVariableChange(data);
            });

            this.sidebar.on('flowchartChange', (data) => {
                this.handleFlowchartChange(data);
            });
        }

        // listen for window resize
        window.addEventListener('resize', () => {
            this.handleResize();
        });
    }

    /**
     * handle variable changes from sidebar
     */
    handleVariableChange(data) {
        console.log('variable changed:', data);
        // handle variable changes here
        // this will be implemented in next iteration
    }

    /**
     * handle flowchart changes from sidebar
     */
    handleFlowchartChange(data) {
        console.log('flowchart changed:', data);
        // update url parameters
        this.updateUrlParameters(data);
        // handle flowchart changes here
        // this will be implemented in next iteration
    }

    /**
     * update url parameters
     */
    updateUrlParameters(data) {
        if (data.flowchartId) {
            this.urlParams.set('flowchart_id', data.flowchartId);
        }
        if (data.flowchartName) {
            this.urlParams.set('flowchart_name', data.flowchartName);
        }

        // update browser url without page reload
        const newUrl = `${window.location.pathname}?${this.urlParams.toString()}`;
        window.history.pushState({}, '', newUrl);
    }

    /**
     * update breadcrumb with current flowchart info
     */
    updateBreadcrumb() {
        const breadcrumb = document.querySelector('.breadcrumb');
        if (breadcrumb && this.flowchartName) {
            // update breadcrumb to show current flowchart
            // this will be implemented based on existing breadcrumb structure
        }
    }

    /**
     * handle window resize
     */
    handleResize() {
        if (this.sidebar) {
            this.sidebar.handleResize();
        }
    }

    /**
     * cleanup on page unload
     */
    destroy() {
        if (this.sidebar) {
            this.sidebar.destroy();
        }
        
        // remove event listeners
        window.removeEventListener('resize', this.handleResize);
    }
}
