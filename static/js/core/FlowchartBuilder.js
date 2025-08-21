// main flowchart builder orchestrator
(function(){
    'use strict';
    if (window.FlowchartBuilder) { return; }

class FlowchartBuilder {
    constructor(autoInit = true) {
        // viewport persistence
        this.viewportSaveTimer = null;
        this.viewportSaveDelay = 250; // ms
        
        // only auto-initialize if requested (default behavior for backward compatibility)
        if (autoInit) {
            this.initializeAll();
        }
    }

    // main initialization method that can be called externally
    async initializeAll() {
        // initialize all systems in logical order
        await this.initializeCore();
        await this.initializeComponents();
        await this.initializeCanvas();
        await this.initializeInteractions();
        await this.initializeUI();
        await this.initializeApp();
    }

    async initializeCore() {
        // create state manager
        this.state = new StateManager();
        
        // initialize node creation service
        this.createNode = new CreateNode(this.state, (message) => this.updateStatusBar(message));
        
        // set createNode reference in state manager for methods that need it
        this.state.createNode = this.createNode;
        
        // create event manager
        this.events = new EventManager(this.state, this.createNode);
        
        // execution control
        this.currentExecutionController = null;
        
        // execution state - these will be managed by executionLogic
        // guard to prevent double-start on rapid clicks
		this.executionStarting = false;
        // auto-track state: when true, viewport follows the active node during execution
        this.isAutoTrackEnabled = false;
        // when the user manually pans/zooms, we disable auto-track until re-enabled by the user
        this.userDisabledTracking = false;
        // last execution snapshot for no-selection run view
        this.lastExecutionStatus = 'idle'; // 'running' | 'completed' | 'failed' | 'stopped' | 'error' | 'idle'
        this.lastFailedNode = null; // { id, name, pythonFile, error }
        
        // group select mode state
        this.isGroupSelectMode = false;
        this.justFinishedDragSelection = false;
        

        
        // store execution results for individual nodes
        this.nodeExecutionResults = new Map(); // nodeId -> execution result (legacy reference)
        this.globalExecutionLog = ''; // overall execution log
        this.nodeVariables = new Map(); // nodeId -> returned variables from function (legacy reference)
        // restored variable state from history (for resume functionality)
        this.restoredVariableState = null;

        // runtime branch control: nodes blocked by false if arms in the current run
        // all comments in lower case
        this.blockedNodeIds = new Set();
        
                        // initialize execution logic module
                this.executionLogic = new ExecutionLogic(this);
                
                // initialize node state manager module
                this.nodeStateManager = new NodeStateManager(this);
        
        // setup core event listeners
        this.setupCoreEvents();
        
        // setup resume execution listener
        this.state.on('resumeExecutionFromNode', (data) => this.handleResumeExecution(data));
    }

    async initializeComponents() {
        // initialize sidebar
        this.sidebar = new Sidebar(this.state, this.createNode);
    }

    async initializeCanvas() {
        // get canvas dimensions
        this.updateCanvasDimensions();
        
        // setup svg canvas
        this.svg = d3.select('#flowchart_canvas')
            .attr('width', this.state.canvasWidth)
            .attr('height', this.state.canvasHeight);

        // setup zoom and pan
        this.setupZoomPan();

        // get zoom group container
        this.zoomGroup = this.svg.select('#zoom_group');

        // setup svg definitions (arrows, etc.)
        this.setupSvgDefinitions();

        // initialize renderers
        await this.initializeRenderers();
    }

    async initializeRenderers() {
        // create renderers in correct order (groups behind nodes)
        this.groupRenderer = new GroupRenderer(this.state, this.zoomGroup);
        this.linkRenderer = new LinkRenderer(this.state, this.zoomGroup);
        this.nodeRenderer = new NodeRenderer(this.state, this.zoomGroup, this.createNode);
        // annotations above nodes
        this.annotationRenderer = new AnnotationRenderer(this.state, this.zoomGroup);
    }

    async initializeInteractions() {
        // create interaction handlers
        this.dragHandler = new DragHandler(this.state, this.events);
        this.selectionHandler = new SelectionHandler(this.state, this.events);
        
        // store selection handler reference in state manager
        this.state.selectionHandler = this.selectionHandler;
        
        this.connectionHandler = new ConnectionHandler(this.state, this.events);
        
        // setup canvas interactions directly
        this.canvasHandler = new CanvasHandler(this.state, this.selectionHandler, this.connectionHandler, this.createNode);
        this.canvasHandler.setupCanvasInteractions(this.svg, this.zoomGroup);
        
        // setup node interactions directly
        this.nodeRenderer.setupNodeInteractions();
    }

    async initializeUI() {
        // setup navigation buttons
        this.setupNavigationButtons();
        
        // setup status bar component
        if (window.StatusBar) {
            this.statusBar = new StatusBar(this);
        } else {
            console.error('StatusBar component not available');
        }
        
        // setup context menu and window events directly
        this.canvasHandler.setupContextMenu();
        this.canvasHandler.setupWindowEvents(this.events);

        // wire modal close for massive change modal if present
        const overlay = document.getElementById('massive_change_modal');
        const closeBtn = document.getElementById('massive_change_close');
        if (overlay && closeBtn) {
            closeBtn.addEventListener('click', () => overlay.classList.remove('modal_overlay_is_open'));
        }
    }

    setupCoreEvents() {
        // group related events for better organization
        this.setupStateEvents();
        this.setupDataEvents();
        this.setupModeEvents();
        this.setupSelectionEvents();
        this.setupCoordinateEvents();
    }

    setupStateEvents() {
        // core state changes
        this.state.on('stateChanged', () => {
            // update order when state changes if in flow view
            if (this.state.isFlowView) {
                NodeOrder.renderNodeOrder(this.nodeRenderer, (message) => this.updateStatusBar(message), this.state.nodes, this.state.links, this.state.groups);
            }
            if (this.state.isErrorView) {
                ErrorCircles.renderErrorCircles(this.nodeRenderer);
                if (this.nodeRenderer && this.nodeRenderer.updateCoverageAlerts) {
                    this.nodeRenderer.updateCoverageAlerts();
                }
            }
        });
        
        // status updates
        this.state.on('statusUpdate', (message) => {
            this.updateStatusBar(message);
        });
    }

    setupDataEvents() {
        // data events
        this.state.on('dataSaved', (data) => {
            if (data.message) {
                this.updateStatusBar(data.message);
            }
        });
        
        this.state.on('dataLoaded', (data) => {
            this.restoreViewportFromStorage();
            if (this.state.isHistoryMode) {
                this.loadExecutionHistory();
            }
        });
        
        // error events
        this.state.on('saveError', (data) => {
            this.updateStatusBar(data.message);
        });
        
        this.state.on('loadError', (data) => {
            this.updateStatusBar(data.message);
        });
        
        // destructive change guard
        this.state.on('destructiveChangeDetected', (info) => {
            this.showMassiveChangeModal(info);
        });
    }

    setupModeEvents() {
        // zoom events
        this.state.on('disableZoom', () => this.disableZoom());
        this.state.on('enableZoom', () => this.enableZoom());
        
        // mode change events
        this.state.on('modeChanged', (data) => {
            if (this.toolbars) {
                this.toolbars.updateModeUI(data.mode, data.previousMode);
            }
        });
        
        this.state.on('flowViewChanged', (data) => {
            this.updateFlowViewUI(data.isFlowView);
        });
        
        this.state.on('errorViewChanged', (data) => {
            ErrorCircles.updateErrorViewUI(data.isErrorView);
        });
        
        // link events for error view
        ['linkAdded','linkUpdated','linkRemoved'].forEach(evt => {
            this.state.on(evt, () => {
                if (this.state.isErrorView && this.linkRenderer && this.linkRenderer.renderCoverageAlerts) {
                    this.linkRenderer.renderCoverageAlerts();
                }
            });
        });
    }

    setupSelectionEvents() {
        // selection changes
        this.state.on('selectionChanged', () => {
            if (this.annotationRenderer && this.annotationRenderer.render) {
                this.annotationRenderer.render();
            }
            // scroll to selected node in run mode
            if (this.state.isRunMode && this.state.selectedNodes.size === 1) {
                const nodeId = Array.from(this.state.selectedNodes)[0];
                setTimeout(() => {
                    this.scrollRunFeedToNode(nodeId);
                }, 0);
            }
        });

        // node removal in build mode
        this.state.on('nodeRemoved', () => {
            if (this.state.isBuildMode) {
                this.deselectAll();
            }
        });
        
        // link clicks
        this.state.on('linkClicked', (data) => {
            this.selectionHandler.handleLinkClick(data.event, data.link);
        });
    }

    setupCoordinateEvents() {
        // selection rectangle events
        this.state.on('showSelectionRect', (rect) => {
            this.showSelectionRect(rect);
        });
        
        this.state.on('updateSelectionRect', (rect) => {
            this.updateSelectionRect(rect);
        });
        
        this.state.on('hideSelectionRect', () => {
            this.hideSelectionRect();
        });
    }
    // modal for massive change detection
    showMassiveChangeModal(info) {
        const overlay = document.getElementById('massive_change_modal');
        const yesBtn = document.getElementById('massive_change_yes');
        const noBtn = document.getElementById('massive_change_no');
        if (!overlay || !yesBtn || !noBtn) return;
        overlay.classList.add('modal_overlay_is_open');
        const close = () => overlay.classList.remove('modal_overlay_is_open');
        const onYes = async () => {
            try {
                const res = await this.state.storage.restoreLatestBackup();
                if (res && res.success) {
                    await this.state.load();
                    this.updateStatusBar('restored latest backup');
                } else {
                    this.updateStatusBar((res && res.message) || 'failed to restore backup');
                }
            } catch (_) {}
            cleanup();
        };
        const onNo = async () => {
            try {
                // force the save to accept the destructive change
                await this.state.save(false, true);
                this.updateStatusBar('changes saved');
            } catch (_) {}
            cleanup();
        };
        const cleanup = () => {
            yesBtn.removeEventListener('click', onYes);
            noBtn.removeEventListener('click', onNo);
            close();
        };
        yesBtn.addEventListener('click', onYes);
        noBtn.addEventListener('click', onNo);
    }

    setupZoomPan() {
        this.zoom = d3.zoom()
            .scaleExtent([0.1, 4])
            .filter((event) => {
                // allow wheel zoom always; block panning during drags/selections
                if (event.type === 'wheel') return true;
                return !this.state.isDragging && !this.state.isConnecting && !this.isGroupSelectMode && event.button !== 2;
            })
            .on('zoom', (event) => {
                this.state.setTransform(event.transform);
                this.zoomGroup.attr('transform', event.transform);
                // persist viewport changes with debounce
                this.scheduleViewportSave();
                // if the user moved the viewport while executing, disable auto tracking until re-enabled
                // do not disable for programmatic transforms (event.sourceEvent is null for programmatic)
                const isUserGesture = !!(event && event.sourceEvent);
                if (isUserGesture && this.isExecuting && this.isAutoTrackEnabled && !this.userDisabledTracking) {
                    this.userDisabledTracking = true;
                    if (this.toolbars && this.toolbars.refreshTrackBtnUI) {
                        this.toolbars.refreshTrackBtnUI();
                    }
                }
            });

        this.svg.call(this.zoom);
    }

    // viewport persistence helpers
    getViewportStorageKey() {
        // use current flowchart name to scope viewport
        const name = this.state.storage.getCurrentFlowchart() || 'default.json';
        return `flowchart_viewport:${name}`;
    }

    scheduleViewportSave() {
        // debounce saves to avoid excessive writes
        if (this.viewportSaveTimer) {
            clearTimeout(this.viewportSaveTimer);
        }
        this.viewportSaveTimer = setTimeout(() => {
            this.saveViewportToStorage();
        }, this.viewportSaveDelay);
    }

    saveViewportToStorage() {
        try {
            const t = this.state.transform || d3.zoomIdentity;
            const payload = { x: t.x, y: t.y, k: t.k };
            localStorage.setItem(this.getViewportStorageKey(), JSON.stringify(payload));
        } catch (_) {
            // ignore storage errors silently
        }
    }

    restoreViewportFromStorage() {
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
    }

    setupSvgDefinitions() {
        const defs = this.svg.select('defs').empty() 
            ? this.svg.append('defs') 
            : this.svg.select('defs');

        // svg definitions can be added here if needed
        // removed arrowhead marker since we use custom middle arrows instead
    }



    setupNavigationButtons() {
        // delegate to centralized navigation module for left navigation
        window.Navigation.setupNavButtons(this);

        // setup toolbars module
        this.toolbars = new Toolbars(this);
        
        // setup sidebar toggle
        this.setupSidebarToggle();
    }











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





    // node creation delegated to CreateNode class



    // zoom operations
    disableZoom() {
        this.svg.on('.zoom', null);
    }

    enableZoom() {
        this.svg.call(this.zoom);
    }

    zoomToFit() {
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
    }

    resetZoom() {
        this.svg.transition()
            .duration(500)
            .call(this.zoom.transform, d3.zoomIdentity);
    }

    // reset zoom to 1 and center the first node in flow order (works in build and run modes)
    resetViewToFirstNode() {
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
            targetNode = this.state.getNode(1) || null;
        }

        // animate center to the chosen node at zoom 1
        if (targetNode && typeof targetNode.id !== 'undefined') {
            this.centerOnNodeWithTopOffset(targetNode.id, 300, 400, 1);
        }

        // restore previous auto-tracking state but remain user-disabled until next explicit toggle
        // this preserves run-mode preference and avoids snapping away immediately
        this.isAutoTrackEnabled = prevAutoTrack;
        this.userDisabledTracking = true;
        if (this.toolbars && this.toolbars.refreshTrackBtnUI) {
            this.toolbars.refreshTrackBtnUI();
        }
    }

    // smoothly center a node in both axes at a specific zoom level
    centerOnNodeCentered(nodeId, duration = 400, scaleOverride = null, easeFn = d3.easeCubicOut) {
        const node = this.state.getNode(nodeId);
        if (!node) return;
        const currentScale = this.state.transform && this.state.transform.k ? this.state.transform.k : 1;
        const scale = scaleOverride || currentScale;

        const svgEl = this.svg && this.svg.node ? this.svg.node() : null;
        const containerEl = document.querySelector('.canvas_container');
        if (!svgEl || !containerEl) return;

        const svgRect = svgEl.getBoundingClientRect();
        const containerRect = containerEl.getBoundingClientRect();

        const desiredSvgX = (containerRect.left - svgRect.left) + (containerRect.width / 2);
        const desiredSvgY = (containerRect.top - svgRect.top) + (containerRect.height / 2);

        const targetTranslateX = desiredSvgX - (scale * node.x);
        const targetTranslateY = desiredSvgY - (scale * node.y);

        this.svg
            .transition()
            .duration(Math.max(0, duration | 0))
            .ease(easeFn || d3.easeCubicOut)
            .call(this.zoom.transform, d3.zoomIdentity.translate(targetTranslateX, targetTranslateY).scale(scale));
    }

    // smoothly center horizontally and position a node offset from top at a specific zoom level
    centerOnNodeWithTopOffset(nodeId, offsetTopPx = 400, duration = 400, scaleOverride = null, easeFn = d3.easeCubicOut) {
        const node = this.state.getNode(nodeId);
        if (!node) return;
        const currentScale = this.state.transform && this.state.transform.k ? this.state.transform.k : 1;
        const scale = scaleOverride || currentScale;

        const svgEl = this.svg && this.svg.node ? this.svg.node() : null;
        const containerEl = document.querySelector('.canvas_container');
        if (!svgEl || !containerEl) return;

        const svgRect = svgEl.getBoundingClientRect();
        const containerRect = containerEl.getBoundingClientRect();

        // center horizontally, offset vertically from the top by offsetTopPx
        const desiredSvgX = (containerRect.left - svgRect.left) + (containerRect.width / 2);
        const desiredSvgY = (containerRect.top - svgRect.top) + offsetTopPx;

        const targetTranslateX = desiredSvgX - (scale * node.x);
        const targetTranslateY = desiredSvgY - (scale * node.y);

        this.svg
            .transition()
            .duration(Math.max(0, duration | 0))
            .ease(easeFn || d3.easeCubicOut)
            .call(this.zoom.transform, d3.zoomIdentity.translate(targetTranslateX, targetTranslateY).scale(scale));
    }



    updateCanvasDimensions() {
        const width = window.innerWidth - 600; // both sidebars
        const height = window.innerHeight - 32; // status bar
        
        this.state.setCanvasSize(width, height);
    }

    handleResize() {
        this.updateCanvasDimensions();
        
        if (this.svg) {
            this.svg
                .attr('width', this.state.canvasWidth)
                .attr('height', this.state.canvasHeight);
        }
    }

    // app initialization (async)
    async initializeApp() {
        try {
            // wait for sidebar to initialize flowchart dropdown and set current flowchart
            await this.sidebar.initializeFlowchartDropdown();
            
            // now load the initial data with correct flowchart
            await this.loadInitialData();
            
            // set initial mode from url if provided (e.g., ?mode=run)
            const params = new URLSearchParams(window.location.search);
            const mode = params.get('mode');
            if (mode === 'run') {
                this.switchToRunMode();
            } else {
                if (this.toolbars) {
            this.toolbars.updateModeUI('build', null);
        }
            }
            
            // coordinates are handled by StatusBar component
        } catch (error) {
            this.handleError('failed to initialize application', error);
        }
    }

    // error handling helper
    handleError(message, error) {
        console.error(message, error);
        this.updateStatusBar(message);
    }

    // helper method for safe status bar updates
    updateStatusBar(message) {
        if (this.statusBar) {
            this.statusBar.updateStatusBar(message);
        }
    }

    // data operations
    async loadInitialData() {
        try {
            await this.state.load();
        } catch (error) {
            this.updateStatusBar('failed to load saved data');
        }
    }

    async saveData() {
        try {
            const result = await this.state.save();
            if (result.success) {
                this.updateStatusBar('flowchart saved successfully');
            } else {
                this.updateStatusBar('failed to save flowchart');
            }
        } catch (error) {
            this.updateStatusBar('save error occurred');
        }
    }

    exportData() {
        const data = this.state.exportData();
        this.state.storage.exportAsJson(data);
        this.updateStatusBar('flowchart exported');
    }



    async importData(file) {
        try {
            const data = await this.state.storage.importFromJson(file);
            this.state.importData(data);
            this.updateStatusBar('flowchart imported successfully');
        } catch (error) {
            this.updateStatusBar('failed to import flowchart');
        }
    }

    // utility methods
    getStats() {
        return {
            ...this.state.getStats(),
            canvasSize: { width: this.state.canvasWidth, height: this.state.canvasHeight },
            zoomLevel: this.state.transform.k,
            panPosition: { x: this.state.transform.x, y: this.state.transform.y }
        };
    }

    calculateNodeOrder() {
        return NodeOrder.calculateNodeOrder(this.state.nodes, this.state.links, this.state.groups);
    }



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
    }

            // history mode removed

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
    }

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
    }

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
            this.hideSelectionRect();
        }
        
        // update cursor style
        const canvas = document.getElementById('flowchart_canvas');
        if (this.isGroupSelectMode) {
            canvas.style.cursor = 'crosshair';
        } else {
            canvas.style.cursor = '';
        }
    }

    // selection rectangle methods
    showSelectionRect(rect) {
        // remove any existing selection rectangle
        this.zoomGroup.select('.selection_rect').remove();
        
        // create new selection rectangle
        this.selectionRect = this.zoomGroup.append('rect')
            .attr('class', 'selection_rect')
            .attr('x', Math.min(rect.startX, rect.endX))
            .attr('y', Math.min(rect.startY, rect.endY))
            .attr('width', Math.abs(rect.endX - rect.startX))
            .attr('height', Math.abs(rect.endY - rect.startY))
            .style('fill', 'rgba(74, 165, 245, 0.1)')
            .style('stroke', '#4aa5f5')
            .style('stroke-width', '1px')
            .style('stroke-dasharray', '5,5')
            .style('pointer-events', 'none');
    }

    updateSelectionRect(rect) {
        if (this.selectionRect) {
            this.selectionRect
                .attr('x', Math.min(rect.startX, rect.endX))
                .attr('y', Math.min(rect.startY, rect.endY))
                .attr('width', Math.abs(rect.endX - rect.startX))
                .attr('height', Math.abs(rect.endY - rect.startY));
        }
    }

    hideSelectionRect() {
        if (this.selectionRect) {
            this.selectionRect.remove();
            this.selectionRect = null;
        }
    }







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
    }



    deselectAll() {
        // if group select mode is active, turn it off and enable pan tool
        if (this.isGroupSelectMode) {
            this.isGroupSelectMode = false;
            
            // update group select button appearance
            const groupSelectButton = document.getElementById('group_select_btn');
            if (groupSelectButton) {
                groupSelectButton.classList.remove('active');
            }
            
            // hide any existing selection rectangle
            this.hideSelectionRect();
            
            // update cursor style
            const canvas = document.getElementById('flowchart_canvas');
            if (canvas) {
                canvas.style.cursor = '';
            }
            
            this.updateStatusBar('pan tool enabled');
        }
        
        // clear all selections
        this.selectionHandler.clearSelection();
        
        // update visual state
        this.nodeRenderer.updateNodeStyles();
        this.linkRenderer.updateLinkStyles();
        
        // update properties sidebar depending on mode
        if (this.state.isRunMode) {
            // keep execution panel visible and show run-mode default (status + progress)
            this.showExecutionPanel();
            this.state.emit('updateSidebar');
            // when in run mode and nothing is selected, ensure global status reflects the last run outcome
            const s = String(this.lastExecutionStatus || 'idle');
            if (['completed', 'stopped', 'failed', 'error'].includes(s)) {
                this.updateExecutionStatus(s, '');
            }
        } else {
            this.sidebar.showDefaultPanel();
        }
        
        this.updateStatusBar('all selections cleared');
    }

    // execution methods
    showExecutionPanel() {
        // only show execution panel in run mode
        if (this.state.isRunMode) {
            // hide all other panels
            document.querySelectorAll('.properties_content').forEach(panel => {
                panel.classList.remove('active');
            });
            
            // show execution panel
            const executionPanel = document.getElementById('run_execution_properties');
            executionPanel.classList.add('active');

            // force sidebar to render default run view (status + progress only)
            this.selectionHandler.clearSelection();
            this.state.emit('updateSidebar');
        }
    }

    hideExecutionPanel() {
        // hide execution panel
        const executionPanel = document.getElementById('run_execution_properties');
        if (executionPanel) {
            executionPanel.classList.remove('active');
        }
        
        // let sidebar handle showing the appropriate panel
        if (this.state.isBuildMode) {
            // trigger sidebar update to show correct panel for current selection
            this.state.emit('updateSidebar');
        }
    }

    // history panel removed

    // history panel removed

    // execution methods - delegate to execution logic module
    async startExecution() {
        await this.executionLogic.startExecution();
    }
    
    async stopExecution() {
        await this.executionLogic.stopExecution();
    }
    
    updateExecutionUI(isExecuting) {
        this.executionLogic.updateExecutionUI(isExecuting);
    }
    
    async executeNodeLive(node, nodeIndex, totalNodes, accumulatedVariables = null) {
        return await this.executionLogic.executeNodeLive(node, nodeIndex, totalNodes, accumulatedVariables);
    }
    
    clearIfRuntimeIndicators() {
        if (this.executionLogic) {
            this.executionLogic.clearIfRuntimeIndicators();
        }
    }
    
    resetNodeStates() {
        if (this.executionLogic) {
            this.executionLogic.resetNodeStates();
        }
    }

    // getter methods to access execution logic data
    get nodeExecutionResults() {
        return this.executionLogic ? this.executionLogic.getExecutionResults() : new Map();
    }

    get nodeVariables() {
        return this.executionLogic ? this.executionLogic.getNodeVariables() : new Map();
    }

    get blockedNodeIds() {
        return this.executionLogic ? this.executionLogic.getBlockedNodeIds() : new Set();
    }

    get isExecuting() {
        return this.executionLogic ? this.executionLogic.isCurrentlyExecuting() : false;
    }

    get executionAborted() {
        return this.executionLogic ? this.executionLogic.isExecutionAborted() : false;
    }

    // setter methods to access execution logic data
    set nodeExecutionResults(results) {
        if (this.executionLogic) {
            this.executionLogic.setExecutionResults(results);
        }
    }

    set nodeVariables(variables) {
        if (this.executionLogic) {
            this.executionLogic.setNodeVariables(variables);
        }
    }

    set blockedNodeIds(blockedIds) {
        if (this.executionLogic) {
            this.executionLogic.setBlockedNodeIds(blockedIds);
        }
    }

    set isExecuting(value) {
        if (this.executionLogic) {
            this.executionLogic.setExecuting(value);
        }
    }

    set executionAborted(value) {
        if (this.executionLogic) {
            this.executionLogic.setExecutionAborted(value);
        }
    }

    

    

    
    getCurrentFlowchartName() {
        // prefer the canonical filename from storage to avoid ui sync issues
        const filename = this.state.storage.getCurrentFlowchart() || '';
        if (filename) {
            // strip .json extension for history api which expects folder name
            return filename.endsWith('.json') ? filename.slice(0, -5) : filename;
        }

        // fallback to the selector's display name
        const selector = document.getElementById('flowchart_selector');
        return (selector && selector.value) ? selector.value : 'default';
    }

    async saveExecutionHistory(status, executionOrder, errorMessage = null) {
        try {
            // prepare execution results
            const results = [];
            
            // convert node execution results to array format
            for (const node of executionOrder) {
                const result = this.nodeExecutionResults.get(node.id);
                if (result) {
                    results.push({
                        node_id: node.id,
                        node_name: node.name,
                        python_file: (node.pythonFile || '').replace(/\\/g,'/').replace(/^(?:nodes\/)*/i,''),
                        success: result.success,
                        output: result.output,
                        error: result.error,
                        runtime: result.runtime,
                        timestamp: result.timestamp,
                        return_value: result.return_value,
                        function_name: result.function_name,
                        input_args: result.input_args
                    });
                }
            }

                // also include synthesized results for data_save nodes (not part of executionOrder)
            const dataSaveNodes = this.state.nodes.filter(n => n.type === 'data_save');
            for (const ds of dataSaveNodes) {
                const dsResult = this.nodeExecutionResults.get(ds.id);
                if (!dsResult) continue;
                results.push({
                    node_id: ds.id,
                    node_name: ds.name,
                    python_file: (dsResult.python_file || '').replace(/\\/g,'/').replace(/^(?:nodes\/)*/i,''),
                    success: dsResult.success,
                    output: dsResult.output,
                    error: dsResult.error,
                    runtime: dsResult.runtime,
                    timestamp: dsResult.timestamp,
                    return_value: dsResult.return_value,
                    function_name: dsResult.function_name || 'data_save',
                    input_args: dsResult.input_args,
                    // carry metadata to help ui show the python variable name
                    data_save: dsResult.data_save || {
                        data_name: (ds && ds.dataSource && ds.dataSource.variable && ds.dataSource.variable.name) || (ds && ds.name) || 'data',
                        variable_name: (ds && ds.dataSource && ds.dataSource.variable && ds.dataSource.variable.name) || null
                    }
                });
            }

            // build a normalized data_saves array for easy consumption in the data matrix
            const dataSaves = [];
            const dataSaveNodesForMatrix = this.state.nodes.filter(n => n.type === 'data_save');
            for (const ds of dataSaveNodesForMatrix) {
                const dsResult = this.nodeExecutionResults.get(ds.id);
                if (!dsResult || !dsResult.return_value || typeof dsResult.return_value !== 'object') continue;
                const keys = Object.keys(dsResult.return_value);
                if (keys.length === 0) continue;
                const varName = (dsResult.data_save && dsResult.data_save.variable_name) || keys[0];
                const value = dsResult.return_value[varName] ?? dsResult.return_value[keys[0]];
                const typeOf = (val) => {
                    if (val === null) return 'null';
                    if (Array.isArray(val)) return 'array';
                    if (typeof val === 'number') return Number.isInteger(val) ? 'integer' : 'float';
                    if (typeof val === 'object') return 'object';
                    if (typeof val === 'string') return 'string';
                    if (typeof val === 'boolean') return 'boolean';
                    return typeof val;
                };
                dataSaves.push({
                    node_name: ds.name || 'data save',
                    variable_name: varName || keys[0],
                    variable_content: [ typeOf(value), value ]
                });
            }
            
            // sanitize feed to ensure no duplicate entries or line texts per node before saving history
            const sanitizedFeed = [];

            // build variable state for resume functionality
            const variableState = {};
            // collect variables from all executed nodes in order
            for (const node of executionOrder) {
                const result = this.nodeExecutionResults.get(node.id);
                if (result && result.success && result.return_value) {
                    if (typeof result.return_value === 'object' && result.return_value !== null) {
                        Object.assign(variableState, result.return_value);
                    } else {
                        // use node name as variable name for simple values
                        const varName = node.name.toLowerCase().replace(/[^a-zA-Z0-9]/g, '_');
                        variableState[varName] = result.return_value;
                    }
                }
            }

            const executionData = {
                status: status,
                execution_order: executionOrder.map(node => node.id),
                results: results,
                data_saves: dataSaves,
                feed: sanitizedFeed,
                // exclude data_save nodes from counts by only considering the computed execution order
                total_nodes: executionOrder.length,
                successful_nodes: results.filter(r => r.success && executionOrder.some(node => node.id === r.node_id)).length,
                error_message: errorMessage,
                variable_state: variableState, // add variable state for resume functionality
                flowchart_state: {
                    nodes: this.state.nodes.map(node => {
                        // base properties for all nodes
                        const baseNode = {
                            id: node.id,
                            name: node.name,
                            x: node.x,
                            y: node.y,
                            pythonFile: node.pythonFile,
                            description: node.description,
                            type: node.type,
                            width: node.width,
                            groupId: node.groupId
                        };
                        
                        // add type-specific properties
                        if (node.type === 'input_node') {
                            // include all input node specific properties
                            return {
                                ...baseNode,
                                parameters: node.parameters,
                                targetNodeId: node.targetNodeId,
                                inputValues: node.inputValues,
                                skipInputCheck: node.skipInputCheck
                            };
                        } else if (node.type === 'data_save') {
                            // include data_save specific fields to support data matrix table
                            return {
                                ...baseNode,
                                dataSource: node.dataSource
                            };
                        } else {
                            // for other node types, include any additional properties they might have
                            return {
                                ...baseNode,
                                // include any other properties that might be needed
                                ...(node.magnet_partner_id && { magnet_partner_id: node.magnet_partner_id })
                            };
                        }
                    }),
                    links: this.state.links,
                    groups: this.state.groups
                }
            };
            
            const response = await fetch('/api/save-execution', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    flowchart_name: this.getCurrentFlowchartName(),
                    execution_data: executionData
                })
            });
            
            const result = await response.json();
            
            if (result.status === 'success') {
        
            } else {
                console.error('failed to save execution history:', result.message);
            }
            
        } catch (error) {
            console.error('error saving execution history:', error);
        }
    }
    // history removed

    async viewExecutionHistory(executionId) {
        try {
            const response = await fetch(`/api/history/${executionId}?flowchart_name=${encodeURIComponent(this.getCurrentFlowchartName())}`);
            const result = await response.json();
            
            if (result.status === 'success') {
                const executionData = result.execution.execution_data;
                
                // switch to run mode first (before restoring state to avoid clearing restored runtime indicators)
                this.switchToRunMode(false);
                
                // restore flowchart state
                this.restoreFlowchartFromHistory(executionData);
                
                // show execution results in sidebar
                this.displayHistoryExecutionResults(executionData);
                
            } else {
                alert('failed to load execution details: ' + result.message);
            }
            
        } catch (error) {
            console.error('error viewing execution history:', error);
            alert('error loading execution details');
        }
    }

    async deleteExecutionHistory(executionId) {
        if (!confirm('are you sure you want to delete this execution history?')) {
            return;
        }
        
        try {
            const response = await fetch(`/api/history/${executionId}?flowchart_name=${encodeURIComponent(this.getCurrentFlowchartName())}`, {
                method: 'DELETE'
            });
            
            const result = await response.json();
            
            if (result.status === 'success') {
                // no-op: history panel removed; data matrix will reflect deletion on refresh
            } else {
                alert('failed to delete execution: ' + result.message);
            }
            
        } catch (error) {
            console.error('error deleting execution history:', error);
            alert('error deleting execution');
        }
    }

    restoreFlowchartFromHistory(executionData) {
        // set restoration flag to prevent input node recreation
        this.state.isRestoringFromHistory = true;
        
        // clear current node execution results and variables
        this.nodeExecutionResults.clear();
        this.nodeVariables.clear();
        
        // restore flowchart state from saved execution data if available
        if (executionData.flowchart_state) {
            try {
                // restore nodes, links, and groups from the saved state
                if (Array.isArray(executionData.flowchart_state.nodes)) {
                    this.state.nodes = executionData.flowchart_state.nodes;
                }
                if (Array.isArray(executionData.flowchart_state.links)) {
                    this.state.links = executionData.flowchart_state.links;
                }
                if (Array.isArray(executionData.flowchart_state.groups)) {
                    this.state.groups = executionData.flowchart_state.groups;
                }
                
                // ensure input nodes are properly handled after restoration
                // mark all existing input nodes to prevent duplicate creation
                this.state.nodes.forEach(node => {
                    if (node.type === 'input_node') {
                        // ensure all required properties are present
                        node.skipInputCheck = true; // prevent this input node from being recreated
                        node.inputValues = node.inputValues || {}; // ensure inputValues exists
                        node.parameters = node.parameters || []; // ensure parameters exists
                        
                        // validate that the target node exists
                        if (node.targetNodeId) {
                            const targetNode = this.state.nodes.find(n => n.id === node.targetNodeId);
                            if (!targetNode) {
                                console.warn(`input node ${node.id} has invalid targetNodeId: ${node.targetNodeId}`);
                            }
                        }
                    }
                });
                
                // trigger state change to update the ui
                this.state.emit('stateChanged');
                
                // explicitly update link renderer to show restored if condition states
                // add a small delay to ensure link paths are fully rendered before positioning circles
                setTimeout(() => {
                    // ensure link renderer is fully updated first
                    this.linkRenderer.render();
                    // then render if condition circles
                    this.linkRenderer.renderIfToPythonNodes();
                }, 50);
                
                // update sidebar content to reflect restored state
                this.state.emit('updateSidebar');
            } catch (error) {
                console.warn('error restoring flowchart state from history:', error);
            }
        }
        
        // restore node states from execution results
        executionData.results.forEach(result => {
            // set node execution result
            const node = this.state.getNode(result.node_id);
            if (node) {
                this.nodeExecutionResults.set(result.node_id, {
                    node: node,
                    success: result.success,
                    output: result.output || '',
                    error: result.error || null,
                    runtime: result.runtime || 0,
                    timestamp: result.timestamp || 'unknown',
                    return_value: result.return_value,
                    function_name: result.function_name,
                    input_args: result.input_args
                });
                
                // restore variables if any
                if (result.success && result.return_value !== null && result.return_value !== undefined) {
                    this.nodeVariables.set(result.node_id, result.return_value);
                }
                
                // set visual node state
                if (result.success) {
                    this.nodeStateManager.setNodeState(result.node_id, 'completed');
                } else {
                    this.nodeStateManager.setNodeState(result.node_id, 'error');
                }
            }
        });

        // restore global variable state if available (for resume functionality)
        if (executionData.variable_state && typeof executionData.variable_state === 'object') {
            try {
                // store the global variable state for resume operations
                this.restoredVariableState = executionData.variable_state;
            } catch (_) {}
        }
        
        // restore visual state for input nodes based on their target node's execution state
        this.state.nodes.forEach(node => {
            if (node.type === 'input_node' && node.targetNodeId) {
                const targetNode = this.state.getNode(node.targetNodeId);
                if (targetNode) {
                    const targetResult = this.nodeExecutionResults.get(node.targetNodeId);
                    if (targetResult) {
                        // set input node visual state to match its target node
                        if (targetResult.success) {
                            this.nodeStateManager.setNodeState(node.id, 'completed');
                        } else {
                            this.nodeStateManager.setNodeState(node.id, 'error');
                        }
                    }
                }
            }
        });
        
        // clear restoration flag after a short delay to allow UI updates to complete
        setTimeout(() => {
            this.state.isRestoringFromHistory = false;
        }, 100);
    }

    displayHistoryExecutionResults(executionData) {

        // update execution status and top time row with restored elapsed/timestamp
        try {
            // compute elapsed by summing per-node runtimes that are part of the execution order
            const orderIds = new Set(Array.isArray(executionData.execution_order) ? executionData.execution_order : []);
            const resultsArr = Array.isArray(executionData.results) ? executionData.results : [];
            let elapsedMs = 0;
            for (const r of resultsArr) {
                if (orderIds.size === 0 || orderIds.has(r.node_id)) {
                    const ms = parseInt(r.runtime || 0, 10);
                    if (!isNaN(ms)) elapsedMs += ms;
                }
            }
            // prefer a finished_at from feed; fallback to started_at
            let tsIso = '';
            try {
                const feed = Array.isArray(executionData.feed) ? executionData.feed : [];
                const finished = feed.filter(e => e && e.finished_at).slice(-1)[0];
                if (finished && finished.finished_at) tsIso = finished.finished_at;
                else if (feed.length && feed[0] && feed[0].started_at) tsIso = feed[0].started_at;
            } catch (_) {}
            let tsShort = '';
            if (tsIso) {
                try {
                    const d = new Date(tsIso);
                    if (!isNaN(d.getTime())) tsShort = d.toLocaleTimeString();
                } catch (_) {}
            }
            // apply to ui and persistent snapshot used by sidebar when no node selected
            const timeRow = document.getElementById('execution_time_row');
            const timeText = document.getElementById('execution_time_text');
            const timestampEl = document.getElementById('execution_timestamp');
            if (timeRow) timeRow.style.display = 'flex';
            if (timeText) timeText.textContent = `${(elapsedMs / 1000).toFixed(3)}s`;
            if (timestampEl) timestampEl.textContent = tsShort || (timestampEl.textContent || '');
            this.lastExecutionElapsedMs = elapsedMs;
            this.lastExecutionTimestampString = tsShort || this.lastExecutionTimestampString || '';
        } catch (_) {}

        // update execution status line
        const statusText = executionData.status === 'success' ? 'completed' : 
                          executionData.status === 'failed' ? 'failed' : (executionData.status || 'stopped');
        this.updateExecutionStatus(statusText, `historical execution - ${executionData.successful_nodes}/${executionData.total_nodes} nodes completed`);
    }

    async handleResumeExecution(data) {
        const { nodeId, node } = data;
        
        // check if we're in run mode
        if (this.state.currentMode !== 'run') {
            this.updateStatusBar('resume execution is only available in run mode');
            return;
        }

        // check if we're already executing
        if (this.isExecuting) {
            this.updateStatusBar('cannot resume - execution already in progress');
            return;
        }

        // get execution order starting from the selected node
        const executionOrder = this.calculateNodeOrder();
        const resumeIndex = executionOrder.findIndex(n => n.id === nodeId);
        
        if (resumeIndex === -1) {
            this.updateStatusBar('selected node not found in execution order');
            return;
        }

        // get nodes to execute (from selected node onwards)
        const nodesToExecute = executionOrder.slice(resumeIndex);
        
        if (nodesToExecute.length === 0) {
            this.updateStatusBar('no nodes to execute from this point');
            return;
        }

        // get variables from previous execution (if any) - enhanced to work with both live and restored executions
        const previousVariables = this.getVariablesForResume(nodeId, executionOrder);
        
        this.updateStatusBar(`resuming execution from ${node.name} with ${Object.keys(previousVariables).length} variables`);
        
        // use the new resume endpoint for better variable handling
                        await this.startResumeExecution(nodesToExecute, previousVariables, nodeId, true);
    }

    getPreviousExecutionVariables(resumeNodeId, executionOrder) {
        // find the index of the resume node
        const resumeIndex = executionOrder.findIndex(n => n.id === resumeNodeId);
        
        if (resumeIndex <= 0) {
            return {}; // no previous nodes or first node
        }

        // collect variables from all previous nodes that have execution results
        const variables = {};
        
        for (let i = 0; i < resumeIndex; i++) {
            const node = executionOrder[i];
            const result = this.nodeExecutionResults.get(node.id);
            
            if (result && result.success && result.return_value) {
                // if return value is an object, merge its properties
                if (typeof result.return_value === 'object' && result.return_value !== null) {
                    Object.assign(variables, result.return_value);
                } else {
                    // use node name as variable name for simple values
                    const varName = node.name.toLowerCase().replace(/[^a-zA-Z0-9]/g, '_');
                    variables[varName] = result.return_value;
                }
            }
        }
        
        return variables;
    }

    // enhanced method to get variables from both live and restored executions
    getVariablesForResume(resumeNodeId, executionOrder) {
        // first try to get variables from current execution results (live execution)
        const liveVariables = this.getPreviousExecutionVariables(resumeNodeId, executionOrder);
        
        // if we have variables from live execution, use them
        if (Object.keys(liveVariables).length > 0) {
            return liveVariables;
        }
        
        // if no live variables, try to use restored variable state (from history)
        if (this.restoredVariableState && typeof this.restoredVariableState === 'object') {
            const resumeIndex = executionOrder.findIndex(n => n.id === resumeNodeId);
            
            if (resumeIndex > 0) {
                // return the full variable state since it represents the state up to the resume point
                return { ...this.restoredVariableState };
            }
        }
        
        // if no restored variable state, try to reconstruct from restored execution history
        const resumeIndex = executionOrder.findIndex(n => n.id === resumeNodeId);
        
        if (resumeIndex <= 0) {
            return {}; // no previous nodes or first node
        }

        // collect variables from all previous nodes in the restored execution
        const variables = {};
        
        for (let i = 0; i < resumeIndex; i++) {
            const node = executionOrder[i];
            const result = this.nodeExecutionResults.get(node.id);
            
            if (result && result.success && result.return_value) {
                // if return value is an object, merge its properties
                if (typeof result.return_value === 'object' && result.return_value !== null) {
                    Object.assign(variables, result.return_value);
                } else {
                    // use node name as variable name for simple values
                    const varName = node.name.toLowerCase().replace(/[^a-zA-Z0-9]/g, '_');
                    variables[varName] = result.return_value;
                }
            }
        }
        
        return variables;
    }



    processResumeResults(results, nodesToExecute) {
        // process each result and update the ui
        results.forEach((result, index) => {
            const node = nodesToExecute[index];
            if (!node) return;

            // store execution result
            this.nodeExecutionResults.set(result.node_id, {
                node: node,
                success: result.success,
                output: result.output || '',
                error: result.error || null,
                runtime: result.runtime || 0,
                timestamp: new Date().toLocaleTimeString(),
                return_value: result.return_value,
                function_name: result.function_name,
                function_args: result.function_args || {},
                input_values: result.input_values || {},
                input_used: false
            });

            // update visual state
            if (result.success) {
                this.nodeStateManager.setNodeState(result.node_id, 'completed');
                this.updateNodeDetails(node, 'completed', result.runtime || 0, result.output);
                
                // store variables for next nodes
                if (result.return_value !== null && result.return_value !== undefined) {
                    this.nodeVariables.set(result.node_id, result.return_value);
                }
                
                // append to execution log
                this.appendToExecutionLog(`[${node.name}] executed successfully`);
                if (result.output) {
                    this.appendToExecutionLog(result.output);
                }
            } else {
                this.nodeStateManager.setNodeState(result.node_id, 'error');
                this.updateNodeDetails(node, 'error', result.runtime || 0, result.error);
                
                // append error to execution log
                this.appendToExecutionLog(`[${node.name}] failed: ${result.error}`);
            }
        });
    }

    async startResumeExecution(nodesToExecute, initialVariables, startNodeId = null, useAPI = false) {
        // create abort controller for this execution session
        this.currentExecutionController = new AbortController();

        // set execution state
        this.executionLogic.setExecuting(true);
        this.executionLogic.setExecutionAborted(false);
        
        // update ui to show stop button and loading wheel
        this.updateExecutionUI(true);

        // clear output for new execution
        this.clearOutput();
        
        // update execution status
        this.updateExecutionStatus('running', `resuming execution: ${nodesToExecute.length} nodes`);
        
        try {
            // reset blocked branches at resume start
            this.blockedNodeIds.clear();
            // clear any previous runtime condition indicators on if→python links
            try {
                const links = Array.isArray(this.state.links) ? this.state.links : [];
                links.forEach(l => {
                    const s = this.state.getNode(l.source);
                    const t = this.state.getNode(l.target);
                    if (s && t && s.type === 'if_node' && t.type === 'python_file') {
                        this.state.updateLink(l.source, l.target, { runtime_condition: null, runtime_details: null });
                    }
                });
            } catch (_) {}

            if (useAPI && startNodeId) {
                // use api-first approach for resume execution
                const fullExecutionOrder = this.calculateNodeOrder().map(n => n.id);
                
                const response = await fetch('/api/resume-execution', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        flowchart_name: this.getCurrentFlowchartName(),
                        start_node_id: startNodeId,
                        execution_order: fullExecutionOrder,
                        previous_variables: initialVariables
                    }),
                    signal: this.currentExecutionController.signal
                });

                const result = await response.json();
                
                if (result.status === 'success') {
                    // process results and update ui
                    this.processResumeResults(result.results, nodesToExecute);
                    this.updateExecutionStatus('completed', 'resumed execution completed successfully');
                    await this.saveExecutionHistory('success', nodesToExecute);
                } else if (result.status === 'failed') {
                    // process partial results
                    this.processResumeResults(result.results, nodesToExecute);
                    this.updateExecutionStatus('failed', result.message);
                    await this.saveExecutionHistory('failed', nodesToExecute, result.message);
                } else {
                    throw new Error(result.message || 'resume execution failed');
                }
            } else {
                // execute nodes one by one with live feedback, starting with initial variables
                let currentVariables = { ...initialVariables };
                
                for (let i = 0; i < nodesToExecute.length; i++) {
                    // check if execution was stopped
                    if (this.executionAborted) {
                        this.updateExecutionStatus('stopped', 'execution stopped by user');
                        await this.saveExecutionHistory('stopped', nodesToExecute, 'execution stopped by user');
                        return;
                    }
                    
                    const node = nodesToExecute[i];
                    const success = await this.executeNodeLive(node, i + 1, nodesToExecute.length, currentVariables);
                    
                    // if node succeeded, update variables for next node
                    if (success) {
                        const result = this.nodeExecutionResults.get(node.id);
                        if (result && result.return_value && typeof result.return_value === 'object') {
                            Object.assign(currentVariables, result.return_value);
                        }
                        if (node.type === 'python_file') {
                            try { await this.persistDataSaveForNode(node); } catch (e) { console.warn('data_save persist failed:', e); }
                        }
                    } else {
                        // if node failed or execution was aborted, stop execution immediately
                        if (this.executionAborted) {
                            this.updateExecutionStatus('stopped', 'execution stopped by user');
                            await this.saveExecutionHistory('stopped', nodesToExecute, 'execution stopped by user');
                        } else {
                            this.updateExecutionStatus('failed', `execution stopped at node: ${node.name}`);
                            this.state.emit('selectionChanged', { nodes: [], link: null, group: null });
                            await this.saveExecutionHistory('failed', nodesToExecute, `execution stopped at node: ${node.name}`);
                        }
                        return;
                    }
                }
                
                // all nodes completed successfully
                this.updateExecutionStatus('completed', 'resumed execution completed successfully');
                await this.saveExecutionHistory('success', nodesToExecute);
            }
            
        } catch (error) {
            if (error.name === 'AbortError') {
                this.updateExecutionStatus('stopped', 'execution stopped by user');
                await this.saveExecutionHistory('stopped', nodesToExecute, 'execution stopped by user');
            } else {
                this.updateExecutionStatus('error', `execution failed: ${error.message}`);
                await this.saveExecutionHistory('error', nodesToExecute, error.message);
            }
        } finally {
            // reset execution state
            this.executionLogic.setExecuting(false);
            this.updateExecutionUI(false);
        }
    }









    async gatherInputVariables(targetNode) {
        // gather all variables from nodes that connect to this target node
        // separate function arguments (from previous nodes) from input values (from input nodes)
        const functionArgs = {};
        const inputValues = {};
        
        // find all links that point to this node
        const incomingLinks = this.state.links.filter(link => link.target === targetNode.id);
        
        // first, we need to know what parameters the target function expects
        const targetFunctionInfo = await this.analyzePythonFunction(targetNode.pythonFile);
        const expectedParams = targetFunctionInfo.formal_parameters || [];  // formal parameters come from previous nodes
        const inputVariableNames = targetFunctionInfo.input_variable_names || []; // input() calls get values from input nodes
        
        // separate input nodes from regular nodes
        const inputNodes = [];
        const regularNodes = [];
        
        incomingLinks.forEach(link => {
            const sourceNodeId = link.source;
            const sourceNode = this.state.getNode(sourceNodeId);
            
            if (sourceNode && sourceNode.type === 'input_node') {
                inputNodes.push(sourceNode);
            } else if (sourceNode && sourceNode.type === 'if_node') {
                // bridge variables across an if splitter: pull from upstream python nodes
                const upstreamLinks = this.state.links.filter(l => l.target === sourceNode.id);
                upstreamLinks.forEach(ul => {
                    const upNode = this.state.getNode(ul.source);
                    if (!upNode) return;
                    if (upNode.type === 'input_node') {
                        inputNodes.push(upNode);
                        return;
                    }
                    if (this.nodeVariables.has(upNode.id)) {
                        const returnValue = this.nodeVariables.get(upNode.id);
                        regularNodes.push({ node: upNode, returnValue });
                    }
                });
            } else if (sourceNode) {
                // check if this source node has variables available
                if (this.nodeVariables.has(sourceNodeId)) {
                    const returnValue = this.nodeVariables.get(sourceNodeId);
                    regularNodes.push({ node: sourceNode, returnValue });
                }
            }
        });
        
        // collect variables from regular nodes (previous node outputs) -> these become function arguments
        regularNodes.forEach(({ node: sourceNode, returnValue }) => {
            if (returnValue === null || typeof returnValue === 'undefined') return;

            // case 1: upstream returned a plain object (e.g., dict from python)
            if (typeof returnValue === 'object' && returnValue.constructor === Object) {
                // merge without overwriting already-set parameters
                Object.keys(returnValue).forEach((key) => {
                    const val = returnValue[key];
                    // if this key corresponds to an expected parameter and it's not set yet, set it
                    if (!Object.prototype.hasOwnProperty.call(functionArgs, key)) {
                        functionArgs[key] = val;
                    }
                });
                return;
            }

            // case 2: upstream returned an array/tuple — map elements to remaining expected params in order
            if (Array.isArray(returnValue)) {
                const remainingParams = expectedParams.filter((p) => !Object.prototype.hasOwnProperty.call(functionArgs, p));
                for (let i = 0; i < returnValue.length && i < remainingParams.length; i++) {
                    const paramName = remainingParams[i];
                    if (!Object.prototype.hasOwnProperty.call(functionArgs, paramName)) {
                        functionArgs[paramName] = returnValue[i];
                    }
                }
                return;
            }

            // case 3: primitive return — try to match by heuristics
            const variableName = this.matchVariableToParameter(sourceNode, returnValue, expectedParams, functionArgs);
            if (variableName && !Object.prototype.hasOwnProperty.call(functionArgs, variableName)) {
                functionArgs[variableName] = returnValue;
            }
        });
        
        // collect from input nodes -> these become input values for input() calls
        inputNodes.forEach(inputNode => {
            if (inputNode.inputValues) {
                Object.keys(inputNode.inputValues).forEach(param => {
                    const value = inputNode.inputValues[param];
                    // use input node values for input() calls
                    if (value !== '' && value !== null && value !== undefined) {
                        inputValues[param] = value;
                    }
                });
            }
        });
        

        return { functionArgs, inputValues };
    }

    // persist data from connected data_save nodes when a python node completes successfully
    async persistDataSaveForNode(pythonNode) {
        try {
            // find all data_save nodes connected to this python node (either direction)
            const connectedDataSaves = [];
            for (const link of this.state.links) {
                if (link.source === pythonNode.id) {
                    const t = this.state.getNode(link.target);
                    if (t && t.type === 'data_save') connectedDataSaves.push(t);
                } else if (link.target === pythonNode.id) {
                    const s = this.state.getNode(link.source);
                    if (s && s.type === 'data_save') connectedDataSaves.push(s);
                }
            }
            if (connectedDataSaves.length === 0) return;

            // get latest execution result for this python node
            const result = this.nodeExecutionResults.get(pythonNode.id);
            const returnsVal = result ? result.return_value : undefined;

            const analyzeReturnsForNode = async () => {
                try {
                    const resp = await fetch('/api/analyze-python-function', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ python_file: (pythonNode.pythonFile || '').replace(/\\/g,'/').replace(/^(?:nodes\/)*/i,'') })
                    });
                    const data = await resp.json();
                    if (!data || data.success === false) return null;
                    return Array.isArray(data.returns) ? data.returns : [];
                } catch (e) {
                    console.warn('[data_save] analyze-python-function failed:', e);
                    return null;
                }
            };

            const returnsAnalysis = Array.isArray(returnsVal) ? await analyzeReturnsForNode() : null;

            const getIndexForVariable = (varName, varLine, rvArray, analysis) => {
                if (!Array.isArray(rvArray) || !analysis) return -1;
                // group analysis returns by line to identify tuple elements from the same return statement
                const grouped = new Map();
                analysis.forEach(item => {
                    const ln = item && typeof item.line === 'number' ? item.line : null;
                    if (ln === null) return;
                    if (!grouped.has(ln)) grouped.set(ln, []);
                    grouped.get(ln).push(item);
                });
                const tryFindInGroup = (items) => {
                    // prefer variables; keep order
                    const names = items.filter(it => it && it.type === 'variable').map(it => it.name);
                    const idx = names.indexOf(varName);
                    return idx >= 0 ? idx : -1;
                };
                // 1) if we know the line, use that group directly
                if (typeof varLine === 'number' && grouped.has(varLine)) {
                    const idx = tryFindInGroup(grouped.get(varLine));
                    if (idx >= 0 && idx < rvArray.length) return idx;
                }
                // 2) otherwise, search for a group whose size matches rv length
                for (const [, items] of grouped.entries()) {
                    const onlyVars = items.filter(it => it && it.type === 'variable');
                    if (onlyVars.length === rvArray.length) {
                        const idx = tryFindInGroup(onlyVars);
                        if (idx >= 0) return idx;
                    }
                }
                // 3) fallback: search any group in order
                for (const [, items] of grouped.entries()) {
                    const idx = tryFindInGroup(items);
                    if (idx >= 0) return idx;
                }
                return -1;
            };

            connectedDataSaves.forEach(async ds => {
                // try to use the selected variable name; if none, infer from return value
                let varName = (ds && ds.dataSource && ds.dataSource.variable && ds.dataSource.variable.name) || null;
                const varLine = (ds && ds.dataSource && ds.dataSource.variable && ds.dataSource.variable.line) || null;
                if (!result) { return; }
                let value;
                const rv = returnsVal;
                if (rv && typeof rv === 'object') {
                    const keys = Object.keys(rv);
                    // if no explicit variable chosen, default to first key when available
                    if (typeof varName !== 'string' || varName.length === 0) {
                        if (keys.length > 0) {
                            varName = keys[0];
                        }
                    }
                    if (Array.isArray(rv)) {
                        // map variable name to index using analysis grouping by return line
                        let idx = -1;
                        if (typeof varName === 'string' && varName.length > 0) {
                            idx = getIndexForVariable(varName, typeof varLine === 'number' ? varLine : null, rv, returnsAnalysis);
                        }
                        if (idx >= 0 && idx < rv.length) {
                            value = rv[idx];
                        } else if (typeof varName === 'string' && Object.prototype.hasOwnProperty.call(rv, varName)) {
                            // as a last resort, allow numeric-string index
                            value = rv[varName];
                        } else {
                            // no reliable mapping: keep whole array
                            value = rv;
                        }
                    } else if (typeof varName === 'string' && Object.prototype.hasOwnProperty.call(rv, varName)) {
                        value = rv[varName];
                    } else if (keys.length === 1) {
                        value = rv[keys[0]];
                        if (typeof varName !== 'string' || varName.length === 0) {
                            varName = keys[0];
                        }
                    } else {
                        // as a fallback for objects with multiple keys and no match, persist the whole object
                        value = rv;
                    }
                } else if (typeof rv !== 'undefined') {
                    // primitive return: save it directly
                    value = rv;
                }
                // choose a data key for storage
                const dataKey = (typeof varName === 'string' && varName.length > 0) ? varName : ((ds && ds.name) || 'data');
                if (typeof value === 'undefined') { return; }
                try {
                    // store a synthetic result entry so it shows up in history and data matrix
                    const synthetic = {
                        node_id: ds.id,
                        node_name: ds.name || 'data save',
                        python_file: (pythonNode.pythonFile || '').replace(/\\/g,'/').replace(/^(?:nodes\/)*/i,''),
                        success: true,
                        output: '',
                        error: null,
                        runtime: 0,
                        timestamp: new Date().toLocaleTimeString(),
                        return_value: { [dataKey]: value },
                        function_name: 'data_save',
                        input_args: {},
                        data_save: { data_name: dataKey, variable_name: (typeof varName === 'string' && varName.length > 0) ? varName : null }
                    };
                    // push into current map so saveExecutionHistory includes it
                    this.nodeExecutionResults.set(ds.id, synthetic);
                    // mark the data_save node as success and refresh style in run mode
                    ds.runtimeStatus = 'success'; 
                    if (this.nodeRenderer) this.nodeRenderer.updateNodeStyles();

                } catch (e) {
                    console.warn('failed to synthesize data_save result', e);
                    ds.runtimeStatus = 'error'; 
                    if (this.nodeRenderer) this.nodeRenderer.updateNodeStyles();
                }
            });
        } catch (e) {
            console.warn('persistDataSaveForNode error', e);
        }
    }

    async updateConnectedInputNodes(sourceNodeId, returnValue) {
        // find all nodes that this source node connects to
        const outgoingLinks = this.state.links.filter(link => link.source === sourceNodeId);
        
        for (const link of outgoingLinks) {
            const targetNode = this.state.getNode(link.target);
            if (!targetNode || targetNode.type !== 'python_file') continue;
            
            // find the input node for this target node
            const inputNode = this.state.nodes.find(n => 
                n.type === 'input_node' && n.targetNodeId === targetNode.id
            );
            
            if (inputNode) {
                // analyze the target function to get expected parameters
                const targetFunctionInfo = await this.analyzePythonFunction(targetNode.pythonFile);
                const expectedParams = targetFunctionInfo.formal_parameters || [];  // use formal_parameters for variable passing
                
                // match the return value to the expected parameters
                const variableName = this.matchVariableToParameter(
                    this.state.getNode(sourceNodeId), 
                    returnValue, 
                    expectedParams, 
                    inputNode.inputValues || {}
                );
                
                if (variableName && expectedParams.includes(variableName)) {
                    // update the input node's value
                    if (!inputNode.inputValues) {
                        inputNode.inputValues = {};
                    }
                    
                    // only update if the current value is empty (preserve user-entered values)
                    if (!inputNode.inputValues[variableName] || inputNode.inputValues[variableName] === '') {
                        inputNode.inputValues[variableName] = returnValue;
                        
                        // emit update to refresh the visual representation
                        this.state.emit('nodeUpdated', inputNode);
                        this.state.emit('stateChanged');
                    }
                }
            }
        }
    }

    async analyzePythonFunction(pythonFile) {
        // analyze a python file to get function information
        try {
            const response = await fetch('/api/analyze-python-function', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    python_file: (pythonFile || '').replace(/\\/g,'/').replace(/^(?:nodes\/)*/i,'')
                })
            });
            
            const result = await response.json();
            return result;
        } catch (error) {
            this.handleError('error analyzing python function', error);
            return { parameters: [] };
        }
    }

    matchVariableToParameter(sourceNode, returnValue, expectedParams, existingVariables) {
        // try to match the return value to one of the expected parameters
        
        // if there's only one expected parameter, use it (highest priority)
        if (expectedParams.length === 1) {
            const paramName = expectedParams[0];
            if (!existingVariables.hasOwnProperty(paramName)) {
                return paramName;
            }
        }
        
        // try to match based on common naming patterns
        for (const paramName of expectedParams) {
            if (!existingVariables.hasOwnProperty(paramName)) {
                // direct match with common variable names
                if (paramName === 'result' && typeof returnValue === 'number') {
                    return paramName;
                }
                if (paramName === 'text' && typeof returnValue === 'string') {
                    return paramName;
                }
                if (paramName === 'data' || paramName === 'value') {
                    return paramName;
                }
                if (paramName === 'items' && Array.isArray(returnValue)) {
                    return paramName;
                }
            }
        }
        
        // fallback: use the first available expected parameter
        for (const paramName of expectedParams) {
            if (!existingVariables.hasOwnProperty(paramName)) {
                return paramName;
            }
        }
        
        // last resort: use a generic name based on return value type
        const genericName = this.getVariableNameForNode(sourceNode, returnValue);
        return genericName;
    }

    getVariableNameForNode(sourceNode, returnValue) {
        // try to determine a good variable name based on the source node or return value
        if (sourceNode.name && sourceNode.name.toLowerCase() !== 'untitled') {
            // use node name, sanitized for variable naming
            return sourceNode.name.toLowerCase().replace(/[^a-z0-9_]/g, '_');
        }
        
        // fallback to generic name based on return value type
        if (typeof returnValue === 'number') {
            return 'result';
        } else if (typeof returnValue === 'string') {
            return 'text';
        } else if (Array.isArray(returnValue)) {
            return 'items';
        } else {
            return 'data';
        }
    }

    // node state management methods - delegate to node state manager module
    setNodeState(nodeId, state) {
        this.nodeStateManager.setNodeState(nodeId, state);
    }
    
    addNodeLoadingAnimation(nodeId) {
        this.nodeStateManager.addNodeLoadingAnimation(nodeId);
    }
    
    removeNodeLoadingAnimation(nodeId) {
        this.nodeStateManager.removeNodeLoadingAnimation(nodeId);
    }
    
    clearAllNodeColorState() {
        this.nodeStateManager.clearAllNodeColorState();
    }
    
    // node state enum - delegate to node state manager
    static get NODE_STATES() {
        return NodeStateManager.NODE_STATES;
    }

    updateExecutionStatus(type, message) {
        const statusElement = document.getElementById('execution_status_text');
        const iconElement = document.querySelector('#execution_status .material-icons');
        const timeRow = document.getElementById('execution_time_row');
        const timeText = document.getElementById('execution_time_text');
        const timestampEl = document.getElementById('execution_timestamp');
        const progressText = document.getElementById('execution_progress_text');
        const failureInfo = document.getElementById('execution_failure_info');
        // when a single node is selected in run mode, the sidebar shows node-specific status.
        // avoid overwriting that with global status updates.
        let isSingleNodeSelected = false;
        try {
            const selected = Array.from(this.state.selectedNodes || []);
            isSingleNodeSelected = (selected.length === 1);
        } catch(_) { isSingleNodeSelected = false; }
        
        // compute display message for global (no-selection) view
        let displayMessage = message;
        if (!isSingleNodeSelected) {
            switch (type) {
                case 'completed':
                    displayMessage = 'flowchart executed successfully';
                    break;
                case 'stopped':
                    displayMessage = 'script was stopped by user';
                    break;
                case 'error':
                case 'failed':
                    displayMessage = 'execution faced an error';
                    break;
                default:
                    // keep provided message for non-terminal states like running/idle
                    break;
            }
        }

        if (!isSingleNodeSelected && statusElement) statusElement.textContent = displayMessage;
        
        // update icon based on status type
        switch (type) {
            case 'running':
                if (!isSingleNodeSelected && iconElement) {
                    iconElement.textContent = 'play_arrow';
                    iconElement.style.color = '#2196f3';
                }
                // show elapsed timer
                if (!this.executionStartTimestamp) {
                    this.executionStartTimestamp = Date.now();
                }
                // clear last execution snapshot when starting a new run
                this.lastExecutionElapsedMs = null;
                this.lastExecutionTimestampString = '';
                if (!isSingleNodeSelected && timeRow) timeRow.style.display = 'flex';
                if (!isSingleNodeSelected && failureInfo) failureInfo.style.display = 'none';
                if (this._elapsedTimer) clearInterval(this._elapsedTimer);
                this._elapsedTimer = setInterval(() => {
                    const elapsed = Date.now() - this.executionStartTimestamp;
                    if (!isSingleNodeSelected && timeText) {
                        const seconds = (elapsed / 1000).toFixed(3);
                        timeText.textContent = `${seconds}s`;
                    }
                }, 100);
                this.lastExecutionStatus = 'running';
                break;
            case 'completed':
                if (!isSingleNodeSelected && iconElement) {
                    iconElement.textContent = 'check_circle';
                    iconElement.style.color = '#4caf50';
                }
                if (this._elapsedTimer) clearInterval(this._elapsedTimer);
                {
                    const elapsed = this.executionStartTimestamp
                        ? (Date.now() - this.executionStartTimestamp)
                        : (typeof this.lastExecutionElapsedMs === 'number' ? this.lastExecutionElapsedMs : 0);
                    this.lastExecutionElapsedMs = elapsed;
                    if (!isSingleNodeSelected && timeText) {
                        const seconds = (elapsed / 1000).toFixed(3);
                        timeText.textContent = `${seconds}s`;
                    }
                    if (!isSingleNodeSelected && timestampEl) {
                        // use restored snapshot if available; otherwise current time
                        let ts = this.lastExecutionTimestampString;
                        if (!ts) {
                            const now = new Date();
                            const hh = String(now.getHours()).padStart(2, '0');
                            const mm = String(now.getMinutes()).padStart(2, '0');
                            const ss = String(now.getSeconds()).padStart(2, '0');
                            ts = `${hh}:${mm}:${ss}`;
                        }
                        timestampEl.textContent = ts;
                        this.lastExecutionTimestampString = ts;
                    }
                }
                if (!isSingleNodeSelected && timeRow) timeRow.style.display = 'flex';
                if (!isSingleNodeSelected && failureInfo) failureInfo.style.display = 'none';
                this.executionStartTimestamp = null;
                this.lastExecutionStatus = 'completed';
                break;
            case 'error':
                if (!isSingleNodeSelected && iconElement) {
                    iconElement.textContent = 'error';
                    iconElement.style.color = '#f44336';
                }
                if (this._elapsedTimer) clearInterval(this._elapsedTimer);
                {
                    const elapsed = this.executionStartTimestamp
                        ? (Date.now() - this.executionStartTimestamp)
                        : (typeof this.lastExecutionElapsedMs === 'number' ? this.lastExecutionElapsedMs : 0);
                    this.lastExecutionElapsedMs = elapsed;
                    if (!isSingleNodeSelected && timeText) {
                        const seconds = (elapsed / 1000).toFixed(3);
                        timeText.textContent = `${seconds}s`;
                    }
                    if (!isSingleNodeSelected && timestampEl) {
                        let ts = this.lastExecutionTimestampString;
                        if (!ts) {
                            const now = new Date();
                            const hh = String(now.getHours()).padStart(2, '0');
                            const mm = String(now.getMinutes()).padStart(2, '0');
                            const ss = String(now.getSeconds()).padStart(2, '0');
                            ts = `${hh}:${mm}:${ss}`;
                        }
                        timestampEl.textContent = ts;
                        this.lastExecutionTimestampString = ts;
                    }
                }
                if (!isSingleNodeSelected && timeRow) timeRow.style.display = 'flex';
                if (!isSingleNodeSelected && failureInfo) failureInfo.style.display = 'none';
                this.executionStartTimestamp = null;
                this.lastExecutionStatus = 'error';
                break;
            case 'stopped':
                if (!isSingleNodeSelected && iconElement) {
                    iconElement.textContent = 'stop';
                    iconElement.style.color = '#ff9800';
                }
                if (this._elapsedTimer) clearInterval(this._elapsedTimer);
                {
                    const elapsed = this.executionStartTimestamp
                        ? (Date.now() - this.executionStartTimestamp)
                        : (typeof this.lastExecutionElapsedMs === 'number' ? this.lastExecutionElapsedMs : 0);
                    this.lastExecutionElapsedMs = elapsed;
                    if (!isSingleNodeSelected && timeText) {
                        const seconds = (elapsed / 1000).toFixed(3);
                        timeText.textContent = `${seconds}s`;
                    }
                    if (!isSingleNodeSelected && timestampEl) {
                        let ts = this.lastExecutionTimestampString;
                        if (!ts) {
                            const now = new Date();
                            const hh = String(now.getHours()).padStart(2, '0');
                            const mm = String(now.getMinutes()).padStart(2, '0');
                            const ss = String(now.getSeconds()).padStart(2, '0');
                            ts = `${hh}:${mm}:${ss}`;
                        }
                        timestampEl.textContent = ts;
                        this.lastExecutionTimestampString = ts;
                    }
                }
                if (!isSingleNodeSelected && timeRow) timeRow.style.display = 'flex';
                if (!isSingleNodeSelected && failureInfo) failureInfo.style.display = 'none';
                this.executionStartTimestamp = null;
                this.lastExecutionStatus = 'stopped';
                break;
            case 'failed':
                if (!isSingleNodeSelected && iconElement) {
                    iconElement.textContent = 'error';
                    iconElement.style.color = '#f44336';
                }
                if (this._elapsedTimer) clearInterval(this._elapsedTimer);
                {
                    const elapsed = this.executionStartTimestamp
                        ? (Date.now() - this.executionStartTimestamp)
                        : (typeof this.lastExecutionElapsedMs === 'number' ? this.lastExecutionElapsedMs : 0);
                    this.lastExecutionElapsedMs = elapsed;
                    if (!isSingleNodeSelected && timeText) {
                        const seconds = (elapsed / 1000).toFixed(3);
                        timeText.textContent = `${seconds}s`;
                    }
                    if (!isSingleNodeSelected && timestampEl) {
                        let ts = this.lastExecutionTimestampString;
                        if (!ts) {
                            const now = new Date();
                            const hh = String(now.getHours()).padStart(2, '0');
                            const mm = String(now.getMinutes()).padStart(2, '0');
                            const ss = String(now.getSeconds()).padStart(2, '0');
                            ts = `${hh}:${mm}:${ss}`;
                        }
                        timestampEl.textContent = ts;
                        this.lastExecutionTimestampString = ts;
                    }
                }
                if (!isSingleNodeSelected && timeRow) timeRow.style.display = 'flex';
                this.executionStartTimestamp = null;
                this.lastExecutionStatus = 'failed';
                break;
            default:
                if (!isSingleNodeSelected && iconElement) {
                    iconElement.textContent = 'info';
                    iconElement.style.color = 'var(--on-surface)';
                }
                if (this._elapsedTimer) clearInterval(this._elapsedTimer);
                // keep last visible time; do not hide the row here
                // default resets failure info visibility
                if (!isSingleNodeSelected && failureInfo) failureInfo.style.display = 'none';
                this.lastExecutionStatus = 'idle';
        }

        // update global progress when status updates
        if (progressText) {
            const order = this.calculateNodeOrder ? this.calculateNodeOrder() : [];
            const total = order.length;
            // only count executed nodes that are part of the execution order (exclude data_save etc.)
            const executed = this.nodeExecutionResults
                ? Array.from(this.nodeExecutionResults.keys()).filter(id => order.some(n => n.id === id)).length
                : 0;
            progressText.textContent = `${executed} of ${total}`;
        }

        // also update the main status bar for important execution messages
        if (type === 'error' || type === 'failed' || type === 'completed') {
            if (this.statusBar) {
                this.statusBar.updateStatus(type, message, { autoClear: false });
            }
        }
    }

    // smooth center on a node by id
    centerOnNode(nodeId) {
        const node = this.state.getNode(nodeId);
        if (!node) return;
        // nodes are positioned by translate(x, y) with their rect centered at (x, y)
        const scale = this.state.transform.k || 1;

        // target placement rules:
        // - horizontal: align node center with the horizontal center of the .canvas_container
        // - vertical: keep node center 250px from the top of the browser window
        const svgEl = this.svg && this.svg.node ? this.svg.node() : null;
        const containerEl = document.querySelector('.canvas_container');
        if (!svgEl || !containerEl) return;

        const svgRect = svgEl.getBoundingClientRect();
        const containerRect = containerEl.getBoundingClientRect();

        // desired position of the node center in svg screen coords
        const desiredSvgX = (containerRect.left - svgRect.left) + (containerRect.width / 2);
        const desiredSvgY = (250 - svgRect.top);

        // translate so that: scale * node.(x|y) + translate = desiredSvg(X|Y)
        const targetTranslateX = desiredSvgX - (scale * node.x);
        const targetTranslateY = desiredSvgY - (scale * node.y);

        this.svg
            .transition()
            .duration(600)
            .ease(d3.easeCubicOut)
            .call(this.zoom.transform, d3.zoomIdentity.translate(targetTranslateX, targetTranslateY).scale(scale));
    }

    updateNodeDetails(node, state, runtime, output = '') {
        // in run mode, the sidebar handles node details display
        // this method is kept for compatibility but doesn't update the UI directly
        // the sidebar will be updated through the normal selection change events
        
        // trigger sidebar update if this node is currently selected
        const selectedNodes = Array.from(this.state.selectedNodes);
        if (selectedNodes.length === 1 && selectedNodes[0] === node.id) {
            this.state.emit('updateSidebar');
        }
    }



    formatNodeOutput(output) {
        if (!output || typeof output !== 'string') {
            return '';
        }
        
        // split output into lines and try to identify variables
        const lines = output.trim().split('\n');
        const formattedParts = [];
        
        for (let line of lines) {
            line = line.trim();
            if (!line) continue;
            
            // check if line looks like a variable assignment output (simple heuristic)
            // this is a basic implementation - could be enhanced with more sophisticated parsing
            if (this.looksLikeVariableOutput(line)) {
                formattedParts.push(this.formatVariableOutput(line));
            } else {
                // treat as regular output
                formattedParts.push(this.formatRegularOutput(line));
            }
        }
        
        return formattedParts.join('');
    }
    
    looksLikeVariableOutput(line) {
        // simple heuristics to detect if this might be variable output
        // look for common patterns like:
        // - simple values (numbers, strings)
        // - array-like structures [1, 2, 3]
        // - object-like structures
        
        // for now, let's assume single values and arrays
        const trimmed = line.trim();
        
        // check for array-like output
        if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
            return true;
        }
        
        // check for simple values (numbers, quoted strings)
        if (/^[\d.-]+$/.test(trimmed) || /^['"].*['"]$/.test(trimmed)) {
            return true;
        }
        
        // check for boolean values
        if (trimmed === 'True' || trimmed === 'False' || trimmed === 'None') {
            return true;
        }
        
        return false;
    }
    
    formatVariableOutput(line) {
        const trimmed = line.trim();
        
        // try to determine a better title based on the content
        let title = 'Output';
        
        // check if it's an array
        if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
            title = this.inferArrayTitle(trimmed);
            return this.formatArrayVariable(title, trimmed);
        } else {
            title = this.inferValueTitle(trimmed);
            return this.formatStringVariable(title, trimmed);
        }
    }
    
    inferArrayTitle(arrayStr) {
        try {
            const content = arrayStr.slice(1, -1).trim();
            if (!content) return 'Empty Array';
            
            const elements = content.split(',').map(item => item.trim());
            const firstElement = elements[0].replace(/^['"]|['"]$/g, '');
            
            // check if all elements are numbers
            if (elements.every(el => /^[\d.-]+$/.test(el.trim()))) {
                return 'Number Array';
            }
            
            // check if all elements are strings (quoted)
            if (elements.every(el => /^['"].*['"]$/.test(el.trim()))) {
                return 'String Array';
            }
            
            return 'Mixed Array';
        } catch (e) {
            return 'Array';
        }
    }
    
    inferValueTitle(value) {
        const trimmed = value.trim();
        
        // check for specific value types
        if (/^[\d.-]+$/.test(trimmed)) {
            return 'Number Value';
        }
        
        if (/^['"].*['"]$/.test(trimmed)) {
            return 'String Value';
        }
        
        if (trimmed === 'True' || trimmed === 'False') {
            return 'Boolean Value';
        }
        
        if (trimmed === 'None') {
            return 'None Value';
        }
        
        return 'Output Value';
    }
    
    formatStringVariable(title, value) {
        return `
            <div style="margin-bottom: 8px;">
                <div style="font-size: 0.9em; font-weight: 500; color: var(--primary); margin-bottom: 4px;">
                    ${title}
                </div>
                <div style="
                    background: var(--surface-variant);
                    border: 1px solid var(--outline);
                    border-radius: 6px;
                    padding: 8px 12px;
                    font-family: 'Courier New', monospace;
                    font-size: 0.85em;
                    color: var(--on-surface);
                    word-break: break-all;
                ">
                    ${this.escapeHtml(value)}
                </div>
            </div>
        `;
    }
    
    formatArrayVariable(title, arrayStr) {
        // parse the array string to get individual elements
        let elements = [];
        try {
            // simple parsing - remove brackets and split by comma
            const content = arrayStr.slice(1, -1).trim();
            if (content) {
                elements = content.split(',').map(item => item.trim().replace(/^['"]|['"]$/g, ''));
            }
        } catch (e) {
            // fallback to showing the raw string
            return this.formatStringVariable(title, arrayStr);
        }
        
        const elementBoxes = elements.map(element => `
            <div style="
                background: var(--surface-variant);
                border: 1px solid var(--outline);
                border-radius: 4px;
                padding: 6px 10px;
                margin: 2px;
                display: inline-block;
                font-family: 'Courier New', monospace;
                font-size: 0.8em;
                color: var(--on-surface);
            ">
                ${this.escapeHtml(element)}
            </div>
        `).join('');
        
        return `
            <div style="margin-bottom: 8px;">
                <div style="font-size: 0.9em; font-weight: 500; color: var(--primary); margin-bottom: 4px;">
                    ${title} (${elements.length} items)
                </div>
                <div style="
                    background: var(--surface);
                    border: 1px solid var(--outline);
                    border-radius: 6px;
                    padding: 8px;
                    display: flex;
                    flex-wrap: wrap;
                    gap: 2px;
                ">
                    ${elementBoxes || '<em style="opacity: 0.7;">empty array</em>'}
                </div>
            </div>
        `;
    }
    
    formatRegularOutput(line) {
        return `
            <div style="margin-bottom: 8px;">
                <div style="font-size: 0.9em; font-weight: 500; color: var(--on-surface); opacity: 0.8; margin-bottom: 4px;">
                    Console Output
                </div>
                <div style="
                    background: var(--surface-variant);
                    border-left: 3px solid var(--secondary);
                    padding: 8px 12px;
                    font-family: 'Courier New', monospace;
                    font-size: 0.85em;
                    color: var(--on-surface);
                    border-radius: 0 6px 6px 0;
                    opacity: 0.9;
                ">
                    ${this.escapeHtml(line)}
                </div>
            </div>
        `;
    }
    
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    appendOutput(text) {
        // add to global execution log
        this.globalExecutionLog += text + '\n';
        
        // only update the console display if no specific node is selected
        // or if we're not in run mode with a node selection
        const selectedNodes = Array.from(this.state.selectedNodes);
        const isRunMode = this.state.currentMode === 'run';
        
        if (!isRunMode || selectedNodes.length !== 1) {
            const consoleLog = document.getElementById('console_output_log');
            if (consoleLog) {
                consoleLog.textContent = this.globalExecutionLog;
                consoleLog.scrollTop = consoleLog.scrollHeight;
            }
        }
    }
    
    showGlobalExecutionLog() {
        // show the complete execution log in console output
        const consoleLog = document.getElementById('console_output_log');
        if (consoleLog) {
            consoleLog.textContent = this.globalExecutionLog || 'no execution output yet';
            consoleLog.scrollTop = consoleLog.scrollHeight;
        }
    }

    appendToExecutionLog(message) {
        // append a line to the global execution log and update the console view
        try {
            const text = (typeof message === 'string') ? message : JSON.stringify(message);
            if (this.globalExecutionLog && this.globalExecutionLog.length > 0) {
                this.globalExecutionLog += `\n${text}`;
            } else {
                this.globalExecutionLog = text;
            }
            this.showGlobalExecutionLog();
        } catch (_) {
            // best-effort fallback without breaking execution
            this.globalExecutionLog += `\n${String(message)}`;
            this.showGlobalExecutionLog();
        }
    }

    clearOutput() {
        // clear the separate output sections
        const nodeInputContent = document.getElementById('node_input_content');
        const nodeOutputContent = document.getElementById('node_output_content');
        const consoleContent = document.getElementById('console_output_log');
        
        if (nodeInputContent) {
            nodeInputContent.textContent = 'output cleared';
        }
        if (nodeOutputContent) {
            nodeOutputContent.textContent = 'output cleared';
        }
        if (consoleContent) {
            consoleContent.textContent = 'output cleared';
        }
        
        // clear global execution log
        this.globalExecutionLog = '';
        
        // clear all node execution results
        if (this.nodeExecutionResults) {
            this.nodeExecutionResults.clear();
        }
        // also clear execution logic data
        if (this.executionLogic) {
            this.executionLogic.nodeExecutionResults.clear();
            this.executionLogic.nodeVariables.clear();
        }
        
        // trigger sidebar update to reflect cleared state
        this.state.emit('updateSidebar');
    }



    // debug methods
    logState() {
        // debug method - removed console.log for cleaner output
    }

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
    }
}

window.FlowchartBuilder = FlowchartBuilder;
})();

// extend prototype with a centralized clear for leaving run mode
// this mirrors the clear button behavior so navigation away from run fully resets ui
FlowchartBuilder.prototype.clearRunModeState = function() {
    this.resetNodeStates();
    this.clearOutput();
    this.updateExecutionStatus('info', 'cleared');
    this.clearIfRuntimeIndicators();
    this.nodeStateManager.clearAllNodeColorState();
    // clear selection and ensure default run panel when coming back later
    this.selectionHandler.clearSelection(); 
    this.state.emit('updateSidebar');
};