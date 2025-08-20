// main flowchart builder orchestrator
// Load all FlowchartBuilder modules

// Load modules in dependency order
// (function() {
//     const script = document.createElement('script');
//     script.src = '/static/js/core/FlowchartBuilder.Initialization.js';
//     script.async = false;
//     document.head.appendChild(script);
// })();

(function(){
    'use strict';
    if (window.FlowchartBuilder) { return; }

class FlowchartBuilder {
    constructor() {
        // viewport persistence
        this.viewportSaveTimer = null;
        this.viewportSaveDelay = 250; // ms

        // defer initialization until all modules are loaded
        this.initialized = false;
        
        // initialize immediately if all modules are available
        if (this.checkModulesAvailable()) {
            this.performInitialization();
        } else {
            // wait for modules to be loaded
            this.waitForModules();
        }
    }

    // check if all required modules are available
    checkModulesAvailable() {
        return typeof this.initializeCore === 'function' &&
               typeof this.initializeComponents === 'function' &&
               typeof this.initializeCanvas === 'function' &&
               typeof this.initializeInteractions === 'function' &&
               typeof this.initializeApp === 'function';
    }

    // wait for modules to be loaded
    waitForModules() {
        const checkInterval = setInterval(() => {
            if (this.checkModulesAvailable()) {
                clearInterval(checkInterval);
                this.performInitialization();
            }
        }, 10); // check every 10ms

        // timeout after 5 seconds
        setTimeout(() => {
            clearInterval(checkInterval);
            if (!this.initialized) {
                console.error('timeout waiting for modules to load');
                this.showInitializationError(new Error('timeout waiting for modules to load'));
            }
        }, 5000);
    }

    // perform the actual initialization
    performInitialization() {
        if (this.initialized) return;
        
        try {
            // initialize all systems in logical order
            this.initializeCore();
            this.initializeComponents();
            this.initializeCanvas();
            this.initializeInteractions();
            
            // handle async initialization properly
            this.initializeApp().catch(error => {
                console.error('failed to initialize application:', error);
                this.showInitializationError(error);
            });
            
            this.initialized = true;
        } catch (error) {
            console.error('failed to perform initialization:', error);
            this.showInitializationError(error);
        }
    }

    // method to be called after all modules are loaded
    initializeUIAfterModules() {
        this.initializeUI();
    }

    // show initialization error to user
    showInitializationError(error) {
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

// Core class methods that need to be available immediately
FlowchartBuilder.NODE_STATES = {
    IDLE: 'idle',
    RUNNING: 'running',
    COMPLETED: 'completed',
    ERROR: 'error',
    CANCELLED: 'cancelled',
    SUCCESS: 'success'
};

// Make class globally available
window.FlowchartBuilder = FlowchartBuilder;

})();
