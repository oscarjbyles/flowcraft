// flowchart list dropdown, switching, creation, deletion, export
(function(){
    if (!window.Sidebar) return;

    Sidebar.prototype.setupFlowchartManagement = function() {
        document.getElementById('create_flowchart_btn').addEventListener('click', () => {
            this.showCreateFlowchartModal();
        });

        document.getElementById('export_btn').addEventListener('click', () => {
            this.exportCurrentFlowchart();
        });

        // open data matrix page for current flowchart
        const dmBtn = document.getElementById('data_matrix_btn');
        if (dmBtn) {
            dmBtn.addEventListener('click', () => {
                try {
                    const fc = this.state.storage.getCurrentFlowchart ? this.state.storage.getCurrentFlowchart() : 'default.json';
                    const url = `/data?flowchart_name=${encodeURIComponent(fc || 'default.json')}`;
                    window.location.href = url;
                } catch (_) {
                    window.location.href = '/data';
                }
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

        document.getElementById('new_flowchart_name').addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                this.createNewFlowchart();
            }
        });

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
        const displayName = this.urlManager.getFlowchartDisplayName();
        console.log(`[Sidebar] Initializing with flowchart from URL: ${flowchartFromURL} (${displayName})`);
        const flowchartExists = this.flowcharts.some(f => f.filename === flowchartFromURL);
        if (flowchartExists) {
            this.state.storage.setCurrentFlowchart(flowchartFromURL);
            this.setCurrentFlowchart(displayName);
        } else {
            console.warn(`[Sidebar] Flowchart ${flowchartFromURL} not found, falling back to default`);
            this.state.storage.setCurrentFlowchart('default.json');
            this.setCurrentFlowchart('default');
            this.urlManager.updateFlowchartInURL('default.json');
        }
    };

    Sidebar.prototype.loadFlowcharts = async function() {
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
        if (this.flowchartDropdown.classList.contains('show')) {
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
            await this.state.save(true);
            this.state.storage.setCurrentFlowchart(filename);
            const result = await this.state.load();
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
        try {
            const result = await this.state.storage.createFlowchart(name);
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
            const result = await this.state.storage.deleteFlowchart(filename);
            if (result.success) {
                await this.loadFlowcharts();
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


