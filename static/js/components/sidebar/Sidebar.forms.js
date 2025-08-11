// forms, inputs, realtime updates, and feedback helpers
(function(){
    if (!window.Sidebar) return;

    Sidebar.prototype.setupFormHandlers = function() {
        // single node form handlers
        document.getElementById('delete_node_from_sidebar').addEventListener('click', () => {
            this.deleteNodeFromSidebar();
        });

        // create python script modal handlers
        const createPyBtn = document.getElementById('create_python_script_btn');
        const createPyModal = document.getElementById('create_python_modal');
        const closeCreatePyModal = document.getElementById('close_create_python_modal');
        const cancelCreatePy = document.getElementById('cancel_create_python');
        const confirmCreatePy = document.getElementById('confirm_create_python');
        const newPythonNameInput = document.getElementById('new_python_name');
        // mini explorer elements
        const miniList = document.getElementById('mini_list');
        const miniBreadcrumb = document.getElementById('mini_breadcrumb');
        const miniUpBtn = document.getElementById('mini_up_btn');
        const miniSelectedPath = document.getElementById('mini_selected_path');
        const miniCwdDisplay = document.getElementById('mini_cwd_display');
        const miniNewFolderBtn = document.getElementById('mini_new_folder_btn');
        let miniCwd = '';

        if (createPyBtn && createPyModal) {
            createPyBtn.addEventListener('click', (e) => {
                e.preventDefault();
                createPyModal.classList.add('show');
                newPythonNameInput.value = '';
                newPythonNameInput.focus();
                // load mini explorer
                this.loadMiniExplorer('');
            });
        }
        if (closeCreatePyModal) {
            closeCreatePyModal.addEventListener('click', () => createPyModal.classList.remove('show'));
        }
        if (cancelCreatePy) {
            cancelCreatePy.addEventListener('click', () => createPyModal.classList.remove('show'));
        }
        if (createPyModal) {
            createPyModal.addEventListener('click', (e) => {
                if (e.target === createPyModal) createPyModal.classList.remove('show');
            });
        }
        if (confirmCreatePy) {
            confirmCreatePy.addEventListener('click', async () => {
                const rawName = (newPythonNameInput.value || '').trim();
                if (!rawName) {
                    this.showError('script name is required');
                    return;
                }
                const fileName = rawName.toLowerCase().endsWith('.py') ? rawName : `${rawName}.py`;
                try {
                    const resp = await fetch('/api/nodes/touch', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ path: (miniSelectedPath?.value || ''), name: fileName })
                    });
                    const data = await resp.json();
                    if (data.status !== 'success') {
                        this.showError(data.message || 'failed to create file');
                        return;
                    }
                    const selectedNodes = Array.from(this.state.selectedNodes);
                    if (selectedNodes.length === 1) {
                        const nodeId = selectedNodes[0];
                        const relDir = (miniSelectedPath?.value || '').trim();
                        const relDisplay = (relDir ? `${relDir}/` : '') + fileName;
                        const fullPath = `nodes/${relDisplay}`;
                        this.state.updateNode(nodeId, { pythonFile: fullPath });
                        const input = document.getElementById('python_file');
                        if (input) {
                            input.value = relDisplay;
                            input.dataset.fullPath = fullPath;
                        }
                        this.showSuccess(`created script: ${fileName}`);
                    }
                    createPyModal.classList.remove('show');
                } catch (err) {
                    this.showError('error creating file');
                }
            });
        }

        this.loadMiniExplorer = async (path) => {
            try {
                const resp = await fetch(`/api/nodes/browse?path=${encodeURIComponent(path || '')}`);
                const data = await resp.json();
                if (data.status !== 'success') { miniList.innerHTML = '<div style="padding:10px; opacity:0.7;">failed to load</div>'; return; }
                miniCwd = data.cwd || '';
                if (miniCwdDisplay) {
                    miniCwdDisplay.textContent = '/' + (miniCwd || '');
                }
                miniSelectedPath.value = miniCwd;
                miniBreadcrumb.innerHTML = '';
                const rootCrumb = document.createElement('span'); rootCrumb.className = 'mini_breadcrumb_item'; rootCrumb.textContent = 'nodes'; rootCrumb.onclick = () => this.loadMiniExplorer('');
                miniBreadcrumb.appendChild(rootCrumb);
                (data.breadcrumb || []).forEach((b) => {
                    const sep = document.createElement('span'); sep.className = 'mini_breadcrumb_sep'; sep.textContent = '/'; miniBreadcrumb.appendChild(sep);
                    const item = document.createElement('span'); item.className = 'mini_breadcrumb_item'; item.textContent = b.name; item.onclick = () => this.loadMiniExplorer(b.path); miniBreadcrumb.appendChild(item);
                });
                const folders = (data.entries || []).filter(e => e.is_dir && e.name !== '__pycache__');
                if (folders.length === 0) { miniList.innerHTML = '<div style="padding:10px; opacity:0.7;">no folders</div>'; return; }
                miniList.innerHTML = '';
                folders.forEach(f => {
                    const row = document.createElement('div'); row.className = 'mini_row';
                    row.innerHTML = '<span class="material-icons" style="font-size:16px; opacity:.9;">folder</span><span>'+f.name+'</span>';
                    row.onclick = () => this.loadMiniExplorer(f.path);
                    miniList.appendChild(row);
                });
            } catch (_) {
                miniList.innerHTML = '<div style="padding:10px; opacity:0.7;">error loading folders</div>';
            }
        };
        if (miniUpBtn) miniUpBtn.onclick = () => {
            const parent = (miniCwd || '').split('/').filter(Boolean); parent.pop(); this.loadMiniExplorer(parent.join('/'));
        };

        if (miniNewFolderBtn) miniNewFolderBtn.onclick = async () => {
            const name = prompt('new folder name');
            if (!name) return;
            try {
                const resp = await fetch('/api/nodes/mkdir', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ path: miniCwd || '', name })});
                const data = await resp.json();
                if (data.status === 'success') {
                    this.loadMiniExplorer(miniCwd);
                } else {
                    alert(data.message || 'failed to create folder');
                }
            } catch (_) { alert('error creating folder'); }
        };

        // multi-select form handlers
        document.getElementById('create_group_btn').addEventListener('click', () => {
            this.createGroup();
        });
        
        document.getElementById('align_nodes_btn').addEventListener('click', () => {
            this.alignNodes();
        });
        
        document.getElementById('delete_selected_nodes').addEventListener('click', () => {
            this.deleteSelectedNodes();
        });

        // group form handlers
        const saveGroupBtn = document.getElementById('save_group_properties');
        if (saveGroupBtn) {
            saveGroupBtn.addEventListener('click', () => {
                this.saveGroupProperties();
            });
        }
        
        document.getElementById('ungroup_nodes').addEventListener('click', () => {
            this.ungroupNodes();
        });
        
        document.getElementById('delete_group').addEventListener('click', () => {
            this.deleteGroup();
        });

        // real-time form updates
        this.setupRealTimeUpdates();
    };

    Sidebar.prototype.setupRealTimeUpdates = function() {
        // auto-save node properties on input
        const nodeInputs = ['node_name', 'python_file'];
        nodeInputs.forEach(inputId => {
            const input = document.getElementById(inputId);
            if (input) {
                input.addEventListener('input', () => {
                    this.debounceNodeSave();
                });
            }
        });

        // auto-save group properties
        const groupInputs = ['group_name', 'group_description'];
        groupInputs.forEach(inputId => {
            const input = document.getElementById(inputId);
            if (input) {
                input.addEventListener('input', () => {
                    this.debounceGroupSave();
                });
            }
        });
    };

    Sidebar.prototype.debounceNodeSave = function() {
        clearTimeout(this.nodeSaveTimeout);
        this.nodeSaveTimeout = setTimeout(() => {
            this.saveNodeProperties();
        }, 1000);
    };

    Sidebar.prototype.debounceGroupSave = function() {
        clearTimeout(this.groupSaveTimeout);
        this.groupSaveTimeout = setTimeout(() => {
            this.saveGroupProperties();
        }, 1000);
    };

    Sidebar.prototype.showSuccess = function(message) {
        this.state.emit('statusUpdate', message);
        this.flashStatusBar(message, 'success');
    };

    Sidebar.prototype.showError = function(message) {
        this.state.emit('statusUpdate', `error: ${message}`);
        this.flashStatusBar(message, 'error');
    };

    Sidebar.prototype.showWarning = function(message) {
        this.state.emit('statusUpdate', `warning: ${message}`);
        this.flashStatusBar(message, 'info');
    };

    Sidebar.prototype.flashStatusBar = function(message, type = 'info') {
        const statusElement = document.getElementById('status_text');
        const statusBar = document.querySelector('.status_bar');
        if (!statusElement || !statusBar) return;

        // capture default text once
        if (!this._defaultStatusTextCaptured) {
            this._defaultStatusText = statusElement.textContent || 'ready';
            this._defaultStatusTextCaptured = true;
        }

        // set message
        statusElement.textContent = message;

        // choose subtle background based on type
        const originalBg = statusBar.style.backgroundColor;
        let bgColor = 'var(--surface-color)';
        if (type === 'success') {
            bgColor = '#0e2a16';
        } else if (type === 'error') {
            bgColor = '#2A0E0E';
        }
        statusBar.style.backgroundColor = bgColor;

        // reset after a short delay
        if (this._statusResetTimeout) {
            clearTimeout(this._statusResetTimeout);
        }
        this._statusResetTimeout = setTimeout(() => {
            statusBar.style.backgroundColor = originalBg || 'var(--surface-color)';
            statusElement.textContent = '';
            this._statusResetTimeout = null;
        }, 3000);
    };
})();


