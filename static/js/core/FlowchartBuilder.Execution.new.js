// flowchartbuilder execution module - delegates to execution engine
(function() {
    'use strict';

    const ExecutionModule = {
        
        initializeExecution() {
            // create execution engine and orchestrator
            this.executionEngine = new ExecutionEngine(this.state);
            this.executionOrchestrator = new ExecutionOrchestrator(this.state, this.executionEngine);
            
            // setup listeners
            this.setupExecutionListeners();
            
            // expose methods
            this.isExecuting = false;
            this.executionAborted = false;
            this.executionStarting = false;
        },
        
        setupExecutionListeners() {
            // ui updates
            this.executionOrchestrator.on('executionStarted', (data) => {
                this.isExecuting = true;
                this.executionStarting = false;
                this.updateExecutionUI(true);
                this.updateExecutionStatus('running', `executing ${data.nodeCount} nodes`);
            });
            
            this.executionOrchestrator.on('executionCompleted', (message) => {
                this.isExecuting = false;
                this.updateExecutionUI(false);
                this.updateExecutionStatus('completed', message);
            });
            
            this.executionOrchestrator.on('executionFailed', (data) => {
                this.isExecuting = false;
                this.updateExecutionUI(false);
                this.updateExecutionStatus('failed', data.message);
                this.lastFailedNode = data.node;
                this.state.emit('selectionChanged', { nodes: [], link: null, group: null });
            });
            
            this.executionOrchestrator.on('executionStopped', (message) => {
                this.isExecuting = false;
                this.updateExecutionUI(false);
                this.updateExecutionStatus('stopped', message);
            });
            
            this.executionOrchestrator.on('executionError', (message) => {
                this.isExecuting = false;
                this.updateExecutionUI(false);
                this.updateExecutionStatus('error', message);
            });
            
            // node updates
            this.executionOrchestrator.on('nodeStateUpdated', (data) => {
                this.updateNodeExecutionState(data.node, data.state);
            });
            
            this.executionOrchestrator.on('nodeExecutionStarted', (data) => {
                this.addToRunFeed({
                    node: data.node,
                    status: 'running',
                    timestamp: data.timestamp
                });
            });
            
            this.executionOrchestrator.on('nodeExecutionCompleted', (data) => {
                this.updateNodeOutput(data.node, data.result);
                this.addToRunFeed({
                    node: data.node,
                    status: 'success',
                    timestamp: new Date().toISOString(),
                    executionTime: data.executionTime
                });
            });
            
            this.executionOrchestrator.on('nodeExecutionFailed', (data) => {
                this.addToRunFeed({
                    node: data.node,
                    status: 'error',
                    error: data.error,
                    timestamp: new Date().toISOString()
                });
            });
            
            // progress updates
            this.executionOrchestrator.on('executionProgress', (data) => {
                this.updateExecutionStatus('running', `executing ${data.current} of ${data.total}`);
            });
            
            // tracking
            this.executionOrchestrator.on('trackNode', (node) => {
                this.panToNode(node);
            });
            
            // feed updates
            this.executionOrchestrator.on('executionFeedUpdated', (entry) => {
                this.updateExecutionFeedUI(entry);
            });
        },
        
        // main execution methods
        async startExecution() {
            if (this.executionStarting || this.isExecuting) return;
            
            this.executionStarting = true;
            this.deselectAll();
            
            const success = await this.executionOrchestrator.startExecution();
            
            if (!success) {
                this.executionStarting = false;
            }
            
            return success;
        },
        
        async stopExecution() {
            await this.executionOrchestrator.stopExecution();
        },
        
        // ui update methods
        updateExecutionUI(isExecuting) {
            const button = document.getElementById('execute_start_btn');
            const loadingWheel = document.getElementById('execution_loading_wheel');
            
            if (!button) return;
            
            const icon = button.querySelector('.material-icons');
            const text = button.childNodes[button.childNodes.length - 1];
            
            if (isExecuting) {
                button.classList.remove('btn_primary');
                button.classList.add('btn_stop');
                icon.textContent = 'stop';
                text.textContent = ' Stop';
                if (loadingWheel) loadingWheel.style.display = 'block';
            } else {
                button.classList.remove('btn_stop');
                button.classList.add('btn_primary');
                icon.textContent = 'play_arrow';
                text.textContent = ' Start';
                if (loadingWheel) loadingWheel.style.display = 'none';
            }
        },
        
        updateExecutionStatus(type, message) {
            this.updateStatus(type, message);
            
            // update sidebar if in run mode
            if (this.state.currentMode === 'run') {
                this.state.emit('executionStatusUpdated', { type, message });
            }
        },
        
        updateNodeExecutionState(node, state) {
            // update visual state
            const nodeElement = d3.select(`#node_${node.id}`);
            if (!nodeElement.empty()) {
                // remove all state classes
                nodeElement.classed('running', false);
                nodeElement.classed('success', false);
                nodeElement.classed('error', false);
                nodeElement.classed('idle', false);
                
                // add new state class
                if (state !== 'idle') {
                    nodeElement.classed(state, true);
                }
            }
            
            // emit for other components
            this.state.emit('nodeExecutionStateChanged', { node, state });
        },
        
        updateNodeOutput(node, result) {
            // store results for display
            this.nodeExecutionResults = this.nodeExecutionResults || new Map();
            this.nodeVariables = this.nodeVariables || new Map();
            
            this.nodeExecutionResults.set(node.id, result);
            if (result.variables) {
                this.nodeVariables.set(node.id, result.variables);
            }
            
            // update ui if node is selected
            if (this.state.selectedNodes.has(node.id)) {
                this.state.emit('nodeOutputUpdated', { node, result });
            }
        },
        
        addToRunFeed(entry) {
            this.executionFeed = this.executionFeed || [];
            this.executionFeed.push(entry);
            
            // update feed ui
            const feedList = document.getElementById('run_feed_list');
            if (!feedList) return;
            
            // remove placeholder if exists
            const placeholder = document.getElementById('run_feed_placeholder');
            if (placeholder) placeholder.remove();
            
            // create feed item
            const item = document.createElement('div');
            item.className = `run_feed_item run_feed_${entry.status}`;
            
            const icon = document.createElement('span');
            icon.className = 'material-icons run_feed_icon';
            icon.textContent = entry.status === 'running' ? 'play_circle' :
                              entry.status === 'success' ? 'check_circle' :
                              entry.status === 'error' ? 'error' : 'info';
            
            const content = document.createElement('div');
            content.className = 'run_feed_content';
            
            const title = document.createElement('div');
            title.className = 'run_feed_title';
            title.textContent = entry.node.name;
            
            const details = document.createElement('div');
            details.className = 'run_feed_details';
            details.textContent = entry.error || 
                                (entry.executionTime ? `${entry.executionTime}ms` : 
                                 entry.status);
            
            content.appendChild(title);
            content.appendChild(details);
            
            item.appendChild(icon);
            item.appendChild(content);
            
            feedList.appendChild(item);
            feedList.scrollTop = feedList.scrollHeight;
        },
        
        updateExecutionFeedUI(entry) {
            // handled by addToRunFeed for now
        },
        
        clearExecutionFeed() {
            this.executionFeed = [];
            const list = document.getElementById('run_feed_list');
            if (list) {
                list.innerHTML = '';
                const placeholder = document.createElement('div');
                placeholder.id = 'run_feed_placeholder';
                placeholder.className = 'run_feed_placeholder';
                placeholder.textContent = 'waiting for execution';
                list.appendChild(placeholder);
            }
        },
        
        // state methods
        clearRunModeState() {
            this.executionOrchestrator.clearExecutionResults();
            this.clearExecutionFeed();
            this.updateExecutionStatus('info', 'cleared');
            this.clearIfRuntimeIndicators();
            this.executionOrchestrator.clearAllNodeColorState();
            this.state.clearSelection();
            this.state.emit('updateSidebar');
        },
        
        clearIfRuntimeIndicators() {
            const links = this.state.links || [];
            links.forEach(link => {
                const sourceNode = this.state.getNode(link.source);
                const targetNode = this.state.getNode(link.target);
                if (sourceNode && targetNode && sourceNode.type === 'if_node' && targetNode.type === 'python_file') {
                    this.state.updateLink(link.source, link.target, {
                        runtime_condition: null,
                        runtime_details: null
                    });
                }
            });
            
            if (this.linkRenderer) {
                this.linkRenderer.renderIfToPythonNodes();
            }
        },
        
        resetNodeStates() {
            this.executionOrchestrator.resetNodeStates();
        },
        
        clearAllNodeColorState() {
            this.executionOrchestrator.clearAllNodeColorState();
        },
        
        clearOutput() {
            const outputEl = document.getElementById('console_output_log');
            if (outputEl) {
                outputEl.innerHTML = '';
            }
        },
        
        // tracking methods
        setAutoTrack(enabled) {
            this.executionOrchestrator.setAutoTrack(enabled);
            this.isAutoTrackEnabled = enabled;
            
            const btn = document.getElementById('track_toggle_btn');
            if (btn) {
                if (enabled) {
                    btn.classList.add('active');
                    btn.title = 'auto track enabled';
                } else {
                    btn.classList.remove('active');
                    btn.title = 'auto track disabled';
                }
            }
        },
        
        // resume execution
        handleResumeExecution(data) {
            this.executionOrchestrator.handleResumeExecution(data);
        },
        
        // getters
        getExecutionStatus() {
            return this.executionOrchestrator.getExecutionStatus();
        }
    };

    // extend FlowchartBuilder prototype
    if (window.FlowchartBuilder) {
        Object.assign(window.FlowchartBuilder.prototype, ExecutionModule);
    }
})();
