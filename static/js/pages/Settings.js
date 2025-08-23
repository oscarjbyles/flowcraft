// dedicated settings page functionality
class Settings {
    constructor() {
        this.urlManager = new URLManager();
        this.initializeSettingsSidebar();
        this.initializeFormHandlers();
        this.loadSettingsData();
        this.initializeBackupsTable();
    }

    // initialize settings sidebar navigation
    initializeSettingsSidebar() {
        const sidebarItems = document.querySelectorAll('.settings_sidebar_item');
        const settingsSections = document.querySelectorAll('.settings_section');

        sidebarItems.forEach(item => {
            item.addEventListener('click', () => {
                const targetSection = item.getAttribute('data-section');
                
                // update active states
                sidebarItems.forEach(btn => btn.classList.remove('active'));
                item.classList.add('active');
                
                // show target section, hide others
                settingsSections.forEach(section => {
                    if (section.id === targetSection) {
                        section.classList.add('active');
                    } else {
                        section.classList.remove('active');
                    }
                });
            });
        });
    }

    // initialize form handlers for settings
    initializeFormHandlers() {
        // cache editor dropdown elements
        this.defaultEditorInput = document.getElementById('default_editor_input');
        this.defaultEditorDropdown = document.getElementById('default_editor_dropdown');

        // wire clear history button (files only)
        const clearBtn = document.getElementById('clear_history_btn');
        if (clearBtn) {
            clearBtn.addEventListener('click', async () => {
                try {
                    const current = this.getCurrentFlowchart();
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
                    const current = this.getCurrentFlowchart();
                    const resp = await fetch('/api/history/clear_all', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ flowchart_name: current })
                    });
                    const data = await resp.json();
                    if (data.status === 'success') {
                        this.showSuccess(data.message || 'executions and history cleared');
                    } else {
                        this.showError(data.message || 'failed to clear executions and history');
                    }
                } catch (err) {
                    this.showError('error clearing executions and history');
                }
            });
        }

        // wire project root copy button and load project root path
        const projectRootBtn = document.getElementById('copy_project_root_btn');
        const projectRootPath = document.getElementById('project_root_path');
        
        const loadProjectRoot = async () => {
            if (!projectRootPath) return;
            try {
                const resp = await fetch('/api/project-root');
                const data = await resp.json();
                if (data.status === 'success') {
                    projectRootPath.textContent = data.root || '-';
                } else {
                    projectRootPath.textContent = data.message || 'failed to load';
                }
            } catch (err) {
                projectRootPath.textContent = 'error loading path';
            }
        };
        
        loadProjectRoot();
        
        if (projectRootBtn && projectRootPath) {
            projectRootBtn.addEventListener('click', async () => {
                try {
                    await navigator.clipboard.writeText(projectRootPath.textContent || '');
                    this.showSuccess('copied');
                } catch (_) {
                    this.showError('failed to copy');
                }
            });
        }

        // wire flowchart file path copy button
        const flowPathEl = document.getElementById('flowchart_file_path');
        const flowCopyBtn = document.getElementById('copy_flowchart_file_btn');
        const refreshFlowPath = async () => {
            if (!flowPathEl) return;
            try {
                const current = this.getCurrentFlowchart();
                if (!current) { flowPathEl.textContent = '-'; return; }
                const resp = await fetch('/api/flowcharts');
                const data = await resp.json();
                if (data.status === 'success' && Array.isArray(data.flowcharts)) {
                    const match = data.flowcharts.find(f => f.filename === current);
                    flowPathEl.textContent = (match && match.path) ? match.path : '-';
                } else {
                    flowPathEl.textContent = 'failed to load';
                }
            } catch (_) {
                flowPathEl.textContent = 'error loading path';
            }
        };
        refreshFlowPath();
        if (flowCopyBtn && flowPathEl) {
            flowCopyBtn.addEventListener('click', async () => {
                try {
                    await navigator.clipboard.writeText(flowPathEl.textContent || '');
                    this.showSuccess('copied');
                } catch (_) {
                    this.showError('failed to copy');
                }
            });
        }

        // wire rename flowchart functionality
        const renameInput = document.getElementById('rename_flowchart_input');
        const renameBtn = document.getElementById('rename_flowchart_btn');
        if (renameInput && renameBtn) {
            renameBtn.addEventListener('click', async () => {
                const newName = renameInput.value.trim();
                if (!newName) {
                    this.showError('please enter a name');
                    return;
                }
                try {
                    const current = this.getCurrentFlowchart();
                    if (!current) {
                        this.showError('no flowchart selected');
                        return;
                    }
                    const resp = await fetch('/api/flowcharts/rename', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ 
                            old_name: current,
                            new_name: newName 
                        })
                    });
                    const data = await resp.json();
                    if (data.status === 'success') {
                        this.showSuccess('flowchart renamed');
                        renameInput.value = '';
                    } else {
                        this.showError(data.message || 'failed to rename flowchart');
                    }
                } catch (err) {
                    this.showError('error renaming flowchart');
                }
            });
        }

        // initialize editor dropdown functionality
        this.initializeEditorDropdown();
    }

    // initialize editor dropdown
    initializeEditorDropdown() {
        if (!this.defaultEditorInput || !this.defaultEditorDropdown) return;

        // load saved preference from localstorage
        const saved = localStorage.getItem('flowcraft_default_editor');
        if (saved) {
            try {
                const parsed = JSON.parse(saved);
                this.defaultEditorInput.value = parsed.name || '';
            } catch (_) {
                // ignore invalid saved data
            }
        }

        // scan for installed editors
        this.fetchInstalledEditors();

        // wire dropdown interactions
        this.defaultEditorInput.addEventListener('click', () => {
            this.defaultEditorDropdown.classList.toggle('active');
        });

        // close dropdown when clicking outside
        document.addEventListener('click', (e) => {
            if (!this.defaultEditorInput.contains(e.target) && !this.defaultEditorDropdown.contains(e.target)) {
                this.defaultEditorDropdown.classList.remove('active');
            }
        });
    }

    // fetch installed editors
    async fetchInstalledEditors() {
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
    }

    // render editors dropdown
    renderEditorsDropdown(editors) {
        if (!Array.isArray(editors) || editors.length === 0) {
            this.defaultEditorDropdown.innerHTML = '<div class="dropdown_no_results">no editors found</div>';
            return;
        }
        const items = editors.map(ed => `
            <div class="dropdown_item" data-name="${ed.name}" data-path="${ed.path}">
                <div class="dropdown_item_content">
                    <div class="dropdown_item_name">${ed.name.charAt(0).toUpperCase() + ed.name.slice(1).toLowerCase()}</div>
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
    }

    // set default editor
    setDefaultEditor(editor) {
        this.defaultEditorInput.value = editor.name;
        this.defaultEditorInput.dataset.path = editor.path || '';
        localStorage.setItem('flowcraft_default_editor', JSON.stringify(editor));
        this.showSuccess(`default editor set to ${editor.name}`);
    }

    // close editor dropdown
    closeEditorDropdown() {
        this.defaultEditorDropdown.classList.remove('show');
    }

    // load settings data
    loadSettingsData() {
        // refresh data when settings page loads
        try { this.loadAndRenderBackups && this.loadAndRenderBackups(); } catch (_) {}
    }

    // initialize backups table
    initializeBackupsTable() {
        const tableBody = document.getElementById('backups_table_body');
        if (!tableBody) return;
        const current = this.getCurrentFlowchart();

        const formatTimeAgo = (isoOrReadable) => {
            try {
                // parse 'YYYY-MM-DD HH:MM:SS' as local time (not utc) for accurate diff
                let d;
                if (typeof isoOrReadable === 'string' && isoOrReadable.includes(' ')) {
                    const [ds, ts] = isoOrReadable.split(' ');
                    const [y, m, da] = ds.split('-').map(n => parseInt(n, 10));
                    const [hh, mm, ss] = ts.split(':').map(n => parseInt(n, 10));
                    d = new Date(y, (m || 1) - 1, da || 1, hh || 0, mm || 0, ss || 0, 0);
                } else if (typeof isoOrReadable === 'string') {
                    d = new Date(isoOrReadable);
                } else {
                    return '';
                }
                const now = new Date();
                let diff = Math.max(0, Math.floor((now.getTime() - d.getTime()) / 1000));
                const days = Math.floor(diff / 86400); diff -= days * 86400;
                const hours = Math.floor(diff / 3600); diff -= hours * 3600;
                const minutes = Math.floor(diff / 60); diff -= minutes * 60;
                const seconds = diff;
                const parts = [];
                if (days > 0) parts.push(days + ' day');
                if (hours > 0) parts.push(hours + ' hou');
                if (minutes > 0) parts.push(minutes + ' min');
                if (seconds > 0 || parts.length === 0) parts.push(seconds + ' sec');
                return parts.join(', ');
            } catch (_) { return ''; }
        };

        const renderRows = (activeData, backups, showAll = false) => {
            const max = 10;
            const slice = showAll ? backups : backups.slice(0, max);
            const rows = [];

            // active row under headers
            const activeNodes = (activeData?.nodes || []).length;
            const activeLinks = (activeData?.links || []).length;
            const activeGroups = (activeData?.groups || []).length;
            rows.push(`
                <tr class="backups_active_row">
                    <td colspan="3">${this.escapeHTML('active flowchart')}</td>
                    <td>${activeNodes}</td>
                    <td>${activeLinks}</td>
                    <td>${activeGroups}</td>
                    <td></td>
                    <td></td>
                </tr>
                `);

            // backup rows
            for (const b of slice) {
                const dt = (b.date_readable || b.timestamp || '').split(' ');
                const dateStr = dt.length >= 2 ? dt[0] : '';
                const timeStr = dt.length >= 2 ? dt[1] : (dt[0] || '');
                const agoStr = formatTimeAgo(b.date_readable || b.timestamp || '');
                rows.push(`
                    <tr data-timestamp="${this.escapeHTML(b.timestamp)}">
                        <td>${this.escapeHTML(timeStr)}</td>
                        <td>${this.escapeHTML(agoStr)}</td>
                        <td>${this.escapeHTML(dateStr)}</td>
                        <td class="col_nodes">${b.nodes}</td>
                        <td class="col_connections">${b.links}</td>
                        <td class="col_groups">${b.groups}</td>
                        <td class="col_delete">
                            <div class="cell_actions">
                                <button class="btn btn_secondary btn_inline js_delete_backup" title="delete">Delete</button>
                            </div>
                        </td>
                        <td class="col_restore">
                            <div class="cell_actions">
                                <button class="btn btn_primary btn_inline js_restore_backup" title="restore">Restore</button>
                            </div>
                        </td>
                    </tr>
                    `);
            }

            // show more row if needed
            if (!showAll && backups.length > max) {
                rows.push(`
                    <tr>
                        <td colspan="8" class="backups_show_more" style="text-align:center;">Show More</td>
                    </tr>
                    `);
            }

            tableBody.innerHTML = rows.join('');

            // wire actions
            tableBody.querySelectorAll('.js_delete_backup').forEach(btn => {
                btn.addEventListener('click', async (e) => {
                    const tr = e.currentTarget.closest('tr');
                    const ts = tr?.dataset?.timestamp;
                    if (!ts) return;
                    try {
                        const url = `/api/flowchart/backups/${encodeURIComponent(ts)}?name=${encodeURIComponent(current)}`;
                        const resp = await fetch(url, { method: 'DELETE' });
                        const data = await resp.json();
                        if (data.status === 'success') {
                            this.showSuccess('deleted backup');
                            this.loadAndRenderBackups();
                        } else {
                            this.showError(data.message || 'failed to delete');
                        }
                    } catch (_) {
                        this.showError('error deleting');
                    }
                });
            });
            tableBody.querySelectorAll('.js_restore_backup').forEach(btn => {
                btn.addEventListener('click', async (e) => {
                    const tr = e.currentTarget.closest('tr');
                    const ts = tr?.dataset?.timestamp;
                    if (!ts) return;
                    try {
                        const url = `/api/flowchart/backups/${encodeURIComponent(ts)}/restore?name=${encodeURIComponent(current)}`;
                        const resp = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' } });
                        const data = await resp.json().catch(() => ({ status: 'error', message: 'invalid json' }));
                        if (resp.ok && data && data.status === 'success') {
                            this.showSuccess('restored backup');
                            // refresh the backups table to reflect any changes
                            try {
                                await this.loadAndRenderBackups();
                            } catch (_) {}
                        } else {
                            const msg = (data && data.message) || `failed to restore (status ${resp.status})`;
                            console.error('[backups] restore failed', { msg });
                            this.showError(msg);
                        }
                    } catch (err) {
                        console.error('[backups] restore error', err);
                        this.showError('error restoring');
                    }
                });
            });

            const showMore = tableBody.querySelector('.backups_show_more');
            if (showMore) {
                showMore.addEventListener('click', () => {
                    renderRows(activeData, backups, true);
                });
            }
        };

        this.loadAndRenderBackups = async () => {
            try {
                const name = encodeURIComponent(current);
                const resp = await fetch(`/api/flowchart/backups?name=${name}`);
                const payload = await resp.json();
                const backups = resp.ok && payload && payload.status === 'success' ? (payload.backups || []) : [];

                // load active data counts
                let activeData = null;
                try {
                    const activeResp = await fetch(`/api/flowchart?name=${name}`);
                    activeData = activeResp.ok ? await activeResp.json() : null;
                } catch (_) {}

                renderRows(activeData || { nodes: [], links: [], groups: [] }, backups, false);
            } catch (err) {
                tableBody.innerHTML = '<tr><td colspan="8" style="opacity:.7">failed to load backups</td></tr>';
                console.error('[backups] failed to load backups', err);
            }
        };

        this.loadAndRenderBackups();
    }



    // get current flowchart name
    getCurrentFlowchart() {
        return this.urlManager.getFlowchartFilenameFromURL();
    }

    // utility methods
    showSuccess(message) {
        // simple success notification - can be enhanced later
        // could add toast notification here
    }

    showError(message) {
        // simple error notification - can be enhanced later
        console.error('[Settings] Error:', message);
        // could add toast notification here
    }

    escapeHTML(str) {
        try {
            return String(str)
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#039;');
        } catch (_) { return ''; }
    }

    // api action handlers moved from EventManager.js
    handleApiAction(action, data = {}) {
        switch (action) {
            case 'build':
                this.handleBuildAction(data);
                break;
                
            case 'run':
                this.handleRunAction(data);
                break;
                
            default:
                console.warn(`unknown api action: ${action}`);
        }
    }

    async handleBuildAction(data) {
        try {
            const response = await fetch('/api/build', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });

            if (response.ok) {
                const result = await response.json();
                this.showSuccess(`build: ${result.message}`);
            } else {
                this.showError('build failed');
            }
        } catch (error) {
            console.error('build error:', error);
            this.showError('build error');
        }
    }

    async handleRunAction(data) {
        try {
            const response = await fetch('/api/run', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });

            if (response.ok) {
                const result = await response.json();
                this.showSuccess(`run: ${result.message}`);
            } else {
                this.showError('run failed');
            }
        } catch (error) {
            console.error('run error:', error);
            this.showError('run error');
        }
    }
}

// export for use in other modules
window.Settings = Settings;
