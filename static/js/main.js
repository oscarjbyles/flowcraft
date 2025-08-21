// main entry point for the flowchart builder application
(function() {
    'use strict';

    // ensure all dependencies are loaded
    function checkDependencies() {
        const requiredClasses = [
            'StateManager', 
            'DragHandler', 
            'SelectionHandler', 
            'ConnectionHandler',
            'NodeRenderer', 
            'LinkRenderer', 
            'GroupRenderer',
            'CreateNode',
            'FlowchartBuilder',
            'Sidebar'
        ];

        const missing = requiredClasses.filter(className => !window[className]);
        
        if (missing.length > 0) {
            console.warn('missing dependencies:', missing);
            return false;
        }
        
        return true;
    }

    // initialize application
    async function initializeApp() {
        // guard against double initialization (e.g., script included twice or rapid re-exec)
        if (window.flowchartApp && window.__flowcraft_initialized) {
            console.warn('flowchart app already initialized; skipping duplicate init');
            return;
        }

        // run only on builder page
        try {
            var isBuilderPath = (window.location && window.location.pathname === '/');
            var hasCanvas = !!document.getElementById('flowchart_canvas');
            if (!isBuilderPath || !hasCanvas) {
                return;
            }
        } catch (error) { 
            console.error('error checking builder path:', error);
            return; 
        }

        try {
            // check if EventManager is available (only loaded in build/run modes)
            if (!window.EventManager) {
                console.log('EventManager not available - not in flowchart mode');
                return;
            }
            
            // check dependencies
            if (!checkDependencies()) {
                console.error('missing required dependencies');
                return;
            }
            
            // create global app instance (single instance)
            if (!window.flowchartApp) {
                // create FlowchartBuilder without auto-initialization
                window.flowchartApp = new FlowchartBuilder(false); // pass false to prevent auto-init
                
                // manually initialize all systems in logical order
                await window.flowchartApp.initializeCore();
                await window.flowchartApp.initializeComponents();
                await window.flowchartApp.initializeCanvas();
                await window.flowchartApp.initializeInteractions();
                await window.flowchartApp.initializeUI();
                await window.flowchartApp.initializeApp();
            }
            window.__flowcraft_initialized = true;

            // wire left navigation (flowchart dropdown, nav buttons) for builder view
            try { 
                if (window.Navigation && typeof window.Navigation.setupNavButtons === 'function') { 
                    window.Navigation.setupNavButtons(window.flowchartApp); 
                } 
            } catch (error) {
                console.error('error initializing navigation:', error);
            }

            console.log('flowchart application initialized');
            console.log('debug helpers available at window.debugFlowchart');
            
        } catch (error) {
            console.error('failed to initialize flowchart application:', error);
            
            // show error to user
            const errorMessage = document.createElement('div');
            errorMessage.style.cssText = `
                position: fixed;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                background: #f44336;
                color: white;
                padding: 20px;
                border-radius: 8px;
                font-family: 'Roboto', sans-serif;
                z-index: 10000;
                text-align: center;
            `;
            errorMessage.innerHTML = `
                <h3>initialization error</h3>
                <p>failed to start flowchart builder</p>
                <p style="font-size: 0.8em; margin-top: 10px;">check console for details</p>
            `;
            document.body.appendChild(errorMessage);
        }
    }

    // wait for dom to be ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initializeApp);
    } else {
        initializeApp();
    }

    // handle page lifecycle to avoid losing recent edits on quick exit
    function handleExit() {
        try {
            const app = window.flowchartApp;
            if (app && app.state && typeof app.state.flushPendingSavesOnExit === 'function') {
                app.state.flushPendingSavesOnExit();
            }
            // clear transient runtime visuals before teardown/navigation so no green/red persists
            try { if (app && typeof app.clearAllNodeColorState === 'function') { app.clearAllNodeColorState(); } } catch (_) {}
        } catch (_) {}
        try {
            if (window.flowchartApp) {
                window.flowchartApp.destroy();
            }
        } catch (_) {}
    }

    // backgrounding should only flush saves, not destroy the app (prevents disappearing diagram on tab return)
    function handleBackgroundFlush() {
        try {
            const app = window.flowchartApp;
            if (app && app.state && typeof app.state.flushPendingSavesOnExit === 'function') {
                app.state.flushPendingSavesOnExit();
            }
        } catch (_) {}
    }

    // use pagehide (fires on bfcache and normal navigations)
    window.addEventListener('pagehide', handleExit, { capture: true });
    // fallback for some browsers
    window.addEventListener('beforeunload', handleExit, { capture: true });
    // ensure backgrounding only flushes (do not destroy on hidden tab)
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') {
            handleBackgroundFlush();
        }
    }, { capture: true });

})();