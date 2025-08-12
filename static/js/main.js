// main entry point for the flowchart builder application
(function() {
    'use strict';

    // ensure all dependencies are loaded
    function checkDependencies() {
        const requiredClasses = [
            'EventEmitter', 'Geometry', 'Storage', 'Validation', 'URLManager',
            'StateManager', 'EventManager',
            'DragHandler', 'SelectionHandler', 'ConnectionHandler',
            'NodeRenderer', 'LinkRenderer', 'GroupRenderer',
            'Sidebar', 'FlowchartBuilder'
        ];

        const missing = requiredClasses.filter(className => !window[className]);
        
        if (missing.length > 0) {
            console.error('missing dependencies:', missing);
            return false;
        }
        
        return true;
    }

    // initialize application
    function initializeApp() {
        if (!checkDependencies()) {
            console.error('cannot initialize app: missing dependencies');
            return;
        }

        // verify roboto is applied; if not, log a warning for diagnostics
        try {
            const testEl = document.createElement('span');
            testEl.textContent = 'AaBbCc123';
            testEl.style.cssText = 'position:absolute;visibility:hidden;font-size:16px;line-height:16px;';
            // measure with fallback first
            testEl.style.fontFamily = 'sans-serif';
            document.body.appendChild(testEl);
            const fallbackWidth = testEl.getBoundingClientRect().width;
            // now apply roboto
            testEl.style.fontFamily = "'Roboto', sans-serif";
            const robotoWidth = testEl.getBoundingClientRect().width;
            document.body.removeChild(testEl);
            if (Math.abs(robotoWidth - fallbackWidth) < 0.1) {
                console.warn('roboto may not be loaded or applied; ui will use system sans-serif');
            }
        } catch (_) {}

        try {
            // create global app instance
            window.flowchartApp = new FlowchartBuilder();
            
            // add global debug helpers
            window.debugFlowchart = {
                logState: () => window.flowchartApp.logState(),
                getStats: () => window.flowchartApp.getStats(),
                zoomToFit: () => window.flowchartApp.zoomToFit(),
                resetZoom: () => window.flowchartApp.resetZoom(),
                exportData: () => window.flowchartApp.exportData(),
                saveData: () => window.flowchartApp.saveData()
            };

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