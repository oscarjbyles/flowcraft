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
        
        // selection state - now handled by SelectionHandler
        // this.selectedNodes = new Set();
        // this.selectedLink = null;
        // this.selectedGroup = null;
        // this.selectedAnnotation = null;
        
        // interaction state
        this.isDragging = false;
        this.isConnecting = false;
        this.draggedNode = null;
        this.sourceNode = null;
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
    }

    /**
     * return a plain object representing current flowchart state for persistence
     */
    getSerializableData() {
        return this.saving ? this.saving.getSerializableData() : {
            nodes: this.nodes || [],
            links: this.links || [],
            groups: this.groups || [],
            annotations: this.annotations || []
        };
    }

    /**
     * flush any pending autosave immediately and try to persist using exit-safe transport
     */
    flushPendingSavesOnExit() {
        if (this.saving) {
            this.saving.flushPendingSavesOnExit();
        }
    }



    async updateNode(nodeId, updates) {
        const node = this.getNode(nodeId);
        if (!node) return false;

        // store previous pythonFile for comparison
        const previousPythonFile = node.pythonFile;

        // update width if name changed
        if (updates.name && updates.name !== node.name) {
            updates.width = Geometry.getNodeWidth(updates.name);
        }

        // normalize pythonFile in updates to remove any leading 'nodes/' prefixes
        if (typeof updates.pythonFile === 'string') {
            const s = updates.pythonFile.replace(/\\/g, '/');
            const noPrefix = s.replace(/^(?:nodes\/)*/i, '');
            updates.pythonFile = noPrefix;
        }
        
        Object.assign(node, updates);
        
        // validate updated node
        const validation = Validation.validateNode(node);
        if (!validation.isValid) {
            throw new Error(`invalid node update: ${validation.errors.join(', ')}`);
        }

        // when a python node's python file changes, ensure only one fresh input node exists
        if (node.type === 'python_file' && typeof updates.pythonFile !== 'undefined' && updates.pythonFile !== previousPythonFile) {
            // preserve existing input node values if possible
            const existingInputs = this.nodes.filter(n => n.type === 'input_node' && n.targetNodeId === node.id);
            const existingInputValues = existingInputs.length > 0 ? existingInputs[0].inputValues : {};
            
            // remove existing associated input nodes
            existingInputs.forEach(inputNode => this.removeNode(inputNode.id, true));

            // create a new input node only if the new python file is non-empty
            if (updates.pythonFile && updates.pythonFile.trim() !== '') {
                // create the new input node
                const newInputNode = await this.createNode.checkAndCreateInputNode(node);
                
                // if a new input node was created and we had existing values, try to restore them
                if (newInputNode && Object.keys(existingInputValues).length > 0) {
                    // analyze the new python file to get parameters
                    try {
                        const response = await fetch('/api/analyze-python-function', {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json'
                            },
                            body: JSON.stringify({
                                python_file: updates.pythonFile
                            })
                        });
                        
                        const result = await response.json();
                        
                        if (result.success && result.parameters) {
                            // restore values for parameters that still exist
                            const updatedInputValues = {};
                            result.parameters.forEach(param => {
                                updatedInputValues[param] = existingInputValues[param] || '';
                            });
                            
                            // update the new input node with preserved values
                            this.updateNode(newInputNode.id, {
                                inputValues: updatedInputValues
                            });
                        }
                    } catch (error) {
                        console.error('error preserving input values during file change:', error);
                    }
                }
            }
        }

        this.emit('nodeUpdated', node);
        this.emit('stateChanged');
        if (this.saving) this.saving.scheduleAutosave();
        
        return true;
    }

    // magnet helpers
    setMagnetPair(nodeAId, nodeBId) {
        // ensure both nodes exist
        const a = this.getNode(nodeAId);
        const b = this.getNode(nodeBId);
        if (!a || !b) return false;
        // set partner ids on nodes
        a.magnet_partner_id = b.id;
        b.magnet_partner_id = a.id;
        // update helper map
        this.magnetPairs.set(a.id, b.id);
        this.magnetPairs.set(b.id, a.id);
        // emit update for rendering
        this.emit('nodeUpdated', a);
        this.emit('nodeUpdated', b);
        this.emit('stateChanged');
        return true;
    }

    clearMagnetForNode(nodeId) {
        const node = this.getNode(nodeId);
        if (!node) return false;
        const partnerId = node.magnet_partner_id;
        if (partnerId) {
            const partner = this.getNode(partnerId);
            if (partner) {
                delete partner.magnet_partner_id;
                this.magnetPairs.delete(partner.id);
                this.emit('nodeUpdated', partner);
            }
            delete node.magnet_partner_id;
            this.magnetPairs.delete(node.id);
            this.emit('nodeUpdated', node);
            this.emit('stateChanged');
            return true;
        }
        return false;
    }

    getMagnetPartner(nodeId) {
        // try map first
        let partnerId = this.magnetPairs.get(nodeId);
        if (!partnerId) {
            // fallback to persisted property for hydration after reload
            const n = this.getNode(nodeId);
            if (n && n.magnet_partner_id) {
                partnerId = n.magnet_partner_id;
                // lazily hydrate the map for both directions
                this.magnetPairs.set(nodeId, partnerId);
                this.magnetPairs.set(partnerId, nodeId);
            }
        }
        if (!partnerId) return null;
        return this.getNode(partnerId) || null;
    }

    // rebuild magnet pairs from nodes (used after load/import)
    rebuildMagnetPairsFromNodes() {
        this.magnetPairs.clear();
        this.nodes.forEach(n => {
            const pid = n.magnet_partner_id;
            if (!pid) return;
            const partner = this.getNode(pid);
            if (!partner) return;
            this.magnetPairs.set(n.id, pid);
            this.magnetPairs.set(pid, n.id);
            if (partner.magnet_partner_id !== n.id) {
                partner.magnet_partner_id = n.id;
            }
        });
    }

    // association helpers
    getAssociatedPythonForIf(ifNodeId) {
        const ifNode = this.getNode(ifNodeId);
        if (!ifNode || ifNode.type !== 'if_node') return null;
        // find a linked python_file node (either direction)
        for (const link of this.links) {
            if (link.source === ifNodeId) {
                const n = this.getNode(link.target);
                if (n && n.type === 'python_file') return n;
            } else if (link.target === ifNodeId) {
                const n = this.getNode(link.source);
                if (n && n.type === 'python_file') return n;
            }
        }
        return null;
    }

    getAssociatedIfForPython(pythonNodeId) {
        const pyNode = this.getNode(pythonNodeId);
        if (!pyNode || pyNode.type !== 'python_file') return null;
        for (const link of this.links) {
            if (link.source === pythonNodeId) {
                const n = this.getNode(link.target);
                if (n && n.type === 'if_node') return n;
            } else if (link.target === pythonNodeId) {
                const n = this.getNode(link.source);
                if (n && n.type === 'if_node') return n;
            }
        }
        return null;
    }

    hasUpstreamIfSplitter(pythonNodeId) {
        const pyNode = this.getNode(pythonNodeId);
        if (!pyNode || pyNode.type !== 'python_file') return false;
        
        // check if there's an if splitter upstream in the flow
        const visited = new Set();
        const queue = [pythonNodeId];
        
        while (queue.length > 0) {
            const currentNodeId = queue.shift();
            if (visited.has(currentNodeId)) continue;
            visited.add(currentNodeId);
            
            // check incoming links to this node
            for (const link of this.links) {
                if (link.target === currentNodeId) {
                    const sourceNode = this.getNode(link.source);
                    if (sourceNode && sourceNode.type === 'if_node') {
                        return true; // found upstream if splitter
                    }
                    // continue traversing upstream
                    queue.push(link.source);
                }
            }
        }
        
        return false;
    }

    hasDownstreamIfSplitter(pythonNodeId) {
        const pyNode = this.getNode(pythonNodeId);
        if (!pyNode || pyNode.type !== 'python_file') return false;
        
        // check if there's an if splitter downstream in the flow
        const visited = new Set();
        const queue = [pythonNodeId];
        
        while (queue.length > 0) {
            const currentNodeId = queue.shift();
            if (visited.has(currentNodeId)) continue;
            visited.add(currentNodeId);
            
            // check outgoing links from this node
            for (const link of this.links) {
                if (link.source === currentNodeId) {
                    const targetNode = this.getNode(link.target);
                    if (targetNode && targetNode.type === 'if_node') {
                        return true; // found downstream if splitter
                    }
                    // continue traversing downstream
                    queue.push(link.target);
                }
            }
        }
        
        return false;
    }

    removeNode(nodeId, force = false) {
        const nodeIndex = this.nodes.findIndex(n => n.id === nodeId);
        if (nodeIndex === -1) return false;

        const node = this.nodes[nodeIndex];
        
        // prevent deletion of input nodes unless forced (for cascading deletion)
        if (node.type === 'input_node' && !force) {
            this.emit('inputNodeDeletionAttempted', node);
            return false;
        }
        
        // if deleting a python node, also delete its associated input nodes
        if (node.type === 'python_file') {
            const associatedInputNodes = this.nodes.filter(n => 
                n.type === 'input_node' && n.targetNodeId === nodeId
            );
            
            // force delete associated input nodes
            associatedInputNodes.forEach(inputNode => {
                this.removeNode(inputNode.id, true);
            });
        }
        
        // remove associated links
        this.links = this.links.filter(l => l.source !== nodeId && l.target !== nodeId);
        
        // remove from selection - delegate to SelectionHandler
        if (this.selectionHandler) {
            this.selectionHandler.removeNodeFromSelection(nodeId);
        }
        
        // remove from groups
        this.groups.forEach(group => {
            const nodeIdIndex = group.nodeIds.indexOf(nodeId);
            if (nodeIdIndex > -1) {
                group.nodeIds.splice(nodeIdIndex, 1);
            }
        });

        // remove empty groups
        this.groups = this.groups.filter(g => g.nodeIds.length > 1);
        
        this.nodes.splice(nodeIndex, 1);
        
        this.emit('nodeRemoved', node);
        this.emit('stateChanged');
        if (this.saving) this.saving.scheduleAutosave();
        
        return true;
    }

    getNode(nodeId) {
        return this.nodes.find(n => n.id === nodeId);
    }

    getNodes() {
        return [...this.nodes];
    }

    // link management
    addLink(sourceId, targetId) {
        // check if link already exists
        const exists = this.links.some(l => 
            (l.source === sourceId && l.target === targetId) ||
            (l.source === targetId && l.target === sourceId)
        );

        if (exists) return null;

        const link = { source: sourceId, target: targetId };
        
        // make python→if links non-selectable
        const sourceNode = this.getNode(sourceId);
        const targetNode = this.getNode(targetId);
        if (sourceNode && targetNode && sourceNode.type === 'python_file' && targetNode.type === 'if_node') {
            link.selectable = false;
        }
        
        // validate link (will also block data_save connections)
        const validation = Validation.validateLink(link, this.nodes);
        if (!validation.isValid) {
            throw new Error(`invalid link: ${validation.errors.join(', ')}`);
        }

        this.links.push(link);
        this.emit('linkAdded', link);
        this.emit('stateChanged');
        if (this.saving) this.saving.scheduleAutosave();
        
        return link;
    }

    // helper to retrieve a link by endpoints
    getLink(sourceId, targetId) {
        return this.links.find(l =>
            (l.source === sourceId && l.target === targetId) ||
            (l.source === targetId && l.target === sourceId)
        );
    }

    // update link metadata (e.g., conditions for if→python)
    updateLink(sourceId, targetId, updates) {
        const link = this.getLink(sourceId, targetId);
        if (!link) return false;
        Object.assign(link, updates);
        this.emit('linkUpdated', link);
        this.emit('stateChanged');
        if (this.saving) this.saving.scheduleAutosave();
        return true;
    }

    removeLink(sourceId, targetId) {
        const linkIndex = this.links.findIndex(l => 
            (l.source === sourceId && l.target === targetId) ||
            (l.source === targetId && l.target === sourceId)
        );
        
        if (linkIndex === -1) return false;

        const link = this.links[linkIndex];
        this.links.splice(linkIndex, 1);
        
        // clear link selection - delegate to SelectionHandler
        if (this.selectionHandler) {
            this.selectionHandler.clearLinkSelection();
        }

        this.emit('linkRemoved', link);
        this.emit('stateChanged');
        if (this.saving) this.saving.scheduleAutosave();
        
        return true;
    }

    getLinks() {
        return [...this.links];
    }

    // get dependencies for a node (nodes that must run before this node)
    getDependencies(node) {
        const dependencies = [];
        const visited = new Set();
        
        const findDependencies = (currentNode) => {
            // find all links where this node is the target
            const incomingLinks = this.links.filter(link => link.target === currentNode.id);
            
            incomingLinks.forEach(link => {
                const sourceNode = this.getNode(link.source);
                if (sourceNode && !visited.has(sourceNode.id)) {
                    visited.add(sourceNode.id);
                    dependencies.push(sourceNode);
                    // recursively find dependencies of the source node
                    findDependencies(sourceNode);
                }
            });
        };
        
        findDependencies(node);
        return dependencies;
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
        if (this.saving) this.saving.scheduleAutosave();
        
        return true;
    }

    removeGroup(groupId) {
        const groupIndex = this.groups.findIndex(g => g.id === groupId);
        if (groupIndex === -1) return false;

        const group = this.groups[groupIndex];
        
        // remove group id from nodes
        this.nodes.forEach(node => {
            if (node.groupId === groupId) {
                node.groupId = null;
            }
        });

        this.groups.splice(groupIndex, 1);
        
        // clear group selection - delegate to SelectionHandler
        if (this.selectionHandler) {
            this.selectionHandler.clearGroupSelection(groupId);
        }

        this.emit('groupRemoved', group);
        this.emit('stateChanged');
        if (this.saving) this.saving.scheduleAutosave();
        
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

    setConnecting(isConnecting, sourceNode = null) {
        this.isConnecting = isConnecting;
        this.sourceNode = sourceNode;
        this.emit('connectionStateChanged', { isConnecting, sourceNode });
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

    // history mode removed

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

    // data persistence - delegated to Saving class
    scheduleAutosave() {
        if (this.saving) this.saving.scheduleAutosave();
    }

    async save(isAutosave = false, force = false) {
        return this.saving ? this.saving.save(isAutosave, force) : { success: false, message: 'saving not initialized' };
    }

    async load() {
        return this.saving ? this.saving.load() : { success: false, message: 'saving not initialized' };
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
        if (this.saving) this.saving.scheduleAutosave();
        return true;
    }

    removeAnnotation(annotationId) {
        const idx = this.annotations.findIndex(a => a.id === annotationId);
        if (idx === -1) return false;
        const ann = this.annotations[idx];
        this.annotations.splice(idx, 1);
        this.emit('annotationRemoved', ann);
        this.emit('stateChanged');
        if (this.saving) this.saving.scheduleAutosave();
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

    // selection getter methods - delegate to SelectionHandler
    getSelectedNodes() {
        if (!this.selectionHandler) {
            return [];
        }
        return this.selectionHandler.getSelectedNodes() || [];
    }

    get selectedNodes() {
        if (!this.selectionHandler) {
            return new Set();
        }
        return this.selectionHandler.selectedNodes || new Set();
    }

    get selectedLink() {
        if (!this.selectionHandler) {
            return null;
        }
        return this.selectionHandler.selectedLink || null;
    }

    get selectedGroup() {
        if (!this.selectionHandler) {
            return null;
        }
        return this.selectionHandler.selectedGroup || null;
    }

    get selectedAnnotation() {
        if (!this.selectionHandler) {
            return null;
        }
        return this.selectionHandler.selectedAnnotation || null;
    }

    // selection modification methods - delegate to SelectionHandler
    clearSelection() {
        if (this.selectionHandler && typeof this.selectionHandler.clearSelection === 'function') {
            this.selectionHandler.clearSelection();
        }
    }

    selectNode(nodeId) {
        if (this.selectionHandler && this.selectionHandler.selectedNodes) {
            this.selectionHandler.selectedNodes.add(nodeId);
        }
    }

    deselectNode(nodeId) {
        if (this.selectionHandler && this.selectionHandler.selectedNodes) {
            this.selectionHandler.selectedNodes.delete(nodeId);
        }
    }

    selectLink(link) {
        if (this.selectionHandler) {
            this.selectionHandler.selectedLink = link;
        }
    }

    selectGroup(group) {
        if (this.selectionHandler) {
            this.selectionHandler.selectedGroup = group;
        }
    }

    selectAnnotation(annotationId) {
        if (this.selectionHandler && typeof this.selectionHandler.selectAnnotation === 'function') {
            this.selectionHandler.selectAnnotation(annotationId);
        }
    }

    // debug methods - delegated to Saving class
    exportData() {
        return this.saving ? this.saving.exportData() : { nodes: [], links: [], groups: [], metadata: {} };
    }

    importData(data) {
        if (this.saving) {
            this.saving.importData(data);
        }
    }


    



}

window.StateManager = StateManager;
})();