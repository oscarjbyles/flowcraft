// status bar component for flowchart builder
(function(){
    'use strict';
    if (window.StatusBar) { return; }

class StatusBar {
    constructor(app) {
        this.app = app;
        this.state = app.state;
        
        // status bar elements
        this.statusText = null;
        this.nodeCount = null;
        this.nodeCoordinates = null;
        this.statusProgress = null;
        this.statusProgressBar = null;
        this.statusBar = null;
        
        // coordinate input elements
        this.nodeXInput = null;
        this.nodeYInput = null;
        this.nodeWidthInput = null;
        this.nodeHeightInput = null;
        
        // status management
        this._defaultStatusText = null;
        this._statusOriginalBg = null;
        this._statusResetTimeout = null;
        this._defaultStatusTextCaptured = false;
        
        // coordinate update frame for smooth updates
        this.coordinateUpdateFrame = null;
        
        this.initialize();
    }

    initialize() {
        this.setupElements();
        this.setupCoordinateInputs();
        this.setupEventListeners();
        this.updateStats();
        this.updateNodeCoordinates();
    }

    setupElements() {
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
    }

    setupEventListeners() {
        // guard against undefined state or missing on method
        if (!this.state || typeof this.state.on !== 'function') {
            return;
        }
        
        // listen for state changes to update stats
        this.state.on('stateChanged', () => {
            this.updateStats();
        });

        // listen for selection changes to update coordinates
        this.state.on('selectionChanged', () => {
            this.updateNodeCoordinates();
        });

        // listen for node updates to update coordinates
        this.state.on('nodeUpdated', () => {
            this.updateNodeCoordinates();
        });

        // listen for coordinate updates with debouncing
        this.state.on('updateNodePosition', () => {
            if (this.coordinateUpdateFrame) {
                cancelAnimationFrame(this.coordinateUpdateFrame);
            }
            this.coordinateUpdateFrame = requestAnimationFrame(() => {
                this.updateNodeCoordinates();
            });
        });

        // listen for mode changes to update coordinates visibility
        this.state.on('modeChanged', () => {
            this.updateNodeCoordinates();
        });
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

    async handleCoordinateChange(property, value) {
        if (!this.state || !this.state.selectionHandler) return;
        
        const selectedNodes = Array.from(this.state.selectionHandler.selectedNodes || []);
        if (selectedNodes.length !== 1) return;
        
        const nodeId = selectedNodes[0];
        const node = this.state.createNode ? this.state.createNode.getNode(nodeId) : null;
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
        if (this.state.createNode) {
            await this.state.createNode.updateNode(nodeId, updates);
        }
        
        // trigger immediate save
                    if (this.state.saving) this.state.saving.scheduleAutosave();
    }

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
    }

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
    }

    // progress bar functionality
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
        if (!this.state || typeof this.state.getStats !== 'function') {
            if (this.nodeCount) {
                this.nodeCount.textContent = 'nodes: 0  ·  groups: 0';
            }
            return;
        }
        
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
        
        // guard against undefined selectedNodes
        if (!this.state.selectionHandler) {
            this.hideCoordinateInputs();
            this.nodeCoordinates.style.opacity = '0.3';
            this.nodeCoordinates.title = 'no node selected';
            return;
        }
        
        const selectedNodes = Array.from(this.state.selectionHandler.selectedNodes || []);
        
        if (selectedNodes.length === 1) {
            // single node selected - show editable inputs
            const node = this.state.createNode ? this.state.createNode.getNode(selectedNodes[0]) : null;
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
            const nodes = selectedNodes.map(id => this.state.createNode ? this.state.createNode.getNode(id) : null).filter(Boolean);
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

    calculateNodeHeight(node) {
        // delegate to geometry utility if available
        if (window.Geometry && window.Geometry.getNodeHeight) {
            return window.Geometry.getNodeHeight(node);
        }
        
        // fallback calculation
        const baseHeight = 40;
        const lineHeight = 20;
        const maxLines = 3;
        const text = node.name || '';
        const lines = text.split('\n').length;
        return Math.max(baseHeight, Math.min(lines * lineHeight, maxLines * lineHeight));
    }

    // cleanup method
    destroy() {
        // clear any pending timeouts
        if (this._statusResetTimeout) {
            clearTimeout(this._statusResetTimeout);
        }
        
        // clear coordinate update frame
        if (this.coordinateUpdateFrame) {
            cancelAnimationFrame(this.coordinateUpdateFrame);
        }
        
        // remove event listeners
        if (this.nodeXInput) {
            this.nodeXInput.removeEventListener('change', this.handleCoordinateChange);
            this.nodeXInput.removeEventListener('keyup', this.handleCoordinateChange);
        }
        if (this.nodeYInput) {
            this.nodeYInput.removeEventListener('change', this.handleCoordinateChange);
            this.nodeYInput.removeEventListener('keyup', this.handleCoordinateChange);
        }
        if (this.nodeWidthInput) {
            this.nodeWidthInput.removeEventListener('change', this.handleCoordinateChange);
            this.nodeWidthInput.removeEventListener('keyup', this.handleCoordinateChange);
        }
        if (this.nodeHeightInput) {
            this.nodeHeightInput.removeEventListener('change', this.handleCoordinateChange);
            this.nodeHeightInput.removeEventListener('keyup', this.handleCoordinateChange);
        }
    }
}

window.StatusBar = StatusBar;
})();
