// flowchart list dropdown, switching, creation, deletion, export
(function(){
    if (!window.Sidebar) return;

    Sidebar.prototype.setupFlowchartManagement = function() {

        document.getElementById('create_flowchart_btn').addEventListener('click', (e) => {
            // prevent default anchor navigation so it never changes page
            e.preventDefault();
            this.showCreateFlowchartModal();
        });



        // close button is now handled automatically by ModalManager

        document.getElementById('cancel_create_flowchart').addEventListener('click', () => {
            this.hideCreateFlowchartModal();
        });

        document.getElementById('confirm_create_flowchart').addEventListener('click', () => {
            this.createNewFlowchart();
        });

        this.createFlowchartModal.addEventListener('click', (e) => {
            if (e.target === this.createFlowchartModal) {
                this.hideCreateFlowchartModal();
            }
        });

        const nameInput = document.getElementById('new_flowchart_name');
        if (nameInput) {
            nameInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    this.createNewFlowchart();
                }
            });
            // replace spaces with underscores when typing
            nameInput.addEventListener('keypress', (e) => {
                if (e.key === ' ') {
                    e.preventDefault();
                    // insert underscore at cursor position
                    const start = nameInput.selectionStart;
                    const end = nameInput.selectionEnd;
                    const value = nameInput.value;
                    nameInput.value = value.substring(0, start) + '_' + value.substring(end);
                    nameInput.selectionStart = nameInput.selectionEnd = start + 1;
                }
            });
            // replace spaces with underscores when pasting
            nameInput.addEventListener('paste', (e) => {
                const pastedText = (e.clipboardData || window.clipboardData).getData('text');
                if (pastedText.includes(' ')) {
                    e.preventDefault();
                    // replace spaces with underscores in pasted text
                    const cleanText = pastedText.replace(/ /g, '_');
                    const start = nameInput.selectionStart;
                    const end = nameInput.selectionEnd;
                    const value = nameInput.value;
                    nameInput.value = value.substring(0, start) + cleanText + value.substring(end);
                    nameInput.selectionStart = nameInput.selectionEnd = start + cleanText.length;
                }
            });
        }

        try {
            const params = new URLSearchParams(window.location.search);
            if (params.get('openCreateFlowchart') === '1') {
                this.showCreateFlowchartModal();
                params.delete('openCreateFlowchart');
                const newQuery = params.toString();
                const newUrl = window.location.pathname + (newQuery ? `?${newQuery}` : '');
                window.history.replaceState(null, '', newUrl);
            }
        } catch (_) {}

    };

    Sidebar.prototype.initializeFlowchartDropdown = async function() {

        await this.loadFlowcharts();
        this.setupFlowchartDropdownEvents();
        const flowchartFromURL = this.urlManager.getFlowchartFromURL();
        const displayNameFromURL = this.urlManager.getFlowchartDisplayName();
        let initialFilename = null;
        let initialDisplay = null;

        if (flowchartFromURL) {
            // url-param driven selection
            const exists = this.flowcharts.some(f => f.filename === flowchartFromURL);
            if (exists) {
                initialFilename = flowchartFromURL;
                initialDisplay = displayNameFromURL || (flowchartFromURL.replace('.json',''));
            }
        }

        if (!initialFilename) {
            // fall back to last accessed from local storage
            try {
                const last = localStorage.getItem('last_accessed_flowchart');
                if (last && this.flowcharts.some(f => f.filename === last)) {
                    initialFilename = last;
                    initialDisplay = last.replace('.json','');
                }
            } catch (_) {}
        }

        if (!initialFilename) {
            // final fallback: newest modified from backend list
            if (this.flowcharts.length > 0) {
                initialFilename = this.flowcharts[0].filename;
                initialDisplay = this.flowcharts[0].name;
            }
        }

                    if (initialFilename) {
                if (this.state.saving && this.state.saving.storage) {
                    this.state.saving.storage.setCurrentFlowchart(initialFilename);
                }
                this.setCurrentFlowchart(initialDisplay);
                this.urlManager.setLastAccessedFlowchart(initialFilename);
            this.urlManager.updateFlowchartInURL(initialFilename);
        } else {
            // no flowcharts exist yet
            console.warn('[Sidebar] no flowcharts available');
        }

    };

    Sidebar.prototype.loadFlowcharts = async function() {
        try {
            // check if saving module is available
            if (!this.state.saving || !this.state.saving.storage) {
                console.error('saving module not available, retrying in 100ms');
                setTimeout(() => this.loadFlowcharts(), 100);
                return;
            }
            
            // access storage through the saving module
            const result = await this.state.saving.storage.listFlowcharts();
    
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
    };

    Sidebar.prototype.setupFlowchartDropdownEvents = function() {
        const container = this.flowchartSelector.closest('.dropdown_container');
        this.flowchartSelector.addEventListener('click', (e) => {
    
            e.stopPropagation();
            this.toggleFlowchartDropdown();
        });
        document.addEventListener('click', (e) => {
            if (!container.contains(e.target)) {
                this.closeFlowchartDropdown();
            }
        });

    };

    Sidebar.prototype.toggleFlowchartDropdown = function() {
        const willClose = this.flowchartDropdown.classList.contains('show');

        if (willClose) {
            this.closeFlowchartDropdown();
        } else {
            this.openFlowchartDropdown();
        }
    };

    Sidebar.prototype.openFlowchartDropdown = function() {

        this.flowchartDropdown.classList.add('show');
        this.updateFlowchartDropdownMenu();
    };

    Sidebar.prototype.closeFlowchartDropdown = function() {
        if (this.flowchartDropdown.classList.contains('show')) {
    
        }
        this.flowchartDropdown.classList.remove('show');
    };

    Sidebar.prototype.updateFlowchartDropdownMenu = function() {

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
        this.flowchartDropdown.querySelectorAll('.dropdown_item').forEach(item => {
            item.addEventListener('click', (e) => {
                if (!e.target.closest('.dropdown_delete_btn')) {
            
                    this.selectFlowchart(item.dataset.filename, item.dataset.name);
                }
            });
        });
        this.flowchartDropdown.querySelectorAll('.dropdown_delete_btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
        
                this.deleteFlowchart(btn.dataset.filename, btn.dataset.name);
            });
        });
    };

    Sidebar.prototype.selectFlowchart = async function(filename, name) {
        this.closeFlowchartDropdown();
        try {
    
            
            // check if we're in run, build, or settings mode and clear execution output if needed
            const currentMode = this.state.currentMode || 'build';
            if (currentMode === 'run' || currentMode === 'build' || currentMode === 'settings') {
                try {
                    if (window.flowchartApp && typeof window.flowchartApp.clearRunModeState === 'function') {
                        window.flowchartApp.clearRunModeState();
                    }
                } catch (clearError) {
                    console.warn('[sidebar-flow] failed to clear execution state:', clearError);
                }
            }
            
            if (this.state.saving) await this.state.saving.save(true);
            if (this.state.saving && this.state.saving.storage) {
                this.state.saving.storage.setCurrentFlowchart(filename);
            }
            const result = this.state.saving ? await this.state.saving.load() : { success: false, message: 'saving not initialized' };
            if (result.success) {
                this.setCurrentFlowchart(name);
                this.urlManager.updateFlowchartInURL(filename);
                this.showSuccess(`switched to flowchart: ${name}`);
        
            } else {
                this.showError(`failed to load flowchart: ${result.message}`);
            }
        } catch (error) {
            this.showError(`error switching flowchart: ${error.message}`);
        }
    };

    Sidebar.prototype.setCurrentFlowchart = function(name) {
        this.flowchartSelector.value = name;
    };

    Sidebar.prototype.showFlowchartDropdownError = function(message) {
        this.flowchartDropdown.innerHTML = `<div class="dropdown_no_results">${message}</div>`;
    };

    Sidebar.prototype.showCreateFlowchartModal = function() {
        document.getElementById('new_flowchart_name').value = '';
        ModalManager.open('create_flowchart_modal');
    };

    Sidebar.prototype.hideCreateFlowchartModal = function() {
        ModalManager.close('create_flowchart_modal');
    };

    Sidebar.prototype.createNewFlowchart = async function() {
        const name = document.getElementById('new_flowchart_name').value.trim();
        if (!name) {
            this.showError('flowchart name is required');
            return;
        }
        
        // if in run mode, clear execution output before creating new flowchart
        try {
            if (window.flowchartApp && window.flowchartApp.state && window.flowchartApp.state.isRunMode) {
                if (typeof window.flowchartApp.clearRunModeState === 'function') {
                    window.flowchartApp.clearRunModeState();
                } else if (window.flowchartApp.nodeStateManager && typeof window.flowchartApp.nodeStateManager.clearAllNodeColorState === 'function') {
                    window.flowchartApp.nodeStateManager.clearAllNodeColorState();
                } else if (typeof window.flowchartApp.clearAllNodeColorState === 'function') {
                    window.flowchartApp.clearAllNodeColorState();
                }
            }
        } catch (_) {}
        
        try {
    
            // check if saving module is available
            if (!this.state.saving || !this.state.saving.storage) {
                this.showError('saving module not available');
                return;
            }
            const result = await this.state.saving.storage.createFlowchart(name);
            if (result.success) {
                this.hideCreateFlowchartModal();
                await this.loadFlowcharts();
                await this.selectFlowchart(result.flowchart.filename, result.flowchart.name);
                this.showSuccess(result.message);
        
            } else {
                this.showError(result.message);
            }
        } catch (error) {
            this.showError(`error creating flowchart: ${error.message}`);
        }
    };

    Sidebar.prototype.deleteFlowchart = async function(filename, name) {
        if (!confirm(`are you sure you want to delete the flowchart "${name}"? this action cannot be undone.`)) {
            return;
        }
        try {
    
            // check if saving module is available
            if (!this.state.saving || !this.state.saving.storage) {
                this.showError('saving module not available');
                return;
            }
            const result = await this.state.saving.storage.deleteFlowchart(filename);
            if (result.success) {
                await this.loadFlowcharts();
                if (this.state.saving && this.state.saving.storage && this.state.saving.storage.getCurrentFlowchart() === filename) {
                    // if we deleted the current one, switch to newest available or clear
                    if (this.flowcharts.length > 0) {
                        const newest = this.flowcharts[0];
                        await this.selectFlowchart(newest.filename, newest.name);
                    } else {
                        if (this.state.saving && this.state.saving.storage) {
                            this.state.saving.storage.setCurrentFlowchart(null);
                        }
                        this.setCurrentFlowchart('');
                        // clear flowchart param
                        try {
                            const params = new URLSearchParams(window.location.search);
                            params.delete('flowchart');
                            const newUrl = window.location.pathname + (params.toString() ? `?${params.toString()}` : '');
                            window.history.replaceState(null, '', newUrl);
                        } catch (_) {}
                    }
                }
                this.showSuccess(result.message);
        
            } else {
                this.showError(result.message);
            }
        } catch (error) {
            this.showError(`error deleting flowchart: ${error.message}`);
        }
    };

    Sidebar.prototype.exportCurrentFlowchart = function() {
        try {
            // check if saving module is available
            if (!this.state.saving || !this.state.saving.storage) {
                this.showError('saving module not available');
                return;
            }
            const data = this.state.saving ? this.state.saving.exportData() : { nodes: [], links: [], groups: [], metadata: {} };
            this.state.saving.storage.exportAsJson(data);
            this.showSuccess('flowchart exported successfully');
        } catch (error) {
            this.showError(`error exporting flowchart: ${error.message}`);
        }
    };
})();


