(function(){
    'use strict';

    // lightweight navigation module for left sidebar
    // comments are lowercase per project convention

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
                else if (typeof app.clearAllNodeColorState === 'function') app.clearAllNodeColorState();
            }
        } catch(_) {}
    }

    function setActiveNav(){
        const path = window.location.pathname;
        const ids = ['dashboard_btn','build_btn','scripts_btn','run_btn','settings_btn','export_btn','data_matrix_btn'];
        ids.forEach(id => { const el = document.getElementById(id); if (el){ el.classList.remove('active'); el.classList.remove('run_mode_active'); }});
        const map = { '/dashboard':'dashboard_btn', '/scripts':'scripts_btn', '/data':'data_matrix_btn' };
        const id = map[path];
        const el = id ? document.getElementById(id) : null;
        if (el) el.classList.add('active');
    }

    const Navigation = {
        // wire left sidebar buttons; if app is provided, use rich behavior (mode switches, clears), otherwise navigate only
        setupNavButtons(app){
            onDomReady(() => {
                console.log('[nav] setupNavButtons start', { hasApp: !!app, path: window.location.pathname });
                // dashboard
                const db = document.getElementById('dashboard_btn');
                if (db) db.onclick = () => { clearRunVisualsIfNeeded(app); window.location.href = buildHref('/dashboard'); };

                // build
                const build = document.getElementById('build_btn');
                if (build) build.onclick = () => {
                    if (app && typeof app.switchToBuildMode === 'function') {
                        try { if (app.state && app.state.isRunMode && typeof app.clearRunModeState === 'function') app.clearRunModeState(); } catch(_) {}
                        app.switchToBuildMode();
                        try { const u = new URL(window.location.href); u.searchParams.set('mode','build'); window.history.replaceState(null,'',u.pathname + '?' + u.searchParams.toString()); } catch(_) {}
                    } else {
                        window.location.href = buildHref('/?mode=build');
                    }
                };

                // scripts
                const scripts = document.getElementById('scripts_btn');
                if (scripts) scripts.onclick = () => { clearRunVisualsIfNeeded(app); window.location.href = buildHref('/scripts'); };

                // run
                const run = document.getElementById('run_btn');
                if (run) run.onclick = () => {
                    console.log('[debug] run button clicked');
                    if (app && typeof app.switchToRunMode === 'function') {
                        console.log('[debug] calling app.switchToRunMode()');
                        app.switchToRunMode();
                        try { const u = new URL(window.location.href); u.searchParams.set('mode','run'); window.history.replaceState(null,'',u.pathname + '?' + u.searchParams.toString()); } catch(_) {}
                    } else {
                        console.log('[debug] no app or switchToRunMode function, navigating to:', buildHref('/?mode=run'));
                        window.location.href = buildHref('/?mode=run');
                    }
                };

                // settings
                const settings = document.getElementById('settings_btn');
                if (settings) settings.onclick = () => {
                    if (app && typeof app.switchToSettingsMode === 'function') {
                        clearRunVisualsIfNeeded(app);
                        app.switchToSettingsMode();
                        try { const u = new URL(window.location.href); u.searchParams.set('mode','settings'); window.history.replaceState(null,'',u.pathname + '?' + u.searchParams.toString()); } catch(_) {}
                    } else {
                        window.location.href = buildHref('/?mode=settings');
                    }
                };

                // export (builder handles its own export via sidebar module; only handle on non-app pages)
                if (!app) {
                    const exp = document.getElementById('export_btn');
                    if (exp) exp.onclick = () => { window.location.href = buildHref('/'); };
                }

                // data matrix (let builder-specific handler manage clearing visuals if already present)
                if (!app) {
                    const data = document.getElementById('data_matrix_btn');
                    if (data) data.onclick = () => { window.location.href = buildHref('/data'); };
                }

                // highlight active nav (non-builder pages only)
                setActiveNav();
                console.log('[nav] setupNavButtons done');
            });
        },

        init(app){
            console.log('[nav] init called', { hasApp: !!app });
            this.setupNavButtons(app || (window.flowchartApp || null));
            // flowchart ui setup is in Navigation.flowcharts.js
            if (!app && window.Navigation && typeof window.Navigation.setupFlowchartUI === 'function') {
                console.log('[nav] calling setupFlowchartUI');
                window.Navigation.setupFlowchartUI(null);
            } else if (app) {
                console.log('[nav] skipping setupFlowchartUI on builder (handled by Sidebar)');
            } else {
                console.warn('[nav] setupFlowchartUI not available on window.Navigation');
            }
            console.log('[nav] init complete');
        }
    };

    window.Navigation = Navigation;
})();


