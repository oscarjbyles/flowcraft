// core event bindings and high-level view updates
(function(){
    if (!window.Sidebar) return;

    Sidebar.prototype.setupEventListeners = function() {
        this.state.on('selectionChanged', (selection) => this.updateContent(selection));
        this.state.on('updateSidebar', () => this.updateFromState());
        this.state.on('statusUpdate', (message) => this.updateStatus(message));
        // ensure sidebar updates when mode changes (e.g., hide delete in run mode)
        this.state.on('modeChanged', () => this.updateFromState());

        // handle quick add if condition button click (delegated)
        document.addEventListener('click', (e) => {
            const btn = e.target.closest('#add_if_condition_btn');
            if (btn) this.handleAddIfCondition();
        });
    };

    Sidebar.prototype.updateFromState = function() {
        const selection = {
            nodes: Array.from(this.state.selectedNodes),
            link: this.state.selectedLink,
            group: this.state.selectedGroup,
            annotation: this.state.selectedAnnotation
        };
        this.updateContent(selection);
        this.updateFooterDelete(selection);
        this.updateFooterVisibility(selection);
    };

    Sidebar.prototype.hideAllPanels = function() {
        Object.values(this.contentPanels).forEach(panel => {
            if (panel) panel.classList.remove('active');
        });
    };

    Sidebar.prototype.showDefaultPanel = function() {
        this.currentView = 'default';
        if (this.propertiesTitle) {
            this.propertiesTitle.textContent = 'properties';
        }
        this.contentPanels.default.classList.add('active');
    };
})();


