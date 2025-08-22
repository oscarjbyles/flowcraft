// centralized state management for the flowchart
(function() {
    'use strict';
    // avoid re-defining in case this file is accidentally loaded twice
    if (window.StateManager) { return; }

class StateManager extends (window.EventEmitter || class {
    constructor() { this.events = {}; }
    on(event, callback) {
        if (!this.events[event]) this.events[event] = [];
        this.events[event].push(callback);
    }
    off(event, callback) {
        if (!this.events[event]) return;
        const idx = this.events[event].indexOf(callback);
        if (idx > -1) this.events[event].splice(idx, 1);
    }
    emit(event, ...args) {
        if (!this.events[event]) return;
        this.events[event].forEach(cb => { try { cb(...args); } catch(e) { try { console.error(e); } catch(_) {} } });
    }
    once(event, callback) {
        const onceCb = (...args) => { try { callback(...args); } finally { this.off(event, onceCb); } };
        this.on(event, onceCb);
    }
    removeAllListeners(event) {
        if (event) { delete this.events[event]; } else { this.events = {}; }
    }
}) {
    constructor() {
        super();
        
        // core data
        this.nodes = [];
        this.links = [];
        this.groups = [];
        
        // annotations (text labels, braces, etc.)
        this.annotations = [];
        
        // interaction state
        this.isDragging = false;
        this.draggedNode = null;
        this.currentEditingNode = null;
        this.suppressNextCanvasClick = false;
        
        // application modes
        this.currentMode = 'build'; // 'build' or 'run' or 'settings'
        
        // flow view state (toggle within build mode)
        this.isFlowView = false;
        // error view state (toggle to show red error circles)
        this.isErrorView = false;
        
        // restoration state
        this.isRestoringFromHistory = false; // flag to prevent input node recreation during restoration
        
        // counters
        this.nodeCounter = 0;
        this.groupCounter = 0;
        
        // ui state
        this.transform = d3.zoomIdentity;
        this.canvasWidth = 0;
        this.canvasHeight = 0;
        
        // saving functionality - delegated to Saving class
        this.saving = null;

        // magnetized node pairing (if<->python)
        // we store partner ids directly on nodes; this map is a helper for quick checks
        this.magnetPairs = new Map(); // key: nodeId -> partnerId
        
        // selection handler reference
        this.selectionHandler = null;
        
        // create node handler reference
        this.createNode = null;
        
        // connection handler reference
        this.connectionHandler = null;
        
        // delete node handler reference
        this.deleteNode = null;
    }

    updateGroup(groupId, updates) {
        const group = this.getGroup(groupId);
        if (!group) return false;

        Object.assign(group, updates);
        
        // validate updated group
        const validation = Validation.validateGroup(group, this.nodes);
        if (!validation.isValid) {
            throw new Error(`invalid group update: ${validation.errors.join(', ')}`);
        }

        this.emit('groupUpdated', group);
        this.emit('stateChanged');
        
        return true;
    }

    getGroup(groupId) {
        return this.groups.find(g => g.id === groupId);
    }

    getGroups() {
        return [...this.groups];
    }

    getGroupNodes(groupId) {
        return this.nodes.filter(n => n.groupId === groupId);
    }

    // interaction state
    setDragging(isDragging, draggedNode = null) {
        this.isDragging = isDragging;
        this.draggedNode = draggedNode;
        this.emit('dragStateChanged', { isDragging, draggedNode });
    }

    setMode(mode) {
        const previousMode = this.currentMode;
        this.currentMode = mode;
        this.emit('modeChanged', { mode, previousMode });
    }

    setFlowView(isFlowView) {
        this.isFlowView = isFlowView;
        this.emit('flowViewChanged', { isFlowView });
    }

    setErrorView(isErrorView) {
        this.isErrorView = isErrorView;
        this.emit('errorViewChanged', { isErrorView });
    }

    // convenience getters
    get isRunMode() {
        return this.currentMode === 'run';
    }

    get isBuildMode() {
        return this.currentMode === 'build';
    }

    // canvas state
    setTransform(transform) {
        this.transform = transform;
        this.emit('transformChanged', transform);
    }

    setCanvasSize(width, height) {
        this.canvasWidth = width;
        this.canvasHeight = height;
        this.emit('canvasSizeChanged', { width, height });
    }

    updateAnnotation(annotationId, updates) {
        const ann = this.annotations.find(a => a.id === annotationId);
        if (!ann) return false;
        if (typeof updates.text === 'string') {
            updates.text = Validation.sanitizeString(updates.text, 200);
        }
        // normalize font size if provided
        if (typeof updates.fontSize !== 'undefined') {
            const size = parseInt(updates.fontSize, 10);
            if (!Number.isNaN(size)) {
                updates.fontSize = Math.max(8, Math.min(72, size));
            } else {
                delete updates.fontSize;
            }
        }
        Object.assign(ann, updates);
        this.emit('annotationUpdated', ann);
        this.emit('stateChanged');
        return true;
    }

    updateCounters() {
        // update node counter
        if (this.nodes.length > 0) {
            const maxNodeCounter = Math.max(...this.nodes
                .filter(n => n.name && n.name.startsWith('python_file_'))
                .map(n => {
                    const match = n.name.match(/python_file_(\d+)\.py/);
                    return match ? parseInt(match[1]) : 0;
                })
            );
            this.nodeCounter = maxNodeCounter;
        }

        // update group counter
        if (this.groups.length > 0) {
            const maxGroupCounter = Math.max(...this.groups
                .filter(g => g.name && g.name.startsWith('group_'))
                .map(g => {
                    const match = g.name.match(/group_(\d+)/);
                    return match ? parseInt(match[1]) : 0;
                })
            );
            this.groupCounter = maxGroupCounter;
        }
    }

    // utility methods
    findNodeAtPosition(x, y, excludeId = null) {
        return this.nodes.find(node => {
            if (excludeId && node.id === excludeId) return false;
            return Geometry.isPointInNode(x, y, node);
        });
    }

    getStats() {
        return {
            nodeCount: this.nodes.length,
            linkCount: this.links.length,
            groupCount: this.groups.length,
            selectedNodeCount: this.selectionHandler ? this.selectionHandler.getSelectedNodeCount() : 0
        };
    }

    // Connect selection handler to state changes for validation
    connectSelectionHandler() {
        if (this.selectionHandler && typeof this.selectionHandler.onStateChanged === 'function') {
            this.on('stateChanged', () => {
                this.selectionHandler.onStateChanged();
            });
        }
    }

}

window.StateManager = StateManager;
})();