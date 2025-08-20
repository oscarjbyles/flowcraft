// unified state management coordinator
(function() {
    'use strict';
    if (window.StateManager) { return; }

class StateManager extends EventEmitter {
    constructor() {
        super();
        
        // initialize managers
        this.nodeManager = new NodeManager();
        this.linkManager = new LinkManager(this.nodeManager);
        this.groupManager = new GroupManager(this.nodeManager);
        this.annotationManager = new AnnotationManager();
        
        // application state
        this.currentMode = 'build'; // 'build' or 'run' or 'settings'
        this.isFlowView = false;
        this.isErrorView = false;
        this.isRestoringFromHistory = false;
        this.isDragging = false;
        this.suppressNextCanvasClick = false;
        
        // ui state
        this.transform = d3.zoomIdentity;
        this.canvasWidth = 0;
        this.canvasHeight = 0;
        
        // storage
        this.storage = new Storage();
        this.autosaveTimer = null;
        this.autosaveDelay = 2000;
        
        // magnet pairs for if-python node connections
        this.magnetPairs = new Map();
        
        // forward events from managers
        this.setupEventForwarding();
    }

    setupEventForwarding() {
        // forward all manager events
        const managers = [this.nodeManager, this.linkManager, this.groupManager, this.annotationManager];
        managers.forEach(manager => {
            manager.on('stateChanged', () => {
                this.emit('stateChanged');
                this.scheduleAutosave();
            });
            
            manager.on('selectionChanged', (selection) => {
                this.emit('selectionChanged', selection);
            });
        });
    }

    // delegated node methods
    get nodes() { return this.nodeManager.nodes; }
    get selectedNodes() { return this.nodeManager.selectedNodes; }
    get draggedNode() { return this.nodeManager.draggedNode; }
    set draggedNode(value) { this.nodeManager.draggedNode = value; }
    
    addNode(nodeData) { 
        const node = this.nodeManager.addNode(nodeData);
        // check if this node needs an input node
        if (node.type === 'python_file' && !nodeData.skipInputCheck) {
            this.checkAndCreateInputNode(node);
        }
        return node;
    }
    
    updateNode(nodeId, updates) { 
        return this.nodeManager.updateNode(nodeId, updates); 
    }
    
    removeNode(nodeId, skipValidation) { 
        // remove associated links
        this.linkManager.removeLinksForNode(nodeId);
        // remove from groups
        const node = this.getNode(nodeId);
        if (node && node.groupId) {
            this.groupManager.removeNodeFromGroup(nodeId, node.groupId);
        }
        return this.nodeManager.removeNode(nodeId, skipValidation); 
    }
    
    getNode(nodeId) { return this.nodeManager.getNode(nodeId); }
    selectNode(nodeId, isMultiSelect) { return this.nodeManager.selectNode(nodeId, isMultiSelect); }
    findNodeAtPosition(x, y) { return this.nodeManager.findNodeAtPosition(x, y); }

    // delegated link methods
    get links() { return this.linkManager.links; }
    get selectedLink() { return this.linkManager.selectedLink; }
    get isConnecting() { return this.linkManager.isConnecting; }
    get sourceNode() { return this.linkManager.sourceNode; }
    
    addLink(sourceId, targetId, linkData) { return this.linkManager.addLink(sourceId, targetId, linkData); }
    updateLink(sourceId, targetId, updates) { return this.linkManager.updateLink(sourceId, targetId, updates); }
    removeLink(sourceId, targetId) { return this.linkManager.removeLink(sourceId, targetId); }
    selectLink(link) { return this.linkManager.selectLink(link); }
    setConnecting(isConnecting, sourceNode) { return this.linkManager.setConnecting(isConnecting, sourceNode); }

    // delegated group methods
    get groups() { return this.groupManager.groups; }
    get selectedGroup() { return this.groupManager.selectedGroup; }
    
    createGroup(nodeIds, groupData) { return this.groupManager.createGroup(nodeIds, groupData); }
    updateGroup(groupId, updates) { return this.groupManager.updateGroup(groupId, updates); }
    removeGroup(groupId) { return this.groupManager.removeGroup(groupId); }
    getGroup(groupId) { return this.groupManager.getGroup(groupId); }
    selectGroup(groupId) { return this.groupManager.selectGroup(groupId); }

    // delegated annotation methods
    get annotations() { return this.annotationManager.annotations; }
    get selectedAnnotation() { return this.annotationManager.selectedAnnotation; }
    
    addAnnotation(annotationData) { return this.annotationManager.addAnnotation(annotationData); }
    updateAnnotation(annotationId, updates) { return this.annotationManager.updateAnnotation(annotationId, updates); }
    removeAnnotation(annotationId) { return this.annotationManager.removeAnnotation(annotationId); }
    selectAnnotation(annotationId) { return this.annotationManager.selectAnnotation(annotationId); }

    // selection management
    clearSelection() {
        this.nodeManager.clearNodeSelection();
        this.linkManager.clearLinkSelection();
        this.groupManager.clearGroupSelection();
        this.annotationManager.clearAnnotationSelection();
        this.emit('selectionCleared');
    }

    // state management
    setDragging(isDragging, node = null) {
        this.isDragging = isDragging;
        this.draggedNode = node;
        this.emit('draggingStateChanged', { isDragging, node });
    }

    // magnet pair management
    setMagnetPair(nodeAId, nodeBId) {
        const a = this.getNode(nodeAId);
        const b = this.getNode(nodeBId);
        if (!a || !b) return false;
        
        a.magnet_partner_id = b.id;
        b.magnet_partner_id = a.id;
        this.magnetPairs.set(a.id, b.id);
        this.magnetPairs.set(b.id, a.id);
        
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
        let partnerId = this.magnetPairs.get(nodeId);
        if (!partnerId) {
            const n = this.getNode(nodeId);
            if (n && n.magnet_partner_id) {
                partnerId = n.magnet_partner_id;
                this.magnetPairs.set(nodeId, partnerId);
                this.magnetPairs.set(partnerId, nodeId);
            }
        }
        return partnerId ? this.getNode(partnerId) : null;
    }

    // input node management
    async checkAndCreateInputNode(pythonNode) {
        if (this.isRestoringFromHistory) return null;
        if (!pythonNode || pythonNode.type !== 'python_file') return null;
        if (!pythonNode.pythonFile || pythonNode.pythonFile.trim() === '') return null;
        
        // check if input node already exists
        const existingInputs = this.nodes.filter(n => 
            n.type === 'input_node' && n.targetNodeId === pythonNode.id
        );
        
        if (existingInputs.length > 0) {
            // keep only the first input node if multiple exist
            if (existingInputs.length > 1) {
                for (let i = 1; i < existingInputs.length; i++) {
                    this.removeNode(existingInputs[i].id, true);
                }
            }
            return existingInputs[0];
        }
        
        // create new input node
        try {
            const response = await fetch('/api/analyze-python-function', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ python_file: pythonNode.pythonFile })
            });
            
            const result = await response.json();
            
            if (result.success && result.parameters && result.parameters.length > 0) {
                const inputNode = this.addNode({
                    x: pythonNode.x - 200,
                    y: pythonNode.y,
                    name: 'input',
                    type: 'input_node',
                    targetNodeId: pythonNode.id,
                    parameters: result.parameters,
                    inputValues: {},
                    skipInputCheck: true
                });
                
                // create link from input to python node
                this.addLink(inputNode.id, pythonNode.id);
                
                return inputNode;
            }
        } catch (error) {
            // silently fail - input node creation is optional
        }
        
        return null;
    }

    clearOrphanedInputNodes() {
        let count = 0;
        const inputNodes = this.nodes.filter(n => n.type === 'input_node');
        
        inputNodes.forEach(inputNode => {
            const targetExists = inputNode.targetNodeId && 
                                this.nodes.some(n => n.id === inputNode.targetNodeId);
            if (!targetExists) {
                this.removeNode(inputNode.id, true);
                count++;
            }
        });
        
        return count;
    }

    // persistence
    getSerializableData() {
        return {
            nodes: this.nodeManager.getSerializableNodes(),
            links: this.linkManager.getSerializableLinks(),
            groups: this.groupManager.getSerializableGroups(),
            annotations: this.annotationManager.getSerializableAnnotations()
        };
    }

    async importData(data) {
        this.isRestoringFromHistory = true;
        
        try {
            this.nodeManager.importNodes(data.nodes || []);
            this.linkManager.importLinks(data.links || []);
            this.groupManager.importGroups(data.groups || []);
            this.annotationManager.importAnnotations(data.annotations || []);
            
            this.emit('dataImported');
            this.emit('stateChanged');
        } finally {
            this.isRestoringFromHistory = false;
        }
    }

    scheduleAutosave() {
        if (this.autosaveTimer) {
            clearTimeout(this.autosaveTimer);
        }
        
        this.autosaveTimer = setTimeout(() => {
            this.save(true);
        }, this.autosaveDelay);
    }

    async save(isAutosave = false) {
        const data = this.getSerializableData();
        return await this.storage.save(data, isAutosave);
    }

    async load() {
        const data = await this.storage.load();
        if (data) {
            await this.importData(data);
        }
    }

    flushPendingSavesOnExit() {
        try {
            if (this.autosaveTimer) {
                clearTimeout(this.autosaveTimer);
                this.autosaveTimer = null;
            }
            const data = this.getSerializableData();
            this.storage.saveOnExit(data);
        } catch (_) {}
    }

    // statistics
    getStats() {
        return {
            ...this.nodeManager.getStats(),
            ...this.linkManager.getStats(),
            ...this.groupManager.getStats(),
            ...this.annotationManager.getStats(),
            canvasSize: { width: this.canvasWidth, height: this.canvasHeight },
            currentMode: this.currentMode
        };
    }
}

window.StateManager = StateManager;
})();
