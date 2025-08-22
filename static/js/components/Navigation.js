(function(){
    'use strict';

    // consolidated navigation module for all pages
    // comments are lowercase per project convention

    // shared utilities (defined once)
    function onDomReady(fn){
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn); else fn();
    }

    function getUrlManager(){
        try { return new URLManager(); } catch(_) { return null; }
    }

    function buildHref(path){
        const urlMgr = getUrlManager();
        if (urlMgr && typeof urlMgr.buildUrlPreserveContext === 'function') {
            return urlMgr.buildUrlPreserveContext(path);
        }
        const u = new URL(path, window.location.origin);
        return u.pathname + (u.search ? u.search : '');
    }

    function clearRunVisualsIfNeeded(app){
        try {
            if (!app || !app.state) return;
            if (app.state.isRunMode) {
                if (typeof app.clearRunModeState === 'function') app.clearRunModeState();
                else if (app.nodeStateManager && typeof app.nodeStateManager.clearAllNodeColorState === 'function') app.nodeStateManager.clearAllNodeColorState();
                else if (typeof app.clearAllNodeColorState === 'function') app.clearAllNodeColorState();
            }
        } catch(_) {}
    }

    function setActiveNav(){
        const path = window.location.pathname;
        const ids = ['dashboard_btn','build_btn','scripts_btn','run_btn','export_btn','data_matrix_btn'];
        ids.forEach(id => { const el = document.getElementById(id); if (el){ el.classList.remove('active'); el.classList.remove('run_mode_active'); }});
        const map = { '/dashboard':'dashboard_btn', '/scripts':'scripts_btn', '/data':'data_matrix_btn' };
        const id = map[path];
        const el = id ? document.getElementById(id) : null;
        if (el) el.classList.add('active');
    }

    // consolidated url context management
    function withFlowchart(path) {
        const urlMgr = getUrlManager();
        if (urlMgr && typeof urlMgr.buildUrlPreserveContext === 'function') {
            return urlMgr.buildUrlPreserveContext(path);
        }
        const u = new URL(path, window.location.origin);
        const params = new URLSearchParams(window.location.search);
        // preserve mode if present; default to build
        const mode = params.get('mode') || 'build';
        if (!u.searchParams.get('mode')) u.searchParams.set('mode', mode);
        // preserve display flowchart param for dashboard/scripts/builder
        const display = params.get('flowchart');
        if (display && (u.pathname === '/' || u.pathname === '/dashboard' || u.pathname === '/scripts')) {
            u.searchParams.set('flowchart', display);
        }
        // preserve filename for data matrix
        const filename = params.get('flowchart_name');
        if (filename && u.pathname === '/data') {
            u.searchParams.set('flowchart_name', filename);
        }
        return u.pathname + (u.search ? u.search : '');
    }

    // flowchart utilities
    function preventSpaces(input){
        if (!input) return;
        input.addEventListener('keypress', (e) => { 
            if (e.key === ' ') {
                e.preventDefault();
                const start = input.selectionStart;
                const end = input.selectionEnd;
                const value = input.value;
                input.value = value.substring(0, start) + '_' + value.substring(end);
                input.selectionStart = input.selectionEnd = start + 1;
            }
        });
        input.addEventListener('paste', (e) => {
            const txt = (e.clipboardData || window.clipboardData).getData('text');
            if (txt.includes(' ')) {
                e.preventDefault();
                const cleanText = txt.replace(/ /g, '_');
                const start = input.selectionStart;
                const end = input.selectionEnd;
                const value = input.value;
                input.value = value.substring(0, start) + cleanText + value.substring(end);
                input.selectionStart = input.selectionEnd = start + cleanText.length;
            }
        });
    }

    function fetchFlowcharts(){
        return fetch('/api/flowcharts').then(r => r.json()).catch(() => ({ status:'error', flowcharts: [] }));
    }

    function renderDropdown(dropdownEl, items){
        if (!dropdownEl) return;
        if (!Array.isArray(items) || items.length === 0) {
            dropdownEl.innerHTML = '<div class="dropdown_no_results">no flowcharts found</div>';
            return;
        }
        dropdownEl.innerHTML = items.map(f => `
            <div class="dropdown_item" data-filename="${f.filename}" data-name="${f.name}">
                <div class="dropdown_item_content">
                    <div class="dropdown_item_name">${f.name}</div>
                </div>
                <button class="dropdown_delete_btn" data-filename="${f.filename}" data-name="${f.name}" title="delete flowchart">
                    <span class="material-icons">delete</span>
                </button>
            </div>
        `).join('');
    }

    function closeDropdown(dropdown){ if (dropdown) dropdown.classList.remove('show'); }

    // data matrix utilities
    function el(tag, cls, html){ 
        const e = document.createElement(tag); 
        if(cls) e.className = cls; 
        if(html !== undefined) e.innerHTML = html; 
        return e; 
    }

    function formatTimestamp(timestamp) {
        if (!timestamp || timestamp === '-') return '-';
        try {
            const date = new Date(timestamp);
            if (isNaN(date.getTime())) return timestamp;
            
            const now = new Date();
            const diffMs = now - date;
            const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
            const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
            const diffMinutes = Math.floor(diffMs / (1000 * 60));
            
            const options = { 
                month: 'short', 
                day: 'numeric', 
                hour: '2-digit', 
                minute: '2-digit',
                hour12: true
            };
            const formattedDate = date.toLocaleDateString('en-US', options);
            
            if (diffMinutes < 1) {
                return `${formattedDate} (just now)`;
            } else if (diffMinutes < 60) {
                return `${formattedDate} (${diffMinutes}m ago)`;
            } else if (diffHours < 24) {
                return `${formattedDate} (${diffHours}h ago)`;
            } else if (diffDays < 7) {
                return `${formattedDate} (${diffDays}d ago)`;
            } else {
                return formattedDate;
            }
        } catch (e) {
            return timestamp;
        }
    }

    // page-specific initialization
    function initializePage() {
        const path = window.location.pathname;
        
        if (path === '/dashboard') {
            initializeDashboardPage();
        } else if (path === '/settings') {
            initializeSettingsPage();
        } else if (path === '/data') {
            initializeDataMatrixPage();
        }
    }

    function initializeDashboardPage() {
        onDomReady(() => {
            if (typeof Dashboard !== 'undefined') {
                try {
                    new Dashboard();
                    console.log('Dashboard initialized successfully');
                } catch (error) {
                    console.error('Error initializing Dashboard:', error);
                }
            } else {
                console.error('Dashboard class not found');
            }
        });
    }

    function initializeSettingsPage() {
        onDomReady(() => {
            // settings back link
            const backLink = document.querySelector('[data-back-link]');
            if (backLink) {
                backLink.addEventListener('click', (e) => {
                    e.preventDefault();
                    window.location.href = withFlowchart('/');
                });
            }
            
            if (typeof Settings !== 'undefined') {
                try {
                    new Settings();
                    console.log('Settings initialized successfully');
                } catch (error) {
                    console.error('Error initializing Settings:', error);
                }
            } else {
                console.error('Settings class not found');
            }
        });
    }

    function initializeDataMatrixPage() {
        onDomReady(async () => {
            try { console.log('[dm] init data matrix page'); } catch(_) {}
            
            const container = document.getElementById('dm_content');
            if (!container) { 
                try { console.warn('[dm] container #dm_content not found'); } catch(_) {} 
                return;
            }

            // unify flowchart context from url
            const params = new URLSearchParams(window.location.search);
            const modeParam = params.get('mode') || 'build';
            const flowNameParam = params.get('flowchart');
            const flowFileParam = params.get('flowchart_name');
            const flowDisplay = (flowNameParam || (flowFileParam ? flowFileParam.replace(/\.json$/i, '') : 'default'));
            const flowFilename = (flowFileParam || `${flowDisplay}.json`);

            // fetch latest history for current flowchart
            let data;
            try {
                const res = await fetch(`/api/history?flowchart_name=${encodeURIComponent(flowFilename)}`);
                data = await res.json();
            } catch (err) {
                try { console.error('[dm] /api/history fetch failed', err); } catch(_) {}
                container.appendChild(el('div','dm_error','failed to load history (network error)'));
                return;
            }
            
            if (!data || data.status !== 'success') {
                try { console.warn('[dm] history api returned non-success', data); } catch(_) {}
                container.appendChild(el('div','dm_error','failed to load history'));
                return;
            }

            const executions = data.history || [];
            if (executions.length === 0) {
                container.appendChild(el('div','dm_empty','no executions yet'));
                return;
            }

            // helper to fetch full execution details
            async function fetchDetails(executionId){
                try {
                    const resp = await fetch(`/api/history/${executionId}?flowchart_name=${encodeURIComponent(flowFilename)}`);
                    const json = await resp.json();
                    if (json && json.status === 'success') return json.execution;
                } catch (e) {
                    try { console.error('[dm] details fetch error', e); } catch(_) {}
                }
                return null;
            }

            // render execution rows with detailed data
            const detailPromises = executions.map(exec => fetchDetails(exec.execution_id));
            const details = await Promise.all(detailPromises);
            
            executions.forEach((exec, idx) => {
                const row = el('div','dm_row');
                const left = el('div','dm_left');
                const statusBadge = exec.status === 'success' ? 'success' : (exec.status === 'failed' ? 'failed' : 'info');
                
                // header row with status and actions
                const headerRow = el('div','dm_left_header');
                const statusEl = el('div',`dm_status dm_status_${statusBadge}`, exec.status || 'unknown');
                headerRow.appendChild(statusEl);

                const actions = el('div','dm_actions_row');
                const viewBtn = el('button','btn btn_secondary dm_row_btn','<span class="material-icons u_icon_18">visibility</span><span class="btn_label">View</span>');
                const delBtn = el('button','btn btn_secondary btn_danger_subtle dm_row_btn','<span class="material-icons u_icon_18">delete</span><span class="btn_label">Delete</span>');
                actions.appendChild(viewBtn);
                actions.appendChild(delBtn);
                headerRow.appendChild(actions);
                left.appendChild(headerRow);

                // wire buttons
                viewBtn.addEventListener('click', () => {
                    const url = new URL('/', window.location.origin);
                    if (flowDisplay && flowDisplay !== 'default') url.searchParams.set('flowchart', flowDisplay);
                    url.searchParams.set('mode', 'run');
                    url.searchParams.set('executionId', exec.execution_id);
                    window.location.href = url.pathname + '?' + url.searchParams.toString();
                });
                
                delBtn.addEventListener('click', async () => {
                    if (!confirm('delete this execution from history?')) return;
                    try {
                        const resp = await fetch(`/api/history/${exec.execution_id}?flowchart_name=${encodeURIComponent(flowFilename)}`, { method: 'DELETE' });
                        const json = await resp.json();
                        if (json && json.status === 'success') {
                            window.location.reload();
                        } else {
                            alert('failed to delete execution');
                        }
                    } catch(e) {
                        alert('error deleting execution');
                    }
                });

                // stats with icons
                const stats = el('div','dm_stats');
                function stat(iconName, label, value){
                    const s = el('div','dm_stat');
                    const ic = el('span','material-icons dm_stat_icon', iconName);
                    const txt = el('div','dm_stat_text');
                    txt.appendChild(el('div','dm_stat_label', label));
                    txt.appendChild(el('div','dm_stat_value', value));
                    s.appendChild(ic);
                    s.appendChild(txt);
                    return s;
                }
                
                const nodesText = `${exec.successful_nodes || 0} / ${exec.total_nodes || 0}`;
                stats.appendChild(stat('timeline','nodes', nodesText));
                stats.appendChild(stat('check_circle','success %', String(exec.success_percentage ?? 0) + '%'));
                stats.appendChild(stat('schedule','elapsed', exec.execution_time || '-'));
                const runAtDisplay = formatTimestamp(exec.timestamp);
                stats.appendChild(stat('event','run at', runAtDisplay));
                if (exec.status === 'failed' && exec.failed_node) {
                    stats.appendChild(stat('error','failed node', exec.failed_node));
                }
                left.appendChild(stats);

                // build data table and other UI elements here...
                const right = el('div','dm_right');
                // ... data table implementation would continue here
                
                row.appendChild(left);
                row.appendChild(right);
                container.appendChild(row);
            });

            // update status bar with execution count
            const executionCount = executions.length;
            const statusText = document.getElementById('status_text');
            if (statusText) {
                statusText.textContent = `${executionCount} execution${executionCount !== 1 ? 's' : ''}`;
            }

            // wire clear history button
            const clearBtn = document.getElementById('clear_history_status_btn');
            if (clearBtn) {
                clearBtn.style.display = '';
                clearBtn.addEventListener('click', async () => {
                    if (!confirm('clear all executions for this flowchart?')) return;
                    try {
                        clearBtn.disabled = true;
                        if (statusText) statusText.textContent = 'clearing…';
                        const resp = await fetch('/api/history/clear', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ flowchart_name: flowFilename })
                        });
                        const json = await resp.json();
                        if (json && json.status === 'success') {
                            window.location.reload();
                        } else {
                            alert(json && json.message ? json.message : 'failed to clear history');
                            clearBtn.disabled = false;
                            if (statusText) statusText.textContent = `${executionCount} execution${executionCount !== 1 ? 's' : ''}`;
                        }
                    } catch (e) {
                        alert('error clearing history');
                        clearBtn.disabled = false;
                        if (statusText) statusText.textContent = `${executionCount} execution${executionCount !== 1 ? 's' : ''}`;
                    }
                });
            }
        });
    }

    // flowchart ui setup
    function setupFlowchartUI(app){
        onDomReady(async () => {
            try { console.log('[nav-flow] setup start', { path: window.location.pathname, hasApp: !!app }); } catch(_) {}
            const urlMgr = getUrlManager();
            const selector = document.getElementById('flowchart_selector');
            const dropdown = document.getElementById('flowchart_dropdown');
            const arrow = selector ? selector.parentElement && selector.parentElement.querySelector('.dropdown_arrow') : null;
            const createBtn = document.getElementById('create_flowchart_btn');
            const createModal = document.getElementById('create_flowchart_modal');
            const cancelCreate = document.getElementById('cancel_create_flowchart');
            const confirmCreate = document.getElementById('confirm_create_flowchart');
            const nameInput = document.getElementById('new_flowchart_name');

            // initialize selector value from url/localstorage
            try {
                const currentDisplay = urlMgr ? urlMgr.getFlowchartDisplayNamePreferred() : 'default';
                if (selector) selector.value = currentDisplay || '';
            } catch(_) {}

            // dropdown open/close (input and arrow)
            if (selector) {
                const toggle = (e) => { e.stopPropagation(); if (dropdown) dropdown.classList.toggle('show'); };
                selector.addEventListener('click', toggle);
                if (arrow) arrow.addEventListener('click', toggle);
                document.addEventListener('click', (e) => {
                    const container = selector.closest('.dropdown_container');
                    if (container && !container.contains(e.target)) closeDropdown(dropdown);
                });
            }

            // populate dropdown
            try {
                const data = await fetchFlowcharts();
                const flows = Array.isArray(data.flowcharts) ? data.flowcharts : [];
                renderDropdown(dropdown, flows);
                // wire selection
                if (dropdown && !dropdown._delegated) {
                    dropdown.addEventListener('click', async (e) => {
                        const deleteBtn = e.target && e.target.closest ? e.target.closest('.dropdown_delete_btn') : null;
                        const item = e.target && e.target.closest ? e.target.closest('.dropdown_item') : null;
                        if (!item) return;
                        const filename = item.getAttribute('data-filename');
                        const display = item.getAttribute('data-name');
                        if (deleteBtn) {
                            e.stopPropagation();
                            if (!confirm(`are you sure you want to delete the flowchart "${display}"? this action cannot be undone.`)) return;
                            try {
                                const resp = await fetch(`/api/flowcharts/${encodeURIComponent(filename)}`, { method: 'DELETE' });
                                const json = await resp.json();
                                if (!resp.ok) { alert((json && json.message) || 'error deleting flowchart'); return; }
                                const fresh = await fetchFlowcharts();
                                renderDropdown(dropdown, Array.isArray(fresh.flowcharts) ? fresh.flowcharts : []);
                            } catch(_) { alert('error deleting flowchart'); }
                            return;
                        }
                        try { urlMgr && urlMgr.setLastAccessedFlowchart(filename); } catch(_) {}
                        if (selector) selector.value = display || '';
                        closeDropdown(dropdown);
                        const path = window.location.pathname;
                        if (path === '/data') {
                            const u = new URL('/data', window.location.origin);
                            const mode = urlMgr ? urlMgr.getMode() : 'build';
                            u.searchParams.set('flowchart_name', filename);
                            u.searchParams.set('mode', mode);
                            window.location.href = u.pathname + '?' + u.searchParams.toString();
                        } else if (path === '/scripts') {
                            const u = new URL('/scripts', window.location.origin);
                            u.searchParams.set('flowchart', display);
                            const mode = (new URLSearchParams(window.location.search)).get('mode') || 'build';
                            u.searchParams.set('mode', mode);
                            window.location.href = u.pathname + '?' + u.searchParams.toString();
                        } else if (path === '/dashboard') {
                            const u = new URL('/dashboard', window.location.origin);
                            const mode = urlMgr ? urlMgr.getMode() : 'build';
                            u.searchParams.set('flowchart', display);
                            u.searchParams.set('mode', mode);
                            window.location.href = u.pathname + '?' + u.searchParams.toString();
                        } else {
                            if (app && app.state && app.state.storage && typeof app.state.storage.setCurrentFlowchart === 'function') {
                                try {
                                    const currentMode = app.state.currentMode || 'build';
                                    if (currentMode === 'run' || currentMode === 'build' || currentMode === 'settings') {
                                        try {
                                            if (typeof app.clearRunModeState === 'function') {
                                                app.clearRunModeState();
                                            }
                                        } catch (clearError) {
                                            console.warn('[nav-flow] failed to clear execution state:', clearError);
                                        }
                                    }
                                    
                                    if (app.state.saving) app.state.saving.save(true).then(() => {
                                        app.state.storage.setCurrentFlowchart(filename);
                                        return app.state.saving ? app.state.saving.load() : { success: false, message: 'saving not initialized' };
                                    }).then(() => {
                                        try { urlMgr && urlMgr.updateFlowchartInURL(filename); } catch(_) {}
                                    }).catch(() => {});
                                } catch(_) {}
                            } else {
                                const u = new URL('/', window.location.origin);
                                u.searchParams.set('flowchart', display);
                                const mode = (new URLSearchParams(window.location.search)).get('mode') || 'build';
                                u.searchParams.set('mode', mode);
                                window.location.href = u.pathname + '?' + u.searchParams.toString();
                            }
                        }
                    });
                    dropdown._delegated = true;
                }
            } catch(_) {}

            // create modal wiring using centralized modal manager
            if (createBtn) createBtn.addEventListener('click', (e) => { 
                e.preventDefault(); 
                if (nameInput) {
                    nameInput.value = '';
                }
                ModalManager.open('create_flowchart_modal');
            });
            if (cancelCreate) cancelCreate.addEventListener('click', () => { 
                ModalManager.close('create_flowchart_modal'); 
            });
            if (confirmCreate) {
                confirmCreate.addEventListener('click', async () => {
                    const raw = (nameInput && nameInput.value ? nameInput.value : '').trim();
                    if (!raw) { alert('flowchart name is required'); return; }
                    try {
                        const resp = await fetch('/api/flowcharts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: raw }) });
                        const data = await resp.json();
                        if (data && data.status === 'success' && data.flowchart) {
                            ModalManager.close('create_flowchart_modal');
                            const list = await fetchFlowcharts();
                            renderDropdown(dropdown, Array.isArray(list.flowcharts) ? list.flowcharts : []);
                            if (selector) selector.value = data.flowchart.name;
                            const path = window.location.pathname;
                            if (path === '/data') {
                                const u = new URL('/data', window.location.origin);
                                const mode = urlMgr ? urlMgr.getMode() : 'build';
                                u.searchParams.set('flowchart_name', data.flowchart.filename);
                                u.searchParams.set('mode', mode);
                                try { urlMgr && urlMgr.setLastAccessedFlowchart(data.flowchart.filename); } catch(_) {}
                                window.history.replaceState(null, '', u.pathname + '?' + u.searchParams.toString());
                            } else if (path === '/dashboard') {
                                const target = (urlMgr && typeof urlMgr.buildUrlPreserveContext === 'function')
                                    ? urlMgr.buildUrlPreserveContext('/dashboard', { display: data.flowchart.name })
                                    : '/dashboard';
                                window.location.href = target;
                            } else if (path === '/scripts') {
                                const params2 = new URLSearchParams(window.location.search);
                                params2.set('flowchart', data.flowchart.name);
                                const u = new URL(window.location.pathname, window.location.origin);
                                u.search = '?' + params2.toString();
                                window.history.replaceState(null, '', u.pathname + u.search);
                            } else {
                                try { urlMgr && urlMgr.setLastAccessedFlowchart(data.flowchart.filename); } catch(_) {}
                            }
                        } else {
                            alert((data && data.message) || 'failed to create flowchart');
                        }
                    } catch(_) { alert('error creating flowchart'); }
                });
                if (nameInput) {
                    nameInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') confirmCreate.click(); });
                    preventSpaces(nameInput);
                }
            }

            // export button handling
            const exportBtn = document.getElementById('export_btn');
            if (exportBtn) {
                exportBtn.addEventListener('click', () => {
                    if (window.flowchartApp && window.flowchartApp.sidebar && typeof window.flowchartApp.sidebar.exportCurrentFlowchart === 'function') {
                        window.flowchartApp.sidebar.exportCurrentFlowchart();
                    } else {
                        window.location.href = buildHref('/');
                    }
                });
            }

            // data matrix button handling
            const dmBtn = document.getElementById('data_matrix_btn');
            if (dmBtn) {
                dmBtn.addEventListener('click', () => {
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
                    const url = urlMgr && typeof urlMgr.buildUrlPreserveContext === 'function' 
                        ? urlMgr.buildUrlPreserveContext('/data')
                        : '/data';
                    window.location.href = url;
                });
            }
        });
    }

    // main navigation object
    const Navigation = {
        // wire left navigation buttons
        setupNavButtons(app){
            onDomReady(() => {
                console.log('[nav] setupNavButtons start', { hasApp: !!app, path: window.location.pathname });
                
                // dashboard
                const db = document.getElementById('dashboard_btn');
                if (db) db.onclick = () => { clearRunVisualsIfNeeded(app); window.location.href = withFlowchart('/dashboard'); };

                // build
                const build = document.getElementById('build_btn');
                if (build) build.onclick = () => {
                    if (app && typeof app.switchToBuildMode === 'function') {
                        try { if (app.state && app.state.isRunMode && typeof app.clearRunModeState === 'function') app.clearRunModeState(); } catch(_) {}
                        app.switchToBuildMode();
                        try { const u = new URL(window.location.href); u.searchParams.set('mode','build'); window.history.replaceState(null,'',u.pathname + '?' + u.searchParams.toString()); } catch(_) {}
                    } else {
                        window.location.href = withFlowchart('/?mode=build');
                    }
                };

                // scripts
                const scripts = document.getElementById('scripts_btn');
                if (scripts) scripts.onclick = () => { clearRunVisualsIfNeeded(app); window.location.href = withFlowchart('/scripts'); };

                // run
                const run = document.getElementById('run_btn');
                if (run) run.onclick = () => {
                    console.log('[debug] run button clicked');
                    if (app && typeof app.switchToRunMode === 'function') {
                        console.log('[debug] calling app.switchToRunMode()');
                        app.switchToRunMode();
                        try { const u = new URL(window.location.href); u.searchParams.set('mode','run'); window.history.replaceState(null,'',u.pathname + '?' + u.searchParams.toString()); } catch(_) {}
                    } else {
                        console.log('[debug] no app or switchToRunMode function, navigating to:', withFlowchart('/?mode=run'));
                        window.location.href = withFlowchart('/?mode=run');
                    }
                };

                // settings
                const settings = document.getElementById('settings_btn');
                if (settings) settings.onclick = () => { clearRunVisualsIfNeeded(app); window.location.href = withFlowchart('/settings'); };

                // export (builder handles its own export via navigation module; only handle on non-app pages)
                if (!app) {
                    const exp = document.getElementById('export_btn');
                    if (exp) exp.onclick = () => { window.location.href = withFlowchart('/'); };
                }

                // data matrix (let builder-specific handler manage clearing visuals if already present)
                if (!app) {
                    const data = document.getElementById('data_matrix_btn');
                    if (data) data.onclick = () => { window.location.href = withFlowchart('/data'); };
                }

                // highlight active nav (non-builder pages only)
                setActiveNav();
                console.log('[nav] setupNavButtons done');
            });
        },

        init(app){
            console.log('[nav] init called', { hasApp: !!app });
            this.setupNavButtons(app || (window.flowchartApp || null));
            
            // flowchart ui setup
            if (!app && window.Navigation && typeof window.Navigation.setupFlowchartUI === 'function') {
                console.log('[nav] calling setupFlowchartUI');
                window.Navigation.setupFlowchartUI(null);
            } else if (app) {
                console.log('[nav] skipping setupFlowchartUI on builder (handled by Navigation)');
            } else {
                console.warn('[nav] setupFlowchartUI not available on window.Navigation');
            }
            
            // initialize page-specific functionality
            initializePage();
            console.log('[nav] init complete');
        },

        // expose utility functions for other modules
        withFlowchart: withFlowchart,
        buildHref: buildHref,
        clearRunVisualsIfNeeded: clearRunVisualsIfNeeded,
        setupFlowchartUI: setupFlowchartUI
    };

    window.Navigation = Navigation;
})();
