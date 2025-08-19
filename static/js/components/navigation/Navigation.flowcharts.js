(function(){
    'use strict';

    // flowchart selector and create modal for left navigation on all pages
    // comments are lowercase per project convention

    function onDomReady(fn){
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn); else fn();
    }

    function getUrlManager(){
        try { return new URLManager(); } catch(_) { return null; }
    }

    function preventSpaces(input){
        if (!input) return;
        input.addEventListener('keypress', (e) => { 
            if (e.key === ' ') {
                e.preventDefault();
                // insert underscore at cursor position
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
                // replace spaces with underscores in pasted text
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

    function buildHref(path){
        try {
            const u = new URL(path, window.location.origin);
            const params = new URLSearchParams(window.location.search);
            // preserve flowchart context
            const flowchart = params.get('flowchart');
            if (flowchart) u.searchParams.set('flowchart', flowchart);
            return u.pathname + (u.search ? u.search : '');
        } catch(_) {
            return path;
        }
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

    function openDropdown(selectorInput, dropdown){
        if (!dropdown) return;
        dropdown.classList.add('show');
        const container = selectorInput ? selectorInput.closest('.dropdown_container') : null;
        function outside(e){ if (!container || !container.contains(e.target)) { dropdown.classList.remove('show'); document.removeEventListener('click', outside); } }
        document.addEventListener('click', outside);
    }

    function closeDropdown(dropdown){ if (dropdown) dropdown.classList.remove('show'); }

    const NavigationFlow = {
        setupFlowchartUI(app){
            onDomReady(async () => {
                try { console.log('[nav-flow] setup start', { path: window.location.pathname, hasApp: !!app }); } catch(_) {}
                const urlMgr = getUrlManager();
                const selector = document.getElementById('flowchart_selector');
                const dropdown = document.getElementById('flowchart_dropdown');
                const arrow = selector ? selector.parentElement && selector.parentElement.querySelector('.dropdown_arrow') : null;
                const createBtn = document.getElementById('create_flowchart_btn');
                const createModal = document.getElementById('create_flowchart_modal');
                const closeCreateModal = document.getElementById('close_create_modal');
                const cancelCreate = document.getElementById('cancel_create_flowchart');
                const confirmCreate = document.getElementById('confirm_create_flowchart');
                const nameInput = document.getElementById('new_flowchart_name');
                try { console.log('[nav-flow] dom refs', { hasSelector: !!selector, hasDropdown: !!dropdown, hasCreateBtn: !!createBtn }); } catch(_) {}

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
                    try { console.log('[nav-flow] selector/arrow click handler attached'); } catch(_) {}
                    document.addEventListener('click', (e) => {
                        const container = selector.closest('.dropdown_container');
                        if (container && !container.contains(e.target)) closeDropdown(dropdown);
                    });
                }

                // populate dropdown
                try {
                    const data = await fetchFlowcharts();
                    try { console.log('[nav-flow] fetched flowcharts', { status: data && data.status, count: (data && data.flowcharts && data.flowcharts.length) || 0 }); } catch(_) {}
                    const flows = Array.isArray(data.flowcharts) ? data.flowcharts : [];
                    renderDropdown(dropdown, flows);
                    // wire selection
                    if (dropdown && !dropdown._delegated) {
                        // delegate clicks once for items and delete buttons
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
                            try { console.log('[nav-flow] select item', { filename, display }); } catch(_) {}
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
                                        console.log('[nav-flow] builder select: updating app state');
                                        
                                        // check if we're in run, build, or settings mode and clear execution output if needed
                                        const currentMode = app.state.currentMode || 'build';
                                        if (currentMode === 'run' || currentMode === 'build' || currentMode === 'settings') {
                                            try {
                                                if (typeof app.clearRunModeState === 'function') {
                                                    app.clearRunModeState();
                                                } else if (typeof app.clearExecutionFeed === 'function') {
                                                    app.clearExecutionFeed();
                                                }
                                            } catch (clearError) {
                                                console.warn('[nav-flow] failed to clear execution state:', clearError);
                                            }
                                        }
                                        
                                        app.state.save(true).then(() => {
                                            app.state.storage.setCurrentFlowchart(filename);
                                            return app.state.load();
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

                // create modal wiring (local per page; behavior preserved)
                if (createBtn) createBtn.addEventListener('click', (e) => { e.preventDefault(); if (createModal) createModal.classList.add('show'); if (nameInput){ nameInput.value=''; nameInput.focus(); } });
                if (closeCreateModal) closeCreateModal.addEventListener('click', () => { if (createModal) createModal.classList.remove('show'); });
                if (cancelCreate) cancelCreate.addEventListener('click', () => { if (createModal) createModal.classList.remove('show'); });
                if (createModal) createModal.addEventListener('click', (e) => { if (e.target === createModal) createModal.classList.remove('show'); });
                if (confirmCreate) {
                    confirmCreate.addEventListener('click', async () => {
                        const raw = (nameInput && nameInput.value ? nameInput.value : '').trim();
                        if (!raw) { alert('flowchart name is required'); return; }
                        try {
                            const resp = await fetch('/api/flowcharts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: raw }) });
                            const data = await resp.json();
                            try { console.log('[nav-flow] create response', { ok: resp.ok, status: data && data.status }); } catch(_) {}
                            if (data && data.status === 'success' && data.flowchart) {
                                if (createModal) createModal.classList.remove('show');
                                // refresh dropdown and update selection
                                const list = await fetchFlowcharts();
                                renderDropdown(dropdown, Array.isArray(list.flowcharts) ? list.flowcharts : []);
                                if (selector) selector.value = data.flowchart.name;
                                // update url/location based on page
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

                // export button handling (left navigation)
                const exportBtn = document.getElementById('export_btn');
                if (exportBtn) {
                    exportBtn.addEventListener('click', () => {
                        // delegate to sidebar if available, otherwise navigate to builder
                        if (window.flowchartApp && window.flowchartApp.sidebar && typeof window.flowchartApp.sidebar.exportCurrentFlowchart === 'function') {
                            window.flowchartApp.sidebar.exportCurrentFlowchart();
                        } else {
                            window.location.href = buildHref('/');
                        }
                    });
                }

                // data matrix button handling (left navigation)
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
                        const url = urlMgr && typeof urlMgr.buildUrlPreserveContext === 'function' 
                            ? urlMgr.buildUrlPreserveContext('/data')
                            : '/data';
                        window.location.href = url;
                    });
                }

                try { console.log('[nav-flow] setup complete'); } catch(_) {}
            });
        }
    };

    window.Navigation = Object.assign(window.Navigation || {}, NavigationFlow);
})();


