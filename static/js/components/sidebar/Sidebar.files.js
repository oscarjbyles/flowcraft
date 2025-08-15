// python file explorer and dropdown behaviors
(function(){
    if (!window.Sidebar) return;

    Sidebar.prototype.initializePythonFileDropdown = async function() {
        const input = document.getElementById('python_file');
        const modal = document.getElementById('select_python_modal');
        const listEl = document.getElementById('fe_list');
        const breadcrumbEl = document.getElementById('fe_breadcrumb');
        const upBtn = document.getElementById('fe_up_btn');
        const newFileBtn = document.getElementById('fe_new_file_btn');
        const newFolderBtn = document.getElementById('fe_new_folder_btn');
        const newFileGroup = document.getElementById('fe_new_file_group');
        const newFileInput = document.getElementById('fe_new_file_input');
        const createFileConfirm = document.getElementById('fe_create_file_confirm');
        const createFileCancel = document.getElementById('fe_create_file_cancel');
        const cancelBtn = document.getElementById('fe_cancel');
        const confirmBtn = document.getElementById('fe_confirm');
        const closeBtn = document.getElementById('fe_close_btn');

        if (!input || !modal || !listEl || !breadcrumbEl || !upBtn || !cancelBtn || !confirmBtn) return;

        let explorerCwd = '';
        let selectedRelFile = '';

        const renderBreadcrumb = (cwd) => {
            breadcrumbEl.innerHTML = '';
            const root = document.createElement('span');
            root.className = 'mini_breadcrumb_item';
            root.textContent = 'root';
            root.onclick = () => loadExplorer('');
            breadcrumbEl.appendChild(root);
            const parts = (cwd || '').split('/').filter(Boolean);
            let accum = [];
            parts.forEach(p => {
                const sep = document.createElement('span'); sep.className = 'mini_breadcrumb_sep'; sep.textContent = '/'; breadcrumbEl.appendChild(sep);
                accum.push(p);
                const item = document.createElement('span'); item.className = 'mini_breadcrumb_item'; item.textContent = p; item.onclick = () => loadExplorer(accum.join('/')); breadcrumbEl.appendChild(item);
            });
        };

        const highlightSelection = () => {
            listEl.querySelectorAll('.mini_row').forEach(row => {
                row.style.background = (row.dataset.type === 'file' && row.dataset.path === selectedRelFile) ? 'var(--hover-color)' : '';
            });
        };

        const loadExplorer = async (path) => {
            try {
                const resp = await fetch(`/api/nodes/browse?path=${encodeURIComponent(path || '')}`);
                const data = await resp.json();
                if (data.status !== 'success') { listEl.innerHTML = '<div style="padding:10px; opacity:0.7;">failed to load</div>'; return; }
                explorerCwd = data.cwd || '';
                if (newFileGroup) newFileGroup.style.display = 'none';
                selectedRelFile = '';
                renderBreadcrumb(explorerCwd);
                const folders = (data.entries || []).filter(e => e.is_dir && e.name !== '__pycache__');
                const files = (data.entries || []).filter(e => !e.is_dir && e.ext === '.py');
                listEl.innerHTML = '';
                if (folders.length === 0 && files.length === 0) {
                    listEl.innerHTML = '<div style="padding:10px; opacity:0.7;">empty</div>';
                    return;
                }
                folders.forEach(f => {
                    const row = document.createElement('div'); row.className = 'mini_row'; row.dataset.type = 'dir'; row.dataset.path = f.path;
                    row.innerHTML = `<span class="material-icons" style="font-size:16px; opacity:.9;">folder</span><span>${f.name}</span>`;
                    row.onclick = () => loadExplorer(f.path);
                    listEl.appendChild(row);
                });
                files.forEach(file => {
                    const row = document.createElement('div'); row.className = 'mini_row'; row.dataset.type = 'file'; row.dataset.path = file.path;
                    row.innerHTML = `<span class="material-icons" style="font-size:16px; opacity:.9;">description</span><span>${file.name}</span><span style="margin-left:auto; opacity:.7; font-family:monospace;">/${file.path}</span>`;
                    row.onclick = () => { selectedRelFile = file.path; highlightSelection(); };
                    listEl.appendChild(row);
                });
            } catch (_) {
                listEl.innerHTML = '<div style="padding:10px; opacity:0.7;">error loading</div>';
            }
        };

        upBtn.onclick = () => { const parent = (explorerCwd || '').split('/').filter(Boolean); parent.pop(); loadExplorer(parent.join('/')); };
        if (newFileBtn) newFileBtn.onclick = () => { if (newFileGroup) { newFileGroup.style.display = ''; newFileInput && (newFileInput.value = ''); newFileInput && newFileInput.focus(); } };
        if (createFileCancel) createFileCancel.onclick = () => { if (newFileGroup) newFileGroup.style.display = 'none'; };
        if (newFolderBtn) newFolderBtn.onclick = async () => {
            const name = prompt('new folder name');
            if (!name) return;
            try {
                const resp = await fetch('/api/nodes/mkdir', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ path: explorerCwd || '', name })});
                const data = await resp.json();
                if (data.status === 'success') { loadExplorer(explorerCwd); }
                else { alert(data.message || 'failed to create folder'); }
            } catch (_) { alert('error creating folder'); }
        };
        if (newFileInput) {
            // replace spaces with underscores while typing
            newFileInput.addEventListener('keydown', (e) => {
                if (e.key === ' ') {
                    e.preventDefault();
                    const start = newFileInput.selectionStart;
                    const end = newFileInput.selectionEnd;
                    const val = newFileInput.value;
                    newFileInput.value = val.slice(0, start) + '_' + val.slice(end);
                    newFileInput.setSelectionRange(start + 1, start + 1);
                }
            });
            newFileInput.addEventListener('input', () => {
                const replaced = newFileInput.value.replace(/\s+/g, '_');
                if (replaced !== newFileInput.value) newFileInput.value = replaced;
            });
        }
        if (createFileConfirm) createFileConfirm.onclick = async () => {
            const rawName = ((newFileInput && newFileInput.value) || '').trim();
            if (!rawName) { this.showError && this.showError('script name is required'); return; }
            const fileName = rawName.toLowerCase().endsWith('.py') ? rawName : `${rawName}.py`;
            try {
                const resp = await fetch('/api/nodes/touch', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ path: explorerCwd || '', name: fileName })});
                const data = await resp.json();
                if (data.status !== 'success') { this.showError && this.showError(data.message || 'failed to create file'); return; }
                // after creating, select it and close
                const relDisplay = (explorerCwd ? `${explorerCwd}/` : '') + fileName;
                const noPrefix = relDisplay.replace(/^(?:nodes\/)*/i, '');
                input.value = '';
                input.placeholder = '';
                input.dataset.fullPath = noPrefix;
                modal.classList.remove('show');
                try { this.saveNodeProperties && this.saveNodeProperties(); } catch (_) {}
                try { await this.state.save(false); } catch (_) {}
                // refresh the sidebar to show updated file details
                try { this.state.emit('updateSidebar'); } catch (_) {}
            } catch (_) {
                this.showError && this.showError('error creating file');
            }
        };
        const closeModal = () => { modal.classList.remove('show'); };
        cancelBtn.onclick = closeModal;
        if (closeBtn) closeBtn.onclick = closeModal;
        confirmBtn.onclick = async () => {
            if (!selectedRelFile) { this.showError('select a python file'); return; }
            // normalize to single nodes/ prefix for persistence; display without prefix
            const noPrefix = selectedRelFile.replace(/^(?:nodes\/)*/i, '');
            input.value = '';
            input.placeholder = '';
            input.dataset.fullPath = noPrefix;
            closeModal();
            try { this.saveNodeProperties && this.saveNodeProperties(); } catch (_) {}
            try { await this.state.save(false); } catch (_) {}
            // refresh the sidebar to show updated file details
            try { this.state.emit('updateSidebar'); } catch (_) {}
        };
        modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });
        input.addEventListener('click', (e) => {
            e.stopPropagation();
            modal.classList.add('show');
            loadExplorer('');
        });
    };

    // legacy searchable dropdown api (kept to preserve functionality)
    Sidebar.prototype.loadPythonFiles = async function() {
        try {
            const response = await fetch('/api/python-files');
            const data = await response.json();
            
            if (data.status === 'success') {
                this.pythonFiles = data.files;
                this.filteredFiles = [...this.pythonFiles];
                this.updateDropdownMenu();
            } else {
                console.error('failed to load python files:', data.message);
                this.showDropdownError('failed to load files');
            }
        } catch (error) {
            console.error('error loading python files:', error);
            this.showDropdownError('error loading files');
        }
    };

    Sidebar.prototype.setupDropdownEvents = function() {
        const input = document.getElementById('python_file');
        const dropdown = document.getElementById('python_file_dropdown');
        const container = input.closest('.dropdown_container');

        input.addEventListener('click', (e) => {
            e.stopPropagation();
            this.toggleDropdown();
        });
        input.addEventListener('input', () => {
            this.filterFiles(input.value);
        });
        document.addEventListener('click', (e) => {
            if (!container.contains(e.target)) {
                this.closeDropdown();
            }
        });
        input.addEventListener('keydown', (e) => {
            this.handleKeyboardNavigation(e);
        });
    };

    Sidebar.prototype.toggleDropdown = function() {
        const dropdown = document.getElementById('python_file_dropdown');
        const input = document.getElementById('python_file');
        
        if (dropdown.classList.contains('show')) {
            this.closeDropdown();
        } else {
            this.openDropdown();
            input.removeAttribute('readonly');
            input.focus();
        }
    };

    Sidebar.prototype.openDropdown = function() {
        const dropdown = document.getElementById('python_file_dropdown');
        dropdown.classList.add('show');
        this.updateDropdownMenu();
    };

    Sidebar.prototype.closeDropdown = function() {
        const dropdown = document.getElementById('python_file_dropdown');
        const input = document.getElementById('python_file');
        dropdown.classList.remove('show');
        input.setAttribute('readonly', 'true');
    };

    Sidebar.prototype.filterFiles = function(searchTerm) {
        const term = searchTerm.toLowerCase();
        this.filteredFiles = this.pythonFiles.filter(file => 
            file.name.toLowerCase().includes(term) || 
            file.filename.toLowerCase().includes(term)
        );
        this.updateDropdownMenu();
    };

    Sidebar.prototype.updateDropdownMenu = function() {
        const dropdown = document.getElementById('python_file_dropdown');
        
        if (this.filteredFiles.length === 0) {
            dropdown.innerHTML = '<div class="dropdown_no_results">no files found</div>';
            return;
        }

        const items = this.filteredFiles.map(file => {
            const displayPath = file.path.startsWith('nodes/') ? file.path.substring(6) : file.path;
            return `
                <div class="dropdown_item" data-path="${file.path}" data-display-path="${displayPath}" data-name="${file.name}">
                    ${displayPath}
                </div>
            `;
        }).join('');

        dropdown.innerHTML = items;

        dropdown.querySelectorAll('.dropdown_item').forEach(item => {
            item.addEventListener('click', () => {
                this.selectFile(item.dataset.path, item.dataset.displayPath, item.dataset.name);
            });
        });
    };

    Sidebar.prototype.selectFile = async function(path, displayPath) {
        const input = document.getElementById('python_file');
        // normalize to project-root-relative
        const noPrefix = (displayPath || '').replace(/^(?:nodes\/)*/i, '');
        // keep input visually empty and store path for saving
        input.value = '';
        input.placeholder = '';
        input.dataset.fullPath = path.replace(/^(?:nodes\/)*/i, '');
        this.closeDropdown();
        try { this.saveNodeProperties && this.saveNodeProperties(); } catch (_) {}
        // refresh sidebar ui to update status indicator and formatted path
        try { this.updateFromState && this.updateFromState(); } catch (_) {}
        try { await this.state.save(false); } catch (_) {}
    };

    Sidebar.prototype.showDropdownError = function(message) {
        const dropdown = document.getElementById('python_file_dropdown');
        dropdown.innerHTML = `<div class="dropdown_no_results">${message}</div>`;
    };

    Sidebar.prototype.handleKeyboardNavigation = function(e) {
        const dropdown = document.getElementById('python_file_dropdown');
        const items = dropdown.querySelectorAll('.dropdown_item');
        
        if (items.length === 0) return;

        let currentIndex = -1;
        items.forEach((item, index) => {
            if (item.classList.contains('selected')) {
                currentIndex = index;
            }
        });

        switch (e.key) {
            case 'ArrowDown':
                e.preventDefault();
                currentIndex = Math.min(currentIndex + 1, items.length - 1);
                this.highlightItem(items, currentIndex);
                break;
            case 'ArrowUp':
                e.preventDefault();
                currentIndex = Math.max(currentIndex - 1, 0);
                this.highlightItem(items, currentIndex);
                break;
            case 'Enter':
                e.preventDefault();
                if (currentIndex >= 0) {
                    const item = items[currentIndex];
                    this.selectFile(item.dataset.path, item.dataset.name);
                }
                break;
            case 'Escape':
                this.closeDropdown();
                break;
        }
    };

    Sidebar.prototype.highlightItem = function(items, index) {
        items.forEach(item => item.classList.remove('selected'));
        if (items[index]) {
            items[index].classList.add('selected');
            items[index].scrollIntoView({ block: 'nearest' });
        }
    };
})();


