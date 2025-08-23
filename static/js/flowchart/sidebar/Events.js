// core event bindings and high-level view updates
(function(){
    if (!window.Sidebar) return;

    Sidebar.prototype.setupEventListeners = function() {
        this.state.on('selectionChanged', (selection) => {
            if (typeof this.updateContent === 'function') {
                this.updateContent(selection);
            }
        });
        this.state.on('updateSidebar', () => this.updateFromState());
        this.state.on('statusUpdate', (message) => {
            if (typeof this.updateStatus === 'function') {
                this.updateStatus(message);
            }
        });
        // ensure sidebar updates when mode changes (e.g., hide delete in run mode)
        this.state.on('modeChanged', () => this.updateFromState());

        // handle quick add if condition button click (delegated)
        document.addEventListener('click', (e) => {
            const btn = e.target.closest('#add_if_condition_btn');
            if (btn && typeof this.handleAddIfCondition === 'function') {
                this.handleAddIfCondition();
            }
        });
    };

    Sidebar.prototype.updateFromState = function() {
        const selection = {
            nodes: this.state.selectionHandler ? Array.from(this.state.selectionHandler.selectedNodes) : [],
            link: this.state.selectionHandler ? this.state.selectionHandler.selectedLink : null,
            group: this.state.selectionHandler ? this.state.selectionHandler.selectedGroup : null,
            annotation: this.state.selectionHandler ? this.state.selectionHandler.selectedAnnotation : null
        };
        if (typeof this.updateContent === 'function') {
            this.updateContent(selection);
        }
        if (typeof this.updateFooterDelete === 'function') {
            this.updateFooterDelete(selection);
        }
        if (typeof this.updateFooterVisibility === 'function') {
            this.updateFooterVisibility(selection);
        }
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
