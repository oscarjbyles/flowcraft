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
        // remember current executing node for immediate tracking when toggled on mid-run
        this.currentExecutingNodeId = null;
        
        // group select mode state
        this.isGroupSelectMode = false;
        this.justFinishedDragSelection = false;
        

        
        // store execution results for individual nodes
        this.nodeExecutionResults = new Map(); // nodeId -> execution result (legacy reference)

        // runtime branch control: nodes blocked by false if arms in the current run
        // all comments in lower case
        this.blockedNodeIds = new Set();
        
                        // initialize execution logic module
                this.executionLogic = new ExecutionLogic(this);
                
                // initialize node state manager module
                this.nodeStateManager = new NodeStateManager(this);
                
                // initialize variable manager module
                this.variableManager = new VariableManager(this);
                
                // initialize resume execution module
                this.resumeExecution = new ResumeExecution(this);
                
                // initialize execution status module
                this.executionStatus = new ExecutionStatus(this);
                
                // initialize output manager module
                this.outputManager = new OutputManager(this);
        
        // setup core event listeners
        this.setupCoreEvents();
        
        // setup resume execution listener
        this.state.on('resumeExecutionFromNode', (data) => this.resumeExecution.handleResumeExecution(data));
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
                this.executionStatus.updateExecutionStatus(s, '');
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
        return this.variableManager ? this.variableManager.getNodeVariables() : new Map();
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
        if (this.variableManager) {
            this.variableManager.setNodeVariables(variables);
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

















    async gatherInputVariables(targetNode) {
        return this.variableManager.gatherInputVariables(targetNode);
    }

    async persistDataSaveForNode(pythonNode) {
        return this.variableManager.persistDataSaveForNode(pythonNode);
    }

    getVariablesForResume(resumeNodeId, executionOrder) {
        return this.variableManager.getVariablesForResume(resumeNodeId, executionOrder);
    }

    async updateConnectedInputNodes(sourceNodeId, returnValue) {
        return this.variableManager.updateConnectedInputNodes(sourceNodeId, returnValue);
    }

    async analyzePythonFunction(pythonFile) {
        return this.variableManager.analyzePythonFunction(pythonFile);
    }

    matchVariableToParameter(sourceNode, returnValue, expectedParams, existingVariables) {
        return this.variableManager.matchVariableToParameter(sourceNode, returnValue, expectedParams, existingVariables);
    }

    getVariableNameForNode(sourceNode, returnValue) {
        return this.variableManager.getVariableNameForNode(sourceNode, returnValue);
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
    this.outputManager.clearOutput();
            this.executionStatus.updateExecutionStatus('info', 'cleared');
    this.clearIfRuntimeIndicators();
    this.nodeStateManager.clearAllNodeColorState();
    // clear selection and ensure default run panel when coming back later
    this.selectionHandler.clearSelection(); 
    this.state.emit('updateSidebar');
};