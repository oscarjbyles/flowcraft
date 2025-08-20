// main entry point for the flowchart builder application
(function() {
    'use strict';

    // initialize application
    function initializeApp() {
        // guard against double initialization
        if (window.FlowCraft && window.FlowCraft.app) {
            return;
        }
        
        // run only on builder page
        const isBuilderPath = window.location.pathname === '/';
        const hasCanvas = !!document.getElementById('flowchart_canvas');
        if (!isBuilderPath || !hasCanvas) {
            return;
        }



        try {
            // initialize flowcraft application
            const app = FlowCraft.init();
            
            // temporary compatibility
            window.flowchartApp = app;


            
        } catch (error) {
            
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
        const app = FlowCraft.app;
        if (app) {
            if (app.state && typeof app.state.flushPendingSavesOnExit === 'function') {
                app.state.flushPendingSavesOnExit();
            }
            if (typeof app.clearAllNodeColorState === 'function') { 
                app.clearAllNodeColorState(); 
            }
        }
        FlowCraft.destroy();
    }

    // backgrounding should only flush saves, not destroy the app
    function handleBackgroundFlush() {
        const app = FlowCraft.app;
        if (app && app.state && typeof app.state.flushPendingSavesOnExit === 'function') {
            app.state.flushPendingSavesOnExit();
        }
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