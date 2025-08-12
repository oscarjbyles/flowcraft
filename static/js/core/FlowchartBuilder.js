// main flowchart builder orchestrator
class FlowchartBuilder {
    constructor() {
        // initialize core systems
        this.initializeCore();
        
        // initialize components
        this.initializeComponents();
        
        // setup canvas and rendering
        this.initializeCanvas();
        
        // initialize interactions
        this.initializeInteractions();
        
        // setup ui components
        this.initializeUI();
        
        // initialize app (async)
        this.initializeApp();
        
        // viewport persistence timers
        this.viewportSaveTimer = null;
        this.viewportSaveDelay = 250; // ms

        console.log('flowchart builder initialized successfully');
    }

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

        // runtime branch control: nodes blocked by false if arms in the current run
        // all comments in lower case
        this.blockedNodeIds = new Set();
        
        // setup core event listeners
        this.setupCoreEvents();
        
        // setup resume execution listener
        this.state.on('resumeExecutionFromNode', (data) => this.handleResumeExecution(data));
    }

    initializeComponents() {
        // initialize sidebar
        this.sidebar = new Sidebar(this.state);
    }

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
    }

    initializeRenderers() {
        // create renderers in correct order (groups behind nodes)
        this.groupRenderer = new GroupRenderer(this.state, this.zoomGroup);
        this.linkRenderer = new LinkRenderer(this.state, this.zoomGroup);
        this.nodeRenderer = new NodeRenderer(this.state, this.zoomGroup);
        // annotations above nodes
        this.annotationRenderer = new AnnotationRenderer(this.state, this.zoomGroup);
    }

    initializeInteractions() {
        // create interaction handlers
        this.dragHandler = new DragHandler(this.state, this.events);
        this.selectionHandler = new SelectionHandler(this.state, this.events);
        this.connectionHandler = new ConnectionHandler(this.state, this.events);
        
        // setup canvas interactions
        this.setupCanvasInteractions();
        
        // setup node interactions
        this.setupNodeInteractions();
    }

    initializeUI() {
        // setup sidebar buttons
        this.setupSidebarButtons();
        
        // setup status bar
        this.setupStatusBar();
        
        // setup context menu
        this.setupContextMenu();
        
        // setup window events
        this.setupWindowEvents();
    }

    setupCoreEvents() {
        // state change events
        this.state.on('stateChanged', () => {
            this.updateStats();
        });
        
        // status updates
        this.state.on('statusUpdate', (message) => {
            this.updateStatusBar(message);
        });
        
        // data events
        this.state.on('dataSaved', (data) => {
            if (data.message) {
                this.updateStatusBar(data.message);
            }
        });
        
        this.state.on('dataLoaded', (data) => {
            this.updateStats();
            // try to restore viewport after data loads (handles initial load and flowchart switches)
            this.restoreViewportFromStorage();
            // if currently in history mode, refresh the history list for the newly loaded flowchart
            try {
                if (this.state.isHistoryMode) {
                    this.loadExecutionHistory();
                }
            } catch (_) {}
        });
        
        // error events
        this.state.on('saveError', (data) => {
            this.updateStatusBar(data.message);
        });
        
        this.state.on('loadError', (data) => {
            this.updateStatusBar(data.message);
        });

        // zoom events
        this.state.on('disableZoom', () => this.disableZoom());
        this.state.on('enableZoom', () => this.enableZoom());
        
        // mode change events
        this.state.on('modeChanged', (data) => {
            this.updateModeUI(data.mode, data.previousMode);
            // update coordinates visibility based on mode
            this.updateNodeCoordinates();
        });
        
        this.state.on('flowViewChanged', (data) => {
            this.updateFlowViewUI(data.isFlowView);
        });
        this.state.on('errorViewChanged', (data) => {
            console.log('[error_view] event errorViewChanged', data);
            this.updateErrorViewUI(data.isErrorView);
        });
        
        // update order when state changes if in flow view
        this.state.on('stateChanged', () => {
            if (this.state.isFlowView) {
                this.renderNodeOrder();
            }
            if (this.state.isErrorView) {
                console.log('[error_view] stateChanged -> renderErrorCircles');
                this.renderErrorCircles();
                if (this.nodeRenderer && this.nodeRenderer.updateCoverageAlerts) {
                    this.nodeRenderer.updateCoverageAlerts();
                }
            }
        });

        // re-render alerts when links are added/updated/removed and error view is on
        ['linkAdded','linkUpdated','linkRemoved'].forEach(evt => {
            this.state.on(evt, () => {
                if (this.state.isErrorView) {
                    console.log('[error_view]', evt, '-> re-render link alerts');
                    if (this.linkRenderer && this.linkRenderer.renderCoverageAlerts) {
                        this.linkRenderer.renderCoverageAlerts();
                    }
                }
            });
        });
        
        // update coordinates when selection changes
        this.state.on('selectionChanged', () => {
            this.updateNodeCoordinates();
            // re-render annotations to apply selected class
            if (this.annotationRenderer && this.annotationRenderer.render) {
                this.annotationRenderer.render();
            }
            // in run mode, scroll the live feed to the selected node's output
            try {
                if (this.state.isRunMode && this.state.selectedNodes.size === 1) {
                    const nodeId = Array.from(this.state.selectedNodes)[0];
                    // delay a frame to allow any pending feed dom updates
                    setTimeout(() => {
                        this.scrollRunFeedToNode(nodeId);
                    }, 0);
                }
            } catch (_) {}
        });

        // when a node is removed in build mode, clear all selections to reset ui state
        this.state.on('nodeRemoved', () => {
            if (this.state.isBuildMode) {
                this.deselectAll();
            }
        });
        
        // handle link clicks
        this.state.on('linkClicked', (data) => {
            this.selectionHandler.handleLinkClick(data.event, data.link);
        });
        
        // update coordinates when nodes are updated (e.g., after dragging)
        this.state.on('nodeUpdated', () => {
            this.updateNodeCoordinates();
        });
        
        // update coordinates in real-time during dragging
        this.state.on('updateNodePosition', () => {
            // use requestAnimationFrame to avoid too many updates during dragging
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
                    if (typeof this._refreshTrackBtnUI === 'function') this._refreshTrackBtnUI();
                }
            });

        this.svg.call(this.zoom);
    }

    // viewport persistence helpers
    getViewportStorageKey() {
        // use current flowchart name to scope viewport
        const name = (this.state && this.state.storage && this.state.storage.getCurrentFlowchart()) || 'default.json';
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
    }

    setupNodeInteractions() {
        // these will be setup by the node renderer when nodes are created
        this.state.on('nodeAdded', (node) => {
            this.setupSingleNodeInteractions(node);
        });
        
        // reapply interactions when nodes are updated/re-rendered
        this.state.on('nodeInteractionNeeded', (node) => {
            this.setupSingleNodeInteractions(node);
        });
    }

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
    }

    setupSidebarButtons() {
        // main sidebar buttons
        // dashboard navigates to overview page; preserve flowchart selection
        const dashboardBtn = document.getElementById('dashboard_btn');
        if (dashboardBtn) {
            dashboardBtn.addEventListener('click', () => {
                // if leaving run mode, perform full clear same as clear button
                try { if (this.state && this.state.isRunMode && typeof this.clearRunModeState === 'function') { this.clearRunModeState(); } else { this.clearAllNodeColorState(); } } catch (_) {}
                const currentFlow = this.state?.storage?.getCurrentFlowchart?.();
                let url = '/dashboard';
                if (currentFlow) {
                    const display = String(currentFlow).replace(/\.json$/i, '');
                    url = `/dashboard?flowchart=${encodeURIComponent(display)}&mode=build`;
                }
                window.location.href = url;
            });
        }

        document.getElementById('build_btn').addEventListener('click', () => {
            // if leaving run mode, perform full clear same as clear button
            try { if (this.state && this.state.isRunMode && typeof this.clearRunModeState === 'function') { this.clearRunModeState(); } } catch (_) {}
            this.switchToBuildMode();
            // persist mode in url
            const u = new URL(window.location.href);
            u.searchParams.set('mode', 'build');
            window.history.replaceState(null, '', u.pathname + '?' + u.searchParams.toString());
        });
        
        // navigate to scripts interface
        const scriptsBtn = document.getElementById('scripts_btn');
        if (scriptsBtn) {
            scriptsBtn.addEventListener('click', () => {
                // if leaving run mode, perform full clear same as clear button
                try { if (this.state && this.state.isRunMode && typeof this.clearRunModeState === 'function') { this.clearRunModeState(); } else { this.clearAllNodeColorState(); } } catch (_) {}
                // preserve current flowchart in url when navigating
                const currentFlow = this.state?.storage?.getCurrentFlowchart?.();
                let url = '/scripts';
                if (currentFlow) {
                    const display = String(currentFlow).replace(/\.json$/i, '');
                    url = `/scripts?flowchart=${encodeURIComponent(display)}&mode=build`;
                }
                window.location.href = url;
            });
        }

        document.getElementById('run_btn').addEventListener('click', () => {
            this.switchToRunMode();
            const u = new URL(window.location.href);
            u.searchParams.set('mode', 'run');
            window.history.replaceState(null, '', u.pathname + '?' + u.searchParams.toString());
        });
        
        // history removed

        // settings button
        const settingsBtn = document.getElementById('settings_btn');
        if (settingsBtn) {
            settingsBtn.addEventListener('click', () => {
                // if leaving run mode, perform full clear same as clear button
                try { if (this.state && this.state.isRunMode && typeof this.clearRunModeState === 'function') { this.clearRunModeState(); } else if (this.state && this.state.isRunMode) { this.clearAllNodeColorState(); } } catch (_) {}
                this.switchToSettingsMode();
                const u = new URL(window.location.href);
                u.searchParams.set('mode', 'settings');
                window.history.replaceState(null, '', u.pathname + '?' + u.searchParams.toString());
            });
        }
        
        // floating toolbar buttons
        document.getElementById('flow_toggle_btn').addEventListener('click', () => {
            this.toggleFlowView();
        });
        // error toggle button
        const errorToggleBtn = document.getElementById('error_toggle_btn');
        if (errorToggleBtn) {
            errorToggleBtn.addEventListener('click', () => {
                console.log('[error_view] toggle button clicked');
                this.toggleErrorView();
            });
        } else {
            console.warn('[error_view] error_toggle_btn not found in dom');
        }
        
        document.getElementById('group_select_btn').addEventListener('click', () => {
            this.toggleGroupSelectMode();
        });
        
        document.getElementById('deselect_btn').addEventListener('click', () => {
            this.deselectAll();
        });

        // track toggle button
        const trackBtn = document.getElementById('track_toggle_btn');
        if (trackBtn) {
            const updateTrackBtnUI = () => {
                if (this.isAutoTrackEnabled && !this.userDisabledTracking) {
                    trackBtn.classList.add('active');
                } else {
                    trackBtn.classList.remove('active');
                }
            };
            trackBtn.addEventListener('click', () => {
                // user explicitly toggles tracking back on/off
                const willEnable = !(this.isAutoTrackEnabled && !this.userDisabledTracking);
                this.isAutoTrackEnabled = willEnable;
                this.userDisabledTracking = !willEnable ? true : false;
                updateTrackBtnUI();
                this.updateStatusBar(willEnable ? 'auto tracking enabled' : 'auto tracking disabled');
                // if enabling during an active execution, immediately pan to the current node
                if (willEnable && this.isExecuting && this.currentExecutingNodeId && typeof this.centerOnNode === 'function') {
                    this.centerOnNode(this.currentExecutingNodeId);
                }
            });
            // expose helper to refresh ui elsewhere
            this._refreshTrackBtnUI = updateTrackBtnUI;
        }
        
        // add node buttons
        document.getElementById('python_node_btn').addEventListener('click', () => {
            this.addPythonNode();
        });
        
        document.getElementById('if_condition_btn').addEventListener('click', () => {
            this.addIfNode();
        });
        
        // annotation toolbar buttons
        const addTextBtn = document.getElementById('add_text_btn');
        if (addTextBtn) {
            addTextBtn.addEventListener('click', () => {
                this.addTextAnnotation();
            });
        }
        
        // start/stop button for execution
        document.getElementById('execute_start_btn').addEventListener('click', () => {
            if (this.isExecuting) {
                this.stopExecution();
            } else {
            // clear the live execution feed when starting a new run
            this.clearExecutionFeed();
            this.startExecution();
            }
        });

        // clear button for run mode
        const clearRunBtn = document.getElementById('execute_clear_btn');
        if (clearRunBtn) {
            clearRunBtn.addEventListener('click', () => {
                // centralised clear used by clear button and when leaving run mode
                if (typeof this.clearRunModeState === 'function') {
                    this.clearRunModeState();
                } else {
                    // fallback in case method is not available
                    this.resetNodeStates();
                    this.clearOutput();
                    this.clearExecutionFeed();
                    this.updateExecutionStatus('info', 'cleared');
                    try { this.clearIfRuntimeIndicators(); } catch (_) {}
                }
            });
        }

        // run feed elements
        const runFeedUpBtn = document.getElementById('run_feed_up_btn');
        const runFeedResetBtn = document.getElementById('run_feed_reset_btn');
        const runFeedDownBtn = document.getElementById('run_feed_down_btn');
        const runFeedBar = document.getElementById('run_feed_bar');
        const runFeedResizer = document.getElementById('run_feed_resizer');

        const updateRunFeedButtons = () => {
            if (!runFeedBar) return;
            const isFull = runFeedBar.classList.contains('full_screen');
            const isHidden = runFeedBar.classList.contains('hidden');
            const hasInlineHeight = !!(runFeedBar.style.height && runFeedBar.style.height.trim() !== '');
            const isNormal = !isFull && !isHidden;
            const isDefaultNormal = isNormal && !hasInlineHeight;
            if (runFeedUpBtn) runFeedUpBtn.disabled = isFull;
            if (runFeedDownBtn) runFeedDownBtn.disabled = isHidden;
            if (runFeedResetBtn) runFeedResetBtn.disabled = isDefaultNormal;
        };

        if (runFeedUpBtn && runFeedBar) {
            runFeedUpBtn.addEventListener('click', () => {
                // go to full screen state
                runFeedBar.classList.remove('hidden');
                runFeedBar.classList.add('full_screen');
                // clear inline height so full screen can stretch properly
                runFeedBar.style.height = '';
                updateRunFeedButtons();
            });
        }

        if (runFeedResetBtn && runFeedBar) {
            runFeedResetBtn.addEventListener('click', () => {
                // restore normal state
                runFeedBar.classList.remove('hidden');
                runFeedBar.classList.remove('full_screen');
                // clear inline height to return to default css height
                runFeedBar.style.height = '';
                updateRunFeedButtons();
            });
        }

        if (runFeedDownBtn && runFeedBar) {
            runFeedDownBtn.addEventListener('click', () => {
                // go to hidden state
                runFeedBar.classList.remove('full_screen');
                runFeedBar.classList.add('hidden');
                // clear inline height so future restores start from default
                runFeedBar.style.height = '';
                updateRunFeedButtons();
            });
        }

        // initialize button states on load
        updateRunFeedButtons();

        // ensure a placeholder is visible in the live execution feed when empty
        try {
            const list = document.getElementById('run_feed_list');
            if (list && list.children.length === 0) {
                const placeholder = document.createElement('div');
                placeholder.id = 'run_feed_placeholder';
                placeholder.className = 'run_feed_placeholder';
                placeholder.textContent = 'waiting for execution';
                list.appendChild(placeholder);
            }
        } catch (_) {}

        // resizable top border for run feed (drag to resize height)
        if (runFeedResizer && runFeedBar) {
            let isDraggingFeed = false;
            let startY = 0;
            let startHeight = 0;

            const minHeight = 120; // minimum collapsed height
            const getMaxHeight = () => window.innerHeight - 80; // leave some space when not full screen

            const onMouseMove = (e) => {
                if (!isDraggingFeed) return;
                const deltaY = startY - e.clientY;
                const maxHeight = getMaxHeight();
                let newHeight = Math.min(Math.max(startHeight + deltaY, minHeight), maxHeight);
                // applying height overrides full/hidden states
                runFeedBar.classList.remove('full_screen');
                runFeedBar.classList.remove('hidden');
                runFeedBar.style.height = `${newHeight}px`;
                updateRunFeedButtons();
            };

            const onMouseUp = () => {
                if (!isDraggingFeed) return;
                isDraggingFeed = false;
                document.body.style.userSelect = '';
                document.removeEventListener('mousemove', onMouseMove);
                document.removeEventListener('mouseup', onMouseUp);
                runFeedBar.classList.remove('no_transition');
                // after manual resize, ensure all buttons are active in normal state
                updateRunFeedButtons();
            };

            runFeedResizer.addEventListener('mousedown', (e) => {
                // ignore when already full screen
                if (runFeedBar.classList.contains('full_screen')) return;
                isDraggingFeed = true;
                startY = e.clientY;
                startHeight = runFeedBar.getBoundingClientRect().height;
                document.body.style.userSelect = 'none';
                runFeedBar.classList.add('no_transition');
                document.addEventListener('mousemove', onMouseMove, { passive: true });
                document.addEventListener('mouseup', onMouseUp, { once: true });
            });

            document.addEventListener('mouseup', () => {
                if (!isDraggingFeed) return;
                runFeedBar.classList.remove('no_transition');
                isDraggingFeed = false;
                document.body.style.userSelect = '';
                updateRunFeedButtons();
            });
        }

        // toggle right properties sidebar visibility in run mode via start/clear toolbar
        const toggleSidebarBtn = document.getElementById('toggle_sidebar_btn');
        const sidebarToggleContainer = document.getElementById('sidebar_toggle_container');
        if (toggleSidebarBtn) {
            toggleSidebarBtn.addEventListener('click', () => {
                const propertiesSidebar = document.getElementById('properties_sidebar');
                const mainContent = document.querySelector('.main_content');
                const runFeedBar = document.getElementById('run_feed_bar');
                const startButtonContainer = document.getElementById('start_button_container');
                const sidebarToggleContainer = document.getElementById('sidebar_toggle_container');

                const isCollapsed = propertiesSidebar.classList.toggle('collapsed');
                if (isCollapsed) {
                    // expand canvas area
                    mainContent.classList.add('sidebar_collapsed');
                    if (runFeedBar) runFeedBar.classList.add('sidebar_collapsed');
                    if (startButtonContainer) startButtonContainer.classList.add('sidebar_collapsed');
                    if (sidebarToggleContainer) sidebarToggleContainer.classList.add('sidebar_collapsed');
                    // update button icon/title
                    toggleSidebarBtn.title = 'show properties';
                    toggleSidebarBtn.innerHTML = '<span class="material-icons">chevron_left</span>';
                } else {
                    // restore run-mode layout widths
                    mainContent.classList.remove('sidebar_collapsed');
                    if (runFeedBar) runFeedBar.classList.remove('sidebar_collapsed');
                    if (startButtonContainer) startButtonContainer.classList.remove('sidebar_collapsed');
                    if (sidebarToggleContainer) sidebarToggleContainer.classList.remove('sidebar_collapsed');
                    toggleSidebarBtn.title = 'hide properties';
                    toggleSidebarBtn.innerHTML = '<span class="material-icons">chevron_right</span>';
                }
            });
        }
        
        // history removed
    }

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
        try {
            const params = new URLSearchParams(window.location.search);
            if (params.has('executionId') && this.nodeCount) {
                this.nodeCount.style.display = 'none';
            }
        } catch (_) {}
        
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
    }

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
    }

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
    }

    // canvas operations
    addNodeAtCenter() {
        const centerX = this.state.canvasWidth / 2;
        const centerY = this.state.canvasHeight / 2;
        
        // transform screen coordinates to world coordinates
        const worldCoords = this.state.transform.invert([centerX, centerY]);
        
        try {
            const node = this.state.addNode({
                x: worldCoords[0],
                y: worldCoords[1]
            });
            this.updateStatusBar(`added node: ${node.name}`);
        } catch (error) {
            this.updateStatusBar(`error adding node: ${error.message}`);
        }
    }

    addPythonNode() {
        const centerX = this.state.canvasWidth / 2;
        const centerY = this.state.canvasHeight / 2;
        
        // transform screen coordinates to world coordinates
        const worldCoords = this.state.transform.invert([centerX, centerY]);
        
        try {
            const node = this.state.addNode({
                x: worldCoords[0],
                y: worldCoords[1],
                name: 'python node',
                type: 'python_file'
            });
            this.updateStatusBar(`added python node: ${node.name}`);
        } catch (error) {
            this.updateStatusBar(`error adding python node: ${error.message}`);
        }
    }

    addIfNode() {
        const centerX = this.state.canvasWidth / 2;
        const centerY = this.state.canvasHeight / 2;
        
        // transform screen coordinates to world coordinates
        const worldCoords = this.state.transform.invert([centerX, centerY]);
        
        try {
            const node = this.state.addNode({
                x: worldCoords[0],
                y: worldCoords[1],
                name: 'if condition',
                type: 'if_node'
            });
            this.updateStatusBar(`added if node: ${node.name}`);
        } catch (error) {
            this.updateStatusBar(`error adding if node: ${error.message}`);
        }
    }

    addTextAnnotation() {
        // only in build mode
        if (!this.state.isBuildMode) {
            this.updateStatusBar('text annotation only available in build mode');
            return;
        }
        const centerX = this.state.canvasWidth / 2;
        const centerY = this.state.canvasHeight / 2;
        const [wx, wy] = this.state.transform.invert([centerX, centerY]);
        try {
            const ann = this.state.addAnnotation({ x: wx, y: wy, text: 'text' });
            this.updateStatusBar('added text');
        } catch (e) {
            this.updateStatusBar('error adding text');
        }
    }

    // context menu operations
    showContextMenu(x, y, item) {
        this.contextMenu.style.display = 'block';
        this.contextMenu.style.left = x + 'px';
        this.contextMenu.style.top = y + 'px';
    }

    hideContextMenu() {
        this.contextMenu.style.display = 'none';
    }

    editSelectedNode() {
        if (this.state.selectedNodes.size === 1) {
            const nodeId = Array.from(this.state.selectedNodes)[0];
            this.state.currentEditingNode = this.state.getNode(nodeId);
            this.sidebar.updateFromState();
        }
    }

    deleteSelectedNode() {
        const selectedNodes = Array.from(this.state.selectedNodes);
        let deletedCount = 0;
        let inputNodeAttempts = 0;
        
        selectedNodes.forEach(nodeId => {
            const node = this.state.getNode(nodeId);
            if (node && node.type === 'input_node') {
                inputNodeAttempts++;
            } else {
                const success = this.state.removeNode(nodeId);
                if (success) deletedCount++;
            }
        });
        
        // provide appropriate feedback
        if (inputNodeAttempts > 0 && deletedCount === 0) {
            this.updateStatusBar('input nodes cannot be deleted directly');
        } else if (inputNodeAttempts > 0 && deletedCount > 0) {
            this.updateStatusBar(`deleted ${deletedCount} node(s) - input nodes cannot be deleted directly`);
        } else if (deletedCount > 0) {
            this.updateStatusBar(`deleted ${deletedCount} node(s)`);
        }
    }

    handleDeleteKey(event) {
        // prevent default behavior if we're in an input field
        if (event.target.tagName === 'INPUT' || event.target.tagName === 'TEXTAREA') {
            return;
        }
        
        event.preventDefault();
        
        // delete selected nodes
        if (this.state.selectedNodes.size > 0) {
            const selectedNodes = Array.from(this.state.selectedNodes);
            let deletedCount = 0;
            let inputNodeAttempts = 0;
            
            selectedNodes.forEach(nodeId => {
                const node = this.state.getNode(nodeId);
                if (node && node.type === 'input_node') {
                    inputNodeAttempts++;
                } else {
                    const success = this.state.removeNode(nodeId);
                    if (success) deletedCount++;
                }
            });
            
            // provide appropriate feedback
            if (inputNodeAttempts > 0 && deletedCount === 0) {
                this.updateStatusBar('input nodes cannot be deleted directly');
            } else if (inputNodeAttempts > 0 && deletedCount > 0) {
                this.updateStatusBar(`deleted ${deletedCount} node(s) - input nodes cannot be deleted directly`);
            } else if (deletedCount > 0) {
                this.updateStatusBar(`deleted ${deletedCount} node(s)`);
            }
        }
        
        // delete selected link
        if (this.state.selectedLink) {
            this.state.removeLink(this.state.selectedLink.source, this.state.selectedLink.target);
            this.updateStatusBar('deleted link');
        }
        
        // delete selected group
        if (this.state.selectedGroup) {
            this.state.removeGroup(this.state.selectedGroup.id);
            this.updateStatusBar('deleted group');
        }
    }

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

    // ui updates
    updateStatusBar(message) {
        // suppress mode/view toggle notifications in status bar
        try {
        const lower = String(message || '').toLowerCase();
        const suppressPhrases = [
                'build mode',
                'run view enabled',
                'run view disabled',
                'flow view enabled',
                'flow view disabled',
                'error view enabled',
                'error view disabled',
                'group select mode enabled',
            'group select mode disabled',
            'ready - click to add nodes, drag to connect',
            'run mode - interface locked for execution',
            's: 1 run mode - interface locked for execution'
            ];
            if (suppressPhrases.some(p => lower.includes(p))) {
                return;
            }
        } catch (_) {}

        if (!this.statusText || !this.statusBar) {
            if (this.statusText) this.statusText.textContent = message;
            return;
        }

        // set message
        this.statusText.textContent = message;

        // choose subtle background based on message content
        const originalBg = this._statusOriginalBg || this.statusBar.style.backgroundColor;
        this._statusOriginalBg = originalBg;
        const lower = String(message || '').toLowerCase();
        let bgColor = 'var(--surface-color)';
        if (!message || lower.trim() === '') {
            // no message: keep neutral background
            bgColor = 'var(--surface-color)';
        } else if (lower.startsWith('error') || lower.includes('failed')) {
            bgColor = '#2A0E0E';
        } else if (lower.startsWith('warning') || lower.includes('cannot')) {
            bgColor = '#2a1f0e';
        } else if (lower.includes('success')) {
            bgColor = '#0e2a16';
        }
        this.statusBar.style.backgroundColor = bgColor;

        // reset after a short delay
        if (this._statusResetTimeout) {
            clearTimeout(this._statusResetTimeout);
        }
        this._statusResetTimeout = setTimeout(() => {
            this.statusBar.style.backgroundColor = this._statusOriginalBg || 'var(--surface-color)';
            // clear message instead of restoring verbose default
            this.statusText.textContent = '';
            this._statusResetTimeout = null;
        }, 3000);
    }

    // temporary progress utils for status bar
    showStatusProgress(percent = 10) {
        if (!this.statusProgress || !this.statusProgressBar) return;
        this.statusProgress.style.display = 'block';
        this.setStatusProgress(percent);
    }

    setStatusProgress(percent) {
        if (!this.statusProgressBar) return;
        const clamped = Math.max(0, Math.min(100, percent));
        this.statusProgressBar.style.width = clamped + '%';
    }

    hideStatusProgress() {
        if (!this.statusProgress || !this.statusProgressBar) return;
        this.statusProgressBar.style.width = '0%';
        this.statusProgress.style.display = 'none';
    }

    updateStats() {
        const stats = this.state.getStats();
        if (this.nodeCount) {
            // use interpunct with extra spacing around it
            this.nodeCount.textContent = `nodes: ${stats.nodeCount}  ·  groups: ${stats.groupCount}`;
        }
    }

    updateNodeCoordinates() {
        if (!this.nodeCoordinates) return;
        
        // hide coordinates if not in build mode
        if (!this.state.isBuildMode) {
            this.nodeCoordinates.style.display = 'none';
            return;
        }
        
        // show coordinates in build mode
        this.nodeCoordinates.style.display = 'flex';
        
        const selectedNodes = Array.from(this.state.selectedNodes);
        
        if (selectedNodes.length === 1) {
            // single node selected - show editable inputs
            const node = this.state.getNode(selectedNodes[0]);
            if (node) {
                const x = Math.round(node.x);
                const y = Math.round(node.y);
                const width = Math.round(node.width || 120);
                const height = this.calculateNodeHeight(node);
                
                // update input values
                this.nodeXInput.value = x;
                this.nodeYInput.value = y;
                this.nodeWidthInput.value = width;
                this.nodeHeightInput.value = height;
                
                // show inputs
                this.nodeXInput.style.display = 'inline-block';
                this.nodeYInput.style.display = 'inline-block';
                this.nodeWidthInput.style.display = 'inline-block';
                this.nodeHeightInput.style.display = 'inline-block';
                
                this.nodeCoordinates.style.opacity = '1';
                this.nodeCoordinates.title = `node: ${node.name}`;
            }
        } else if (selectedNodes.length > 1) {
            // multiple nodes selected - hide inputs and show count
            this.hideCoordinateInputs();
            const nodes = selectedNodes.map(id => this.state.getNode(id)).filter(Boolean);
            if (nodes.length > 0) {
                const avgX = Math.round(nodes.reduce((sum, node) => sum + node.x, 0) / nodes.length);
                const avgY = Math.round(nodes.reduce((sum, node) => sum + node.y, 0) / nodes.length);
                this.nodeCoordinates.style.opacity = '0.7';
                this.nodeCoordinates.title = `selected nodes: ${nodes.map(n => n.name).join(', ')}`;
            }
        } else {
            // no nodes selected - hide inputs
            this.hideCoordinateInputs();
            this.nodeCoordinates.style.opacity = '0.3';
            this.nodeCoordinates.title = 'no node selected';
        }
    }

    hideCoordinateInputs() {
        this.nodeXInput.style.display = 'none';
        this.nodeYInput.style.display = 'none';
        this.nodeWidthInput.style.display = 'none';
        this.nodeHeightInput.style.display = 'none';
    }

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
    }

    handleCoordinateChange(property, value) {
        const selectedNodes = Array.from(this.state.selectedNodes);
        if (selectedNodes.length !== 1) return;
        
        const nodeId = selectedNodes[0];
        const node = this.state.getNode(nodeId);
        if (!node) return;
        
        const numValue = parseFloat(value);
        if (isNaN(numValue)) return;
        
        // validate minimum values
        if (property === 'width' && numValue < 80) return;
        if (property === 'height' && numValue < 40) return;
        
        // update node property
        const updates = {};
        
        if (property === 'height') {
            // for height, we need to handle it specially since it's calculated dynamically
            // store the custom height in the node data
            updates.customHeight = numValue;
        } else {
            updates[property] = numValue;
        }
        
        // update the node
        this.state.updateNode(nodeId, updates);
        
        // trigger immediate save
        this.state.scheduleAutosave();
    }

    calculateNodeHeight(node) {
        return Geometry.getNodeHeight(node);
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
            } else if (mode === 'settings') {
                this.switchToSettingsMode();
            } else {
                this.updateModeUI('build', null);
            }
            
            // ensure coordinates are properly hidden/shown based on initial mode
            this.updateNodeCoordinates();
        } catch (error) {
            console.error('failed to initialize app:', error);
            this.updateStatusBar('failed to initialize application');
        }
    }

    // data operations
    async loadInitialData() {
        try {
            await this.state.load();
        } catch (error) {
            console.error('failed to load initial data:', error);
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
            console.error('save error:', error);
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
            console.error('import error:', error);
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
        const nodes = this.state.nodes;
        const links = this.state.links;
        
        // step 1: identify connected nodes only (nodes that are part of execution flow)
        // first filter out input nodes and data_save nodes and their connections
        const nonInputNodes = nodes.filter(node => node.type !== 'input_node' && node.type !== 'data_save');
        const nonInputLinks = links.filter(link => {
            const sourceNode = nodes.find(n => n.id === link.source);
            const targetNode = nodes.find(n => n.id === link.target);
            // exclude links that involve input nodes or data_save nodes or input connections
            return sourceNode?.type !== 'input_node' && 
                   targetNode?.type !== 'input_node' &&
                   sourceNode?.type !== 'data_save' &&
                   targetNode?.type !== 'data_save' &&
                   link.type !== 'input_connection';
        });
        

        
        const connectedNodeIds = new Set();
        nonInputLinks.forEach(link => {
            connectedNodeIds.add(link.source);
            connectedNodeIds.add(link.target);
        });
        
        // filter to only connected nodes (already excluding input nodes)
        const connectedNodes = nonInputNodes.filter(node => 
            connectedNodeIds.has(node.id)
        );
        
        if (connectedNodes.length === 0) {
            return []; // no connected nodes, no execution order
        }
        
        // step 2: build dependency graph
        const incomingLinks = new Map(); // node -> list of source nodes
        const outgoingLinks = new Map(); // node -> list of target nodes
        
        // initialize maps
        connectedNodes.forEach(node => {
            incomingLinks.set(node.id, []);
            outgoingLinks.set(node.id, []);
        });
        
        // populate dependency relationships using filtered links
        nonInputLinks.forEach(link => {
            if (connectedNodeIds.has(link.source) && connectedNodeIds.has(link.target)) {
                incomingLinks.get(link.target).push(link.source);
                outgoingLinks.get(link.source).push(link.target);
            }
        });
        
        // step 3: find execution order using modified topological sort with spatial awareness
        const result = [];
        const processed = new Set();
        const processing = new Set();
        
        // helper function to check if all dependencies are satisfied
        const canExecute = (nodeId) => {
            const dependencies = incomingLinks.get(nodeId) || [];
            return dependencies.every(depId => processed.has(depId));
        };
        
        // helper function to get ready nodes (all dependencies satisfied)
        const getReadyNodes = () => {
            return connectedNodes.filter(node => 
                !processed.has(node.id) && 
                !processing.has(node.id) && 
                canExecute(node.id)
            );
        };
        
        // step 4: process nodes in execution order
        while (processed.size < connectedNodes.length) {
            const readyNodes = getReadyNodes();
            
            if (readyNodes.length === 0) {
                // this shouldn't happen in a valid dag, but handle it gracefully
                console.warn('circular dependency detected or disconnected components');
                break;
            }
            
            // sort ready nodes by y-position (top to bottom) then x-position (left to right)
            readyNodes.sort((a, b) => {
                if (Math.abs(a.y - b.y) < 10) { // if roughly same height
                    return a.x - b.x; // sort left to right
                }
                return a.y - b.y; // sort top to bottom
            });
            
            // process the topmost ready node(s)
            const currentY = readyNodes[0].y;
            const currentLevelNodes = readyNodes.filter(node => 
                Math.abs(node.y - currentY) < 10 // nodes at roughly same level
            );
            
            // add current level nodes to result in left-to-right order
            currentLevelNodes.forEach(node => {
                processing.add(node.id);
                result.push(node);
                processed.add(node.id);
                processing.delete(node.id);
            });
        }
        
        return result;
    }

    switchToBuildMode() {
        this.state.setMode('build');
    }

    switchToRunMode() {
        this.state.setMode('run');
        // enable auto tracking by default when entering run mode
        this.isAutoTrackEnabled = true;
        this.userDisabledTracking = false;
        if (typeof this._refreshTrackBtnUI === 'function') this._refreshTrackBtnUI();
        // ensure any stale runtime indicators are cleared when entering run
        try { this.clearIfRuntimeIndicators(); } catch (_) {}
    }

            // history mode removed

    switchToSettingsMode() {
        this.state.setMode('settings');
    }

    toggleFlowView() {
        // allow flow view toggle in both build and run modes
        this.state.setFlowView(!this.state.isFlowView);
        if (this.state.isFlowView) {
            this.renderNodeOrder();
            this.updateStatusBar('flow view enabled - showing execution order');
        } else {
            this.hideNodeOrder();
            this.updateStatusBar('flow view disabled');
        }
    }

    toggleErrorView() {
        // allow error view toggle in both build and run modes
        const next = !this.state.isErrorView;
        console.log('[error_view] toggling to', next);
        this.state.setErrorView(next);
        console.log('[error_view] state after set', this.state.isErrorView);
        if (this.state.isErrorView) {
            console.log('[error_view] rendering error circles');
            this.renderErrorCircles();
            // also show coverage alerts if any
            if (this.nodeRenderer && this.nodeRenderer.updateCoverageAlerts) {
                console.log('[error_view] updating coverage alerts (enable)');
                this.nodeRenderer.updateCoverageAlerts();
            } else {
                console.warn('[error_view] nodeRenderer.updateCoverageAlerts unavailable');
            }
            // recompute link coverage now that error view is enabled
            if (this.linkRenderer && this.linkRenderer.computeLinkCoverageFromAnalysis) {
                console.log('[error_view] computing link coverage alerts');
                this.linkRenderer.computeLinkCoverageFromAnalysis();
                this.linkRenderer.updateLinkCoverageAlerts();
            }
            this.updateStatusBar('error view enabled - showing errors');
        } else {
            console.log('[error_view] hiding error circles');
            this.hideErrorCircles();
            // ensure legacy coverage alerts are removed while disabled
            if (this.nodeRenderer && this.nodeRenderer.updateCoverageAlerts) {
                console.log('[error_view] updating coverage alerts (disable)');
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

    renderNodeOrder() {
        const order = this.calculateNodeOrder();
        
        // first, remove all existing order elements
        this.nodeRenderer.nodeGroup.selectAll('.node_order_circle, .node_order_text').remove();
        
        if (order.length === 0) {
            this.updateStatusBar('run view enabled - no connected nodes to execute');
            return;
        }
        
        // render order numbers only for nodes in the execution order
        this.nodeRenderer.nodeGroup.selectAll('.node-group').each(function(d) {
            const nodeGroup = d3.select(this);
            
            // find this node's position in the execution order
            const orderIndex = order.findIndex(node => node.id === d.id);
            
            // only show numbers for nodes that are part of the execution flow
            if (orderIndex !== -1) {
                // determine node width based on type
                let nodeWidth = 120; // default width
                if (d.type === 'input_node') {
                    // fixed width for input nodes
                    nodeWidth = d.width || 300;
                } else if (d.width) {
                    nodeWidth = d.width;
                }
                
                // add circle background (no border, orange, radius 12)
                nodeGroup.append('circle')
                    .attr('class', 'node_order_circle')
                    .attr('cx', nodeWidth / 2 + 18)
                    .attr('cy', -18) // moved down slightly for spacing
                    .attr('r', 12)
                    .style('fill', '#ff9800')
                    .style('stroke', 'none')
                    .style('stroke-width', '0');
                
                // add order number text
                nodeGroup.append('text')
                    .attr('class', 'node_order_text')
                    .attr('x', nodeWidth / 2 + 18)
                    .attr('y', -18)
                    .attr('text-anchor', 'middle')
                    .attr('dominant-baseline', 'central')
                    .style('fill', '#000000')
                    .style('font-size', '12px')
                    .style('font-weight', 'bold')
                    .style('pointer-events', 'none')
                    .text(orderIndex + 1);
            }
        });
        
        this.updateStatusBar(`run view enabled - ${order.length} nodes in execution order`);
    }

    hideNodeOrder() {
        this.nodeRenderer.nodeGroup.selectAll('.node_order_circle, .node_order_text').remove();
    }

    renderErrorCircles() {
        console.log('[error_view] renderErrorCircles start');
        // remove previous error indicators
        this.nodeRenderer.nodeGroup.selectAll('.error_circle, .error_text').remove();
        // draw an error marker for nodes in error state
        this.nodeRenderer.nodeGroup.selectAll('.node-group').each(function(d) {
            const group = d3.select(this);
            const rect = group.select('.node');
            const isErr = rect.classed('error');
            // also flag python nodes with no associated python file
            const isPythonMissingFile = d && d.type === 'python_file' && (!d.pythonFile || String(d.pythonFile).trim() === '');
            const shouldMark = isErr || isPythonMissingFile;
            if (!shouldMark) return;
            const width = d.width || 120;
            const height = Geometry.getNodeHeight(d);
            // place the badge left of the node and align its top with the node's top edge
            const topLeftX = -width / 2;
            const topLeftY = -height / 2;
            const offsetX = -18; // moved 4px further left
            const x = topLeftX + offsetX;
            const y = topLeftY + 12; // circle radius is 12, so top aligns with node top
            group.append('circle')
                .attr('class', 'error_circle')
                .attr('cx', x)
                .attr('cy', y)
                .attr('r', 12);
            group.append('text')
                .attr('class', 'error_text')
                .attr('x', x)
                .attr('y', y)
                .text('!');
        });
        console.log('[error_view] renderErrorCircles done');
    }

    hideErrorCircles() {
        console.log('[error_view] hideErrorCircles');
        try {
            this.nodeRenderer.nodeGroup.selectAll('.error_circle, .error_text').remove();
            // also remove link coverage alerts when hiding error view
            if (this.linkRenderer && this.linkRenderer.linkGroup) {
                this.linkRenderer.linkGroup.selectAll('.link-coverage-alert').remove();
            }
        } catch (e) {
            console.warn('[error_view] hideErrorCircles error', e);
        }
    }

    updateModeUI(mode, previousMode) {
        const buildBtn = document.getElementById('build_btn');
        const scriptsBtn = document.getElementById('scripts_btn');
        const runBtn = document.getElementById('run_btn');
        // history button removed
        const settingsBtn = document.getElementById('settings_btn');
        const floatingToolbar = document.getElementById('floating_toolbar');
        const floatingToolbarSecondary = document.getElementById('floating_toolbar_secondary');
        const buildToolbar = document.getElementById('build_toolbar');
        const annotationToolbar = document.getElementById('annotation_toolbar');
        const topToolbars = document.getElementById('top_toolbars');
        const startButtonContainer = document.getElementById('start_button_container');
        const sidebarToggleContainer = document.getElementById('sidebar_toggle_container');
        const mainContent = document.querySelector('.main_content');
        const propertiesSidebar = document.querySelector('.properties_sidebar');
        const runFeedBar = document.getElementById('run_feed_bar');
        const toggleSidebarBtn = document.getElementById('toggle_sidebar_btn');
        const addNodeSection = document.getElementById('add_node_section');
        const canvasContainer = document.querySelector('.canvas_container');
        const settingsPage = document.getElementById('settings_page');
        const trackBtn = document.getElementById('track_toggle_btn');
        
        // reset all button states
        buildBtn.classList.remove('run_mode_active');
        if (scriptsBtn) scriptsBtn.classList.remove('run_mode_active');
        runBtn.classList.remove('run_mode_active');
        // no history button to reset
        if (settingsBtn) settingsBtn.classList.remove('run_mode_active');
        
        // ensure settings page is hidden unless in settings mode
        if (settingsPage) settingsPage.style.display = 'none';
        if (canvasContainer) canvasContainer.style.display = 'block';
        if (propertiesSidebar) propertiesSidebar.style.display = 'flex';
        if (mainContent) mainContent.classList.remove('full_width');
        // reset width mode classes
        if (mainContent) mainContent.classList.remove('run_mode', 'history_mode');
        if (propertiesSidebar) propertiesSidebar.classList.remove('run_mode', 'history_mode');
        // always clear sidebar collapsed classes when switching modes
        if (propertiesSidebar) propertiesSidebar.classList.remove('collapsed');
        if (mainContent) mainContent.classList.remove('sidebar_collapsed');
        if (runFeedBar) runFeedBar.classList.remove('sidebar_collapsed');
        if (startButtonContainer) startButtonContainer.classList.remove('sidebar_collapsed');
        if (sidebarToggleContainer) sidebarToggleContainer.classList.remove('sidebar_collapsed');

        if (mode === 'build') {
            // activate build mode
            buildBtn.classList.add('run_mode_active');
            floatingToolbar.style.display = 'flex'; // show floating toolbar
            if (floatingToolbarSecondary) floatingToolbarSecondary.style.display = 'flex'; // show secondary toolbar
            if (topToolbars) topToolbars.style.display = 'flex';
            if (buildToolbar) buildToolbar.style.display = 'flex'; // show build toolbar
            if (annotationToolbar) annotationToolbar.style.display = 'flex'; // show annotation toolbar
            // hide auto track button in build mode
            if (trackBtn) trackBtn.style.display = 'none';
            
            // enable add node section in build mode
            if (addNodeSection) {
                addNodeSection.classList.remove('disabled');
            }
            
            // hide start button and toggle bar
            startButtonContainer.style.display = 'none';
            if (sidebarToggleContainer) sidebarToggleContainer.style.display = 'none';
            // hide live feed bar
            try {
                const runFeedBar = document.getElementById('run_feed_bar');
                if (runFeedBar) runFeedBar.style.display = 'none';
            } catch (_) {}
            
            // restore normal properties sidebar width
            mainContent.classList.remove('run_mode');
            propertiesSidebar.classList.remove('run_mode');
            
            // switch back to default panel
            this.hideExecutionPanel();
            
            // reset node colors when leaving run mode
            if (previousMode === 'run' || previousMode === 'history') {
                // centralised clear to wipe all runtime colour state
                this.clearAllNodeColorState();
                // hide all play buttons when leaving run mode
                this.nodeRenderer.hideAllPlayButtons();
                // clear runtime condition indicators when exiting run
                try { this.clearIfRuntimeIndicators(); } catch (_) {}
            }
            
            // suppressed: build mode notification
            
        } else if (mode === 'run') {
            // hide multiselect button in run mode
            const groupSelectBtn = document.getElementById('group_select_btn');
            if (groupSelectBtn) {
                groupSelectBtn.style.display = 'none';
            }
            // activate run mode
            runBtn.classList.add('run_mode_active');
            floatingToolbar.style.display = 'flex'; // keep floating toolbar visible in run mode
            if (floatingToolbarSecondary) floatingToolbarSecondary.style.display = 'flex'; // keep secondary toolbar visible in run mode
            if (topToolbars) topToolbars.style.display = 'none';
            if (buildToolbar) buildToolbar.style.display = 'none'; // hide build toolbar in run
            if (annotationToolbar) annotationToolbar.style.display = 'none'; // hide annotation toolbar in run
            // show auto track button in run mode
            if (trackBtn) trackBtn.style.display = '';
            
            // disable add node section in run mode
            if (addNodeSection) {
                addNodeSection.classList.add('disabled');
            }
            
            // disable group select mode in run mode
            if (this.isGroupSelectMode) {
                this.isGroupSelectMode = false;
                const groupSelectBtn = document.getElementById('group_select_btn');
                groupSelectBtn.classList.remove('active');
                const canvas = document.getElementById('flowchart_canvas');
                canvas.style.cursor = '';
                this.hideSelectionRect();
            }
            
            // show start button and toggle bar
            startButtonContainer.style.display = 'flex';
            if (sidebarToggleContainer) sidebarToggleContainer.style.display = 'flex';
            // ensure toggle button ui matches collapsed sidebar state on entry (default closed)
            if (toggleSidebarBtn) {
                toggleSidebarBtn.title = 'show properties';
                toggleSidebarBtn.innerHTML = '<span class="material-icons">chevron_left</span>';
            }
            // show live feed bar
            try {
                const runFeedBar = document.getElementById('run_feed_bar');
                if (runFeedBar) runFeedBar.style.display = 'flex';
            } catch (_) {}
            
            // expand properties sidebar to run view width (but start collapsed)
            mainContent.classList.add('run_mode');
            propertiesSidebar.classList.add('run_mode');
            // start with sidebar collapsed in run mode
            propertiesSidebar.classList.add('collapsed');
            mainContent.classList.add('sidebar_collapsed');
            if (runFeedBar) runFeedBar.classList.add('sidebar_collapsed');
            if (startButtonContainer) startButtonContainer.classList.add('sidebar_collapsed');
            if (sidebarToggleContainer) sidebarToggleContainer.classList.add('sidebar_collapsed');
            
            // switch to execution panel
            this.showExecutionPanel();
            
            // update play button visibility for current selection
            this.nodeRenderer.updatePlayButtonVisibility();
            
            // suppressed: run mode interface locked message

            // check if a specific executionId is requested (from data matrix view button)
            try {
                const params = new URLSearchParams(window.location.search);
                const execId = params.get('executionId');
                if (execId) {
                    // clear the param from url to avoid repeated loads on refresh
                    params.delete('executionId');
                    const newSearch = params.toString();
                    const newURL = `${window.location.pathname}${newSearch ? '?' + newSearch : ''}`;
                    window.history.replaceState(null, '', newURL);
                    // load and display this execution
                    this.viewExecutionHistory(execId);
                }
            } catch (_) {}
            
        } else if (mode === 'settings') {
            // activate settings mode as full page view
            if (settingsBtn) settingsBtn.classList.add('run_mode_active');
            floatingToolbar.style.display = 'none';
            if (floatingToolbarSecondary) floatingToolbarSecondary.style.display = 'none'; // hide secondary toolbar in settings mode
            if (topToolbars) topToolbars.style.display = 'none';
            if (buildToolbar) buildToolbar.style.display = 'none'; // hide build toolbar in settings
            if (annotationToolbar) annotationToolbar.style.display = 'none'; // hide annotation toolbar in settings
            // hide auto track button in settings mode (toolbar hidden, but keep explicit)
            if (trackBtn) trackBtn.style.display = 'none';
            if (addNodeSection) addNodeSection.classList.add('disabled');
            // hide start button if visible
            startButtonContainer.style.display = 'none';

            // remove run_mode expansions
            mainContent.classList.remove('run_mode');
            propertiesSidebar.classList.remove('run_mode');

            // hide canvas and right sidebar, expand main content
            if (canvasContainer) canvasContainer.style.display = 'none';
            if (propertiesSidebar) propertiesSidebar.style.display = 'none';
            if (mainContent) mainContent.classList.add('full_width');

            // hide other special panels
            // also hide live execution feed when entering settings
            try { const runFeedBar = document.getElementById('run_feed_bar'); if (runFeedBar) runFeedBar.style.display = 'none'; } catch (_) {}
            this.hideExecutionPanel();

            // show full page settings
            this.showSettingsPage();
            this.updateStatusBar('settings');
            // if we came from run/history, also clear runtime condition indicators
            if (previousMode === 'run' || previousMode === 'history') {
                try { this.clearIfRuntimeIndicators(); } catch (_) {}
            }
        }
        
        // ensure multiselect button is visible again only in build mode
        if (mode === 'build') {
            const groupSelectBtn = document.getElementById('group_select_btn');
            if (groupSelectBtn) {
                groupSelectBtn.style.display = '';
            }
        }
    }

    // clear all runtime condition flags on if→python links (used when clearing run or leaving run mode)
    clearIfRuntimeIndicators() {
        try {
            const links = Array.isArray(this.state.links) ? this.state.links : [];
            links.forEach(l => {
                const s = this.state.getNode(l.source);
                const t = this.state.getNode(l.target);
                if (s && t && s.type === 'if_node' && t.type === 'python_file') {
                    this.state.updateLink(l.source, l.target, { runtime_condition: null, runtime_details: null });
                }
            });
            // re-render if-to-python nodes to reflect cleared state
            if (this.linkRenderer && typeof this.linkRenderer.renderIfToPythonNodes === 'function') {
                this.linkRenderer.renderIfToPythonNodes();
            }
        } catch (_) {}
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

    updateErrorViewUI(isErrorView) {
        const errorToggleBtn = document.getElementById('error_toggle_btn');
        if (!errorToggleBtn) return;
        if (isErrorView) {
            errorToggleBtn.classList.add('active');
            errorToggleBtn.innerHTML = '<span class="material-icons">stop</span>';
            errorToggleBtn.title = 'stop error view';
        } else {
            errorToggleBtn.classList.remove('active');
            errorToggleBtn.innerHTML = '<span class="material-icons">priority_high</span>';
            errorToggleBtn.title = 'show error circles';
        }
        console.log('[error_view] updateErrorViewUI ->', isErrorView);
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
        this.state.clearSelection();
        
        // update visual state
        this.nodeRenderer.updateNodeStyles();
        this.linkRenderer.updateLinkStyles();
        
        // update properties sidebar depending on mode
        if (this.state.isRunMode) {
            // keep execution panel visible and show run-mode default (status + progress)
            this.showExecutionPanel();
            this.state.emit('updateSidebar');
            // when in run mode and nothing is selected, ensure global status reflects the last run outcome
            try {
                const s = String(this.lastExecutionStatus || 'idle');
                if (['completed', 'stopped', 'failed', 'error'].includes(s)) {
                    this.updateExecutionStatus(s, '');
                }
            } catch (_) {}
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
            this.state.clearSelection();
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

    showSettingsPage() {
        const settingsPage = document.getElementById('settings_page');
        if (settingsPage) settingsPage.style.display = 'block';
    }

    hideSettingsPage() {
        const settingsPage = document.getElementById('settings_page');
        if (settingsPage) settingsPage.style.display = 'none';
    }

    // history panel removed

    async startExecution() {
        // clear all selections when starting execution (same as deselect button)
        this.deselectAll();

        // get execution order
        const executionOrder = this.calculateNodeOrder();
        
        if (executionOrder.length === 0) {
            this.updateExecutionStatus('error', 'no connected nodes to execute');
            return;
        }

        // create abort controller for this execution session
        this.currentExecutionController = new AbortController();

        // set execution state
        this.isExecuting = true;
        this.executionAborted = false;
        
        // update ui to show stop button and loading wheel
        this.updateExecutionUI(true);

        // reset all node states and clear previous execution results
        this.resetNodeStates();
        this.nodeExecutionResults.clear();
        this.nodeVariables.clear();
        this.globalExecutionLog = '';
        this.clearOutput();
        // reset live feed for this run
        this.executionFeed = [];
        // reset blocked branches
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
        
        // update execution status
        this.updateExecutionStatus('running', `executing ${executionOrder.length} nodes`);
        
        try {
            // execute nodes one by one with live feedback
        for (let i = 0; i < executionOrder.length; i++) {
                // check if execution was stopped
                if (this.executionAborted) {
                    this.updateExecutionStatus('stopped', 'execution stopped by user');
                    await this.saveExecutionHistory('stopped', executionOrder, 'execution stopped by user');
                    return;
                }
                
            const node = executionOrder[i];
                const success = await this.executeNodeLive(node, i + 1, executionOrder.length);
                // after a successful python node, persist any connected data_save values
                if (success && node.type === 'python_file') {
                    try { await this.persistDataSaveForNode(node); } catch (e) { console.warn('data_save persist failed:', e); }
                }
                // update sidebar progress each step
                this.updateExecutionStatus('running', `executing ${i + 1} of ${executionOrder.length}`);
                
                // if node failed or execution was aborted, stop execution immediately
                if (!success) {
                    if (this.executionAborted) {
                        this.updateExecutionStatus('stopped', 'execution stopped by user');
                        await this.saveExecutionHistory('stopped', executionOrder, 'execution stopped by user');
                    } else {
                        this.updateExecutionStatus('failed', `execution stopped at node: ${node.name}`);
                        // ensure sidebar refresh picks up failure info in no-selection view
                        this.state.emit('selectionChanged', { nodes: [], link: null, group: null });
                        await this.saveExecutionHistory('failed', executionOrder, `execution stopped at node: ${node.name}`);
                    }
                    return;
                }
            }
            
            // all nodes completed successfully
            this.updateExecutionStatus('completed', 'execution completed successfully');
            await this.saveExecutionHistory('success', executionOrder);
            
        } catch (error) {
            this.updateExecutionStatus('error', `execution failed: ${error.message}`);
            await this.saveExecutionHistory('error', executionOrder, error.message);
        } finally {
            // reset execution state
            this.isExecuting = false;
            this.updateExecutionUI(false);
        }
    }
    
    async stopExecution() {
        if (this.isExecuting) {
            this.executionAborted = true;
            
            // abort the current API request if one is in progress
            if (this.currentExecutionController) {
                this.currentExecutionController.abort();
            }
            
            // call stop API to terminate any running Python processes
            try {
                await fetch('/api/stop-execution', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    }
                });
            } catch (error) {
                console.warn('failed to call stop API:', error);
            }
            
            this.isExecuting = false;
            this.updateExecutionUI(false);
            this.updateExecutionStatus('stopped', 'execution stopped by user');
            
            // reset the abort controller
            this.currentExecutionController = null;
        }
    }
    
    updateExecutionUI(isExecuting) {
        const button = document.getElementById('execute_start_btn');
        const loadingWheel = document.getElementById('execution_loading_wheel');
        const icon = button.querySelector('.material-icons');
        const text = button.childNodes[button.childNodes.length - 1];
        
        if (isExecuting) {
            // change to stop button
            button.classList.remove('btn_primary');
            button.classList.add('btn_stop');
            icon.textContent = 'stop';
            text.textContent = ' Stop';
            loadingWheel.style.display = 'block';
        } else {
            // change back to start button
            button.classList.remove('btn_stop');
            button.classList.add('btn_primary');
            icon.textContent = 'play_arrow';
            text.textContent = ' Start';
            loadingWheel.style.display = 'none';
        }
    }
    

    
    getCurrentFlowchartName() {
        // prefer the canonical filename from storage to avoid ui sync issues
        try {
            const filename = this.state && this.state.storage && typeof this.state.storage.getCurrentFlowchart === 'function'
                ? this.state.storage.getCurrentFlowchart()
                : '';
            if (filename) {
                // strip .json extension for history api which expects folder name
                return filename.endsWith('.json') ? filename.slice(0, -5) : filename;
            }
        } catch (_) {}

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
                        python_file: node.pythonFile,
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
            try {
                const dataSaveNodes = this.state.nodes.filter(n => n.type === 'data_save');
                for (const ds of dataSaveNodes) {
                    const dsResult = this.nodeExecutionResults.get(ds.id);
                    if (!dsResult) continue;
                    results.push({
                        node_id: ds.id,
                        node_name: ds.name,
                        python_file: dsResult.python_file || '',
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
            } catch (_) {}

            // build a normalized data_saves array for easy consumption in the data matrix
            const dataSaves = [];
            try {
                const dataSaveNodes = this.state.nodes.filter(n => n.type === 'data_save');
                for (const ds of dataSaveNodes) {
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
            } catch (_) {}
            
            // sanitize feed to ensure no duplicate line texts per node before saving history
            const sanitizedFeed = Array.isArray(this.executionFeed) ? this.executionFeed.map(entry => {
                try {
                    const seen = new Set();
                    const uniqueLines = [];
                    (entry.lines || []).forEach(l => {
                        const t = (l && typeof l.text === 'string') ? l.text.trim() : '';
                        if (!t || seen.has(t)) return;
                        seen.add(t);
                        uniqueLines.push({ text: t, ts: l.ts || new Date().toISOString() });
                    });
                    return { ...entry, lines: uniqueLines };
                } catch (_) {
                    return entry;
                }
            }) : [];

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
                flowchart_state: {
                    nodes: this.state.nodes.map(node => ({
                        id: node.id,
                        name: node.name,
                        x: node.x,
                        y: node.y,
                        pythonFile: node.pythonFile,
                        description: node.description,
                        type: node.type,
                        // include data_save specific fields to support data matrix table
                        dataSource: node.dataSource
                    })),
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
                console.log('execution history saved:', result.execution_id);
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
                
                // restore flowchart state
                this.restoreFlowchartFromHistory(executionData);
                
                // switch to run mode to show the execution results
                this.switchToRunMode();
                
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
        // clear current node execution results and variables
        this.nodeExecutionResults.clear();
        this.nodeVariables.clear();
        
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
                    this.setNodeState(result.node_id, 'completed');
                } else {
                    this.setNodeState(result.node_id, 'error');
                }
            }
        });
    }

    displayHistoryExecutionResults(executionData) {
        // restore the bottom live feed from saved history when viewing
        try {
            const list = document.getElementById('run_feed_list');
            if (list) {
                list.innerHTML = '';
                const feed = Array.isArray(executionData.feed) ? executionData.feed : [];
                // prefer per-node runtimes saved in results; fallback to elapsed_ms from feed
                const resultsArr = Array.isArray(executionData.results) ? executionData.results : [];
                const runtimeById = new Map();
                try {
                    resultsArr.forEach(r => {
                        const ms = parseInt(r && r.runtime != null ? r.runtime : 0, 10);
                        if (!isNaN(ms)) runtimeById.set(r.node_id, ms);
                    });
                } catch (_) {}
                feed.forEach(entry => {
                    const item = document.createElement('div');
                    item.className = 'run_feed_item ' + (entry.success ? 'success' : (entry.success === false ? 'error' : ''));
                    const title = document.createElement('div');
                    title.className = 'run_feed_item_title';
                    title.textContent = entry.node_name;
                    const outCol = document.createElement('div');
                    outCol.className = 'run_feed_output';
                    (entry.lines || []).forEach(line => {
                        const lineDiv = document.createElement('div');
                        lineDiv.className = 'run_feed_line';
                        lineDiv.textContent = line.text;
                        outCol.appendChild(lineDiv);
                    });
                    const metaCol = document.createElement('div');
                    metaCol.className = 'run_feed_meta';
                    // restore both time and duration; prefer saved node runtime, fallback to elapsed from feed
                    try {
                        const tsIso = entry.finished_at || entry.started_at || '';
                        const dt = tsIso ? new Date(tsIso) : null;
                        const timeStr = (dt && !isNaN(dt.getTime())) ? dt.toLocaleTimeString() : ((tsIso || '').replace('T',' ').split('.')[0]);
                        const rtMs = runtimeById.has(entry.node_id) ? runtimeById.get(entry.node_id) : null;
                        let secText = '';
                        if (typeof rtMs === 'number' && !isNaN(rtMs) && rtMs >= 0) {
                            secText = `${(rtMs / 1000).toFixed(3)}s`;
                        } else if (typeof entry.elapsed_ms === 'number') {
                            secText = `${(entry.elapsed_ms / 1000).toFixed(3)}s`;
                        }
                        metaCol.textContent = secText ? `${timeStr}  ·  ${secText}` : timeStr;
                    } catch (_) {
                        metaCol.textContent = (entry.finished_at || entry.started_at || '').replace('T', ' ').split('.')[0];
                    }
                    item.appendChild(title);
                    item.appendChild(outCol);
                    item.appendChild(metaCol);
                    list.appendChild(item);
                });
            }
        } catch (_) {}

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

        // get variables from previous execution (if any)
        const previousVariables = this.getPreviousExecutionVariables(nodeId, executionOrder);
        
        this.updateStatusBar(`resuming execution from ${node.name} with ${Object.keys(previousVariables).length} variables`);
        
        // start execution from the selected node
        await this.startResumeExecution(nodesToExecute, previousVariables);
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

    async startResumeExecution(nodesToExecute, initialVariables) {
        // create abort controller for this execution session
        this.currentExecutionController = new AbortController();

        // set execution state
        this.isExecuting = true;
        this.executionAborted = false;
        
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
                const success = await this.executeNodeLiveWithVariables(node, i + 1, nodesToExecute.length, currentVariables);
                
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
            
        } catch (error) {
            this.updateExecutionStatus('error', `execution failed: ${error.message}`);
            await this.saveExecutionHistory('error', nodesToExecute, error.message);
        } finally {
            // reset execution state
            this.isExecuting = false;
            this.updateExecutionUI(false);
        }
    }

    async executeNodeLiveWithVariables(node, currentIndex, totalNodes, accumulatedVariables) {
        // this is similar to executeNodeLive but with accumulated variables from previous execution
        // skip blocked nodes silently
        if (this.blockedNodeIds && this.blockedNodeIds.has(node.id)) {
            return true;
        }
        // handle if splitter nodes without executing python
        if (node && node.type === 'if_node') {
            await this.evaluateIfNodeAndBlockBranches(node);
            // mark as completed for visual feedback without running
            this.setNodeState(node.id, 'completed');
            this.updateNodeDetails(node, 'completed', 0);
            return true;
        }
        this.setNodeState(node.id, 'running');
        this.addNodeLoadingAnimation(node.id);
        this.updateExecutionStatus('running', `executing node ${currentIndex}/${totalNodes}: ${node.name}`);
        
        // show node details in sidebar
        this.updateNodeDetails(node, 'running', Date.now());
        
        try {
            // gather input variables properly, but merge with accumulated variables for function args
            const gatheredVariables = await this.gatherInputVariables(node);
            
            // merge accumulated variables from previous nodes into function args
            const finalFunctionArgs = { ...gatheredVariables.functionArgs, ...accumulatedVariables };
            const finalInputValues = gatheredVariables.inputValues;
            
            console.log(`[${node.name}] Resume execution - accumulated variables:`, accumulatedVariables);
            console.log(`[${node.name}] Resume execution - final function args:`, finalFunctionArgs);
            console.log(`[${node.name}] Resume execution - final input values:`, finalInputValues);
            
            const response = await fetch('/api/execute-node', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    node_id: node.id,
                    python_file: node.pythonFile,
                    node_name: node.name,
                    function_args: finalFunctionArgs,
                    input_values: finalInputValues
                }),
                signal: this.currentExecutionController.signal
            });
            
            const result = await response.json();
            
            // store execution result
            this.nodeExecutionResults.set(node.id, {
                node: node,
                success: result.success,
                output: result.output || '',
                error: result.error || null,
                runtime: result.runtime || 0,
                timestamp: new Date().toLocaleTimeString(),
                return_value: result.return_value,
                function_name: result.function_name,
                function_args: result.function_args,
                input_values: result.input_values,
                input_used: !!(result && (result.input_used || (result.input_values && Object.keys(result.input_values || {}).length > 0)))
            });
            
            // remove loading animation
            this.removeNodeLoadingAnimation(node.id);
            
            // update node visual state and details
            if (result.success) {
                this.setNodeState(node.id, 'completed');
                
                // store variables for next nodes
                if (result.return_value !== null && result.return_value !== undefined) {
                    this.nodeVariables.set(node.id, result.return_value);
                    
                    // update input nodes of connected target nodes with this return value
                    await this.updateConnectedInputNodes(node.id, result.return_value);
                }
                
                // append to execution log
                this.appendToExecutionLog(`[${node.name}] executed successfully`);
                if (result.output) {
                    this.appendToExecutionLog(result.output);
                }
                
                // update node details in sidebar
                this.updateNodeDetails(node, 'completed', result.runtime);

                // auto-highlight associated input node in green when inputs were used successfully
                try {
                    const usedInputs = !!(result && (result.input_used || (result.input_values && Object.keys(result.input_values || {}).length > 0)));
                    if (node.type === 'python_file' && usedInputs) {
                        let inputNode = (this.state.nodes || []).find(n => n && n.type === 'input_node' && n.targetNodeId === node.id);
                        if (!inputNode) {
                            const linkFromInput = (this.state.links || []).find(l => {
                                if (!l) return false;
                                const src = this.state.getNode(l.source);
                                return !!(src && src.type === 'input_node' && l.target === node.id);
                            });
                            if (linkFromInput) inputNode = this.state.getNode(linkFromInput.source);
                        }
                        if (inputNode) {
                            inputNode.runtimeStatus = 'success';
                            this.setNodeState(inputNode.id, 'completed');
                            if (this.nodeRenderer && typeof this.nodeRenderer.updateNodeStyles === 'function') {
                                this.nodeRenderer.updateNodeStyles();
                            }
                        }
                    }
                } catch (_) {}
                
                return true;
            } else {
                this.setNodeState(node.id, 'error');
                this.appendToExecutionLog(`[${node.name}] execution failed: ${result.error}`);
                this.updateNodeDetails(node, 'error', result.runtime);
                return false;
            }
            
        } catch (error) {
            this.removeNodeLoadingAnimation(node.id);
            
            if (error.name === 'AbortError') {
                this.setNodeState(node.id, 'error');
                this.nodeExecutionResults.set(node.id, {
                    node: node,
                    success: false,
                    output: '',
                    error: 'execution was cancelled by user',
                    runtime: 0,
                    timestamp: new Date().toLocaleTimeString(),
                    return_value: null
                });
                this.appendToExecutionLog(`[${node.name}] execution cancelled`);
                this.updateNodeDetails(node, 'cancelled', 0);
                return false;
            }
            
            this.setNodeState(node.id, 'error');
            this.appendToExecutionLog(`[${node.name}] execution error: ${error.message}`);
            this.updateNodeDetails(node, 'error', 0);
            return false;
        }
    }

    async executeNodeLive(node, nodeIndex, totalNodes) {
        try {
            // skip blocked nodes silently
            if (this.blockedNodeIds && this.blockedNodeIds.has(node.id)) {
                return true;
            }
            // handle if splitter nodes without executing python
            if (node && node.type === 'if_node') {
                await this.evaluateIfNodeAndBlockBranches(node);
                // mark as completed for visual feedback without running
                this.setNodeState(node.id, 'completed');
                this.updateNodeDetails(node, 'completed', 0);
                return true;
            }
            // remember current executing node for immediate tracking when toggled on mid-run
            this.currentExecutingNodeId = node && node.id;
            // set node to running state with loading animation
            this.setNodeState(node.id, 'running');
            this.addNodeLoadingAnimation(node.id);
            this.updateExecutionStatus('running', `executing node ${nodeIndex}/${totalNodes}: ${node.name}`);
            // auto-follow currently running python nodes if tracking is enabled and not user-disabled
            if (
                node && node.type === 'python_file' &&
                typeof this.centerOnNode === 'function' &&
                this.isAutoTrackEnabled && !this.userDisabledTracking
            ) {
                this.centerOnNode(node.id);
            }
            
            // show node details in sidebar
            this.updateNodeDetails(node, 'running', Date.now());
            
            const startTime = Date.now();
            
            // gather input variables from previous nodes
            const inputVariables = await this.gatherInputVariables(node);
            
            // debug: log input variables for troubleshooting
            console.log(`[${node.name}] Input variables:`, inputVariables);
            
            // create a feed entry upfront so the title appears even if no output lines
            try {
                const existing = this.executionFeed.find(e => e.node_id === node.id && !e.finished_at);
                if (!existing) {
                    this.executionFeed.push({
                        node_id: node.id,
                        node_name: node.name,
                        started_at: new Date().toISOString(),
                        finished_at: null,
                        success: null,
                        lines: []
                    });
                }
            } catch (_) {}
            
            // execute the node via API with input variables
            const result = await this.callNodeExecution(node, inputVariables);

            // append a neat feed item for each node upon completion
            try {
                const list = document.getElementById('run_feed_list');
                if (list) {
                    const runningId = `run_feed_running_${node.id}`;
                    // if a running item exists, finalize it; otherwise create a new completed item
                    let item = document.getElementById(runningId);
                    if (item) {
                        item.classList.add(result.success ? 'success' : 'error');
                        const metaCol = item.children[2];
                        if (metaCol) {
                            const finishedAt = new Date();
                            const elapsedMs = Math.max(0, finishedAt.getTime() - startTime);
                            const elapsedSec = (elapsedMs / 1000).toFixed(3);
                            metaCol.textContent = `${finishedAt.toLocaleTimeString()}  ·  ${elapsedSec}s`;
                        }
                        item.removeAttribute('id');
                    } else {
                        item = document.createElement('div');
                        item.className = 'run_feed_item ' + (result.success ? 'success' : 'error');
                        const title = document.createElement('div');
                        title.className = 'run_feed_item_title';
                        title.textContent = node.name;
                        const outCol = document.createElement('div');
                        outCol.className = 'run_feed_output';
                        // strip embedded result blocks from non-streamed output
                        const sanitized = ((result.output || '') + (result.error ? `\n${result.error}` : ''))
                            .replace(/__RESULT_START__[\s\S]*?__RESULT_END__/g, '')
                            .trim();
                        const lines = sanitized.split(/\r?\n/);
                        lines.filter(Boolean).forEach(l => {
                            const lineDiv = document.createElement('div');
                            lineDiv.className = 'run_feed_line';
                            lineDiv.textContent = l;
                            outCol.appendChild(lineDiv);
                        });
                        const metaCol = document.createElement('div');
                        metaCol.className = 'run_feed_meta';
                        const finishedAt = new Date();
                        const elapsedMs = Math.max(0, finishedAt.getTime() - startTime);
                        const elapsedSec = (elapsedMs / 1000).toFixed(3);
                        metaCol.textContent = `${finishedAt.toLocaleTimeString()}  ·  ${elapsedSec}s`;
                        // also persist these values into the corresponding feed entry for restoration
                        try {
                            let entry = this.executionFeed.find(e => e.node_id === node.id && !e.finished_at);
                            if (!entry) {
                                entry = { node_id: node.id, node_name: node.name, started_at: new Date(startTime).toISOString(), lines: [] };
                                this.executionFeed.push(entry);
                            }
                            entry.finished_at = finishedAt.toISOString();
                            entry.success = !!result.success;
                            entry.elapsed_ms = elapsedMs;
                        } catch (_) {}
                        item.appendChild(title);
                        item.appendChild(outCol);
                        item.appendChild(metaCol);
                        list.appendChild(item);
                    }
                    const bar = document.getElementById('run_feed_bar');
                    if (bar) bar.scrollTop = bar.scrollHeight;
                    // if we created a completed item, ensure placeholder is removed
                    try {
                        const listEl = document.getElementById('run_feed_list');
                        const placeholder = document.getElementById('run_feed_placeholder');
                        if (listEl && placeholder && placeholder.parentElement === listEl) {
                            placeholder.remove();
                        }
                    } catch (_) {}
                }
            } catch (_) {}

            // finalize feed entry and ensure lines present (non-streaming fallback)
            try {
                const entry = this.executionFeed.find(e => e.node_id === node.id && !e.finished_at);
                if (entry) {
                    entry.finished_at = new Date().toISOString();
                    entry.success = !!result.success;
                    // compute and persist elapsed so it can be restored later from data matrix
                    try {
                        const start = entry.started_at ? new Date(entry.started_at).getTime() : NaN;
                        const end = new Date(entry.finished_at).getTime();
                        const elapsedMs = (!isNaN(start) && !isNaN(end) && end >= start)
                            ? (end - start)
                            : (typeof result.runtime === 'number' ? result.runtime : undefined);
                        if (typeof elapsedMs === 'number') entry.elapsed_ms = elapsedMs;
                    } catch (_) {}
                    const combined = ((result.output || '') + (result.error ? `\n${result.error}` : '')).trim();
                    if (combined && entry.lines.length === 0) {
                        combined.split(/\r?\n/).filter(Boolean).forEach(l => {
                            entry.lines.push({ text: l, ts: new Date().toISOString() });
                        });
                    }
                }
            } catch (_) {}
            
            const endTime = Date.now();
            const runtime = endTime - startTime;
            
            // remove loading animation
            this.removeNodeLoadingAnimation(node.id);
            
            if (result.success) {
                // store return value from function if any - do this FIRST
                if (result.return_value !== null && result.return_value !== undefined) {
                    this.nodeVariables.set(node.id, result.return_value);
                    console.log(`[${node.name}] Stored return value:`, result.return_value);
                }
                
                // store execution result
                this.nodeExecutionResults.set(node.id, {
                    node: node,
                    success: true,
                    output: result.output || '',
                    error: null,
                    runtime: runtime,
                    timestamp: new Date().toLocaleTimeString(),
                    return_value: result.return_value,
                    function_name: result.function_name,
                    input_args: result.input_args,
                    input_values: result.input_values,
                    input_used: !!(result && (result.input_used || (result.input_values && Object.keys(result.input_values || {}).length > 0)))
                });
                
                // set node to completed state (green)
                this.setNodeState(node.id, 'completed');
                this.updateNodeDetails(node, 'completed', runtime, result.output);

                // auto-highlight associated input node in green when inputs were used successfully
                try {
                    const usedInputs = !!(result && (result.input_used || (result.input_values && Object.keys(result.input_values || {}).length > 0)));
                    if (node.type === 'python_file' && usedInputs) {
                        let inputNode = (this.state.nodes || []).find(n => n && n.type === 'input_node' && n.targetNodeId === node.id);
                        if (!inputNode) {
                            const linkFromInput = (this.state.links || []).find(l => {
                                if (!l) return false;
                                const src = this.state.getNode(l.source);
                                return !!(src && src.type === 'input_node' && l.target === node.id);
                            });
                            if (linkFromInput) inputNode = this.state.getNode(linkFromInput.source);
                        }
                        if (inputNode) {
                            inputNode.runtimeStatus = 'success';
                            this.setNodeState(inputNode.id, 'completed');
                            if (this.nodeRenderer && typeof this.nodeRenderer.updateNodeStyles === 'function') {
                                this.nodeRenderer.updateNodeStyles();
                            }
                        }
                    }
                } catch (_) {}

                // if this was a data_save node (synthetic), theme it green as success
                if (node.type === 'data_save') {
                    node.runtimeStatus = 'success';
                    if (this.nodeRenderer) this.nodeRenderer.updateNodeStyles();
                }
                
                const returnValueText = result.return_value !== null && result.return_value !== undefined 
                    ? `\nReturned: ${JSON.stringify(result.return_value)}` 
                    : '';
                this.appendOutput(`[${node.name}] execution completed in ${(runtime/1000).toFixed(3)}s${returnValueText}\n${result.output || ''}\n`);
                return true; // success
            } else {
                // store execution result and remember failed node for no-selection view
                this.nodeExecutionResults.set(node.id, {
                    node: node,
                    success: false,
                    output: result.output || '',
                    error: result.error || 'unknown error',
                    runtime: runtime,
                    timestamp: new Date().toLocaleTimeString(),
                    return_value: null,
                    function_name: result.function_name,
                    input_args: result.input_args,
                    input_values: result.input_values,
                    input_used: !!(result && (result.input_used || (result.input_values && Object.keys(result.input_values || {}).length > 0)))
                });
                this.lastFailedNode = { id: node.id, name: node.name, pythonFile: node.pythonFile, error: result.error || 'unknown error' };
                
                // set node to error state (red)
                this.setNodeState(node.id, 'error');
                this.updateNodeDetails(node, 'error', runtime, result.error);
                if (node.type === 'data_save') {
                    node.runtimeStatus = 'error';
                    if (this.nodeRenderer) this.nodeRenderer.updateNodeStyles();
                }
                this.appendOutput(`[${node.name}] execution failed after ${(runtime/1000).toFixed(3)}s\n${result.error || 'unknown error'}\n`);
                return false; // failure - will stop execution
            }
            
        } catch (error) {
            // store execution result for error case
            this.nodeExecutionResults.set(node.id, {
                node: node,
                success: false,
                output: '',
                error: error.message,
                runtime: 0,
                timestamp: new Date().toLocaleTimeString()
            });
            this.lastFailedNode = { id: node.id, name: node.name, pythonFile: node.pythonFile, error: error.message };
            
            this.removeNodeLoadingAnimation(node.id);
            this.setNodeState(node.id, 'error');
            this.updateNodeDetails(node, 'error', 0, error.message);
            this.appendOutput(`[${node.name}] execution error: ${error.message}\n`);
            return false; // failure
        }
    }

    // evaluate an if splitter's outgoing link conditions against available upstream variables
    // and block branches whose conditions evaluate to false for the current run
    async evaluateIfNodeAndBlockBranches(ifNode) {
        try {
            // gather variables from incoming python nodes
            const incomingLinks = this.state.links.filter(l => l.target === ifNode.id);
            const vars = {};
            for (const link of incomingLinks) {
                const sourceId = link.source;
                if (!this.nodeVariables.has(sourceId)) continue;
                const val = this.nodeVariables.get(sourceId);
                if (val && typeof val === 'object' && val !== null) {
                    Object.assign(vars, val);
                } else if (typeof val !== 'undefined') {
                    const src = this.state.getNode(sourceId);
                    let mapped = false;
                    // try to map primitive return value to the real return variable name via analysis
                    try {
                        if (src && src.type === 'python_file' && src.pythonFile) {
                            const resp = await fetch('/api/analyze-python-function', {
                                method: 'POST', headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ python_file: src.pythonFile })
                            });
                            const data = await resp.json();
                            const returns = Array.isArray(data && data.returns) ? data.returns : [];
                            // prefer single variable name; otherwise first variable-like name
                            let varName = null;
                            if (returns.length === 1 && returns[0] && returns[0].name) {
                                varName = returns[0].name;
                            } else {
                                const variableItem = returns.find(r => r && (r.type === 'variable' || typeof r.name === 'string') && r.name);
                                if (variableItem && variableItem.name) varName = variableItem.name;
                            }
                            if (varName && typeof varName === 'string') {
                                vars[varName] = val;
                                mapped = true;
                            }
                        }
                    } catch (_) {}
                    if (!mapped) {
                        const key = (src && src.name) ? src.name.toLowerCase().replace(/[^a-z0-9_]/g, '_') : `node_${sourceId}`;
                        vars[key] = val;
                    }
                }
            }

            // evaluate outgoing links
            const outgoingLinks = this.state.links.filter(l => l.source === ifNode.id);
            if (!outgoingLinks.length) return;

            // helper to evaluate a single condition object { variable, operator, value, combiner? }
            const evalSingle = (variableName, operator, compareRaw) => {
                const left = vars.hasOwnProperty(variableName) ? vars[variableName] : undefined;
                if (typeof left === 'undefined') return false;
                let right = compareRaw;
                // basic type coercion based on left type
                if (typeof left === 'number') {
                    const n = Number(right);
                    right = Number.isNaN(n) ? right : n;
                } else if (typeof left === 'boolean') {
                    if (String(right).toLowerCase() === 'true') right = true;
                    else if (String(right).toLowerCase() === 'false') right = false;
                }
                switch (operator) {
                    case '===': return left === right;
                    case '==': return left == right; // eslint-disable-line eqeqeq
                    case '>': return Number(left) > Number(right);
                    case '<': return Number(left) < Number(right);
                    case '>=': return Number(left) >= Number(right);
                    case '<=': return Number(left) <= Number(right);
                    default: return false;
                }
            };

            const trueTargets = [];
            const falseTargets = [];
            for (const link of outgoingLinks) {
                const meta = this.state.getLink(link.source, link.target) || link;
                const conditions = Array.isArray(meta.conditions) ? meta.conditions : [];
                if (conditions.length === 0) {
                    // no conditions means this arm is not taken by default
                    falseTargets.push(link.target);
                    // mark link as false in runtime
                    try { this.state.updateLink(link.source, link.target, { runtime_condition: 'false', runtime_details: { variables: { ...vars }, conditions: [], final: false } }); } catch (_) {}
                    continue;
                }
                // evaluate left-to-right with optional combiner on subsequent conditions (default 'and')
                const details = [];
                let result = evalSingle(conditions[0].variable, conditions[0].operator, conditions[0].value);
                details.push({
                    variable: conditions[0].variable,
                    operator: conditions[0].operator,
                    value: conditions[0].value,
                    left: Object.prototype.hasOwnProperty.call(vars, conditions[0].variable) ? vars[conditions[0].variable] : undefined,
                    result
                });
                for (let i = 1; i < conditions.length; i++) {
                    const c = conditions[i];
                    const next = evalSingle(c.variable, c.operator, c.value);
                    const comb = (c.combiner || 'and').toLowerCase();
                    details.push({
                        variable: c.variable,
                        operator: c.operator,
                        value: c.value,
                        combiner: comb,
                        left: Object.prototype.hasOwnProperty.call(vars, c.variable) ? vars[c.variable] : undefined,
                        result: next
                    });
                    if (comb === 'or') result = result || next; else result = result && next;
                }
                if (result) {
                    trueTargets.push(link.target);
                    try { this.state.updateLink(link.source, link.target, { runtime_condition: 'true', runtime_details: { variables: { ...vars }, conditions: details, final: true } }); } catch (_) {}
                } else {
                    falseTargets.push(link.target);
                    try { this.state.updateLink(link.source, link.target, { runtime_condition: 'false', runtime_details: { variables: { ...vars }, conditions: details, final: false } }); } catch (_) {}
                }
            }

            // block all false arms (and their downstream nodes where appropriate)
            for (const tgt of falseTargets) {
                this.blockBranchFrom(tgt);
            }
            // ensure true arm immediate targets are unblocked if previously marked
            for (const tgt of trueTargets) {
                if (this.blockedNodeIds.has(tgt)) this.blockedNodeIds.delete(tgt);
            }
        } catch (e) {
            console.warn('if evaluation error', e);
        }
    }

    // block a branch starting from a node id, but stop at merge points that also have
    // incoming links from nodes not in the blocked set (so other paths can still proceed)
    blockBranchFrom(startNodeId) {
        const queue = [startNodeId];
        const localVisited = new Set();
        while (queue.length) {
            const currentId = queue.shift();
            if (localVisited.has(currentId)) continue;
            localVisited.add(currentId);

            // add to global blocked set
            this.blockedNodeIds.add(currentId);

            // traverse outgoing links
            const outgoing = this.state.links.filter(l => l.source === currentId);
            for (const l of outgoing) {
                const targetId = l.target;
                if (localVisited.has(targetId)) continue;
                // check if target has any incoming from outside blocked area
                const incomers = this.state.links.filter(il => il.target === targetId);
                const hasAlternative = incomers.some(il => !this.blockedNodeIds.has(il.source) && !localVisited.has(il.source));
                if (!hasAlternative) {
                    queue.push(targetId);
                }
            }
        }
    }

    async callNodeExecution(node, inputVariables = {}) {
        // call streaming endpoint to receive live stdout as events
        try {
            const callStartTime = Date.now();
            const controller = this.currentExecutionController || new AbortController();
            const response = await fetch('/api/execute-node-stream', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    node_id: node.id,
                    python_file: node.pythonFile,
                    node_name: node.name,
                    function_args: inputVariables.functionArgs || {},
                    input_values: inputVariables.inputValues || {}
                }),
                signal: controller.signal
            });

            if (!response.ok || !response.body) {
                // fallback to non-streaming if server doesn't support it
                const fallback = await fetch('/api/execute-node', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        node_id: node.id,
                        python_file: node.pythonFile,
                        node_name: node.name,
                        function_args: inputVariables.functionArgs || {},
                        input_values: inputVariables.inputValues || {}
                    })
                });
                return await fallback.json();
            }

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';
            let finalResult = null;
            let inResultBlock = false; // filter out embedded result payload from live feed

            const appendConsole = (rawLine) => {
                // filter out embedded result block markers and their contents
                let line = String(rawLine || '');
                if (line.includes('__RESULT_START__') && line.includes('__RESULT_END__')) {
                    line = line.replace(/__RESULT_START__[\s\S]*?__RESULT_END__/g, '');
                    inResultBlock = false;
                } else if (line.includes('__RESULT_START__')) {
                    // keep anything before the start marker, then enter skip mode
                    line = line.split('__RESULT_START__')[0];
                    inResultBlock = true;
                } else if (line.includes('__RESULT_END__')) {
                    // leave skip mode; keep anything after the end marker
                    line = line.split('__RESULT_END__')[1] || '';
                    inResultBlock = false;
                } else if (inResultBlock) {
                    // skip lines inside the result block
                    return;
                }
                // normalize whitespace to improve duplicate detection
                line = line.trim();
                if (!line) return;
                // append live output to the sidebar console if this node is selected
                const selected = Array.from(this.state.selectedNodes);
                if (selected.length === 1 && selected[0] === node.id) {
                    const container = document.getElementById('console_output_log');
                    if (container) {
                        const current = container.textContent || '';
                        container.textContent = current ? (current + '\n' + line) : line;
                        container.scrollTop = container.scrollHeight;
                    }
                }
                // also append a live line to the bottom feed for this node
                try {
                        // persist line into execution feed
                    try {
                        let entry = this.executionFeed.find(e => e.node_id === node.id && !e.finished_at);
                        if (!entry) {
                            entry = {
                                node_id: node.id,
                                node_name: node.name,
                                started_at: new Date().toISOString(),
                                finished_at: null,
                                success: null,
                                lines: []
                            };
                            this.executionFeed.push(entry);
                        }
                        // avoid duplicating any identical line text already present in this entry
                        const hasTextAlready = entry.lines.some(l => (l && typeof l.text === 'string') ? l.text === line : false);
                        if (!hasTextAlready) {
                            entry.lines.push({ text: line, ts: new Date().toISOString() });
                        }
                    } catch (_) {}

                    const list = document.getElementById('run_feed_list');
                    if (list) {
                        // reuse or create a current running item for this node
                        const runningId = `run_feed_running_${node.id}`;
                    let item = document.getElementById(runningId);
                        if (!item) {
                            item = document.createElement('div');
                            item.id = runningId;
                            item.className = 'run_feed_item';
                            const title = document.createElement('div');
                            title.className = 'run_feed_item_title';
                            title.textContent = node.name;
                            const outCol = document.createElement('div');
                            outCol.className = 'run_feed_output';
                            const metaCol = document.createElement('div');
                            metaCol.className = 'run_feed_meta';
                            metaCol.textContent = 'running...';
                            item.appendChild(title);
                            item.appendChild(outCol);
                            item.appendChild(metaCol);
                            list.appendChild(item);
                        // remove placeholder if present since we now have content
                        const placeholder = document.getElementById('run_feed_placeholder');
                        if (placeholder && placeholder.parentElement === list) {
                            placeholder.remove();
                        }
                        }
                        const outCol = item.children[1];
                        if (outCol) {
                            const lineDiv = document.createElement('div');
                            lineDiv.className = 'run_feed_line';
                            lineDiv.textContent = line;
                            outCol.appendChild(lineDiv);
                            list.scrollTop = list.scrollHeight;
                        }
                    }
                } catch (_) {}
            };

            while (true) {
                const { value, done } = await reader.read();
                if (done) break;
                buffer += decoder.decode(value, { stream: true });

                // process sse-like chunks
                let idx;
                while ((idx = buffer.indexOf('\n\n')) !== -1) {
                    const chunk = buffer.slice(0, idx).trimEnd();
                    buffer = buffer.slice(idx + 2);
                    if (!chunk) continue;
                    const lines = chunk.split('\n');
                    let eventType = 'message';
                    let dataLines = [];
                    for (const l of lines) {
                        if (l.startsWith('event:')) {
                            eventType = l.slice(6).trim();
                        } else if (l.startsWith('data:')) {
                            dataLines.push(l.slice(5).trim());
                        }
                    }
                    const data = dataLines.join('\n');
                    if (eventType === 'stdout') {
                        appendConsole(data);
                    } else if (eventType === 'result') {
                        try {
                            finalResult = JSON.parse(data);
                        } catch (_) {
                            finalResult = { success: false, error: 'invalid result payload' };
                        }
                        // finalize the running feed item state
                        try {
                            const runningId = `run_feed_running_${node.id}`;
                            const item = document.getElementById(runningId);
                            if (item) {
                                item.classList.add(finalResult.success ? 'success' : 'error');
                                // keep id so we can reuse if the same node is run again in the same session; but we want to start a new group next time
                                // we will remove id right before creating a new running item for this node next time
                                const metaCol = item.children[2];
                                if (metaCol) {
                                    const finishedAt = new Date();
                                    const elapsedMs = Math.max(0, finishedAt.getTime() - callStartTime);
                                    const elapsedSec = (elapsedMs / 1000).toFixed(3);
                                    metaCol.textContent = `${finishedAt.toLocaleTimeString()}  ·  ${elapsedSec}s`;
                                }
                                // if failed, append error text lines to the live feed ui
                                // all comments in lower case
                                try {
                                    if (!finalResult.success && finalResult && finalResult.error) {
                                        const outCol = item.children[1];
                                        if (outCol) {
                                            String(finalResult.error)
                                                .split(/\r?\n/)
                                                .filter(Boolean)
                                                .forEach(tl => {
                                                    const lineDiv = document.createElement('div');
                                                    lineDiv.className = 'run_feed_line';
                                                    lineDiv.textContent = tl;
                                                    outCol.appendChild(lineDiv);
                                                });
                                            const list = document.getElementById('run_feed_list');
                                            if (list) list.scrollTop = list.scrollHeight;
                                        }
                                    }
                                } catch (_) {}
                            }
                            // finalize feed entry data
                            try {
                                const entry = this.executionFeed.find(e => e.node_id === node.id && !e.finished_at);
                                if (entry) {
                                    entry.finished_at = new Date().toISOString();
                                    entry.success = !!finalResult.success;
                                    try {
                                        // persist elapsed time for restoration in history view
                                        const start = entry.started_at ? new Date(entry.started_at).getTime() : callStartTime;
                                        const end = Date.now();
                                        const elapsedMs = (typeof start === 'number' && start > 0) ? Math.max(0, end - start) : Math.max(0, end - callStartTime);
                                        entry.elapsed_ms = elapsedMs;
                                    } catch (_) {}
                                    // if there was non-streamed output appended at the end by the wrapper, ensure it's included
                                    const tail = (finalResult && finalResult.output) ? String(finalResult.output) : '';
                                    if (tail) {
                                        const tailLines = tail.split(/\r?\n/).filter(Boolean);
                                        // build a set of existing texts to avoid any duplicates, not just the last line
                                        const existingTexts = new Set(entry.lines.map(l => l && typeof l.text === 'string' ? l.text : ''));
                                        tailLines.forEach(tl => {
                                            if (!existingTexts.has(tl)) {
                                                entry.lines.push({ text: tl, ts: new Date().toISOString() });
                                                existingTexts.add(tl);
                                            }
                                        });
                                    }
                                    // if failed, persist error lines into execution feed
                                    try {
                                        if (!finalResult.success && finalResult && finalResult.error) {
                                            const existingTexts = new Set(entry.lines.map(l => l && typeof l.text === 'string' ? l.text : ''));
                                            String(finalResult.error)
                                                .split(/\r?\n/)
                                                .map(s => s.trim())
                                                .filter(Boolean)
                                                .forEach(tl => {
                                                    if (!existingTexts.has(tl)) {
                                                        entry.lines.push({ text: tl, ts: new Date().toISOString() });
                                                        existingTexts.add(tl);
                                                    }
                                                });
                                        }
                                    } catch (_) {}
                                }
                            } catch (_) {}
                        } catch (_) {}
                    }
                }
            }

            // ensure we have a result
            if (!finalResult) {
                finalResult = { success: false, error: 'no result received' };
            }
            return finalResult;
        } catch (error) {
            if (error.name === 'AbortError') {
                return { success: false, error: 'execution was cancelled by user' };
            }
            return { success: false, error: `network error: ${error.message}` };
        }
    }

    async gatherInputVariables(targetNode) {
        // gather all variables from nodes that connect to this target node
        // separate function arguments (from previous nodes) from input values (from input nodes)
        const functionArgs = {};
        const inputValues = {};
        
        // find all links that point to this node
        const incomingLinks = this.state.links.filter(link => link.target === targetNode.id);
        console.log(`[${targetNode.name}] Found ${incomingLinks.length} incoming links`);
        
        // first, we need to know what parameters the target function expects
        const targetFunctionInfo = await this.analyzePythonFunction(targetNode.pythonFile);
        const expectedParams = targetFunctionInfo.formal_parameters || [];  // formal parameters come from previous nodes
        const inputVariableNames = targetFunctionInfo.input_variable_names || []; // input() calls get values from input nodes
        console.log(`[${targetNode.name}] Expected formal parameters (from previous nodes):`, expectedParams);
        console.log(`[${targetNode.name}] Expected input variables (from input nodes):`, inputVariableNames);
        
        // separate input nodes from regular nodes
        const inputNodes = [];
        const regularNodes = [];
        
        incomingLinks.forEach(link => {
            const sourceNodeId = link.source;
            const sourceNode = this.state.getNode(sourceNodeId);
            
            if (sourceNode && sourceNode.type === 'input_node') {
                inputNodes.push(sourceNode);
                console.log(`[${targetNode.name}] Found input node: ${sourceNode.name}`);
            } else if (sourceNode && sourceNode.type === 'if_node') {
                // bridge variables across an if splitter: pull from upstream python nodes
                const upstreamLinks = this.state.links.filter(l => l.target === sourceNode.id);
                upstreamLinks.forEach(ul => {
                    const upNode = this.state.getNode(ul.source);
                    if (!upNode) return;
                    if (upNode.type === 'input_node') {
                        inputNodes.push(upNode);
                        console.log(`[${targetNode.name}] Found input node via if: ${upNode.name}`);
                        return;
                    }
                    if (this.nodeVariables.has(upNode.id)) {
                        const returnValue = this.nodeVariables.get(upNode.id);
                        regularNodes.push({ node: upNode, returnValue });
                        console.log(`[${targetNode.name}] Bridged var from upstream of if: ${upNode.name}`, returnValue);
                    }
                });
            } else if (sourceNode) {
                // check if this source node has variables available
                if (this.nodeVariables.has(sourceNodeId)) {
                    const returnValue = this.nodeVariables.get(sourceNodeId);
                    regularNodes.push({ node: sourceNode, returnValue });
                    console.log(`[${targetNode.name}] Found regular node with variables: ${sourceNode.name}`, returnValue);
                } else {
                    console.log(`[${targetNode.name}] Source node ${sourceNode.name} has no variables stored yet`);
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
                        console.log(`[${targetNode.name}] assigned object key ${key} from ${sourceNode.name}`);
                    } else {
                        console.log(`[${targetNode.name}] skipped overwriting existing arg ${key} from ${sourceNode.name}`);
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
                        console.log(`[${targetNode.name}] mapped tuple/list element to ${paramName} from ${sourceNode.name}`);
                    }
                }
                return;
            }

            // case 3: primitive return — try to match by heuristics
            const variableName = this.matchVariableToParameter(sourceNode, returnValue, expectedParams, functionArgs);
            if (variableName && !Object.prototype.hasOwnProperty.call(functionArgs, variableName)) {
                functionArgs[variableName] = returnValue;
                console.log(`[${targetNode.name}] matched function arg ${variableName} = ${returnValue} from ${sourceNode.name}`);
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
                        console.log(`[${targetNode.name}] Added input value ${param} = ${value} from input node`);
                    }
                });
            }
        });
        
        console.log(`[${targetNode.name}] Final function args (from previous nodes):`, functionArgs);
        console.log(`[${targetNode.name}] Final input values (for input() calls):`, inputValues);
        return { functionArgs, inputValues };
    }

    // persist data from connected data_save nodes when a python node completes successfully
    async persistDataSaveForNode(pythonNode) {
        try {
            console.log(`[data_save] scanning connections for python node: ${pythonNode.name} (${pythonNode.id})`);
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
            console.log(`[data_save] found ${connectedDataSaves.length} connected data_save node(s) for ${pythonNode.name}`);
            if (connectedDataSaves.length === 0) return;

            // get latest execution result for this python node
            const result = this.nodeExecutionResults.get(pythonNode.id);
            const returnsVal = result ? result.return_value : undefined;
            console.log(`[data_save] latest return for ${pythonNode.name}:`, returnsVal);

            const analyzeReturnsForNode = async () => {
                try {
                    const resp = await fetch('/api/analyze-python-function', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ python_file: pythonNode.pythonFile })
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
                if (!result) { console.log('[data_save] no execution result present; skipping'); return; }
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
                if (typeof value === 'undefined') { console.log(`[data_save] unable to resolve value for ${ds.name}; skipping`); return; }
                try {
                    // store a synthetic result entry so it shows up in history and data matrix
                    const synthetic = {
                        node_id: ds.id,
                        node_name: ds.name || 'data save',
                        python_file: pythonNode.pythonFile,
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
                    try { ds.runtimeStatus = 'success'; this.nodeRenderer && this.nodeRenderer.updateNodeStyles(); } catch (_) {}
                    console.log(`[data_save] persisted for node '${ds.name}' with key '${dataKey}'`);
                } catch (e) {
                    console.warn('failed to synthesize data_save result', e);
                    try { ds.runtimeStatus = 'error'; this.nodeRenderer && this.nodeRenderer.updateNodeStyles(); } catch (_) {}
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
                    python_file: pythonFile
                })
            });
            
            const result = await response.json();
            return result;
        } catch (error) {
            console.error('error analyzing python function:', error);
            return { parameters: [] };
        }
    }

    matchVariableToParameter(sourceNode, returnValue, expectedParams, existingVariables) {
        // try to match the return value to one of the expected parameters
        
        // if there's only one expected parameter, use it (highest priority)
        if (expectedParams.length === 1) {
            const paramName = expectedParams[0];
            if (!existingVariables.hasOwnProperty(paramName)) {
                console.log(`[matchVariable] Single parameter match: ${paramName}`);
                return paramName;
            }
        }
        
        // try to match based on common naming patterns
        for (const paramName of expectedParams) {
            if (!existingVariables.hasOwnProperty(paramName)) {
                // direct match with common variable names
                if (paramName === 'result' && typeof returnValue === 'number') {
                    console.log(`[matchVariable] Result type match: ${paramName}`);
                    return paramName;
                }
                if (paramName === 'text' && typeof returnValue === 'string') {
                    console.log(`[matchVariable] Text type match: ${paramName}`);
                    return paramName;
                }
                if (paramName === 'data' || paramName === 'value') {
                    console.log(`[matchVariable] Data/value match: ${paramName}`);
                    return paramName;
                }
                if (paramName === 'items' && Array.isArray(returnValue)) {
                    console.log(`[matchVariable] Array match: ${paramName}`);
                    return paramName;
                }
            }
        }
        
        // fallback: use the first available expected parameter
        for (const paramName of expectedParams) {
            if (!existingVariables.hasOwnProperty(paramName)) {
                console.log(`[matchVariable] First available parameter: ${paramName}`);
                return paramName;
            }
        }
        
        // last resort: use a generic name based on return value type
        const genericName = this.getVariableNameForNode(sourceNode, returnValue);
        console.log(`[matchVariable] Generic name fallback: ${genericName}`);
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

    addNodeLoadingAnimation(nodeId) {
        // add spinning loading animation around the node
        const nodeGroup = this.nodeRenderer.nodeGroup
            .selectAll('.node-group')
            .filter(d => d.id === nodeId);
            
        // add loading circle around the node
        nodeGroup.append('circle')
            .attr('class', 'node_loading_circle')
            .attr('r', 45)
            .attr('cx', 0)
            .attr('cy', 0)
            .style('fill', 'none')
            .style('stroke', '#2196f3')
            .style('stroke-width', '3')
            .style('stroke-dasharray', '10,5')
            .style('animation', 'spin 1s linear infinite');
    }

    removeNodeLoadingAnimation(nodeId) {
        // remove the loading animation
        const nodeGroup = this.nodeRenderer.nodeGroup
            .selectAll('.node-group')
            .filter(d => d.id === nodeId);
            
        nodeGroup.select('.node_loading_circle').remove();
    }

    setNodeState(nodeId, state) {
        // find the node element and update its class
        const nodeElement = this.nodeRenderer.nodeGroup
            .selectAll('.node-group')
            .filter(d => d.id === nodeId)
            .select('.node');
            
        // remove all state classes
        nodeElement.classed('running', false)
                  .classed('completed', false)
                  .classed('error', false);
        
        // add the new state class
        nodeElement.classed(state, true);
        
        // add/remove loading icon for running state
        const nodeGroup = this.nodeRenderer.nodeGroup
            .selectAll('.node-group')
            .filter(d => d.id === nodeId);
            
        if (state === 'running') {
            // add loading icon
            nodeGroup.append('text')
                .attr('class', 'node_loading_icon material-icons')
                .attr('x', (d) => (d.width || 120) / 2 + 25)
                .attr('y', 5)
                .style('font-size', '16px')
                .style('fill', '#2196f3')
                .text('hourglass_empty');
        } else {
            // remove loading icon
            nodeGroup.select('.node_loading_icon').remove();
        }
    }

    resetNodeStates() {
        // reset all nodes to default state
        this.nodeRenderer.nodeGroup.selectAll('.node')
            .classed('running', false)
            .classed('completed', false)
            .classed('error', false);
            
        // remove all loading icons
        this.nodeRenderer.nodeGroup.selectAll('.node_loading_icon').remove();

        // clear any runtimeStatus flags on nodes (e.g., data_save success coloring)
        try {
            this.state.nodes.forEach(n => { if (n && n.runtimeStatus) delete n.runtimeStatus; });
            this.nodeRenderer && this.nodeRenderer.updateNodeStyles();
        } catch (_) {}
    }

    // clear all visual colour state for nodes (classes, inline fills, and runtime flags)
    clearAllNodeColorState() {
        // clear state classes
        try {
            this.nodeRenderer.nodeGroup.selectAll('.node')
                .classed('running', false)
                .classed('completed', false)
                .classed('error', false)
                // clear inline colours to allow base css/theme to apply
                .style('fill', null)
                .style('stroke', null)
                .style('stroke-width', null);
        } catch (_) {}

        // remove loading icons
        try { this.nodeRenderer.nodeGroup.selectAll('.node_loading_icon').remove(); } catch (_) {}

        // clear any runtimeStatus flags (e.g., data_save success/error)
        try {
            const nodes = Array.isArray(this.state.nodes) ? this.state.nodes : [];
            nodes.forEach(n => { if (n && n.runtimeStatus) delete n.runtimeStatus; });
        } catch (_) {}

        // refresh renderer to restore base styles for special node types
        try { this.nodeRenderer && this.nodeRenderer.updateNodeStyles(); } catch (_) {}
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
            // also ensure the live feed is scrolled to this node's output after it updates
            try { this.scrollRunFeedToNode(node.id); } catch (_) {}
        }
    }

    scrollRunFeedToNode(nodeId) {
        // find a running or completed feed item for this node and scroll it into view
        const list = document.getElementById('run_feed_list');
        if (!list) return;
        // prefer the running item id if present
        const running = document.getElementById(`run_feed_running_${nodeId}`);
        const match = running || Array.from(list.children).find(el => {
            try {
                const title = el.querySelector('.run_feed_item_title');
                if (!title) return false;
                // compare by name from state to avoid relying on node_name text differences
                const node = this.state.getNode(nodeId);
                return node && title.textContent === node.name;
            } catch (_) { return false; }
        });
        if (match && typeof match.scrollIntoView === 'function') {
            match.scrollIntoView({ behavior: 'smooth', block: 'start' });
        } else if (list && list.lastElementChild) {
            // fallback: scroll to bottom
            list.lastElementChild.scrollIntoView({ behavior: 'smooth', block: 'end' });
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
        
        // trigger sidebar update to reflect cleared state
        this.state.emit('updateSidebar');
    }

    clearExecutionFeed() {
        // clear internal execution feed data
        this.executionFeed = [];
        // clear bottom live feed ui
        try {
            const list = document.getElementById('run_feed_list');
            if (list) {
                list.innerHTML = '';
                // add placeholder when list is empty
                const placeholder = document.createElement('div');
                placeholder.id = 'run_feed_placeholder';
                placeholder.className = 'run_feed_placeholder';
                placeholder.textContent = 'waiting for execution';
                list.appendChild(placeholder);
            }
        } catch (_) {}
    }

    // debug methods
    logState() {
        console.log('flowchart state:', {
            nodes: this.state.nodes,
            links: this.state.links,
            groups: this.state.groups,
            selection: {
                nodes: Array.from(this.state.selectedNodes),
                link: this.state.selectedLink,
                group: this.state.selectedGroup
            },
            stats: this.getStats()
        });
    }

    // cleanup
    destroy() {
        // cleanup all components
        if (this.nodeRenderer) this.nodeRenderer.destroy();
        if (this.linkRenderer) this.linkRenderer.destroy();
        if (this.groupRenderer) this.groupRenderer.destroy();
        if (this.sidebar) this.sidebar.destroy();
        if (this.events) this.events.destroy();
        
        // remove event listeners
        window.removeEventListener('resize', this.handleResize);
        document.removeEventListener('dragstart', this.preventDefaultDrag);
        
        console.log('flowchart builder destroyed');
    }
}

window.FlowchartBuilder = FlowchartBuilder;

// extend prototype with a centralized clear for leaving run mode
// this mirrors the clear button behavior so navigation away from run fully resets ui
FlowchartBuilder.prototype.clearRunModeState = function() {
    try { this.resetNodeStates(); } catch (_) {}
    try { this.clearOutput(); } catch (_) {}
    try { this.clearExecutionFeed(); } catch (_) {}
    try { this.updateExecutionStatus('info', 'cleared'); } catch (_) {}
    try { this.clearIfRuntimeIndicators(); } catch (_) {}
    try { this.clearAllNodeColorState(); } catch (_) {}
    // clear selection and ensure default run panel when coming back later
    try { this.state.clearSelection(); this.state.emit('updateSidebar'); } catch (_) {}
};