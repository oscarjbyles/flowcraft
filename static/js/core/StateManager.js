// centralized state management for the flowchart
class StateManager extends EventEmitter {
    constructor() {
        super();
        
        // core data
        this.nodes = [];
        this.links = [];
        this.groups = [];
        
        // annotations (text labels, braces, etc.)
        this.annotations = [];
        
        // selection state
        this.selectedNodes = new Set();
        this.selectedLink = null;
        this.selectedGroup = null;
        this.selectedAnnotation = null;
        
        // interaction state
        this.isDragging = false;
        this.isConnecting = false;
        this.draggedNode = null;
        this.sourceNode = null;
        this.currentEditingNode = null;
        this.suppressNextCanvasClick = false;
        
        // application modes
        this.currentMode = 'build'; // 'build' or 'run'
        
        // flow view state (toggle within build mode)
        this.isFlowView = false;
        // error view state (toggle to show red error circles)
        this.isErrorView = false;
        
        // counters
        this.nodeCounter = 0;
        this.groupCounter = 0;
        
        // ui state
        this.transform = d3.zoomIdentity;
        this.canvasWidth = 0;
        this.canvasHeight = 0;
        
        // autosave
        this.autosaveTimer = null;
        this.autosaveDelay = 2000;
        
        // storage
        this.storage = new Storage();

        // magnetized node pairing (if<->python)
        // we store partner ids directly on nodes; this map is a helper for quick checks
        this.magnetPairs = new Map(); // key: nodeId -> partnerId
    }

    // node management
    addNode(nodeData) {
        const node = {
            id: Date.now() + Math.random(),
            x: nodeData.x || 0,
            y: nodeData.y || 0,
            name: nodeData.name || 'python node',
            type: nodeData.type || 'python_file',
            pythonFile: nodeData.pythonFile || '',
            description: nodeData.description || '',
            groupId: nodeData.groupId || null,
            width: (nodeData.type === 'data_save')
                ? Geometry.getDataSaveNodeWidth(nodeData.name || 'data save')
                : Geometry.getNodeWidth(nodeData.name || 'python node'),
            ...nodeData
        };

        // validate node
        const validation = Validation.validateNode(node);
        if (!validation.isValid) {
            throw new Error(`invalid node: ${validation.errors.join(', ')}`);
        }

        // console.log(`[StateManager] Adding node: ${node.name} at (${node.x}, ${node.y})`);
        this.nodes.push(node);
        this.emit('nodeAdded', node);
        
        // check if this node needs an input node
        if (node.type === 'python_file' && !nodeData.skipInputCheck) {
            this.checkAndCreateInputNode(node);
        }
        
        this.emit('stateChanged');
        this.scheduleAutosave();
        
        return node;
    }

    updateNode(nodeId, updates) {
        const node = this.getNode(nodeId);
        if (!node) return false;

        // store previous pythonFile for comparison
        const previousPythonFile = node.pythonFile;

        // update width if name changed
        if (updates.name && updates.name !== node.name) {
            updates.width = Geometry.getNodeWidth(updates.name);
        }

        // console.log(`[StateManager] Updating node ${nodeId}:`, updates);
        Object.assign(node, updates);
        
        // validate updated node
        const validation = Validation.validateNode(node);
        if (!validation.isValid) {
            throw new Error(`invalid node update: ${validation.errors.join(', ')}`);
        }

        // when a python node's python file changes, ensure only one fresh input node exists
        if (typeof updates.pythonFile !== 'undefined' && node.type === 'python_file') {
            // remove existing associated input nodes
            const existingInputs = this.nodes.filter(n => n.type === 'input_node' && n.targetNodeId === node.id);
            existingInputs.forEach(inputNode => this.removeNode(inputNode.id, true));

            // create a new input node only if the new python file is non-empty
            if (updates.pythonFile && updates.pythonFile.trim() !== '') {
                this.checkAndCreateInputNode(node);
            }
        }

        this.emit('nodeUpdated', node);
        this.emit('stateChanged');
        this.scheduleAutosave();
        
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
        
        // remove from selection
        this.selectedNodes.delete(nodeId);
        
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
        this.scheduleAutosave();
        
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

        // console.log(`[StateManager] Adding link: ${sourceId} -> ${targetId}`);
        this.links.push(link);
        this.emit('linkAdded', link);
        this.emit('stateChanged');
        this.scheduleAutosave();
        
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
        this.scheduleAutosave();
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
        
        if (this.selectedLink && 
            this.selectedLink.source === link.source && 
            this.selectedLink.target === link.target) {
            this.selectedLink = null;
        }

        this.emit('linkRemoved', link);
        this.emit('stateChanged');
        this.scheduleAutosave();
        
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

    // group management
    createGroup(nodeIds, groupData = {}) {
        if (nodeIds.length < 2) {
            throw new Error('group must contain at least 2 nodes');
        }

        const groupId = Date.now() + Math.random();
        const group = {
            id: groupId,
            name: groupData.name || 'group name',
            description: groupData.description || '',
            nodeIds: [...nodeIds],
            ...groupData
        };

        // validate group
        const validation = Validation.validateGroup(group, this.nodes);
        if (!validation.isValid) {
            throw new Error(`invalid group: ${validation.errors.join(', ')}`);
        }

        // assign group id to nodes
        nodeIds.forEach(nodeId => {
            const node = this.getNode(nodeId);
            if (node) {
                node.groupId = groupId;
            }
        });

        this.groups.push(group);
        
        // clear node selection and select the new group
        this.selectedNodes.clear();
        this.selectedLink = null;
        this.selectedGroup = group;
        
        this.emit('groupCreated', group);
        this.emit('selectionChanged', {
            nodes: [],
            link: null,
            group: group
        });
        this.emit('stateChanged');
        this.scheduleAutosave();
        
        return group;
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
        this.scheduleAutosave();
        
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
        
        if (this.selectedGroup && this.selectedGroup.id === groupId) {
            this.selectedGroup = null;
        }

        this.emit('groupRemoved', group);
        this.emit('stateChanged');
        this.scheduleAutosave();
        
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

    // selection management
    selectNode(nodeId, multiSelect = false) {
        if (multiSelect) {
            if (this.selectedNodes.has(nodeId)) {
                this.selectedNodes.delete(nodeId);
            } else {
                this.selectedNodes.add(nodeId);
            }
        } else {
            this.selectedNodes.clear();
            this.selectedNodes.add(nodeId);
        }
        
        this.selectedLink = null;
        this.selectedGroup = null;
        // also clear any selected annotation when selecting nodes
        this.selectedAnnotation = null;
        
        this.emit('selectionChanged', {
            nodes: Array.from(this.selectedNodes),
            link: this.selectedLink,
            group: this.selectedGroup,
            annotation: null
        });
    }

    selectLink(link) {
        this.selectedNodes.clear();
        this.selectedLink = link;
        this.selectedGroup = null;
        // also clear any selected annotation when selecting a link
        this.selectedAnnotation = null;
        
        this.emit('selectionChanged', {
            nodes: [],
            link: this.selectedLink,
            group: this.selectedGroup,
            annotation: null
        });
    }

    selectGroup(groupId) {
        this.selectedNodes.clear();
        this.selectedLink = null;
        this.selectedGroup = this.getGroup(groupId);
        // also clear any selected annotation when selecting a group
        this.selectedAnnotation = null;
        
        this.emit('selectionChanged', {
            nodes: [],
            link: this.selectedLink,
            group: this.selectedGroup
        });
    }

    clearSelection() {
        this.selectedNodes.clear();
        this.selectedLink = null;
        this.selectedGroup = null;
        this.currentEditingNode = null;
        this.selectedAnnotation = null;
        
        this.emit('selectionChanged', {
            nodes: [],
            link: null,
            group: null,
            annotation: null
        });

    }

    // annotation selection management
    selectAnnotation(annotationId) {
        this.selectedNodes.clear();
        this.selectedLink = null;
        this.selectedGroup = null;
        this.selectedAnnotation = this.annotations.find(a => a.id === annotationId) || null;
        this.emit('selectionChanged', {
            nodes: [],
            link: null,
            group: null,
            annotation: this.selectedAnnotation
        });
    }

    getSelectedNodes() {
        return this.nodes.filter(n => this.selectedNodes.has(n.id));
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

    get isHistoryMode() {
        return this.currentMode === 'history';
    }

    get isSettingsMode() {
        return this.currentMode === 'settings';
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

    // data persistence
    scheduleAutosave() {
        // console.log(`[StateManager] Scheduling autosave in ${this.autosaveDelay}ms`);
        
        if (this.autosaveTimer) {
            clearTimeout(this.autosaveTimer);
        }
        
        this.autosaveTimer = setTimeout(() => {
            // console.log('[StateManager] Executing scheduled autosave');
            this.save(true);
        }, this.autosaveDelay);
    }

    async save(isAutosave = false) {
        const data = {
            nodes: this.nodes,
            links: this.links,
            groups: this.groups,
            annotations: this.annotations
        };

        const result = await this.storage.save(data, isAutosave);
        
        if (result.success) {
            this.emit('dataSaved', { isAutosave, message: result.message });
        } else {
            this.emit('saveError', { message: result.message });
        }
        
        return result;
    }

    async load() {
        const result = await this.storage.load();
        
        if (result.success) {
            this.nodes = result.data.nodes || [];
            this.links = result.data.links || [];
            this.groups = result.data.groups || [];
            this.annotations = result.data.annotations || [];
            
            // update counters
            this.updateCounters();
            // hydrate magnet pairs after load
            this.rebuildMagnetPairsFromNodes();
            
            // check and create input nodes for loaded python_file nodes
            await this.checkLoadedNodesForInputs();
            
            this.emit('dataLoaded', { data: result.data, message: result.message });
            this.emit('stateChanged');
        } else {
            this.emit('loadError', { message: result.message });
        }
        
        return result;
    }

    // annotation management
    addAnnotation(annotationData) {
        const annotation = {
            id: Date.now() + Math.random(),
            x: annotationData.x || 0,
            y: annotationData.y || 0,
            text: Validation.sanitizeString(annotationData.text || 'text', 200),
            type: 'text',
            // default font size for text annotations
            fontSize: Math.max(8, Math.min(72, parseInt(annotationData.fontSize || 14, 10))) || 14,
            ...annotationData
        };

        this.annotations.push(annotation);
        this.emit('annotationAdded', annotation);
        this.emit('stateChanged');
        this.scheduleAutosave();
        return annotation;
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
        this.scheduleAutosave();
        return true;
    }

    removeAnnotation(annotationId) {
        const idx = this.annotations.findIndex(a => a.id === annotationId);
        if (idx === -1) return false;
        const ann = this.annotations[idx];
        this.annotations.splice(idx, 1);
        this.emit('annotationRemoved', ann);
        this.emit('stateChanged');
        this.scheduleAutosave();
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
            selectedNodeCount: this.selectedNodes.size
        };
    }

    // debug methods
    exportData() {
        return {
            nodes: this.nodes,
            links: this.links,
            groups: this.groups,
            metadata: {
                nodeCounter: this.nodeCounter,
                groupCounter: this.groupCounter,
                timestamp: new Date().toISOString()
            }
        };
    }

    importData(data) {
        this.nodes = data.nodes || [];
        this.links = data.links || [];
        this.groups = data.groups || [];
        
        if (data.metadata) {
            this.nodeCounter = data.metadata.nodeCounter || 0;
            this.groupCounter = data.metadata.groupCounter || 0;
        } else {
            this.updateCounters();
        }
        // hydrate magnet pairs after import
        this.rebuildMagnetPairsFromNodes();
        
        this.clearSelection();
        this.emit('dataImported', data);
        this.emit('stateChanged');
    }

    // check loaded nodes for input requirements (called after loading from JSON)
    async checkLoadedNodesForInputs() {
        // find all python_file nodes that don't have existing input nodes
        const pythonFileNodes = this.nodes.filter(node => 
            node.type === 'python_file' && 
            !node.skipInputCheck &&
            node.pythonFile
        );
        
        // check each python file node for input requirements
        for (const node of pythonFileNodes) {
            // check if this node already has an input node
            const hasInputNode = this.nodes.some(n => 
                n.type === 'input_node' && n.targetNodeId === node.id
            );
            
            if (!hasInputNode) {
                await this.checkAndCreateInputNode(node);
            }
        }
    }
    
    // check if a node needs an input node and create it
    async checkAndCreateInputNode(mainNode) {
        if (!mainNode.pythonFile) return;
        
        try {
            // enforce at most one input node
            const existingInputs = this.nodes.filter(n => n.type === 'input_node' && n.targetNodeId === mainNode.id);
            if (existingInputs.length >= 1) {
                // keep only the first if multiple exist
                for (let i = 1; i < existingInputs.length; i++) {
                    this.removeNode(existingInputs[i].id, true);
                }
                return;
            }
            // analyze the python file to check for function parameters
            const response = await fetch('/api/analyze-python-function', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    python_file: mainNode.pythonFile
                })
            });
            
            const result = await response.json();
            
            if (result.success && result.parameters && result.parameters.length > 0) {
                // create input node for this main node
                const inputNode = this.createInputNode(mainNode, result.parameters);
                
                // create connection from input node to main node
                this.createInputConnection(inputNode, mainNode);
            }
        } catch (error) {
            console.error('error checking node inputs:', error);
        }
    }
    
    // create an input node for a main node
    createInputNode(mainNode, parameters) {
        // fixed width for input nodes
        const dynamicWidth = 300;
        
        const inputNode = {
            id: Date.now() + Math.random() + 0.1, // slightly different to avoid conflicts
            x: mainNode.x - 200, // position to the left of main node
            y: mainNode.y,
            name: `Input Node`,
            type: 'input_node',
            pythonFile: mainNode.pythonFile,
            description: 'input parameters',
            groupId: mainNode.groupId,
            width: dynamicWidth,
            parameters: parameters,
            targetNodeId: mainNode.id, // reference to the main node
            inputValues: {}, // store user input values
            skipInputCheck: true // don't check this node for inputs again
        };
        
        // initialize default values for each parameter
        parameters.forEach(param => {
            inputNode.inputValues[param] = '';
        });
        
        // validate and add the input node
        const validation = Validation.validateNode(inputNode);
        if (!validation.isValid) {
            console.error('invalid input node:', validation.errors);
            return null;
        }
        
        this.nodes.push(inputNode);
        this.emit('nodeAdded', inputNode);
        
        return inputNode;
    }
    
    // create connection from input node to main node
    createInputConnection(inputNode, mainNode) {
        const link = {
            source: inputNode.id,
            target: mainNode.id,
            type: 'input_connection',
            selectable: false, // make input connections non-selectable
            style: 'dashed' // dashed line style
        };
        
        this.links.push(link);
        this.emit('linkAdded', link);
    }
}

window.StateManager = StateManager;