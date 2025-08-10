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
            this.updateStatusBar(data.message);
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
        });
        
        this.state.on('flowViewChanged', (data) => {
            this.updateFlowViewUI(data.isFlowView);
        });
        
        // update order when state changes if in flow view
        this.state.on('stateChanged', () => {
            if (this.state.isFlowView) {
                this.renderNodeOrder();
            }
        });
        
        // update coordinates when selection changes
        this.state.on('selectionChanged', () => {
            this.updateNodeCoordinates();
            // re-render annotations to apply selected class
            if (this.annotationRenderer && this.annotationRenderer.render) {
                this.annotationRenderer.render();
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

        // setup connection dots
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
        document.getElementById('build_btn').addEventListener('click', () => {
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
        
        document.getElementById('history_btn').addEventListener('click', () => {
            this.switchToHistoryMode();
            const u = new URL(window.location.href);
            u.searchParams.set('mode', 'history');
            window.history.replaceState(null, '', u.pathname + '?' + u.searchParams.toString());
        });

        // settings button
        const settingsBtn = document.getElementById('settings_btn');
        if (settingsBtn) {
            settingsBtn.addEventListener('click', () => {
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
        
        document.getElementById('group_select_btn').addEventListener('click', () => {
            this.toggleGroupSelectMode();
        });
        
        document.getElementById('deselect_btn').addEventListener('click', () => {
            this.deselectAll();
        });
        
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
            this.startExecution();
            }
        });

        // clear button for run mode
        const clearRunBtn = document.getElementById('execute_clear_btn');
        if (clearRunBtn) {
            clearRunBtn.addEventListener('click', () => {
                this.resetNodeStates();
                this.clearOutput();
                this.updateExecutionStatus('info', 'cleared');
            });
        }
        
        // refresh history button
        document.getElementById('refresh_history_btn').addEventListener('click', () => {
            this.loadExecutionHistory();
        });
    }

    setupStatusBar() {
        this.statusText = document.getElementById('status_text');
        this.nodeCount = document.getElementById('node_count');
        this.nodeCoordinates = document.getElementById('node_coordinates');
        this.statusProgress = document.getElementById('status_progress');
        this.statusProgressBar = document.getElementById('status_progress_bar');
        
        // get coordinate input elements
        this.nodeXInput = document.getElementById('node_x');
        this.nodeYInput = document.getElementById('node_y');
        this.nodeWidthInput = document.getElementById('node_width');
        this.nodeHeightInput = document.getElementById('node_height');
        
        // setup coordinate input event listeners
        this.setupCoordinateInputs();
        
        // initial status
        this.updateStatusBar('ready - click to add nodes, drag dots to connect');
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
        if (this.statusText) {
            this.statusText.textContent = message;
        }
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
            
            // set initial mode from url if provided (e.g., ?mode=run or ?mode=history)
            const params = new URLSearchParams(window.location.search);
            const mode = params.get('mode');
            if (mode === 'run') {
                this.switchToRunMode();
            } else if (mode === 'history') {
                this.switchToHistoryMode();
            } else if (mode === 'settings') {
                this.switchToSettingsMode();
            } else {
                this.updateModeUI('build', null);
            }
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
        // first filter out input nodes and their connections
        const nonInputNodes = nodes.filter(node => node.type !== 'input_node');
        const nonInputLinks = links.filter(link => {
            const sourceNode = nodes.find(n => n.id === link.source);
            const targetNode = nodes.find(n => n.id === link.target);
            // exclude links that involve input nodes or input connections
            return sourceNode?.type !== 'input_node' && 
                   targetNode?.type !== 'input_node' &&
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
    }

    switchToHistoryMode() {
        this.state.setMode('history');
        this.loadExecutionHistory();
    }

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

    updateModeUI(mode, previousMode) {
        const buildBtn = document.getElementById('build_btn');
        const scriptsBtn = document.getElementById('scripts_btn');
        const runBtn = document.getElementById('run_btn');
        const historyBtn = document.getElementById('history_btn');
        const settingsBtn = document.getElementById('settings_btn');
        const floatingToolbar = document.getElementById('floating_toolbar');
        const buildToolbar = document.getElementById('build_toolbar');
        const annotationToolbar = document.getElementById('annotation_toolbar');
        const topToolbars = document.getElementById('top_toolbars');
        const startButtonContainer = document.getElementById('start_button_container');
        const mainContent = document.querySelector('.main_content');
        const propertiesSidebar = document.querySelector('.properties_sidebar');
        const addNodeSection = document.getElementById('add_node_section');
        const canvasContainer = document.querySelector('.canvas_container');
        const settingsPage = document.getElementById('settings_page');
        
        // reset all button states
        buildBtn.classList.remove('run_mode_active');
        if (scriptsBtn) scriptsBtn.classList.remove('run_mode_active');
        runBtn.classList.remove('run_mode_active');
        historyBtn.classList.remove('run_mode_active');
        if (settingsBtn) settingsBtn.classList.remove('run_mode_active');
        
        // ensure settings page is hidden unless in settings mode
        if (settingsPage) settingsPage.style.display = 'none';
        if (canvasContainer) canvasContainer.style.display = 'block';
        if (propertiesSidebar) propertiesSidebar.style.display = 'flex';
        if (mainContent) mainContent.classList.remove('full_width');
        // reset width mode classes
        if (mainContent) mainContent.classList.remove('run_mode', 'history_mode');
        if (propertiesSidebar) propertiesSidebar.classList.remove('run_mode', 'history_mode');

        if (mode === 'build') {
            // activate build mode
            buildBtn.classList.add('run_mode_active');
            floatingToolbar.style.display = 'flex'; // show floating toolbar
            if (topToolbars) topToolbars.style.display = 'flex';
            if (buildToolbar) buildToolbar.style.display = 'flex'; // show build toolbar
            if (annotationToolbar) annotationToolbar.style.display = 'flex'; // show annotation toolbar
            
            // enable add node section in build mode
            if (addNodeSection) {
                addNodeSection.classList.remove('disabled');
            }
            
            // hide start button
            startButtonContainer.style.display = 'none';
            
            // restore normal properties sidebar width
            mainContent.classList.remove('run_mode');
            propertiesSidebar.classList.remove('run_mode');
            
            // switch back to default panel
            this.hideExecutionPanel();
            this.hideHistoryPanel();
            
            // reset node colors when leaving run mode
            if (previousMode === 'run' || previousMode === 'history') {
                this.resetNodeStates();
                // hide all play buttons when leaving run mode
                this.nodeRenderer.hideAllPlayButtons();
            }
            
            this.updateStatusBar('build mode - create and edit your flowchart');
            
        } else if (mode === 'run') {
            // hide multiselect button in run mode
            const groupSelectBtn = document.getElementById('group_select_btn');
            if (groupSelectBtn) {
                groupSelectBtn.style.display = 'none';
            }
            // activate run mode
            runBtn.classList.add('run_mode_active');
            floatingToolbar.style.display = 'flex'; // keep floating toolbar visible in run mode
            if (topToolbars) topToolbars.style.display = 'none';
            if (buildToolbar) buildToolbar.style.display = 'none'; // hide build toolbar in run
            if (annotationToolbar) annotationToolbar.style.display = 'none'; // hide annotation toolbar in run
            
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
            
            // show start button
            startButtonContainer.style.display = 'flex';
            
            // expand properties sidebar to run view width
            mainContent.classList.add('run_mode');
            propertiesSidebar.classList.add('run_mode');
            
            // switch to execution panel
            this.showExecutionPanel();
            this.hideHistoryPanel();
            
            // update play button visibility for current selection
            this.nodeRenderer.updatePlayButtonVisibility();
            
            this.updateStatusBar('run mode - interface locked for execution');
            
        } else if (mode === 'history') {
            // hide multiselect button in history mode
            const groupSelectBtn = document.getElementById('group_select_btn');
            if (groupSelectBtn) {
                groupSelectBtn.style.display = 'none';
            }
            // activate history mode
            historyBtn.classList.add('run_mode_active');
            // keep floating toolbar visible in history mode
            floatingToolbar.style.display = 'flex';
            
            // disable add node section in history mode
            if (addNodeSection) {
                addNodeSection.classList.add('disabled');
            }
            
            // disable group select mode in history mode
            if (this.isGroupSelectMode) {
                this.isGroupSelectMode = false;
                const groupSelectBtn = document.getElementById('group_select_btn');
                groupSelectBtn.classList.remove('active');
                const canvas = document.getElementById('flowchart_canvas');
                canvas.style.cursor = '';
                this.hideSelectionRect();
            }
            
            // hide start button
            startButtonContainer.style.display = 'none';
            
            // set history-specific width
            mainContent.classList.add('history_mode');
            propertiesSidebar.classList.add('history_mode');
            if (topToolbars) topToolbars.style.display = 'none';
            if (buildToolbar) buildToolbar.style.display = 'none'; // hide build toolbar in history
            if (annotationToolbar) annotationToolbar.style.display = 'none'; // hide annotation toolbar in history
            
            // switch to history panel
            this.hideExecutionPanel();
            this.showHistoryPanel();
            // always (re)load history when entering history mode
            this.loadExecutionHistory();
            
            this.updateStatusBar('history mode - view past executions');
        } else if (mode === 'settings') {
            // activate settings mode as full page view
            if (settingsBtn) settingsBtn.classList.add('run_mode_active');
            floatingToolbar.style.display = 'none';
            if (topToolbars) topToolbars.style.display = 'none';
            if (buildToolbar) buildToolbar.style.display = 'none'; // hide build toolbar in settings
            if (annotationToolbar) annotationToolbar.style.display = 'none'; // hide annotation toolbar in settings
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
            this.hideHistoryPanel();
            this.hideExecutionPanel();

            // show full page settings
            this.showSettingsPage();
            this.updateStatusBar('settings');
        }
        
        // ensure multiselect button is visible again only in build mode
        if (mode === 'build') {
            const groupSelectBtn = document.getElementById('group_select_btn');
            if (groupSelectBtn) {
                groupSelectBtn.style.display = '';
            }
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
        this.state.clearSelection();
        
        // update visual state
        this.nodeRenderer.updateNodeStyles();
        this.linkRenderer.updateLinkStyles();
        
        // update properties sidebar depending on mode
        if (this.state.isRunMode) {
            // keep execution panel visible and show run-mode default (status + progress)
            this.showExecutionPanel();
            this.state.emit('updateSidebar');
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

    showHistoryPanel() {
        // only show history panel in history mode
        if (this.state.isHistoryMode) {
            // hide all other panels
            document.querySelectorAll('.properties_content').forEach(panel => {
                panel.classList.remove('active');
            });
            
            // show history panel
            document.getElementById('execution_history_properties').classList.add('active');
        }
    }

    showSettingsPage() {
        const settingsPage = document.getElementById('settings_page');
        if (settingsPage) settingsPage.style.display = 'block';
    }

    hideSettingsPage() {
        const settingsPage = document.getElementById('settings_page');
        if (settingsPage) settingsPage.style.display = 'none';
    }

    hideHistoryPanel() {
        // hide history panel
        const historyPanel = document.getElementById('execution_history_properties');
        if (historyPanel) {
            historyPanel.classList.remove('active');
        }
        
        // let sidebar handle showing the appropriate panel
        if (this.state.isBuildMode) {
            // trigger sidebar update to show correct panel for current selection
            this.state.emit('updateSidebar');
        }
    }

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
                // update sidebar progress each step
                this.updateExecutionStatus('running', `executing ${i + 1} of ${executionOrder.length}`);
                
                // if node failed, stop execution immediately
                if (!success) {
                    this.updateExecutionStatus('failed', `execution stopped at node: ${node.name}`);
                    // ensure sidebar refresh picks up failure info in no-selection view
                    this.state.emit('selectionChanged', { nodes: [], link: null, group: null });
                    await this.saveExecutionHistory('failed', executionOrder, `execution stopped at node: ${node.name}`);
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
            text.textContent = ' STOP';
            loadingWheel.style.display = 'block';
        } else {
            // change back to start button
            button.classList.remove('btn_stop');
            button.classList.add('btn_primary');
            icon.textContent = 'play_arrow';
            text.textContent = ' START';
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
            
            const executionData = {
                status: status,
                execution_order: executionOrder.map(node => node.id),
                results: results,
                total_nodes: executionOrder.length,
                successful_nodes: results.filter(r => r.success).length,
                error_message: errorMessage,
                flowchart_state: {
                    nodes: this.state.nodes.map(node => ({
                        id: node.id,
                        name: node.name,
                        x: node.x,
                        y: node.y,
                        pythonFile: node.pythonFile,
                        description: node.description,
                        type: node.type
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

    async loadExecutionHistory() {
        try {
            const historyLoading = document.getElementById('history_loading');
            const historyContent = document.getElementById('history_content');
            const historyEmpty = document.getElementById('history_empty');
            const historyError = document.getElementById('history_error');
            
            // show loading state
            historyLoading.style.display = 'block';
            historyContent.style.display = 'none';
            historyEmpty.style.display = 'none';
            historyError.style.display = 'none';
            
            const response = await fetch(`/api/history?flowchart_name=${encodeURIComponent(this.getCurrentFlowchartName())}`);
            const result = await response.json();
            
            if (result.status === 'success') {
                if (result.history.length === 0) {
                    // no history entries
                    historyLoading.style.display = 'none';
                    historyEmpty.style.display = 'block';
                } else {
                    // populate history entries
                    this.renderHistoryEntries(result.history);
                    historyLoading.style.display = 'none';
                    historyContent.style.display = 'block';
                }
            } else {
                // error loading history
                historyLoading.style.display = 'none';
                historyError.style.display = 'block';
                document.getElementById('history_error_message').textContent = result.message || 'failed to load execution history';
            }
            
        } catch (error) {
            console.error('error loading execution history:', error);
            
            // show error state
            document.getElementById('history_loading').style.display = 'none';
            document.getElementById('history_error').style.display = 'block';
            document.getElementById('history_error_message').textContent = 'network error loading history';
        }
    }

    renderHistoryEntries(historyEntries) {
        const historyContent = document.getElementById('history_content');
        historyContent.innerHTML = '';
        
        historyEntries.forEach(entry => {
            const entryDiv = document.createElement('div');
            entryDiv.className = `history_entry ${entry.status}`;
            
            const failedNodeText = entry.failed_node ? `<div>Failed at: ${entry.failed_node}</div>` : '';
            
            entryDiv.innerHTML = `
                <div class="history_entry_header">
                    <div class="history_entry_time">${entry.execution_time}</div>
                    <div class="history_entry_status ${entry.status}">${entry.status}</div>
                </div>
                <div class="history_entry_stats">
                    <div>${entry.successful_nodes}/${entry.total_nodes} nodes (${entry.success_percentage}%)</div>
                    ${failedNodeText}
                </div>
                <div class="history_entry_actions">
                    <button class="history_entry_btn view" onclick="window.flowchartApp.viewExecutionHistory('${entry.execution_id}')">
                        <span class="material-icons" style="font-size: 14px;">visibility</span>
                        view
                    </button>
                    <button class="history_entry_btn delete" onclick="window.flowchartApp.deleteExecutionHistory('${entry.execution_id}')">
                        <span class="material-icons" style="font-size: 14px;">delete</span>
                        delete
                    </button>
                </div>
            `;
            
            historyContent.appendChild(entryDiv);
        });
    }

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
                // reload history list
                this.loadExecutionHistory();
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
        // populate the global execution log with historical data
        this.globalExecutionLog = '';
        
        executionData.results.forEach(result => {
            const statusText = result.success ? 'completed' : 'failed';
            const output = result.success ? result.output : result.error;
            this.globalExecutionLog += `[${result.node_name}] execution ${statusText} in ${result.runtime}ms\n${output}\n\n`;
        });
        
        // update the output display
        this.showGlobalExecutionLog();
        
        // update execution status
        const statusText = executionData.status === 'success' ? 'completed' : 
                          executionData.status === 'failed' ? 'failed' : 'stopped';
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
                } else {
                    // if node failed, stop execution immediately
                    this.updateExecutionStatus('failed', `execution stopped at node: ${node.name}`);
                    this.state.emit('selectionChanged', { nodes: [], link: null, group: null });
                    await this.saveExecutionHistory('failed', nodesToExecute, `execution stopped at node: ${node.name}`);
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
                input_values: result.input_values
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
            // set node to running state with loading animation
            this.setNodeState(node.id, 'running');
            this.addNodeLoadingAnimation(node.id);
            this.updateExecutionStatus('running', `executing node ${nodeIndex}/${totalNodes}: ${node.name}`);
            
            // show node details in sidebar
            this.updateNodeDetails(node, 'running', Date.now());
            
            const startTime = Date.now();
            
            // gather input variables from previous nodes
            const inputVariables = await this.gatherInputVariables(node);
            
            // debug: log input variables for troubleshooting
            console.log(`[${node.name}] Input variables:`, inputVariables);
            
            // execute the node via API with input variables
            const result = await this.callNodeExecution(node, inputVariables);
            
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
                    input_args: result.input_args
                });
                
                // set node to completed state (green)
                this.setNodeState(node.id, 'completed');
                this.updateNodeDetails(node, 'completed', runtime, result.output);
                
                const returnValueText = result.return_value !== null && result.return_value !== undefined 
                    ? `\nReturned: ${JSON.stringify(result.return_value)}` 
                    : '';
                this.appendOutput(`[${node.name}] execution completed in ${runtime}ms${returnValueText}\n${result.output || ''}\n`);
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
                    input_args: result.input_args
                });
                this.lastFailedNode = { id: node.id, name: node.name, pythonFile: node.pythonFile, error: result.error || 'unknown error' };
                
                // set node to error state (red)
                this.setNodeState(node.id, 'error');
                this.updateNodeDetails(node, 'error', runtime, result.error);
                this.appendOutput(`[${node.name}] execution failed after ${runtime}ms\n${result.error || 'unknown error'}\n`);
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

    async callNodeExecution(node, inputVariables = {}) {
        // call the individual node execution endpoint for real-time feedback
        try {
            const response = await fetch('/api/execute-node', {
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
                signal: this.currentExecutionController ? this.currentExecutionController.signal : null
            });
            
            const result = await response.json();
            return result;
        } catch (error) {
            if (error.name === 'AbortError') {
                return {
                    success: false,
                    error: 'execution was cancelled by user'
                };
            }
            return {
                success: false,
                error: `network error: ${error.message}`
            };
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
            if (returnValue !== null && returnValue !== undefined) {
                if (typeof returnValue === 'object' && returnValue.constructor === Object) {
                    // spread object properties into function args
                    Object.assign(functionArgs, returnValue);
                    console.log(`[${targetNode.name}] Spread object from ${sourceNode.name} into function args:`, returnValue);
                } else {
                    // try to match with expected formal parameters
                    const variableName = this.matchVariableToParameter(sourceNode, returnValue, expectedParams, functionArgs);
                    if (variableName) {
                        functionArgs[variableName] = returnValue;
                        console.log(`[${targetNode.name}] Matched function arg ${variableName} = ${returnValue} from ${sourceNode.name}`);
                    }
                }
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
    }

    updateExecutionStatus(type, message) {
        const statusElement = document.getElementById('execution_status_text');
        const iconElement = document.querySelector('#execution_status .material-icons');
        const timeRow = document.getElementById('execution_time_row');
        const timeGroup = document.getElementById('execution_time_group');
        const timeText = document.getElementById('execution_time_text');
        const timestampEl = document.getElementById('execution_timestamp');
        const progressText = document.getElementById('execution_progress_text');
        const failureInfo = document.getElementById('execution_failure_info');
        
        statusElement.textContent = message;
        
        // update icon based on status type
        switch (type) {
            case 'running':
                iconElement.textContent = 'play_arrow';
                iconElement.style.color = '#2196f3';
                // show elapsed timer
                if (!this.executionStartTimestamp) {
                    this.executionStartTimestamp = Date.now();
                }
                // clear last execution snapshot when starting a new run
                this.lastExecutionElapsedMs = null;
                this.lastExecutionTimestampString = '';
                if (timeRow) timeRow.style.display = 'flex';
                if (timeGroup) timeGroup.style.display = '';
                if (failureInfo) failureInfo.style.display = 'none';
                if (this._elapsedTimer) clearInterval(this._elapsedTimer);
                this._elapsedTimer = setInterval(() => {
                    const elapsed = Date.now() - this.executionStartTimestamp;
                    if (timeText) {
                        const seconds = (elapsed / 1000).toFixed(3);
                        timeText.textContent = `${elapsed}ms (${seconds}s)`;
                    }
                }, 100);
                this.lastExecutionStatus = 'running';
                break;
            case 'completed':
                iconElement.textContent = 'check_circle';
                iconElement.style.color = '#4caf50';
                if (this._elapsedTimer) clearInterval(this._elapsedTimer);
                {
                    const elapsed = this.executionStartTimestamp ? (Date.now() - this.executionStartTimestamp) : 0;
                    this.lastExecutionElapsedMs = elapsed;
                    if (timeText) {
                        const seconds = (elapsed / 1000).toFixed(3);
                        timeText.textContent = `${elapsed}ms (${seconds}s)`;
                    }
                    if (timestampEl) {
                        const now = new Date();
                        const hh = String(now.getHours()).padStart(2, '0');
                        const mm = String(now.getMinutes()).padStart(2, '0');
                        const ss = String(now.getSeconds()).padStart(2, '0');
                        const ts = `${hh}:${mm}:${ss}`;
                        timestampEl.textContent = ts;
                        this.lastExecutionTimestampString = ts;
                    }
                }
                if (timeRow) timeRow.style.display = 'flex';
                if (timeGroup) timeGroup.style.display = '';
                if (failureInfo) failureInfo.style.display = 'none';
                this.executionStartTimestamp = null;
                this.lastExecutionStatus = 'completed';
                break;
            case 'error':
                iconElement.textContent = 'error';
                iconElement.style.color = '#f44336';
                if (this._elapsedTimer) clearInterval(this._elapsedTimer);
                {
                    const elapsed = this.executionStartTimestamp ? (Date.now() - this.executionStartTimestamp) : 0;
                    this.lastExecutionElapsedMs = elapsed;
                    if (timeText) {
                        const seconds = (elapsed / 1000).toFixed(3);
                        timeText.textContent = `${elapsed}ms (${seconds}s)`;
                    }
                    if (timestampEl) {
                        const now = new Date();
                        const hh = String(now.getHours()).padStart(2, '0');
                        const mm = String(now.getMinutes()).padStart(2, '0');
                        const ss = String(now.getSeconds()).padStart(2, '0');
                        const ts = `${hh}:${mm}:${ss}`;
                        timestampEl.textContent = ts;
                        this.lastExecutionTimestampString = ts;
                    }
                }
                if (timeRow) timeRow.style.display = 'flex';
                if (timeGroup) timeGroup.style.display = '';
                if (failureInfo) failureInfo.style.display = 'none';
                this.executionStartTimestamp = null;
                this.lastExecutionStatus = 'error';
                break;
            case 'stopped':
                iconElement.textContent = 'stop';
                iconElement.style.color = '#ff9800';
                if (this._elapsedTimer) clearInterval(this._elapsedTimer);
                {
                    const elapsed = this.executionStartTimestamp ? (Date.now() - this.executionStartTimestamp) : 0;
                    this.lastExecutionElapsedMs = elapsed;
                    if (timeText) {
                        const seconds = (elapsed / 1000).toFixed(3);
                        timeText.textContent = `${elapsed}ms (${seconds}s)`;
                    }
                    if (timestampEl) {
                        const now = new Date();
                        const hh = String(now.getHours()).padStart(2, '0');
                        const mm = String(now.getMinutes()).padStart(2, '0');
                        const ss = String(now.getSeconds()).padStart(2, '0');
                        const ts = `${hh}:${mm}:${ss}`;
                        timestampEl.textContent = ts;
                        this.lastExecutionTimestampString = ts;
                    }
                }
                if (timeRow) timeRow.style.display = 'flex';
                if (timeGroup) timeGroup.style.display = '';
                if (failureInfo) failureInfo.style.display = 'none';
                this.executionStartTimestamp = null;
                this.lastExecutionStatus = 'stopped';
                break;
            case 'failed':
                iconElement.textContent = 'error';
                iconElement.style.color = '#f44336';
                if (this._elapsedTimer) clearInterval(this._elapsedTimer);
                {
                    const elapsed = this.executionStartTimestamp ? (Date.now() - this.executionStartTimestamp) : 0;
                    this.lastExecutionElapsedMs = elapsed;
                    if (timeText) {
                        const seconds = (elapsed / 1000).toFixed(3);
                        timeText.textContent = `${elapsed}ms (${seconds}s)`;
                    }
                    if (timestampEl) {
                        const now = new Date();
                        const hh = String(now.getHours()).padStart(2, '0');
                        const mm = String(now.getMinutes()).padStart(2, '0');
                        const ss = String(now.getSeconds()).padStart(2, '0');
                        const ts = `${hh}:${mm}:${ss}`;
                        timestampEl.textContent = ts;
                        this.lastExecutionTimestampString = ts;
                    }
                }
                if (timeRow) timeRow.style.display = 'flex';
                if (timeGroup) timeGroup.style.display = '';
                this.executionStartTimestamp = null;
                this.lastExecutionStatus = 'failed';
                break;
            default:
                iconElement.textContent = 'info';
                iconElement.style.color = 'var(--on-surface)';
                if (this._elapsedTimer) clearInterval(this._elapsedTimer);
                // keep last visible time; do not hide the row here
                // default resets failure info visibility
                if (failureInfo) failureInfo.style.display = 'none';
                this.lastExecutionStatus = 'idle';
        }

        // update global progress when status updates
        if (progressText) {
            const order = this.calculateNodeOrder ? this.calculateNodeOrder() : [];
            const total = order.length;
            const executed = this.nodeExecutionResults ? this.nodeExecutionResults.size : 0;
            progressText.textContent = `${executed} of ${total}`;
        }
    }

    // smooth center on a node by id
    centerOnNode(nodeId) {
        const node = this.state.getNode(nodeId);
        if (!node) return;
        const padding = 0;
        const scale = this.state.transform.k || 1;
        const targetX = this.state.canvasWidth / 2 - (node.x + (node.width || 120) / 2 + padding) * scale;
        const targetY = this.state.canvasHeight / 2 - (node.y + 40 /* approx node height mid */) * scale;
        this.svg.transition()
            .duration(600)
            .ease(d3.easeCubicOut)
            .call(this.zoom.transform, d3.zoomIdentity.translate(targetX, targetY).scale(scale));
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
            const consoleContent = document.getElementById('console_content');
            if (consoleContent) {
                consoleContent.textContent = this.globalExecutionLog;
                
                // scroll to bottom
                const consoleLog = document.getElementById('console_output_log');
                if (consoleLog) {
                    consoleLog.scrollTop = consoleLog.scrollHeight;
                }
            }
        }
    }
    
    showGlobalExecutionLog() {
        // show the complete execution log in console output
        const consoleContent = document.getElementById('console_content');
        if (consoleContent) {
            consoleContent.textContent = this.globalExecutionLog || 'no execution output yet';
            
            // scroll to bottom
            const consoleLog = document.getElementById('console_output_log');
            if (consoleLog) {
                consoleLog.scrollTop = consoleLog.scrollHeight;
            }
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
        const consoleContent = document.getElementById('console_content');
        
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