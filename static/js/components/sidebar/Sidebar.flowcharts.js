// flowchart list dropdown, switching, creation, deletion, export
(function(){
    if (!window.Sidebar) return;

    Sidebar.prototype.setupFlowchartManagement = function() {
        try { console.log('[sidebar-flow] setupFlowchartManagement start'); } catch(_) {}
        document.getElementById('create_flowchart_btn').addEventListener('click', (e) => {
            // prevent default anchor navigation so it never changes page
            e.preventDefault();
            this.showCreateFlowchartModal();
        });

        document.getElementById('export_btn').addEventListener('click', () => {
            this.exportCurrentFlowchart();
        });

        // open data matrix page for current flowchart
        const dmBtn = document.getElementById('data_matrix_btn');
        if (dmBtn) {
            dmBtn.addEventListener('click', () => {
                // if leaving run mode, perform full clear same as clear button
                try {
                    if (window.flowchartApp && window.flowchartApp.state && window.flowchartApp.state.isRunMode) {
                        if (typeof window.flowchartApp.clearRunModeState === 'function') {
                            window.flowchartApp.clearRunModeState();
                        } else if (typeof window.flowchartApp.clearAllNodeColorState === 'function') {
                            window.flowchartApp.clearAllNodeColorState();
                        }
                    }
                } catch (_) {}
                const url = this.urlManager.buildUrlPreserveContext('/data');
                window.location.href = url;
            });
        }

        document.getElementById('close_create_modal').addEventListener('click', () => {
            this.hideCreateFlowchartModal();
        });

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
        try { console.log('[sidebar-flow] setupFlowchartManagement done'); } catch(_) {}
    };

    Sidebar.prototype.initializeFlowchartDropdown = async function() {
        try { console.log('[sidebar-flow] initializeFlowchartDropdown start'); } catch(_) {}
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
            this.state.storage.setCurrentFlowchart(initialFilename);
            this.setCurrentFlowchart(initialDisplay);
            this.urlManager.setLastAccessedFlowchart(initialFilename);
            this.urlManager.updateFlowchartInURL(initialFilename);
        } else {
            // no flowcharts exist yet
            console.warn('[Sidebar] no flowcharts available');
        }
        try { console.log('[sidebar-flow] initializeFlowchartDropdown done', { initialFilename, initialDisplay }); } catch(_) {}
    };

    Sidebar.prototype.loadFlowcharts = async function() {
        try {
            const result = await this.state.storage.listFlowcharts();
            try { console.log('[sidebar-flow] loadFlowcharts', { success: result.success, count: (result.flowcharts && result.flowcharts.length) || 0 }); } catch(_) {}
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
            try { console.log('[sidebar-flow] selector click'); } catch(_) {}
            e.stopPropagation();
            this.toggleFlowchartDropdown();
        });
        document.addEventListener('click', (e) => {
            if (!container.contains(e.target)) {
                this.closeFlowchartDropdown();
            }
        });
        try { console.log('[sidebar-flow] setupFlowchartDropdownEvents done'); } catch(_) {}
    };

    Sidebar.prototype.toggleFlowchartDropdown = function() {
        const willClose = this.flowchartDropdown.classList.contains('show');
        try { console.log('[sidebar-flow] toggleFlowchartDropdown', { willClose }); } catch(_) {}
        if (willClose) {
            this.closeFlowchartDropdown();
        } else {
            this.openFlowchartDropdown();
        }
    };

    Sidebar.prototype.openFlowchartDropdown = function() {
        try { console.log('[sidebar-flow] openFlowchartDropdown'); } catch(_) {}
        this.flowchartDropdown.classList.add('show');
        this.updateFlowchartDropdownMenu();
    };

    Sidebar.prototype.closeFlowchartDropdown = function() {
        if (this.flowchartDropdown.classList.contains('show')) {
            try { console.log('[sidebar-flow] closeFlowchartDropdown'); } catch(_) {}
        }
        this.flowchartDropdown.classList.remove('show');
    };

    Sidebar.prototype.updateFlowchartDropdownMenu = function() {
        try { console.log('[sidebar-flow] updateFlowchartDropdownMenu', { items: this.filteredFlowcharts && this.filteredFlowcharts.length }); } catch(_) {}
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
                    try { console.log('[sidebar-flow] item click', { filename: item.dataset.filename, name: item.dataset.name }); } catch(_) {}
                    this.selectFlowchart(item.dataset.filename, item.dataset.name);
                }
            });
        });
        this.flowchartDropdown.querySelectorAll('.dropdown_delete_btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                try { console.log('[sidebar-flow] delete click', { filename: btn.dataset.filename, name: btn.dataset.name }); } catch(_) {}
                this.deleteFlowchart(btn.dataset.filename, btn.dataset.name);
            });
        });
    };

    Sidebar.prototype.selectFlowchart = async function(filename, name) {
        this.closeFlowchartDropdown();
        try {
            console.log('[sidebar-flow] selectFlowchart start', { filename, name });
            
            // check if we're in run, build, or settings mode and clear execution output if needed
            const currentMode = this.state.currentMode || 'build';
            if (currentMode === 'run' || currentMode === 'build' || currentMode === 'settings') {
                try {
                    if (window.flowchartApp && typeof window.flowchartApp.clearRunModeState === 'function') {
                        window.flowchartApp.clearRunModeState();
                    } else if (window.flowchartApp && typeof window.flowchartApp.clearExecutionFeed === 'function') {
                        window.flowchartApp.clearExecutionFeed();
                    }
                } catch (clearError) {
                    console.warn('[sidebar-flow] failed to clear execution state:', clearError);
                }
            }
            
            await this.state.save(true);
            this.state.storage.setCurrentFlowchart(filename);
            const result = await this.state.load();
            if (result.success) {
                this.setCurrentFlowchart(name);
                this.urlManager.updateFlowchartInURL(filename);
                this.showSuccess(`switched to flowchart: ${name}`);
                try { console.log('[sidebar-flow] selectFlowchart success'); } catch(_) {}
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
        this.createFlowchartModal.classList.add('show');
        document.getElementById('new_flowchart_name').value = '';
        document.getElementById('new_flowchart_name').focus();
    };

    Sidebar.prototype.hideCreateFlowchartModal = function() {
        this.createFlowchartModal.classList.remove('show');
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
                } else if (typeof window.flowchartApp.clearAllNodeColorState === 'function') {
                    window.flowchartApp.clearAllNodeColorState();
                }
            }
        } catch (_) {}
        
        try {
            console.log('[sidebar-flow] createNewFlowchart submit', { name });
            const result = await this.state.storage.createFlowchart(name);
            if (result.success) {
                this.hideCreateFlowchartModal();
                await this.loadFlowcharts();
                await this.selectFlowchart(result.flowchart.filename, result.flowchart.name);
                this.showSuccess(result.message);
                try { console.log('[sidebar-flow] createNewFlowchart success'); } catch(_) {}
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
            console.log('[sidebar-flow] delete flowchart confirm', { filename, name });
            const result = await this.state.storage.deleteFlowchart(filename);
            if (result.success) {
                await this.loadFlowcharts();
                if (this.state.storage.getCurrentFlowchart() === filename) {
                    // if we deleted the current one, switch to newest available or clear
                    if (this.flowcharts.length > 0) {
                        const newest = this.flowcharts[0];
                        await this.selectFlowchart(newest.filename, newest.name);
                    } else {
                        this.state.storage.setCurrentFlowchart(null);
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
                try { console.log('[sidebar-flow] delete flowchart success'); } catch(_) {}
            } else {
                this.showError(result.message);
            }
        } catch (error) {
            this.showError(`error deleting flowchart: ${error.message}`);
        }
    };

    Sidebar.prototype.exportCurrentFlowchart = function() {
        try {
            const data = this.state.exportData();
            this.state.storage.exportAsJson(data);
            this.showSuccess('flowchart exported successfully');
        } catch (error) {
            this.showError(`error exporting flowchart: ${error.message}`);
        }
    };
})();


