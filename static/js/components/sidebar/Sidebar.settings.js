// settings-related sidebar methods
(function(){
    if (!window.Sidebar) return;

    Sidebar.prototype.initializeSettings = function() {
        // cache editor dropdown elements
        this.defaultEditorInput = document.getElementById('default_editor_input');
        this.defaultEditorDropdown = document.getElementById('default_editor_dropdown');

        // wire clear history button (files only)
        const clearBtn = document.getElementById('clear_history_btn');
        if (clearBtn) {
            clearBtn.addEventListener('click', async () => {
                try {
                    const current = this.state?.storage?.getCurrentFlowchart ? this.state.storage.getCurrentFlowchart() : 'default.json';
                    const resp = await fetch('/api/history/clear', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ flowchart_name: current })
                    });
                    const data = await resp.json();
                    if (data.status === 'success') {
                        this.showSuccess(data.message || 'history cleared');
                    } else {
                        this.showError(data.message || 'failed to clear history');
                    }
                } catch (err) {
                    this.showError('error clearing history');
                }
            });
        }

        // wire clear executions + history button (resets executions key and removes history files)
        const clearAllBtn = document.getElementById('clear_executions_btn');
        if (clearAllBtn) {
            clearAllBtn.addEventListener('click', async () => {
                try {
                    const current = this.state?.storage?.getCurrentFlowchart ? this.state.storage.getCurrentFlowchart() : 'default.json';
                    const resp = await fetch('/api/history/clear-all', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ flowchart_name: current })
                    });
                    const data = await resp.json();
                    if (data.status === 'success') {
                        this.showSuccess(data.message || 'executions cleared');
                        // refresh dashboard kpis if present
                        try { window.location.reload(); } catch (_) {}
                    } else {
                        this.showError(data.message || 'failed to clear executions');
                    }
                } catch (err) {
                    this.showError('error clearing executions');
                }
            });
        }

        // fetch and display project root path
        const projectRootEl = document.getElementById('project_root_path');
        const copyBtn = document.getElementById('copy_project_root_btn');
        if (projectRootEl) {
            (async () => {
                try {
                    const resp = await fetch('/api/project-root');
                    const data = await resp.json();
                    if (data.status === 'success') {
                        projectRootEl.textContent = data.root || '-';
                        if (copyBtn) {
                            copyBtn.addEventListener('click', async () => {
                                try {
                                    await navigator.clipboard.writeText(projectRootEl.textContent);
                                    this.showSuccess('copied');
                                } catch (_) {
                                    this.showError('failed to copy');
                                }
                            });
                        }
                    } else {
                        projectRootEl.textContent = data.message || 'failed to load';
                    }
                } catch (err) {
                    projectRootEl.textContent = 'error loading path';
                }
            })();
        }

        if (!this.defaultEditorInput || !this.defaultEditorDropdown) return;

        // load saved preference from localstorage
        const saved = localStorage.getItem('flowcraft_default_editor');
        if (saved) {
            try {
                const parsed = JSON.parse(saved);
                this.defaultEditorInput.value = parsed.name || parsed.path || 'custom editor';
                this.defaultEditorInput.dataset.path = parsed.path || '';
            } catch (_) {}
        }

        // fetch installed editors
        this.fetchInstalledEditors();

        // open/close behavior
        this.defaultEditorInput.addEventListener('click', (e) => {
            e.stopPropagation();
            this.toggleEditorDropdown();
        });
        document.addEventListener('click', (e) => {
            const container = this.defaultEditorInput.closest('.dropdown_container');
            if (!container.contains(e.target)) {
                this.closeEditorDropdown();
            }
        });
    };

    Sidebar.prototype.fetchInstalledEditors = async function() {
        try {
            const resp = await fetch('/api/editors');
            const data = await resp.json();
            if (data.status === 'success') {
                this.renderEditorsDropdown(data.editors);
                // if no saved value, prefill first editor
                if (!this.defaultEditorInput.value && data.editors.length > 0) {
                    this.setDefaultEditor(data.editors[0]);
                }
            } else {
                this.defaultEditorDropdown.innerHTML = '<div class="dropdown_no_results">failed to detect editors</div>';
            }
        } catch (err) {
            this.defaultEditorDropdown.innerHTML = '<div class="dropdown_no_results">error detecting editors</div>';
        }
    };

    Sidebar.prototype.renderEditorsDropdown = function(editors) {
        if (!Array.isArray(editors) || editors.length === 0) {
            this.defaultEditorDropdown.innerHTML = '<div class="dropdown_no_results">no editors found</div>';
            return;
        }
        const items = editors.map(ed => `
            <div class="dropdown_item" data-name="${ed.name}" data-path="${ed.path}">
                <div class="dropdown_item_content">
                    <div class="dropdown_item_name">${ed.name}</div>
                    <div class="dropdown_item_meta" style="opacity:.7; font-size:.75rem;">${ed.path}</div>
                </div>
            </div>
        `).join('');
        this.defaultEditorDropdown.innerHTML = items;
        this.defaultEditorDropdown.querySelectorAll('.dropdown_item').forEach(item => {
            item.addEventListener('click', () => {
                this.setDefaultEditor({ name: item.dataset.name, path: item.dataset.path });
                this.closeEditorDropdown();
            });
        });
    };

    Sidebar.prototype.setDefaultEditor = function(editor) {
        this.defaultEditorInput.value = editor.name;
        this.defaultEditorInput.dataset.path = editor.path || '';
        localStorage.setItem('flowcraft_default_editor', JSON.stringify(editor));
        this.showSuccess(`default editor set to ${editor.name}`);
    };

    Sidebar.prototype.toggleEditorDropdown = function() {
        this.defaultEditorDropdown.classList.toggle('show');
    };

    Sidebar.prototype.closeEditorDropdown = function() {
        this.defaultEditorDropdown.classList.remove('show');
    };
})();


