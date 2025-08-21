// dedicated dashboard page functionality
class Dashboard {
    constructor() {
        this.urlManager = null;
        this.initializeNavigation();
        this.initializeUrlManager();
        this.initializeDashboard();
    }

    // initialize navigation
    initializeNavigation() {
        try { 
            if (window.Navigation && typeof window.Navigation.init === 'function') {
                window.Navigation.init(null); 
            } 
        } catch(_) {}
    }

    // initialize url manager
    initializeUrlManager() {
        try { 
            this.urlManager = new URLManager(); 
        } catch(_) {}
    }

    // preserve flowchart context across page navigation
    withFlowchart(path) {
        try {
            if (this.urlManager && typeof this.urlManager.buildUrlPreserveContext === 'function') {
                return this.urlManager.buildUrlPreserveContext(path);
            }
        } catch(_) {}
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

    // initialize dashboard
    async initializeDashboard() {
        // compute flow context compatible with other pages
        const flowDisplay = this.urlManager ? this.urlManager.getFlowchartDisplayNamePreferred() : (new URLSearchParams(window.location.search)).get('flowchart') || 'default';
        const flowFilename = this.urlManager ? this.urlManager.getFlowchartFilenameFromURL() : ((new URLSearchParams(window.location.search)).get('flowchart_name') || (flowDisplay + '.json'));

        // dom refs
        const elTotalExec = document.getElementById('kpi_total_exec');
        const elSuccessRate = document.getElementById('kpi_success_rate');
        const elAvgTime = document.getElementById('kpi_avg_time');
        const elNodesCov = document.getElementById('kpi_nodes_cov');
        const elMissing = document.getElementById('kpi_missing');
        const elOrphan = document.getElementById('kpi_orphan');
        const elDist = document.getElementById('distribution_bars');
        const elRecentBody = document.getElementById('recent_tbody');
        const elFailureBlock = document.getElementById('failure_block');
        const elLinksBuild = document.getElementById('link_build');
        const elLinksRun = document.getElementById('link_run');
        const elLinksScripts = document.getElementById('link_scripts');
        const elLinksData = document.getElementById('link_data');
        const elClearHistory = document.getElementById('btn_clear_history');

        // wire quick links with preserved context
        if (elLinksBuild) elLinksBuild.onclick = () => window.location.href = this.withFlowchart('/');
        if (elLinksRun) elLinksRun.onclick = () => window.location.href = this.withFlowchart('/?mode=run');
        if (elLinksScripts) elLinksScripts.onclick = () => window.location.href = this.withFlowchart('/scripts');
        if (elLinksData) elLinksData.onclick = () => window.location.href = this.withFlowchart('/data');

        // fetch in parallel (history api removed; we rely on embedded executions in flow json)
        let flowResp, filesResp, editorsResp;
        try {
            [flowResp, filesResp, editorsResp] = await Promise.all([
                fetch(`/api/flowchart?name=${encodeURIComponent(flowDisplay)}`),
                fetch('/api/python-files'),
                fetch('/api/editors')
            ]);
        } catch (e) {
            // basic network failure handling
        }

        let flow = { nodes: [], links: [], executions: [] };
        let pyFiles = [];
        let editors = [];
        try { flow = await flowResp.json(); } catch(_) {}
        try { const f = await filesResp.json(); if (f && f.status === 'success') pyFiles = f.files || []; } catch(_) {}
        try { const ed = await editorsResp.json(); if (ed && ed.status === 'success') editors = ed.editors || []; } catch(_) {}

        // always use compact execution summaries embedded in the flow json for dashboard kpis
        let history = [];
        try { history = Array.isArray(flow.executions) ? flow.executions : []; } catch(_) { history = []; }

        // compute coverage + unassigned/orphan
        const totalNodes = Array.isArray(flow.nodes) ? flow.nodes.length : 0;
        const nodesWithFiles = (flow.nodes || []).filter(n => (n && typeof n.pythonFile === 'string' && n.pythonFile.trim() !== ''));
        const nodesWithFilesCount = nodesWithFiles.length;
        // python nodes without associated files
        const pythonNodesWithoutFiles = (flow.nodes || []).filter(n => n && n.type === 'python_file' && (!n.pythonFile || String(n.pythonFile).trim() === ''));
        // orphaned nodes: nodes that have no incoming or outgoing links (excluding utility nodes)
        const utilityTypes = new Set(['input_node', 'data_save']);
        const candidateNodes = (flow.nodes || []).filter(n => n && !utilityTypes.has(n.type));
        const linkedNodeIds = new Set();
        (flow.links || []).forEach(l => { if (l && l.source != null) linkedNodeIds.add(l.source); if (l && l.target != null) linkedNodeIds.add(l.target); });
        const orphanedNodes = candidateNodes.filter(n => !linkedNodeIds.has(n.id));

        // quick stats
        const totalExec = history.length;
        const avgSuccess = totalExec > 0 ? (history.reduce((a, b) => a + (b.success_percentage || 0), 0) / totalExec) : 0;
        const avgElapsedMs = totalExec > 0 ? Math.round(history.reduce((a, b) => a + (b.elapsed_ms || 0), 0) / totalExec) : 0;
        const fmtElapsed = (ms) => {
            try { ms = parseInt(ms); } catch(_) { return '0.000s'; }
            const s = ms / 1000.0;
            return `${s.toFixed(3)}s`;
        };
        if (elTotalExec) elTotalExec.textContent = String(totalExec);
        if (elSuccessRate) elSuccessRate.textContent = `${avgSuccess.toFixed(1)}%`;
        if (elAvgTime) elAvgTime.textContent = fmtElapsed(avgElapsedMs);
        if (elNodesCov) elNodesCov.textContent = `${nodesWithFilesCount}/${totalNodes}`;
        if (elMissing) elMissing.textContent = String(pythonNodesWithoutFiles.length);
        if (elOrphan) elOrphan.textContent = String(orphanedNodes.length);

        // initialize editor dropdown
        this.initializeEditorDropdown(editors);

        // render execution distribution
        this.renderExecutionDistribution(elDist, history);

        // render recent executions table
        this.renderRecentExecutions(elRecentBody, history, flowDisplay);

        // render failure spotlight
        this.renderFailureSpotlight(elFailureBlock, history, flowDisplay);

        // wire clear history action
        this.wireClearHistory(elClearHistory, flowFilename);
    }

    // initialize editor dropdown
    initializeEditorDropdown(editors) {
        const elDefInput = document.getElementById('default_editor_input');
        const elDefDropdown = document.getElementById('default_editor_dropdown');
        if (!elDefInput || !elDefDropdown) return;

        // load saved preference from localstorage
        try {
            const saved = localStorage.getItem('flowcraft_default_editor');
            if (saved) {
                const parsed = JSON.parse(saved);
                elDefInput.value = parsed.name || parsed.path || 'custom editor';
                elDefInput.dataset.path = parsed.path || '';
            }
        } catch(_) {}

        // render dropdown items
        const renderEditorsDropdown = (editorsList) => {
            if (!Array.isArray(editorsList) || editorsList.length === 0) {
                elDefDropdown.innerHTML = '<div class="dropdown_no_results">no editors found</div>';
                return;
            }
            elDefDropdown.innerHTML = editorsList.map(ed => `
                <div class="dropdown_item" data-name="${ed.name}" data-path="${ed.path}">
                    <div class="dropdown_item_content">
                        <div class="dropdown_item_name">${ed.name}</div>
                        <div class="dropdown_item_meta" style="opacity:.7; font-size:.75rem;">${ed.path}</div>
                    </div>
                </div>
            `).join('');
            elDefDropdown.querySelectorAll('.dropdown_item').forEach(item => {
                item.addEventListener('click', () => {
                    const editor = { name: item.dataset.name, path: item.dataset.path };
                    elDefInput.value = editor.name;
                    elDefInput.dataset.path = editor.path || '';
                    localStorage.setItem('flowcraft_default_editor', JSON.stringify(editor));
                    elDefDropdown.classList.remove('show');
                });
            });
        };

        if (Array.isArray(editors) && editors.length) {
            renderEditorsDropdown(editors);
        } else {
            // fallback fetch if initial editors load failed
            this.fetchEditorsFallback(renderEditorsDropdown);
        }

        // open/close behavior
        elDefInput.addEventListener('click', (e) => {
            e.stopPropagation();
            elDefDropdown.classList.toggle('show');
        });
        document.addEventListener('click', (e) => {
            const container = elDefInput.closest('.dropdown_container');
            if (container && !container.contains(e.target)) {
                elDefDropdown.classList.remove('show');
            }
        });
    }

    // fallback fetch for editors
    async fetchEditorsFallback(renderCallback) {
        try {
            const resp = await fetch('/api/editors');
            const data = await resp.json();
            if (data && data.status === 'success') {
                renderCallback(data.editors);
            } else {
                document.getElementById('default_editor_dropdown').innerHTML = '<div class="dropdown_no_results">failed to detect editors</div>';
            }
        } catch(_) {
            document.getElementById('default_editor_dropdown').innerHTML = '<div class="dropdown_no_results">error detecting editors</div>';
        }
    }

    // render execution distribution
    renderExecutionDistribution(elDist, history) {
        if (!elDist) return;

        const recent = history.slice(0, 40);
        if (!recent.length) {
            elDist.innerHTML = '<div class="muted">no executions yet</div>';
            try { elDist.classList.add('empty'); } catch(_) {}
        } else {
            elDist.innerHTML = '';
            try { elDist.classList.remove('empty'); } catch(_) {}
            recent.forEach((h, idx) => {
                const pct = Math.max(0, Math.min(100, Number(h.success_percentage || 0)));
                const bar = document.createElement('div');
                bar.className = 'bar';
                // color bars based on execution status
                const status = (h.status || '').toLowerCase();
                if (status === 'success') {
                    bar.style.background = 'linear-gradient(180deg, #66bb6a 0%, #2e7d32 100%)';
                } else if (status === 'failed') {
                    bar.style.background = 'linear-gradient(180deg, #f44336 0%, #c62828 100%)';
                } else if (status === 'stopped') {
                    bar.style.background = 'linear-gradient(180deg, #ff9800 0%, #e65100 100%)';
                } else {
                    bar.style.background = 'linear-gradient(180deg, #9e9e9e 0%, #616161 100%)';
                }
                // scale bars to avoid overflow: cap at 85% of container height and add small baseline
                const scaled = 5 + Math.round(pct * 0.8);
                bar.style.height = `${scaled}%`;
                const v = document.createElement('div'); v.className = 'bar_value'; v.textContent = `${pct}%`;
                v.style.transform = 'translateY(-2px)';
                const l = document.createElement('div'); l.className = 'bar_label'; l.textContent = String(idx + 1);
                bar.appendChild(v); bar.appendChild(l);
                elDist.appendChild(bar);
            });
        }
    }

    // render recent executions table
    renderRecentExecutions(elRecentBody, history, flowDisplay) {
        if (!elRecentBody) return;

        if (!history.length) {
            elRecentBody.innerHTML = '<tr><td colspan="5" class="muted" style="text-align:center; padding:14px;">no executions yet</td></tr>';
        } else {
            const rows = history.slice(0, 5).map(item => {
                const cls = item.status === 'success' ? 'status_success' : (item.status === 'failed' ? 'status_failed' : 'status_info');
                const badge = `<span class="status_badge ${cls}"><span class="material-icons" style="font-size:16px;">${item.status==='success'?'check_circle':(item.status==='failed'?'error':'info')}</span>${item.status || 'unknown'}</span>`;
                const nodes = `${item.successful_nodes || 0} / ${item.total_nodes || 0}`;
                const elapsed = item.execution_time || '-';
                const when = item.timestamp || '-';
                const viewBtn = `<button class="mini_btn" data-id="${item.execution_id}"><span class="material-icons" style="font-size:16px;">visibility</span> View</button>`;
                return `<tr>
                    <td>${badge}</td>
                    <td>${nodes}</td>
                    <td>${String(item.success_percentage ?? 0)}%</td>
                    <td>${elapsed}</td>
                    <td class="right">${viewBtn}</td>
                </tr>`;
            }).join('');
            elRecentBody.innerHTML = rows;
            elRecentBody.querySelectorAll('button[data-id]').forEach(btn => {
                btn.addEventListener('click', () => {
                    const id = btn.getAttribute('data-id');
                    const u = new URL('/', window.location.origin);
                    if (flowDisplay && flowDisplay !== 'default') u.searchParams.set('flowchart', flowDisplay);
                    u.searchParams.set('mode', 'run');
                    u.searchParams.set('executionId', id);
                    window.location.href = u.pathname + '?' + u.searchParams.toString();
                });
            });
        }
    }

    // render failure spotlight
    renderFailureSpotlight(elFailureBlock, history, flowDisplay) {
        if (!elFailureBlock) return;

        // find up to 3 most recent failed executions
        const failures = (history || []).filter(h => (h.status || '').toLowerCase() === 'failed').slice(0, 3);
        if (!failures.length) {
            elFailureBlock.innerHTML = '<div class="muted">no failures in recent executions</div>';
        } else {
            // build compact single-line rows for each failure
            const rowsHtml = failures.map((item, idx) => {
                const name = item.failed_node || 'unknown';
                const errorMsg = item.error_snippet || '-';
                const execId = item.execution_id;
                const elapsed = item.execution_time || '-';
                const progressPct = (typeof item.completed_percentage === 'number')
                    ? item.completed_percentage
                    : (item && typeof item.total_nodes === 'number' && item.total_nodes > 0
                        ? Math.round(((item.completed_nodes || 0) / item.total_nodes) * 100)
                        : 0);
                return `
                    <div class="failure_row">
                        <span class="material-icons" style="color:#f44336;">error</span>
                        <div class="failure_name" style="border:1px solid var(--border-color); padding: 2px 6px; border-radius: 6px;">${name}</div>
                        <div class="failure_meta" style="margin: 0 8px; opacity:.8;">${elapsed} • ${progressPct}%</div>
                        <div class="failure_meta" style="flex:1; min-width:0; overflow:hidden; text-overflow: ellipsis; white-space: nowrap;">${errorMsg}</div>
                        <div class="failure_spacer"></div>
                        <button class="mini_btn" data-fail-btn="${String(execId)}"><span class="material-icons" style="font-size:16px;">visibility</span> View</button>
                    </div>`;
            }).join('');
            elFailureBlock.innerHTML = `<div class="failure_rows">${rowsHtml}</div>`;
            // wire up view buttons to open run with correct execution id
            elFailureBlock.querySelectorAll('button[data-fail-btn]').forEach(btn => {
                btn.addEventListener('click', () => {
                    const id = btn.getAttribute('data-fail-btn');
                    const u = new URL('/', window.location.origin);
                    if (flowDisplay && flowDisplay !== 'default') u.searchParams.set('flowchart', flowDisplay);
                    u.searchParams.set('mode', 'run');
                    u.searchParams.set('executionId', id);
                    window.location.href = u.pathname + '?' + u.searchParams.toString();
                });
            });
        }
    }

    // wire clear history action
    wireClearHistory(elClearHistory, flowFilename) {
        if (!elClearHistory) return;

        elClearHistory.onclick = async () => {
            if (!confirm('clear all executions for this flowchart?')) return;
            try {
                const resp = await fetch('/api/history/clear', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ flowchart_name: flowFilename })
                });
                const j = await resp.json();
                if (j && j.status === 'success') {
                    window.location.reload();
                } else {
                    alert(j.message || 'failed to clear history');
                }
            } catch(_) {
                alert('error clearing history');
            }
        };
    }
}

// export for use in other modules
window.Dashboard = Dashboard;
