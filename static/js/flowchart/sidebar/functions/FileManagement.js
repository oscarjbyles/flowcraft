// copy content from Sidebar.files.js
class FileManagementFunctions {
    constructor(sidebar) {
        this.sidebar = sidebar;
    }

    initializePythonFileDropdown() {
        // wait for DropdownManager to be available
        if (!window.DropdownManager) {
            console.warn('DropdownManager not available, retrying in 100ms...');
            setTimeout(() => this.initializePythonFileDropdown(), 100);
            return;
        }

        // create dropdown using centralized manager
        this.pythonFileDropdown = window.DropdownManager.create({
            containerId: 'python_file_container',
            inputId: 'python_file',
            menuId: 'python_file_dropdown',
            options: {
                searchable: true,
                readonly: true,
                placeholder: 'select python file...',
                onSelect: (selectedItem, dropdown) => {
                    this.selectPythonFile(selectedItem.value, selectedItem.label);
                },
                onOpen: (dropdown) => {
                    this.loadPythonFiles();
                },
                renderItem: (item) => {
                    const displayPath = item.path.startsWith('nodes/') ? item.path.substring(6) : item.path;
                    return `
                        <div class="dropdown_item" data-value="${item.path}" data-label="${displayPath}">
                            ${displayPath}
                        </div>
                    `;
                }
            }
        });

        if (!this.pythonFileDropdown) {
            console.error('failed to create python file dropdown');
            return;
        }

        // load initial files
        this.loadPythonFiles();
    }

    async loadPythonFiles() {
        if (!this.pythonFileDropdown) return;

        this.pythonFileDropdown.showLoading('loading python files...');

        try {
            const response = await fetch('/api/python-files');
            const data = await response.json();
            
            if (data.status === 'success' && Array.isArray(data.files)) {
                this.pythonFiles = data.files;
                this.filteredFiles = [...this.pythonFiles];
                
                // transform data for dropdown
                const items = this.pythonFiles.map(file => ({
                    value: file.path,
                    label: file.path.startsWith('nodes/') ? file.path.substring(6) : file.path,
                    path: file.path,
                    name: file.name
                }));
                
                this.pythonFileDropdown.setItems(items);
            } else {
                this.pythonFileDropdown.showError('failed to load files');
            }
        } catch (error) {
            console.error('error loading python files:', error);
            this.pythonFileDropdown.showError('error loading files');
        }
    }

    async selectPythonFile(path, displayPath) {
        const input = document.getElementById('python_file');
        if (!input) return;

        // normalize to project-root-relative
        const noPrefix = (displayPath || '').replace(/^(?:nodes\/)*/i, '');
        
        // keep input visually empty and store path for saving
        input.value = '';
        input.placeholder = '';
        input.dataset.fullPath = path.replace(/^(?:nodes\/)*/i, '');
        
        // update status block
        this.updatePythonFileStatus('checking file...', 'hourglass_empty');
        
        try {
            // validate file exists and is readable
            const response = await fetch(`/api/python-files/validate?path=${encodeURIComponent(path)}`);
            const data = await response.json();
            
            if (data.status === 'success' && data.valid) {
                this.updatePythonFileStatus('file selected', 'check_circle');
                this.updatePythonFilePath(path);
                
                // trigger node analysis
                if (typeof this.analyzePythonNode === 'function') {
                    this.analyzePythonNode();
                }
            } else {
                this.updatePythonFileStatus('invalid file', 'error');
                this.updatePythonFilePath('');
            }
        } catch (error) {
            console.error('error validating python file:', error);
            this.updatePythonFileStatus('error checking file', 'error');
            this.updatePythonFilePath('');
        }
    }

    updatePythonFileStatus(text, icon) {
        const statusIcon = document.getElementById('python_file_status_icon');
        const statusText = document.getElementById('python_file_status_text');
        
        if (statusIcon) statusIcon.textContent = icon;
        if (statusText) statusText.textContent = text;
    }

    updatePythonFilePath(path) {
        const pathBlock = document.getElementById('python_file_path_block');
        if (pathBlock) {
            pathBlock.textContent = path || '';
            pathBlock.style.display = path ? 'block' : 'none';
        }
    }

    // legacy methods for backward compatibility
    setupDropdownEvents() {
        // this is now handled by DropdownManager
        console.warn('setupDropdownEvents is deprecated - use DropdownManager instead');
    }

    toggleDropdown() {
        if (this.pythonFileDropdown) {
            this.pythonFileDropdown.toggle();
        }
    }

    openDropdown() {
        if (this.pythonFileDropdown) {
            this.pythonFileDropdown.open();
        }
    }

    closeDropdown() {
        if (this.pythonFileDropdown) {
            this.pythonFileDropdown.close();
        }
    }

    filterFiles(searchTerm) {
        if (this.pythonFileDropdown) {
            this.pythonFileDropdown.filterItems(searchTerm);
        }
    }

    updateDropdownMenu() {
        // this is now handled by DropdownManager
        console.warn('updateDropdownMenu is deprecated - use DropdownManager instead');
    }

    selectFile(path, displayPath) {
        this.selectPythonFile(path, displayPath);
    }

    async initializeFlowchartDropdown() {
        try {
            // get current flowchart from url or storage
            const urlManager = new URLManager();
            const currentFlowchart = urlManager.getFlowchartFilenameFromURL();
            
            // set current flowchart in storage
            if (this.sidebar.state?.saving?.storage) {
                this.sidebar.state.saving.storage.setCurrentFlowchart(currentFlowchart);
            }
            
            console.log('[FileManagement] initialized flowchart dropdown, current:', currentFlowchart);
            return true;
        } catch (error) {
            console.error('[FileManagement] failed to initialize flowchart dropdown:', error);
            return false;
        }
    }

    showDropdownError(message) {
        if (this.pythonFileDropdown) {
            this.pythonFileDropdown.showError(message);
        }
    }
}

window.FileManagementFunctions = FileManagementFunctions;
