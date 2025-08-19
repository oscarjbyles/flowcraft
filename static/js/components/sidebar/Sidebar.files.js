// python file dropdown functionality - updated to use centralized DropdownManager
(function(){
    if (!window.Sidebar) return;

    Sidebar.prototype.initializePythonFileDropdown = function() {
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
    };

    Sidebar.prototype.loadPythonFiles = async function() {
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
    };

    Sidebar.prototype.selectPythonFile = async function(path, displayPath) {
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
    };

    Sidebar.prototype.updatePythonFileStatus = function(text, icon) {
        const statusIcon = document.getElementById('python_file_status_icon');
        const statusText = document.getElementById('python_file_status_text');
        
        if (statusIcon) statusIcon.textContent = icon;
        if (statusText) statusText.textContent = text;
    };

    Sidebar.prototype.updatePythonFilePath = function(path) {
        const pathBlock = document.getElementById('python_file_path_block');
        if (pathBlock) {
            pathBlock.textContent = path || '';
            pathBlock.style.display = path ? 'block' : 'none';
        }
    };

    // legacy methods for backward compatibility
    Sidebar.prototype.setupDropdownEvents = function() {
        // this is now handled by DropdownManager
        console.warn('setupDropdownEvents is deprecated - use DropdownManager instead');
    };

    Sidebar.prototype.toggleDropdown = function() {
        if (this.pythonFileDropdown) {
            this.pythonFileDropdown.toggle();
        }
    };

    Sidebar.prototype.openDropdown = function() {
        if (this.pythonFileDropdown) {
            this.pythonFileDropdown.open();
        }
    };

    Sidebar.prototype.closeDropdown = function() {
        if (this.pythonFileDropdown) {
            this.pythonFileDropdown.close();
        }
    };

    Sidebar.prototype.filterFiles = function(searchTerm) {
        if (this.pythonFileDropdown) {
            this.pythonFileDropdown.filterItems(searchTerm);
        }
    };

    Sidebar.prototype.updateDropdownMenu = function() {
        // this is now handled by DropdownManager
        console.warn('updateDropdownMenu is deprecated - use DropdownManager instead');
    };

    Sidebar.prototype.selectFile = function(path, displayPath) {
        this.selectPythonFile(path, displayPath);
    };

    Sidebar.prototype.showDropdownError = function(message) {
        if (this.pythonFileDropdown) {
            this.pythonFileDropdown.showError(message);
        }
    };

})();


