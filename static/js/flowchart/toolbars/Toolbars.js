// toolbar management module for build and run modes
(function() {
    'use strict';
    if (window.Toolbars) { return; }

class Toolbars {
    constructor(flowchartBuilder) {
        this.builder = flowchartBuilder;
        this.state = flowchartBuilder.state;
        this.createNode = flowchartBuilder.createNode;
        this.updateStatusBar = (message) => flowchartBuilder.updateStatusBar(message);
        
        // toolbar state
        this._collapseBuildToolbar = null;
        this._refreshTrackBtnUI = null;
        
        // initialize toolbars
        this.initialize();
    }

    initialize() {
        this.setupToolbarButtons();
        this.setupBuildButtons();
        this.setupAnnotationButtons();
        this.setupExecutionButtons();
        this.setupRunFeedButtons();
    }

    setupToolbarButtons() {
        // safe attach helper
        const attachClick = (elementId, handler) => {
            const el = document.getElementById(elementId);
            if (el) {
                el.addEventListener('click', handler);
            } else {
                console.warn(`[toolbars] element not found: #${elementId}`);
            }
        };

        // floating toolbar buttons
        attachClick('flow_toggle_btn', () => this.builder.toggleFlowView());
        attachClick('error_toggle_btn', () => this.builder.toggleErrorView());
        attachClick('group_select_btn', () => this.builder.toggleGroupSelectMode());
        attachClick('deselect_btn', () => this.builder.deselectAll());
        attachClick('reset_view_btn', () => {
            if (this.state && this.builder.svg && this.builder.zoom) {
                this.builder.resetViewToFirstNode();
            }
        });

        // track toggle button
        const trackBtn = document.getElementById('track_toggle_btn');
        if (trackBtn) {
            const updateTrackBtnUI = () => {
                trackBtn.classList.toggle('active', this.builder.isAutoTrackEnabled && !this.builder.userDisabledTracking);
            };
            
            trackBtn.addEventListener('click', () => {
                const willEnable = !(this.builder.isAutoTrackEnabled && !this.builder.userDisabledTracking);
                this.builder.isAutoTrackEnabled = willEnable;
                this.builder.userDisabledTracking = !willEnable;
                updateTrackBtnUI();
                this.updateStatusBar(willEnable ? 'auto tracking enabled' : 'auto tracking disabled');
                
                if (willEnable && this.builder.isExecuting && this.builder.currentExecutingNodeId) {
                    this.builder.viewportTracker.centerOnNode(this.builder.currentExecutingNodeId);
                }
            });
            
            this._refreshTrackBtnUI = updateTrackBtnUI;
        }
    }

    setupBuildButtons() {
        const attachClick = (elementId, handler) => {
            const el = document.getElementById(elementId);
            if (el) el.addEventListener('click', handler);
        };

        // add node buttons
        attachClick('python_node_btn', () => this.createNode.addPythonNode());
        attachClick('if_condition_btn', () => this.createNode.addIfNode());
        attachClick('ai_btn', () => this.createNode.addCallAiNode());

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
    }

    setupAnnotationButtons() {
        const attachClick = (elementId, handler) => {
            const el = document.getElementById(elementId);
            if (el) el.addEventListener('click', handler);
        };

        attachClick('add_text_btn', () => this.createNode.addTextAnnotation());
        attachClick('add_arrow_btn', () => this.createNode.addArrowAnnotation());
    }

    setupExecutionButtons() {
        // start/stop button
        const startBtn = document.getElementById('execute_start_btn');
        if (startBtn) {
            startBtn.addEventListener('click', () => {
                if (this.builder.isExecuting) {
                    this.builder.stopExecution();
                } else if (!this.builder.executionStarting) {
                    this.builder.executionStarting = true;
                    this.builder.clearRunModeState();
                    this.builder.startExecution();
                }
            });
        }

        // clear button
        const clearBtn = document.getElementById('execute_clear_btn');
        if (clearBtn) {
            clearBtn.addEventListener('click', () => this.builder.clearRunModeState());
        }
    }

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
    }

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
            this.builder.hideExecutionPanel();
            
            // reset node colors when leaving run mode
            if (previousMode === 'run' || previousMode === 'history') {
                // centralised clear to wipe all runtime colour state
                this.builder.nodeStateManager.clearAllNodeColorState();
                // hide all play buttons when leaving run mode
                this.builder.nodeRenderer.hideAllPlayButtons();
                // clear runtime condition indicators when exiting run
                this.builder.clearIfRuntimeIndicators();
            }
            
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
            if (this.builder.isGroupSelectMode) {
                this.builder.isGroupSelectMode = false;
                const groupSelectBtn = document.getElementById('group_select_btn');
                groupSelectBtn.classList.remove('active');
                const canvas = document.getElementById('flowchart_canvas');
                canvas.style.cursor = '';
                this.builder.hideSelectionRect();
            }
            
            // show start button and toggle bar
            startButtonContainer.style.display = 'flex';
            if (sidebarToggleContainer) sidebarToggleContainer.style.display = 'flex';
            // ensure sidebar toggle button is wired when it becomes visible
            this.builder.setupSidebarToggle();
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
            this.builder.showExecutionPanel();
            
            // update play button visibility for current selection
            this.builder.nodeRenderer.updatePlayButtonVisibility();

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
                this.builder.executionStatus.viewExecutionHistory(execId);
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

    // helper function to safely set run feed bar display state
    setRunFeedBarDisplay(display) {
        const runFeedBar = document.getElementById('run_feed_bar');
        if (runFeedBar) {
            // if in run mode, only allow flex display
            if (runFeedBar.getAttribute('data-run-mode') === 'true' && display === 'none') {
                return;
            }
            runFeedBar.style.display = display;
        }
    }

    // getter methods for external access
    get collapseBuildToolbar() {
        return this._collapseBuildToolbar;
    }

    get refreshTrackBtnUI() {
        return this._refreshTrackBtnUI;
    }

    // cleanup method
    destroy() {
        // remove event listeners if needed
        // for now, the event listeners will be cleaned up when the page unloads
    }
}

window.Toolbars = Toolbars;
})();
