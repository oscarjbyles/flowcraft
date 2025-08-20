// FlowchartBuilder Initialization Module
// Contains all initialization methods for the FlowchartBuilder class

(function() {
    'use strict';

    // Extend the FlowchartBuilder prototype with initialization methods
    const InitializationModule = {

        initializeCore() {
            // create state manager
            this.state = new StateManager();

            // create event manager
            this.events = new EventManager(this.state);

            // execution control
            this.currentExecutionController = null;

            // execution state
            this.isExecuting = false;
            this.executionAborted = false;
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

            // coordinate update frame for smooth updates
            this.coordinateUpdateFrame = null;

            // store execution results for individual nodes
            this.nodeExecutionResults = new Map(); // nodeId -> execution result
            this.globalExecutionLog = ''; // overall execution log
            this.nodeVariables = new Map(); // nodeId -> returned variables from function
            // live feed for persistence: array of { node_id, node_name, started_at, finished_at, success, lines: [{text, ts}] }
            this.executionFeed = [];
            // restored variable state from history (for resume functionality)
            this.restoredVariableState = null;

            // runtime branch control: nodes blocked by false if arms in the current run
            // all comments in lower case
            this.blockedNodeIds = new Set();

            // setup core event listeners
            this.setupCoreEvents();

            // setup resume execution listener
            this.state.on('resumeExecutionFromNode', (data) => this.handleResumeExecution(data));
        },

        initializeComponents() {
            // initialize sidebar
            this.sidebar = new Sidebar(this.state);
            
            // initialize execution system
            if (typeof this.initializeExecution === 'function') {
                this.initializeExecution();
            }
        },

        initializeCanvas() {
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
            this.initializeRenderers();
        },

        initializeRenderers() {
            // create renderers in correct order (groups behind nodes)
            this.groupRenderer = new GroupRenderer(this.state, this.zoomGroup);
            this.linkRenderer = new LinkRenderer(this.state, this.zoomGroup);
            this.nodeRenderer = new NodeRenderer(this.state, this.zoomGroup);
            // annotations above nodes
            this.annotationRenderer = new AnnotationRenderer(this.state, this.zoomGroup);
        },

        initializeInteractions() {
            // create interaction handlers
            this.dragHandler = new DragHandler(this.state, this.events);
            this.selectionHandler = new SelectionHandler(this.state, this.events);
            this.connectionHandler = new ConnectionHandler(this.state, this.events);

            // setup canvas interactions
            this.setupCanvasInteractions();

            // setup node interactions
            this.setupNodeInteractions();
        },

        initializeUI() {
            // setup navigation buttons
            this.setupNavigationButtons();

            // setup status bar
            this.setupStatusBar();

            // setup context menu
            this.setupContextMenu();

            // setup window events
            this.setupWindowEvents();

            // wire modal close for massive change modal if present
            const overlay = document.getElementById('massive_change_modal');
            const closeBtn = document.getElementById('massive_change_close');
            if (overlay && closeBtn) {
                closeBtn.addEventListener('click', () => overlay.classList.remove('modal_overlay_is_open'));
            }
        },

        setupCoreEvents() {
            // group related events for better organization
            this.setupStateEvents();
            this.setupDataEvents();
            this.setupModeEvents();
            this.setupSelectionEvents();
            this.setupCoordinateEvents();
        },

        setupStateEvents() {
            // core state changes
            this.state.on('stateChanged', () => {
                this.updateStats();
                // update order when state changes if in flow view
                if (this.state.isFlowView) {
                    this.renderNodeOrder();
                }
                if (this.state.isErrorView) {
                    this.renderErrorCircles();
                    if (this.nodeRenderer && this.nodeRenderer.updateCoverageAlerts) {
                        this.nodeRenderer.updateCoverageAlerts();
                    }
                }
            });

            // status updates
            this.state.on('statusUpdate', (message) => {
                this.updateStatusBar(message);
            });
        },

        setupDataEvents() {
            // data events
            this.state.on('dataSaved', (data) => {
                if (data.message) {
                    this.updateStatusBar(data.message);
                }
            });

            this.state.on('dataLoaded', (data) => {
                this.updateStats();
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
        },

        setupModeEvents() {
            // zoom events
            this.state.on('disableZoom', () => this.disableZoom());
            this.state.on('enableZoom', () => this.enableZoom());

            // mode change events
            this.state.on('modeChanged', (data) => {
                this.updateModeUI(data.mode, data.previousMode);
                this.updateNodeCoordinates();
            });

            this.state.on('flowViewChanged', (data) => {
                this.updateFlowViewUI(data.isFlowView);
            });

            this.state.on('errorViewChanged', (data) => {
                this.updateErrorViewUI(data.isErrorView);
            });

            // link events for error view
            ['linkAdded','linkUpdated','linkRemoved'].forEach(evt => {
                this.state.on(evt, () => {
                    if (this.state.isErrorView && this.linkRenderer && this.linkRenderer.renderCoverageAlerts) {
                        this.linkRenderer.renderCoverageAlerts();
                    }
                });
            });
        },

        setupSelectionEvents() {
            // selection changes
            this.state.on('selectionChanged', () => {
                this.updateNodeCoordinates();
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
        },

        setupCoordinateEvents() {
            // coordinate updates
            this.state.on('nodeUpdated', () => {
                this.updateNodeCoordinates();
            });

            this.state.on('updateNodePosition', () => {
                if (this.coordinateUpdateFrame) {
                    cancelAnimationFrame(this.coordinateUpdateFrame);
                }
                this.coordinateUpdateFrame = requestAnimationFrame(() => {
                    this.updateNodeCoordinates();
                });
            });

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
        },

        setupNodeInteractions() {
            // these will be setup by the node renderer when nodes are created
            this.state.on('nodeAdded', (node) => {
                this.setupSingleNodeInteractions(node);
            });

            // reapply interactions when nodes are updated/re-rendered
            this.state.on('nodeInteractionNeeded', (node) => {
                this.setupSingleNodeInteractions(node);
            });
        },

        setupSingleNodeInteractions(node) {
            // get node element
            const nodeElement = this.nodeRenderer.nodeGroup
                .selectAll('.node-group')
                .filter(d => d.id === node.id);

            // setup node click
            nodeElement.select('.node')
                .on('click', (event, d) => {
                    this.selectionHandler.handleNodeClick(event, d);
                })
                .on('contextmenu', (event, d) => {
                    this.events.handleContextMenu(event, { type: 'node', ...d });
                })
                .call(this.dragHandler.createDragBehavior(this.zoomGroup.node()));

            // setup connection dots (none exist for data_save nodes)
            nodeElement.selectAll('.connection_dot')
                .on('mousedown', (event, d) => {
                    event.stopPropagation();
                    const dotSide = d3.select(event.target).attr('data-side');
                    this.connectionHandler.startConnection(event, d, dotSide);
                })
                .call(d3.drag()
                    .on('start', (event, d) => {
                        const dotSide = d3.select(event.sourceEvent.target).attr('data-side');
                        this.connectionHandler.handleDotDragStart(event, d, dotSide);
                    })
                    .on('drag', (event, d) => {
                        const coords = d3.pointer(event, this.zoomGroup.node());
                        this.connectionHandler.handleDotDrag(event, { x: coords[0], y: coords[1] });
                    })
                    .on('end', (event, d) => {
                        const coords = d3.pointer(event, this.zoomGroup.node());
                        this.connectionHandler.handleDotDragEnd(event, { x: coords[0], y: coords[1] });
                    })
                );
        },

        setupCanvasInteractions() {
            // canvas mouse down handler for group selection and annotation deselect
            this.svg.on('mousedown', (event) => {
                // check if clicking on empty canvas area (not on nodes, links, etc.)
                const clickedOnCanvas = event.target === this.svg.node() ||
                                      event.target.tagName === 'g' ||
                                      event.target.id === 'zoom_group';

                if (clickedOnCanvas && this.isGroupSelectMode) {
                    const coordinates = d3.pointer(event, this.zoomGroup.node());
                    const started = this.selectionHandler.startAreaSelection(event, { x: coordinates[0], y: coordinates[1] });
                    if (started) {
                        event.preventDefault();
                        event.stopPropagation();
                    }
                }
                // clear annotation selection when clicking empty canvas
                if (clickedOnCanvas && this.state.selectedAnnotation) {
                    this.state.clearSelection();
                    this.state.emit('updateSidebar');
                }
            });

            // canvas click handler
            this.svg.on('click', (event) => {
                if (event.target === this.svg.node()) {
                    const coordinates = d3.pointer(event, this.zoomGroup.node());

                    // in group select mode, only clear selection on intentional clicks (not after drag)
                    if (this.isGroupSelectMode) {
                        // only clear if this wasn't part of a drag operation
                        if (!this.selectionHandler.isAreaSelecting && !this.justFinishedDragSelection) {
                            if (!event.ctrlKey && !event.shiftKey) {
                                this.state.clearSelection();
                                this.state.emit('updateNodeStyles');
                                this.state.emit('updateSidebar');
                            }
                        }
                    } else {
                        // if a drag operation or annotation drag just occurred, suppress node creation
                        if (this.state.suppressNextCanvasClick) {
                            this.state.suppressNextCanvasClick = false;
                            return;
                        }
                        this.events.handleCanvasClick(event, { x: coordinates[0], y: coordinates[1] });
                    }
                }
            });

            // canvas context menu
            this.svg.on('contextmenu', (event) => {
                event.preventDefault();
                this.hideContextMenu();
            });

            // canvas mouse move for connection dragging and group selection
            this.svg.on('mousemove', (event) => {
                if (this.state.isConnecting) {
                    const coordinates = d3.pointer(event, this.zoomGroup.node());
                    this.connectionHandler.updateConnection(event, { x: coordinates[0], y: coordinates[1] });
                } else if (this.isGroupSelectMode && this.selectionHandler.isAreaSelecting) {
                    const coordinates = d3.pointer(event, this.zoomGroup.node());
                    this.selectionHandler.updateAreaSelection(event, { x: coordinates[0], y: coordinates[1] });
                }
            });

            // canvas mouse up for connection ending and group selection
            this.svg.on('mouseup', (event) => {
                if (this.state.isConnecting) {
                    const coordinates = d3.pointer(event, this.zoomGroup.node());
                    this.connectionHandler.endConnection(event, null, { x: coordinates[0], y: coordinates[1] });
                } else if (this.isGroupSelectMode && this.selectionHandler.isAreaSelecting) {
                    this.selectionHandler.endAreaSelection(event);
                }
            });
        },

        setupNavigationButtons() {
            // delegate to centralized navigation module for left navigation
            window.Navigation.setupNavButtons(this);

            // setup all button groups
            this.setupToolbarButtons();
            this.setupBuildButtons();
            this.setupAnnotationButtons();
            this.setupExecutionButtons();
            this.setupRunFeedButtons();
            this.setupSidebarToggle();
        },

        setupStatusBar() {
            this.statusText = document.getElementById('status_text');
            this.nodeCount = document.getElementById('node_count');
            this.nodeCoordinates = document.getElementById('node_coordinates');
            this.statusProgress = document.getElementById('status_progress');
            this.statusProgressBar = document.getElementById('status_progress_bar');
            this.statusBar = document.querySelector('.status_bar');

            // capture default status text once
            if (this.statusText && !this._defaultStatusText) {
                this._defaultStatusText = this.statusText.textContent || 'ready';
            }

            // hide node count when viewing a past execution (history view in run mode via executionId)
            const params = new URLSearchParams(window.location.search);
            if (params.has('executionId') && this.nodeCount) {
                this.nodeCount.style.display = 'none';
            }

            // get coordinate input elements
            this.nodeXInput = document.getElementById('node_x');
            this.nodeYInput = document.getElementById('node_y');
            this.nodeWidthInput = document.getElementById('node_width');
            this.nodeHeightInput = document.getElementById('node_height');

            // setup coordinate input event listeners
            this.setupCoordinateInputs();

            // initial status (suppress verbose hint)
            this.updateStatusBar('');
            this.updateStats();
            this.updateNodeCoordinates();
        },

        setupContextMenu() {
            this.contextMenu = document.getElementById('context_menu');

            // context menu handlers
            document.getElementById('edit_node').addEventListener('click', () => {
                this.editSelectedNode();
                this.hideContextMenu();
            });

            document.getElementById('delete_node').addEventListener('click', () => {
                this.deleteSelectedNode();
                this.hideContextMenu();
            });

            // hide context menu on click elsewhere
            document.addEventListener('click', () => this.hideContextMenu());

            // context menu display handler
            this.state.on('showContextMenu', (data) => {
                this.showContextMenu(data.x, data.y, data.item);
            });
        },

        setupWindowEvents() {
            // window resize
            window.addEventListener('resize', () => this.handleResize());

            // prevent default drag behavior on images/links
            document.addEventListener('dragstart', (e) => e.preventDefault());

            // keyboard delete functionality
            document.addEventListener('keydown', (event) => {
                if (event.key === 'Delete' || event.key === 'Backspace') {
                    this.handleDeleteKey(event);
                }
            });
        },

        setupCoordinateInputs() {
            // setup input change handlers
            this.nodeXInput.addEventListener('change', (e) => this.handleCoordinateChange('x', e.target.value));
            this.nodeYInput.addEventListener('change', (e) => this.handleCoordinateChange('y', e.target.value));
            this.nodeWidthInput.addEventListener('change', (e) => this.handleCoordinateChange('width', e.target.value));
            this.nodeHeightInput.addEventListener('change', (e) => this.handleCoordinateChange('height', e.target.value));

            // setup input key handlers for immediate updates
            this.nodeXInput.addEventListener('keyup', (e) => {
                if (e.key === 'Enter') {
                    this.handleCoordinateChange('x', e.target.value);
                }
            });
            this.nodeYInput.addEventListener('keyup', (e) => {
                if (e.key === 'Enter') {
                    this.handleCoordinateChange('y', e.target.value);
                }
            });
            this.nodeWidthInput.addEventListener('keyup', (e) => {
                if (e.key === 'Enter') {
                    this.handleCoordinateChange('width', e.target.value);
                }
            });
            this.nodeHeightInput.addEventListener('keyup', (e) => {
                if (e.key === 'Enter') {
                    this.handleCoordinateChange('height', e.target.value);
                }
            });
        },

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
                    this.updateModeUI('build', null);
                }

                // ensure coordinates are properly hidden/shown based on initial mode
                this.updateNodeCoordinates();
            } catch (error) {
                this.handleError('failed to initialize application', error);
            }
        }

    };

    // Apply the initialization methods to FlowchartBuilder prototype
    Object.assign(FlowchartBuilder.prototype, InitializationModule);

})();
