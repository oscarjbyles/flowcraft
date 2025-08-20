// FlowchartBuilder UI Module
// Contains all UI-related methods for the FlowchartBuilder class

(function() {
    'use strict';

    // Extend the FlowchartBuilder prototype with UI methods
    const UIModule = {

        // Status bar operations
        updateStatus(type, message, options = {}) {
            const { suppressModeNotifications = true, autoClear = true, clearDelay = 3000 } = options;

            // suppress mode/view toggle notifications if enabled
            if (suppressModeNotifications) {
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
                    's: 1 run mode - interface locked for execution',
                    'settings'
                ];
                if (suppressPhrases.some(p => lower.includes(p))) {
                    return;
                }
            }

            // update status bar text
            if (this.statusText) {
                this.statusText.textContent = message || '';
            }

            // update status bar background color based on type
            if (this.statusBar) {
                const originalBg = this._statusOriginalBg || this.statusBar.style.backgroundColor;
                this._statusOriginalBg = originalBg;

                let bgColor = 'var(--surface-color)';
                if (type === 'error' || type === 'failed') {
                    bgColor = '#2A0E0E';
                } else if (type === 'success') {
                    bgColor = '#0E2A0E';
                } else if (type === 'warning') {
                    bgColor = '#2A2A0E';
                }

                this.statusBar.style.backgroundColor = bgColor;

                // auto-clear after delay if enabled
                if (autoClear && clearDelay > 0) {
                    if (this._statusResetTimeout) {
                        clearTimeout(this._statusResetTimeout);
                    }
                    this._statusResetTimeout = setTimeout(() => {
                        this.statusBar.style.backgroundColor = this._statusOriginalBg || 'var(--surface-color)';
                        if (this.statusText) this.statusText.textContent = '';
                        this._statusResetTimeout = null;
                    }, clearDelay);
                }
            }
        },

        updateStatusBar(message) {
            // legacy method - determine type from message content
            const lower = String(message || '').toLowerCase();
            let type = 'info';
            if (lower.startsWith('error') || lower.includes('failed')) {
                type = 'error';
            } else if (lower.includes('success') || lower.includes('completed')) {
                type = 'success';
            } else if (lower.includes('warning')) {
                type = 'warning';
            }

            this.updateStatus(type, message);
        },

        // Progress bar operations
        showStatusProgress(percent = 10) {
            if (!this.statusProgress || !this.statusProgressBar) return;
            this.statusProgress.style.display = 'block';
            this.setStatusProgress(percent);
        },

        setStatusProgress(percent) {
            if (!this.statusProgressBar) return;
            const clamped = Math.max(0, Math.min(100, percent));
            this.statusProgressBar.style.width = clamped + '%';
        },

        hideStatusProgress() {
            if (!this.statusProgress || !this.statusProgressBar) return;
            this.statusProgressBar.style.width = '0%';
            this.statusProgress.style.display = 'none';
        },

        // Stats and coordinates
        updateStats() {
            const stats = this.state.getStats();
            if (this.nodeCount) {
                // use interpunct with extra spacing around it
                this.nodeCount.textContent = `nodes: ${stats.nodeCount}  ·  groups: ${stats.groupCount}`;
            }
        },

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
        },

        hideCoordinateInputs() {
            this.nodeXInput.style.display = 'none';
            this.nodeYInput.style.display = 'none';
            this.nodeWidthInput.style.display = 'none';
            this.nodeHeightInput.style.display = 'none';
        },

        async handleCoordinateChange(property, value) {
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
            await this.state.updateNode(nodeId, updates);

            // trigger immediate save
            this.state.scheduleAutosave();
        },

        calculateNodeHeight(node) {
            return Geometry.getNodeHeight(node);
        },

        // Button setup methods
        setupToolbarButtons() {
            // safe attach helper
            const attachClick = (elementId, handler) => {
                const el = document.getElementById(elementId);
                if (el) {
                    el.addEventListener('click', handler);
                } else {
                    console.warn(`[ui] element not found: #${elementId}`);
                }
            };

            // floating toolbar buttons
            attachClick('flow_toggle_btn', () => this.toggleFlowView());
            attachClick('error_toggle_btn', () => this.toggleErrorView());
            attachClick('group_select_btn', () => this.toggleGroupSelectMode());
            attachClick('deselect_btn', () => this.deselectAll());
            attachClick('reset_view_btn', () => {
                if (this.state && this.svg && this.zoom) {
                    this.resetViewToFirstNode();
                }
            });

            // track toggle button
            const trackBtn = document.getElementById('track_toggle_btn');
            if (trackBtn) {
                const updateTrackBtnUI = () => {
                    trackBtn.classList.toggle('active', this.isAutoTrackEnabled && !this.userDisabledTracking);
                };

                trackBtn.addEventListener('click', () => {
                    const willEnable = !(this.isAutoTrackEnabled && !this.userDisabledTracking);
                    this.isAutoTrackEnabled = willEnable;
                    this.userDisabledTracking = !willEnable;
                    updateTrackBtnUI();
                    this.updateStatusBar(willEnable ? 'auto tracking enabled' : 'auto tracking disabled');

                    if (willEnable && this.isExecuting && this.currentExecutingNodeId) {
                        this.centerOnNode(this.currentExecutingNodeId);
                    }
                });

                this._refreshTrackBtnUI = updateTrackBtnUI;
            }
        },

        setupBuildButtons() {
            const attachClick = (elementId, handler) => {
                const el = document.getElementById(elementId);
                if (el) el.addEventListener('click', handler);
            };

            // add node buttons
            attachClick('python_node_btn', () => this.addPythonNode());
            attachClick('if_condition_btn', () => this.addIfNode());
            attachClick('ai_btn', () => this.addCallAiNode && this.addCallAiNode());

            // build toolbar toggle
            const buildToolbar = document.getElementById('build_toolbar');
            if (buildToolbar) {
                const collapse = () => buildToolbar.classList.remove('is_expanded');
                const expand = () => buildToolbar.classList.add('is_expanded');

                collapse(); // default collapsed

                buildToolbar.addEventListener('click', (e) => {
                    const toggle = e.target.closest('[data-action="toggle-build-toolbar"], #build_toolbar_toggle');
                    if (!toggle) return;

                    const isOpen = buildToolbar.classList.contains('is_expanded');
                    isOpen ? collapse() : expand();
                });

                // direct toggle fallback
                const directToggle = document.getElementById('build_toolbar_toggle');
                if (directToggle && !directToggle._wired) {
                    directToggle.addEventListener('click', (e) => {
                        e.stopPropagation();
                        const isOpen = buildToolbar.classList.contains('is_expanded');
                        isOpen ? collapse() : expand();
                    });
                    directToggle._wired = true;
                }

                // collapse on action clicks
                ['python_node_btn', 'if_condition_btn'].forEach(id => {
                    const btn = document.getElementById(id);
                    if (btn) btn.addEventListener('click', collapse);
                });

                this._collapseBuildToolbar = collapse;
            }
        },

        setupAnnotationButtons() {
            const attachClick = (elementId, handler) => {
                const el = document.getElementById(elementId);
                if (el) el.addEventListener('click', handler);
            };

            attachClick('add_text_btn', () => this.addTextAnnotation());
            attachClick('add_arrow_btn', () => this.addArrowAnnotation());
        },

        setupExecutionButtons() {
            // start/stop button
            const startBtn = document.getElementById('execute_start_btn');
            console.log('[debug] setupExecutionButtons - startBtn found:', !!startBtn);
            if (startBtn) {
                // remove any existing listeners to prevent duplicates
                const newStartBtn = startBtn.cloneNode(true);
                startBtn.parentNode.replaceChild(newStartBtn, startBtn);
                
                console.log('[debug] adding click listener to start button');
                newStartBtn.addEventListener('click', () => {
                    console.log('[debug] start button clicked!');
                    if (this.isExecuting) {
                        console.log('[debug] stopping execution');
                        this.stopExecution();
                    } else if (!this.executionStarting) {
                        console.log('[debug] starting execution');
                        this.executionStarting = true;
                        this.clearExecutionFeed();
                        this.startExecution();
                    }
                });
            } else {
                console.error('[debug] execute_start_btn not found in DOM');
            }

            // clear button
            const clearBtn = document.getElementById('execute_clear_btn');
            console.log('[debug] setupExecutionButtons - clearBtn found:', !!clearBtn);
            if (clearBtn) {
                clearBtn.addEventListener('click', () => this.clearRunModeState());
            } else {
                console.error('[debug] execute_clear_btn not found in DOM');
            }
        },

        setupRunFeedButtons() {
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

            // setup feed control buttons
            if (runFeedUpBtn && runFeedBar) {
                runFeedUpBtn.addEventListener('click', () => {
                    runFeedBar.classList.remove('hidden');
                    runFeedBar.classList.add('full_screen');
                    runFeedBar.style.height = '';
                    updateRunFeedButtons();
                });
            }

            if (runFeedResetBtn && runFeedBar) {
                runFeedResetBtn.addEventListener('click', () => {
                    runFeedBar.classList.remove('hidden', 'full_screen');
                    runFeedBar.style.height = '';
                    updateRunFeedButtons();
                });
            }

            if (runFeedDownBtn && runFeedBar) {
                runFeedDownBtn.addEventListener('click', () => {
                    runFeedBar.classList.remove('full_screen');
                    runFeedBar.classList.add('hidden');
                    runFeedBar.style.height = '';
                    updateRunFeedButtons();
                });
            }

            // initialize button states
            updateRunFeedButtons();

            // setup placeholder
            const list = document.getElementById('run_feed_list');
            if (list && list.children.length === 0) {
                const placeholder = document.createElement('div');
                placeholder.id = 'run_feed_placeholder';
                placeholder.className = 'run_feed_placeholder';
                placeholder.textContent = 'waiting for execution';
                list.appendChild(placeholder);
            }

            // setup resizer
            if (runFeedResizer && runFeedBar) {
                let isDraggingFeed = false;
                let startY = 0;
                let startHeight = 0;
                const minHeight = 120;
                const getMaxHeight = () => window.innerHeight - 80;

                const onMouseMove = (e) => {
                    if (!isDraggingFeed) return;
                    const deltaY = startY - e.clientY;
                    const maxHeight = getMaxHeight();
                    const newHeight = Math.min(Math.max(startHeight + deltaY, minHeight), maxHeight);
                    runFeedBar.classList.remove('full_screen', 'hidden');
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
                    updateRunFeedButtons();
                };

                runFeedResizer.addEventListener('mousedown', (e) => {
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
        },

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
        },

        // Modal operations
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
        },

        // Context menu operations
        showContextMenu(x, y, item) {
            this.contextMenu.style.display = 'block';
            this.contextMenu.style.left = x + 'px';
            this.contextMenu.style.top = y + 'px';
        },

        hideContextMenu() {
            this.contextMenu.style.display = 'none';
        },

        // Mode UI updates
        updateModeUI(mode, previousMode) {
            const buildBtn = document.getElementById('build_btn');
            const scriptsBtn = document.getElementById('scripts_btn');
            const runBtn = document.getElementById('run_btn');

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

            const trackBtn = document.getElementById('track_toggle_btn');

            // reset all button states
            buildBtn.classList.remove('run_mode_active');
            if (scriptsBtn) scriptsBtn.classList.remove('run_mode_active');
            runBtn.classList.remove('run_mode_active');

            if (canvasContainer) canvasContainer.style.display = 'block';
            // do not force-show sidebar on generic reset; let per-mode branches control visibility to prevent flash
            if (propertiesSidebar) propertiesSidebar.style.display = propertiesSidebar.style.display;
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
                // ensure build toolbar starts collapsed in build mode
                this._collapseBuildToolbar();

                // enable add node section in build mode
                if (addNodeSection) {
                    addNodeSection.classList.remove('disabled');
                }

                // hide start button and toggle bar
                startButtonContainer.style.display = 'none';
                if (sidebarToggleContainer) sidebarToggleContainer.style.display = 'none';
                // hide live feed bar
                const runFeedBar = document.getElementById('run_feed_bar');
                if (runFeedBar) {
                    this.setRunFeedBarDisplay('none');
                    // clear run mode attribute when leaving run mode
                    runFeedBar.removeAttribute('data-run-mode');
                }

                // restore normal properties sidebar width
                mainContent.classList.remove('run_mode');
                propertiesSidebar.classList.remove('run_mode');
                // show sidebar in build mode
                if (propertiesSidebar) propertiesSidebar.style.display = 'flex';

                // switch back to default panel
                this.hideExecutionPanel();

                // reset node colors when leaving run mode
                if (previousMode === 'run' || previousMode === 'history') {
                    // centralised clear to wipe all runtime colour state
                    this.clearAllNodeColorState();
                    // hide all play buttons when leaving run mode
                    this.nodeRenderer.hideAllPlayButtons();
                    // clear runtime condition indicators when exiting run
                    this.clearIfRuntimeIndicators();
                }

                // suppressed: build mode notification

            } else if (mode === 'run') {
                console.log('[debug] entering run mode');
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
                console.log('[debug] showing start button container');
                startButtonContainer.style.display = 'flex';
                if (sidebarToggleContainer) sidebarToggleContainer.style.display = 'flex';
                
                // debug: check if button is actually visible and clickable
                setTimeout(() => {
                    const startBtn = document.getElementById('execute_start_btn');
                    if (startBtn) {
                        const rect = startBtn.getBoundingClientRect();
                        const container = document.getElementById('start_button_container');
                        const containerRect = container ? container.getBoundingClientRect() : null;
                        console.log('[debug] start button visibility check:', {
                            display: startBtn.style.display,
                            visibility: startBtn.style.visibility,
                            opacity: startBtn.style.opacity,
                            rect: rect,
                            isVisible: rect.width > 0 && rect.height > 0,
                            pointerEvents: startBtn.style.pointerEvents,
                            containerRect: containerRect,
                            containerDisplay: container ? container.style.display : 'N/A',
                            containerClasses: container ? container.className : 'N/A',
                            windowWidth: window.innerWidth,
                            windowHeight: window.innerHeight,
                            isInViewport: rect.left >= 0 && rect.top >= 0 && rect.right <= window.innerWidth && rect.bottom <= window.innerHeight
                        });
                    }
                }, 100);
                // ensure sidebar toggle button is wired when it becomes visible
                this.setupSidebarToggle();
                // ensure toggle button ui matches collapsed sidebar state on entry (default closed)
                if (toggleSidebarBtn) {
                    toggleSidebarBtn.title = 'show properties';
                    toggleSidebarBtn.innerHTML = '<span class="material-icons">chevron_left</span>';
                }
                // show live feed bar
                const runFeedBar = document.getElementById('run_feed_bar');
                if (runFeedBar) {
                    this.setRunFeedBarDisplay('flex');
                    // fix the width issue by setting explicit width
                    const leftSidebarWidth = 320;
                    const width = window.innerWidth - leftSidebarWidth;
                    runFeedBar.style.width = `${width}px`;
                    runFeedBar.style.left = `${leftSidebarWidth}px`;
                    runFeedBar.style.right = 'auto';
                    // ensure run feed bar stays visible in run mode regardless of sidebar state
                    runFeedBar.setAttribute('data-run-mode', 'true');
                }

                // expand properties sidebar to run view width (but start collapsed)
                mainContent.classList.add('run_mode');
                propertiesSidebar.classList.add('run_mode');
                // start with sidebar collapsed in run mode
                propertiesSidebar.classList.add('collapsed');
                mainContent.classList.add('sidebar_collapsed');
                if (runFeedBar) runFeedBar.classList.add('sidebar_collapsed');
                if (startButtonContainer) startButtonContainer.classList.add('sidebar_collapsed');
                if (sidebarToggleContainer) sidebarToggleContainer.classList.add('sidebar_collapsed');
                // keep sidebar hidden while collapsed to avoid flash
                if (propertiesSidebar) propertiesSidebar.style.display = 'none';

                // switch to execution panel
                this.showExecutionPanel();

                // update play button visibility for current selection
                this.nodeRenderer.updatePlayButtonVisibility();

                // suppressed: run mode interface locked message

                // check if a specific executionId is requested (from data matrix view button)
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

            } else if (mode === 'run') {
                // run mode handling is already done above
            }

            // ensure multiselect button is visible again only in build mode
            if (mode === 'build') {
                const groupSelectBtn = document.getElementById('group_select_btn');
                if (groupSelectBtn) {
                    groupSelectBtn.style.display = '';
                }
            }
        },

        // Helper function to safely set run feed bar display state
        setRunFeedBarDisplay(display) {
            const runFeedBar = document.getElementById('run_feed_bar');
            if (runFeedBar) {
                // if in run mode, only allow flex display
                if (runFeedBar.getAttribute('data-run-mode') === 'true' && display === 'none') {
                    return;
                }
                runFeedBar.style.display = display;
            }
        },

        // Mode switching methods
        switchToBuildMode() {
            this.state.setMode('build');
        },

        switchToRunMode(clearRuntimeIndicators = true) {
            this.state.setMode('run');
            // enable auto tracking by default when entering run mode
            this.isAutoTrackEnabled = true;
            this.userDisabledTracking = false;
            this._refreshTrackBtnUI();
            // ensure any stale runtime indicators are cleared when entering run (unless restoring from history)
            if (clearRuntimeIndicators) {
                this.clearIfRuntimeIndicators();
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
        },

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
                const s = String(this.lastExecutionStatus || 'idle');
                if (['completed', 'stopped', 'failed', 'error'].includes(s)) {
                    this.updateExecutionStatus(s, '');
                }
            } else {
                this.sidebar.showDefaultPanel();
            }

            this.updateStatusBar('all selections cleared');
        },

        // Execution panel management
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
        },

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

    };

    // Apply the UI methods to FlowchartBuilder prototype
    Object.assign(FlowchartBuilder.prototype, UIModule);

})();
