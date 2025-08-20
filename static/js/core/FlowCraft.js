// flowcraft namespace - encapsulates all global objects
(function() {
    'use strict';
    
    // create namespace
    window.FlowCraft = window.FlowCraft || {};
    
    // core modules
    FlowCraft.Core = {
        EventEmitter: window.EventEmitter,
        StateManager: window.StateManager,
        EventManager: window.EventManager,
        FlowchartBuilder: window.FlowchartBuilder
    };
    
    // state management
    FlowCraft.State = {
        NodeManager: window.NodeManager,
        LinkManager: window.LinkManager,
        GroupManager: window.GroupManager,
        AnnotationManager: window.AnnotationManager
    };
    
    // execution
    FlowCraft.Execution = {
        ExecutionEngine: window.ExecutionEngine,
        ExecutionOrchestrator: window.ExecutionOrchestrator
    };
    
    // rendering
    FlowCraft.Rendering = {
        NodeRenderer: window.NodeRenderer,
        LinkRenderer: window.LinkRenderer,
        GroupRenderer: window.GroupRenderer,
        AnnotationRenderer: window.AnnotationRenderer
    };
    
    // interactions
    FlowCraft.Interactions = {
        DragHandler: window.DragHandler,
        SelectionHandler: window.SelectionHandler,
        ConnectionHandler: window.ConnectionHandler
    };
    
    // components
    FlowCraft.Components = {
        Sidebar: window.Sidebar,
        Navigation: window.Navigation,
        DropdownManager: window.DropdownManager
    };
    
    // utilities
    FlowCraft.Utils = {
        Geometry: window.Geometry,
        Storage: window.Storage,
        Validation: window.Validation,
        URLManager: window.URLManager
    };
    
    // application instance
    FlowCraft.app = null;
    
    // initialization
    FlowCraft.init = function() {
        if (FlowCraft.app) {
            return FlowCraft.app;
        }
        
        // check dependencies
        const requiredModules = [
            'Core.EventEmitter',
            'Core.StateManager',
            'Core.EventManager',
            'Core.FlowchartBuilder',
            'Utils.Geometry',
            'Utils.Storage',
            'Utils.Validation'
        ];
        
        const missing = [];
        requiredModules.forEach(path => {
            const parts = path.split('.');
            let obj = FlowCraft;
            for (const part of parts) {
                obj = obj[part];
                if (!obj) {
                    missing.push(path);
                    break;
                }
            }
        });
        
        if (missing.length > 0) {
            throw new Error(`missing required modules: ${missing.join(', ')}`);
        }
        
        // create application instance
        FlowCraft.app = new FlowCraft.Core.FlowchartBuilder();
        
        // initialize ui after modules are loaded
        if (FlowCraft.app && typeof FlowCraft.app.initializeUIAfterModules === 'function') {
            FlowCraft.app.initializeUIAfterModules();
        }
        
        // initialize navigation
        if (FlowCraft.Components.Navigation && typeof FlowCraft.Components.Navigation.init === 'function') {
            FlowCraft.Components.Navigation.init(FlowCraft.app);
        }
        
        return FlowCraft.app;
    };
    
    // cleanup
    FlowCraft.destroy = function() {
        if (FlowCraft.app) {
            if (typeof FlowCraft.app.destroy === 'function') {
                FlowCraft.app.destroy();
            }
            FlowCraft.app = null;
        }
    };
    
    // export for compatibility (temporary)
    window.flowchartApp = FlowCraft.app;
    
})();
