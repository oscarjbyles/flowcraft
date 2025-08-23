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
            'CanvasHandler',
            'NodeRenderer',
            'LinkRenderer',
            'GroupRenderer',
            'AnnotationRenderer',
            'CreateNode',
            'DeleteNode',
            'ExecutionFeed',
            'EventManager',
            'Sidebar',
            'Toolbars',
            'StatusBar',
            'ExecutionLogic',
            'NodeStateManager',
            'VariableManager',
            'ResumeExecution',
            'ExecutionStatus',
            'OutputManager',
            'ViewportTracker',
            // Add section dependencies
            'BaseSection',
            'HeaderSection',
            'NodeNameSection',
            'DeleteButtonSection',
            // Add controller dependencies
            'BaseController',
            'ControllerRegistry',
            'DefaultController',
            'DefaultRunController'
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
                return;
            }
            
            // check dependencies
            if (!checkDependencies()) {
                console.error('missing required dependencies');
                return;
            }
            
            // create global app instance (single instance)
            if (!window.flowchartApp) {
                // create the main app object that will hold all components
                window.flowchartApp = createFlowchartApp();
                
                // initialize all systems in logical order
                await initializeCore();
                await initializeComponents();
                await initializeCanvas();
                await initializeInteractions();
                await initializeUI();
                await finalizeApp();
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

    // create the main flowchart app object
    function createFlowchartApp() {
        const app = {
            // viewport persistence
            viewportSaveTimer: null,
            viewportSaveDelay: 250, // ms
            
            // execution control
            currentExecutionController: null,
            
            // execution state - these will be managed by executionLogic
            // guard to prevent double-start on rapid clicks
            executionStarting: false,
            // auto-track state: when true, viewport follows the active node during execution
            isAutoTrackEnabled: false,
            // when the user manually pans/zooms, we disable auto-track until re-enabled by the user
            userDisabledTracking: false,
            // last execution snapshot for no-selection run view
            lastExecutionStatus: 'idle', // 'running' | 'completed' | 'failed' | 'stopped' | 'error' | 'idle'
            lastFailedNode: null, // { id, name, pythonFile, error }
            // remember current executing node for immediate tracking when toggled on mid-run
            currentExecutingNodeId: null,
            
            // group select mode state
            isGroupSelectMode: false,
            justFinishedDragSelection: false,
            
            // store execution results for individual nodes
            nodeExecutionResults: new Map(), // nodeId -> execution result (legacy reference)

            // runtime branch control: nodes blocked by false if arms in the current run
            // all comments in lower case
            blockedNodeIds: new Set(),

            // utility methods
            updateStatusBar: function(message) {
                if (this.statusBar) {
                    this.statusBar.updateStatusBar(message);
                }
            },

            handleError: function(message, error) {
                console.error(message, error);
                this.updateStatusBar(message);
            },

            // viewport persistence helpers
            getViewportStorageKey: function() {
                // use current flowchart name to scope viewport
                const name = (this.state.saving && this.state.saving.storage) ? this.state.saving.storage.getCurrentFlowchart() || 'default.json' : 'default.json';
                return `flowchart_viewport:${name}`;
            },

            scheduleViewportSave: function() {
                // debounce saves to avoid excessive writes
                if (this.viewportSaveTimer) {
                    clearTimeout(this.viewportSaveTimer);
                }
                this.viewportSaveTimer = setTimeout(() => {
                    this.saveViewportToStorage();
                }, this.viewportSaveDelay);
            },

            saveViewportToStorage: function() {
                try {
                    const t = this.state.transform || d3.zoomIdentity;
                    const payload = { x: t.x, y: t.y, k: t.k };
                    localStorage.setItem(this.getViewportStorageKey(), JSON.stringify(payload));
                } catch (_) {
                    // ignore storage errors silently
                }
            },

            restoreViewportFromStorage: function() {
                try {
                    const raw = localStorage.getItem(this.getViewportStorageKey());
                    if (!raw) return;
                    const parsed = JSON.parse(raw);
                    if (typeof parsed?.x !== 'number' || typeof parsed?.y !== 'number' || typeof parsed?.k !== 'number') return;
                    const transform = d3.zoomIdentity.translate(parsed.x, parsed.y).scale(parsed.k);
                    // apply via d3 to keep behavior state in sync
                    if (this.svg && this.zoom) {
                        this.svg.call(this.zoom.transform, transform);
                    }
                } catch (_) {
                    // ignore parse/storage errors
                }
            },

            // zoom operations
            disableZoom: function() {
                this.svg.on('.zoom', null);
            },

            enableZoom: function() {
                this.svg.call(this.zoom);
            },

            zoomToFit: function() {
                if (this.state.nodes.length === 0) return;

                const bounds = Geometry.calculateGroupBounds(this.state.nodes);
                const padding = 50;
                
                const scale = Math.min(
                    this.state.canvasWidth / (bounds.width + 2 * padding),
                    this.state.canvasHeight / (bounds.height + 2 * padding)
                );
                
                const translateX = this.state.canvasWidth / 2 - bounds.centerX * scale;
                const translateY = this.state.canvasHeight / 2 - bounds.centerY * scale;
                
                this.svg.transition()
                    .duration(750)
                    .call(this.zoom.transform, d3.zoomIdentity.translate(translateX, translateY).scale(scale));
            },

            resetZoom: function() {
                this.svg.transition()
                    .duration(500)
                    .call(this.zoom.transform, d3.zoomIdentity);
            },

            // reset zoom to 1 and center the first node in flow order (works in build and run modes)
            resetViewToFirstNode: function() {
                // temporarily pause auto-tracking while we reposition the viewport
                const prevAutoTrack = this.isAutoTrackEnabled;
                const prevUserDisabled = this.userDisabledTracking;
                // mark as user-disabled to prevent immediate re-centering during programmatic transforms
                this.userDisabledTracking = true;

                // choose target node: first in flow order, fallback to id 1
                let targetNode = null;
                const order = this.calculateNodeOrder();
                targetNode = (order && order.length > 0) ? order[0] : null;
                if (!targetNode) {
                    targetNode = this.state.createNode ? this.state.createNode.getNode(1) : null;
                }

                // animate center to the chosen node at zoom 1
                if (targetNode && typeof targetNode.id !== 'undefined') {
                    this.viewportTracker.centerOnNodeWithTopOffset(targetNode.id, 300, 400, 1);
                }

                // restore previous auto-tracking state but remain user-disabled until next explicit toggle
                // this preserves run-mode preference and avoids snapping away immediately
                this.isAutoTrackEnabled = prevAutoTrack;
                this.userDisabledTracking = true;
                if (this.toolbars && this.toolbars.refreshTrackBtnUI) {
                    this.toolbars.refreshTrackBtnUI();
                }
            },

            updateCanvasDimensions: function() {
                const width = window.innerWidth - 600; // both sidebars
                const height = window.innerHeight - 32; // status bar
                
                this.state.setCanvasSize(width, height);
            },

            handleResize: function() {
                this.updateCanvasDimensions();
                
                if (this.svg) {
                    this.svg
                        .attr('width', this.state.canvasWidth)
                        .attr('height', this.state.canvasHeight);
                }
            },

            // data operations
            async loadInitialData() {
                try {
                    if (this.state.saving) await this.state.saving.load();
                } catch (error) {
                    this.updateStatusBar('failed to load saved data');
                }
            },

            async saveData() {
                try {
                    const result = this.state.saving ? await this.state.saving.save() : { success: false, message: 'saving not initialized' };
                    if (result.success) {
                        this.updateStatusBar('flowchart saved successfully');
                    } else {
                        this.updateStatusBar('failed to save flowchart');
                    }
                } catch (error) {
                    this.updateStatusBar('save error occurred');
                }
            },

            exportData() {
                const data = this.state.saving ? this.state.saving.exportData() : { nodes: [], links: [], groups: [], metadata: {} };
                if (this.state.saving && this.state.saving.storage) {
                    this.state.saving.storage.exportAsJson(data);
                    this.updateStatusBar('flowchart exported');
                } else {
                    this.updateStatusBar('saving module not available');
                }
            },

            async importData(file) {
                try {
                    if (!this.state.saving || !this.state.saving.storage) {
                        this.updateStatusBar('saving module not available');
                        return;
                    }
                    const data = await this.state.saving.storage.importFromJson(file);
                    if (this.state.saving) this.state.saving.importData(data);
                    this.updateStatusBar('flowchart imported successfully');
                } catch (error) {
                    this.updateStatusBar('failed to import flowchart');
                }
            },

            // utility methods
            getStats() {
                return {
                    ...this.state.getStats(),
                    canvasSize: { width: this.state.canvasWidth, height: this.state.canvasHeight },
                    zoomLevel: this.state.transform.k,
                    panPosition: { x: this.state.transform.x, y: this.state.transform.y }
                };
            },

            calculateNodeOrder() {
                return NodeOrder.calculateNodeOrder(this.state.nodes, this.state.links, this.state.groups);
            },

            switchToRunMode(clearRuntimeIndicators = true) {
                this.state.setMode('run');
                // enable auto tracking by default when entering run mode
                this.isAutoTrackEnabled = true;
                this.userDisabledTracking = false;
                if (this.toolbars && this.toolbars.refreshTrackBtnUI) {
                    this.toolbars.refreshTrackBtnUI();
                }
                // ensure any stale runtime indicators are cleared when entering run (unless restoring from history)
                if (clearRuntimeIndicators && this.executionLogic) {
                    this.clearIfRuntimeIndicators();
                }
            },

            switchToBuildMode() {
                this.state.setMode('build');
                // disable auto tracking when entering build mode
                this.isAutoTrackEnabled = false;
                this.userDisabledTracking = true;
                if (this.toolbars && this.toolbars.refreshTrackBtnUI) {
                    this.toolbars.refreshTrackBtnUI();
                }
                // clear any runtime indicators when switching to build mode
                if (this.executionLogic) {
                    this.clearIfRuntimeIndicators();
                }
                // hide the live execution feed when switching to build mode
                if (this.toolbars && this.toolbars.setRunFeedBarDisplay) {
                    this.toolbars.setRunFeedBarDisplay('none');
                }
            },

            toggleFlowView() {
                // allow flow view toggle in both build and run modes
                this.state.setFlowView(!this.state.isFlowView);
                if (this.state.isFlowView) {
                    NodeOrder.renderNodeOrder(this.nodeRenderer, (message) => this.updateStatusBar(message), this.state.nodes, this.state.links, this.state.groups);
                    this.updateStatusBar('flow view enabled - showing execution order');
                } else {
                    NodeOrder.hideNodeOrder(this.nodeRenderer);
                    this.updateStatusBar('flow view disabled');
                }
            },

            toggleErrorView() {
                // allow error view toggle in both build and run modes
                const next = !this.state.isErrorView;
                this.state.setErrorView(next);
                if (this.state.isErrorView) {
                    ErrorCircles.renderErrorCircles(this.nodeRenderer);
                    // also show coverage alerts if any
                    if (this.nodeRenderer && this.nodeRenderer.updateCoverageAlerts) {
                        this.nodeRenderer.updateCoverageAlerts();
                    } else {
                        console.warn('[error_view] nodeRenderer.updateCoverageAlerts unavailable');
                    }
                    // recompute link coverage now that error view is enabled
                    if (this.linkRenderer && this.linkRenderer.computeLinkCoverageFromAnalysis) {
                        this.linkRenderer.computeLinkCoverageFromAnalysis();
                        this.linkRenderer.updateLinkCoverageAlerts();
                    }
                    this.updateStatusBar('error view enabled - showing errors');
                } else {
                    ErrorCircles.hideErrorCircles(this.nodeRenderer, this.linkRenderer);
                    // ensure legacy coverage alerts are removed while disabled
                    if (this.nodeRenderer && this.nodeRenderer.updateCoverageAlerts) {
                        this.nodeRenderer.updateCoverageAlerts();
                    } else {
                        console.warn('[error_view] nodeRenderer.updateCoverageAlerts unavailable');
                    }
                    this.updateStatusBar('error view disabled');
                }
            },

            toggleGroupSelectMode() {
                // only allow in build mode
                if (!this.state.isBuildMode) {
                    this.updateStatusBar('group select only available in build mode');
                    return;
                }
                
                // explicitly toggle the state
                this.isGroupSelectMode = !this.isGroupSelectMode;
                
                // update button appearance
                const button = document.getElementById('group_select_btn');
                if (!button) {
                    console.error('Group select button not found!');
                    return;
                }
                
                if (this.isGroupSelectMode) {
                    button.classList.add('active');
                    this.updateStatusBar('group select mode enabled - drag to select multiple nodes');
                } else {
                    button.classList.remove('active');
                    this.updateStatusBar('group select mode disabled');
                    // hide any existing selection rectangle
                    this.state.selectionHandler.hideSelectionRect();
                }
                
                // update cursor style
                const canvas = document.getElementById('flowchart_canvas');
                if (this.isGroupSelectMode) {
                    canvas.style.cursor = 'crosshair';
                } else {
                    canvas.style.cursor = '';
                }
            },

            updateFlowViewUI(isFlowView) {
                const flowToggleBtn = document.getElementById('flow_toggle_btn');
                if (isFlowView) {
                    flowToggleBtn.classList.add('active');
                    flowToggleBtn.innerHTML = '<span class="material-icons">stop</span>';
                    flowToggleBtn.title = 'Stop Flow View';
                } else {
                    flowToggleBtn.classList.remove('active');
                    flowToggleBtn.innerHTML = '<span class="material-icons">device_hub</span>';
                    flowToggleBtn.title = 'Toggle Flow View';
                }
            },

            // execution methods - delegate to execution logic module
            async startExecution() {
                await this.executionLogic.startExecution();
            },
            
            async stopExecution() {
                await this.executionLogic.stopExecution();
            },
            
            updateExecutionUI(isExecuting) {
                this.executionLogic.updateExecutionUI(isExecuting);
            },
            
            async executeNodeLive(node, nodeIndex, totalNodes, accumulatedVariables = null) {
                return await this.executionLogic.executeNodeLive(node, nodeIndex, totalNodes, accumulatedVariables);
            },
            
            clearIfRuntimeIndicators() {
                if (this.executionLogic) {
                    this.executionLogic.clearIfRuntimeIndicators();
                }
            },
            
            resetNodeStates() {
                if (this.executionLogic) {
                    this.executionLogic.resetNodeStates();
                }
            },

            // getter methods to access execution logic data
            get nodeExecutionResults() {
                return this.executionLogic ? this.executionLogic.getExecutionResults() : new Map();
            },

            get nodeVariables() {
                return this.variableManager ? this.variableManager.getNodeVariables() : new Map();
            },

            get blockedNodeIds() {
                return this.executionLogic ? this.executionLogic.getBlockedNodeIds() : new Set();
            },

            get isExecuting() {
                return this.executionLogic ? this.executionLogic.isCurrentlyExecuting() : false;
            },

            get executionAborted() {
                return this.executionLogic ? this.executionLogic.isExecutionAborted() : false;
            },

            // setter methods to access execution logic data
            set nodeExecutionResults(results) {
                if (this.executionLogic) {
                    this.executionLogic.setExecutionResults(results);
                }
            },

            set nodeVariables(variables) {
                if (this.variableManager) {
                    this.variableManager.setNodeVariables(variables);
                }
            },

            set blockedNodeIds(blockedIds) {
                if (this.executionLogic) {
                    this.executionLogic.setBlockedNodeIds(blockedIds);
                }
            },

            set isExecuting(value) {
                if (this.executionLogic) {
                    this.executionLogic.setExecuting(value);
                }
            },

            set executionAborted(value) {
                if (this.executionLogic) {
                    this.executionLogic.setExecutionAborted(value);
                }
            },

            getCurrentFlowchartName() {
                // prefer the canonical filename from storage to avoid ui sync issues
                const filename = (this.state.saving && this.state.saving.storage) ? this.state.saving.storage.getCurrentFlowchart() || '' : '';
                if (filename) {
                    // strip .json extension for history api which expects folder name
                    return filename.endsWith('.json') ? filename.slice(0, -5) : filename;
                }

                // fallback to the selector's display name
                const selector = document.getElementById('flowchart_selector');
                return (selector && selector.value) ? selector.value : 'default';
            },

            async gatherInputVariables(targetNode) {
                return this.variableManager.gatherInputVariables(targetNode);
            },

            async persistDataSaveForNode(pythonNode) {
                return this.variableManager.persistDataSaveForNode(pythonNode);
            },

            getVariablesForResume(resumeNodeId, executionOrder) {
                return this.variableManager.getVariablesForResume(resumeNodeId, executionOrder);
            },

            async updateConnectedInputNodes(sourceNodeId, returnValue) {
                return this.variableManager.updateConnectedInputNodes(sourceNodeId, returnValue);
            },

            async analyzePythonFunction(pythonFile) {
                return this.variableManager.analyzePythonFunction(pythonFile);
            },

            matchVariableToParameter(sourceNode, returnValue, expectedParams, existingVariables) {
                return this.variableManager.matchVariableToParameter(sourceNode, returnValue, expectedParams, existingVariables);
            },

            getVariableNameForNode(sourceNode, returnValue) {
                return this.variableManager.getVariableNameForNode(sourceNode, returnValue);
            },

            // node state management methods - delegate to node state manager module
            setNodeState(nodeId, state) {
                this.nodeStateManager.setNodeState(nodeId, state);
            },
            
            addNodeLoadingAnimation(nodeId) {
                this.nodeStateManager.addNodeLoadingAnimation(nodeId);
            },
            
            removeNodeLoadingAnimation(nodeId) {
                this.nodeStateManager.removeNodeLoadingAnimation(nodeId);
            },
            
            clearAllNodeColorState() {
                this.nodeStateManager.clearAllNodeColorState();
            },
            
            // node state enum - delegate to node state manager
            get NODE_STATES() {
                return NodeStateManager.NODE_STATES;
            },

            // debug methods
            logState() {
                // debug method - removed console.log for cleaner output
            },

            // cleanup
            destroy() {
                // cleanup all components
                if (this.nodeRenderer) this.nodeRenderer.destroy();
                if (this.linkRenderer) this.linkRenderer.destroy();
                if (this.groupRenderer) this.groupRenderer.destroy();
                if (this.sidebar) this.sidebar.destroy();
                if (this.events) this.events.destroy();
                if (this.statusBar) this.statusBar.destroy();
                if (this.toolbars) this.toolbars.destroy();
                if (this.canvasHandler) this.canvasHandler.destroy();
                
                // remove event listeners
                window.removeEventListener('resize', this.handleResize);
                document.removeEventListener('dragstart', this.preventDefaultDrag);
                
                // flowchart builder destroyed
            },

            // extend prototype with a centralized clear for leaving run mode
            // this mirrors the clear button behavior so navigation away from run fully resets ui
            clearRunModeState() {
                this.resetNodeStates();
                this.outputManager.clearOutput();
                this.executionStatus.updateExecutionStatus('info', 'cleared');
                this.clearIfRuntimeIndicators();
                this.nodeStateManager.clearAllNodeColorState();
                // clear selection and ensure default run panel when coming back later
                this.selectionHandler.clearSelection(); 
                this.state.emit('updateSidebar');
            },

            // setup sidebar toggle method for toolbars
            setupSidebarToggle() {
                const toggleSidebarBtn = document.getElementById('toggle_sidebar_btn');
                if (toggleSidebarBtn) {
                    // remove existing listener to prevent duplicates
                    if (toggleSidebarBtn._wired) {
                        toggleSidebarBtn.removeEventListener('click', toggleSidebarBtn._clickHandler);
                    }
                    
                    // create the click handler
                    toggleSidebarBtn._clickHandler = () => {
                        const propertiesSidebar = document.getElementById('properties_sidebar');
                        const isCurrentlyCollapsed = propertiesSidebar && propertiesSidebar.classList.contains('collapsed');

                        // use centralized sidebar api to handle all the toggling
                        this.sidebar.setCollapsed(!isCurrentlyCollapsed);
                    };
                    
                    // attach the listener
                    toggleSidebarBtn.addEventListener('click', toggleSidebarBtn._clickHandler, { passive: true });
                    toggleSidebarBtn._wired = true;
                }
            }
        };

        return app;
    }

    // initialize core systems
    async function initializeCore() {
        const app = window.flowchartApp;
        
        // create state manager
        app.state = new StateManager();
        
        // initialize saving module
        app.state.saving = new Saving(app.state);

        // initialize execution feed module
        app.executionFeed = new ExecutionFeed(app.state);
        
        // initialize node creation service
        app.createNode = new CreateNode(app.state, (message) => app.updateStatusBar(message));
        
        // set createNode reference in state manager for methods that need it
        app.state.createNode = app.createNode;
        
        // initialize delete node service
        app.deleteNode = new DeleteNode(app.state);
        
        // set deleteNode reference in state manager for methods that need it
        app.state.deleteNode = app.deleteNode;
        
        // create event manager
        app.events = new EventManager(app.state, app.createNode, app);
        
        // initialize execution logic module
        app.executionLogic = new ExecutionLogic(app);
        
        // initialize node state manager module
        app.nodeStateManager = new NodeStateManager(app);
        
        // initialize variable manager module
        app.variableManager = new VariableManager(app);
        
        // initialize resume execution module
        app.resumeExecution = new ResumeExecution(app);
        
        // initialize execution status module
        app.executionStatus = new ExecutionStatus(app);
        
        // initialize output manager module
        app.outputManager = new OutputManager(app);
        
        // initialize saving module with builder reference for execution history
        app.state.saving.initialize(app);
        
        // setup resume execution listener
        app.state.on('resumeExecutionFromNode', (data) => app.resumeExecution.handleResumeExecution(data));
    }

    // initialize components
    async function initializeComponents() {
        const app = window.flowchartApp;
        
        // initialize sidebar
        app.sidebar = new Sidebar(app.state, app.createNode);
    }

    // initialize canvas
    async function initializeCanvas() {
        const app = window.flowchartApp;
        
        // get canvas dimensions
        app.updateCanvasDimensions();
        
        // setup svg canvas
        app.svg = d3.select('#flowchart_canvas')
            .attr('width', app.state.canvasWidth)
            .attr('height', app.state.canvasHeight);

        // setup zoom and pan
        setupZoomPan();

        // get zoom group container
        app.zoomGroup = app.svg.select('#zoom_group');

        // setup svg definitions (arrows, etc.)
        setupSvgDefinitions();

        // initialize viewport tracker module (after svg is set up)
        app.viewportTracker = new ViewportTracker(app);

        // initialize renderers
        await initializeRenderers();
    }

    // setup zoom and pan
    function setupZoomPan() {
        const app = window.flowchartApp;
        
        app.zoom = d3.zoom()
            .scaleExtent([0.1, 4])
            .filter((event) => {
                // allow wheel zoom always; block panning during drags/selections
                if (event.type === 'wheel') return true;
                return !app.state.isDragging && !app.state.connectionHandler.isConnecting && !app.isGroupSelectMode && event.button !== 2;
            })
            .on('zoom', (event) => {
                app.state.setTransform(event.transform);
                app.zoomGroup.attr('transform', event.transform);
                // persist viewport changes with debounce
                app.scheduleViewportSave();
                // if the user moved the viewport while executing, disable auto tracking until re-enabled
                // do not disable for programmatic transforms (event.sourceEvent is null for programmatic)
                const isUserGesture = !!(event && event.sourceEvent);
                if (isUserGesture && app.isExecuting && app.isAutoTrackEnabled && !app.userDisabledTracking) {
                    app.userDisabledTracking = true;
                    if (app.toolbars && app.toolbars.refreshTrackBtnUI) {
                        app.toolbars.refreshTrackBtnUI();
                    }
                }
            });

        app.svg.call(app.zoom);
    }

    // setup svg definitions
    function setupSvgDefinitions() {
        const app = window.flowchartApp;
        
        const defs = app.svg.select('defs').empty() 
            ? app.svg.append('defs') 
            : app.svg.select('defs');

        // svg definitions can be added here if needed
        // removed arrowhead marker since we use custom middle arrows instead
    }

    // initialize renderers
    async function initializeRenderers() {
        const app = window.flowchartApp;
        
        // create renderers in correct order (groups behind nodes)
        app.groupRenderer = new GroupRenderer(app.state, app.zoomGroup);
        app.linkRenderer = new LinkRenderer(app.state, app.zoomGroup);
        app.nodeRenderer = new NodeRenderer(app.state, app.zoomGroup, app.createNode);
        // annotations above nodes
        app.annotationRenderer = new AnnotationRenderer(app.state, app.zoomGroup);
    }

    // initialize interactions
    async function initializeInteractions() {
        const app = window.flowchartApp;
        
        // create interaction handlers
        app.dragHandler = new DragHandler(app.state, app.events);
        app.selectionHandler = new SelectionHandler(app.state, app.events);
        
        // store selection handler reference in state manager
        app.state.selectionHandler = app.selectionHandler;
        
        // connect selection handler to state changes for validation
        app.state.connectSelectionHandler();
        
        app.connectionHandler = new ConnectionHandler(app.state, app.events);
        
        // store connection handler reference in state manager
        app.state.connectionHandler = app.connectionHandler;
        
        // setup canvas interactions directly
        app.canvasHandler = new CanvasHandler(app.state, app.selectionHandler, app.connectionHandler, app.createNode);
        app.canvasHandler.setupCanvasInteractions(app.svg, app.zoomGroup);
        
        // setup node interactions directly
        app.nodeRenderer.setupNodeInteractions();
    }

    // initialize UI
    async function initializeUI() {
        const app = window.flowchartApp;
        
        // setup navigation buttons
        setupNavigationButtons();
        
        // setup status bar component
        if (window.StatusBar) {
            app.statusBar = new StatusBar(app);
        } else {
            console.error('StatusBar component not available');
        }
        
        // setup context menu and window events directly
        app.canvasHandler.setupContextMenu();
        app.canvasHandler.setupWindowEvents(app.events);

        // modal close buttons are now handled automatically by ModalManager
    }

    // setup navigation buttons
    function setupNavigationButtons() {
        const app = window.flowchartApp;
        
        // delegate to centralized navigation module for left navigation
        window.Navigation.setupNavButtons(app);

        // setup toolbars module
        app.toolbars = new Toolbars(app);
        
        // setup sidebar toggle
        setupSidebarToggle();
    }

    // setup sidebar toggle
    function setupSidebarToggle() {
        const app = window.flowchartApp;
        
        const toggleSidebarBtn = document.getElementById('toggle_sidebar_btn');
        if (toggleSidebarBtn) {
            // remove existing listener to prevent duplicates
            if (toggleSidebarBtn._wired) {
                toggleSidebarBtn.removeEventListener('click', toggleSidebarBtn._clickHandler);
            }
            
            // create the click handler
            toggleSidebarBtn._clickHandler = () => {
                const propertiesSidebar = document.getElementById('properties_sidebar');
                const isCurrentlyCollapsed = propertiesSidebar && propertiesSidebar.classList.contains('collapsed');

                // use centralized sidebar api to handle all the toggling
                app.sidebar.setCollapsed(!isCurrentlyCollapsed);
            };
            
            // attach the listener
            toggleSidebarBtn.addEventListener('click', toggleSidebarBtn._clickHandler, { passive: true });
            toggleSidebarBtn._wired = true;
        }
    }

    // final app initialization (async)
    async function finalizeApp() {
        const app = window.flowchartApp;
        
        if (!app) {
            console.error('flowchartApp is undefined in finalizeApp');
            return;
        }
        
        try {
            // wait for sidebar to initialize flowchart dropdown and set current flowchart
            // ensure the method exists before calling it (sidebar modules load asynchronously)
            if (typeof app.sidebar.initializeFlowchartDropdown === 'function') {
                await app.sidebar.initializeFlowchartDropdown();
            } else {
                console.warn('initializeFlowchartDropdown not available, waiting for sidebar modules to load...');
                // wait a bit for sidebar modules to load
                await new Promise(resolve => setTimeout(resolve, 500));
                if (typeof app.sidebar.initializeFlowchartDropdown === 'function') {
                    await app.sidebar.initializeFlowchartDropdown();
                } else {
                    console.error('initializeFlowchartDropdown still not available after delay');
                }
            }
            
            // now load the initial data with correct flowchart
            await app.loadInitialData();
            
            // set initial mode from url if provided (e.g., ?mode=run)
            const params = new URLSearchParams(window.location.search);
            const mode = params.get('mode');
            if (mode === 'run') {
                app.switchToRunMode();
            } else {
                if (app.toolbars) {
                    app.toolbars.updateModeUI('build', null);
                }
            }
            
            // coordinates are handled by StatusBar component
        } catch (error) {
            if (app && app.handleError) {
                app.handleError('failed to initialize application', error);
            } else {
                console.error('failed to initialize application', error);
            }
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
            if (app && app.state && app.state.saving) {
                app.state.saving.flushPendingSavesOnExit();
            }
            // clear transient runtime visuals before teardown/navigation so no green/red persists
            try { 
                if (app && app.nodeStateManager && typeof app.nodeStateManager.clearAllNodeColorState === 'function') { 
                    app.nodeStateManager.clearAllNodeColorState(); 
                } else if (app && typeof app.clearAllNodeColorState === 'function') { 
                    app.clearAllNodeColorState(); 
                } 
            } catch (_) {}
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
            if (app && app.state && app.state.saving) {
                app.state.saving.flushPendingSavesOnExit();
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
