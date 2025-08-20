// node state management
(function() {
    'use strict';
    if (window.NodeManager) { return; }

class NodeManager extends EventEmitter {
    constructor() {
        super();
        this.nodes = [];
        this.nodeCounter = 0;
        this.selectedNodes = new Set();
        this.draggedNode = null;
        this.currentEditingNode = null;
    }

    // node crud operations
    addNode(nodeData) {
        const node = {
            id: Date.now() + Math.random(),
            x: nodeData.x || 0,
            y: nodeData.y || 0,
            name: nodeData.name || 'python node',
            type: nodeData.type || 'python_file',
            pythonFile: this.normalizePythonFile(nodeData.pythonFile),
            description: nodeData.description || '',
            groupId: nodeData.groupId || null,
            width: this.calculateNodeWidth(nodeData),
            ...nodeData
        };

        // validate node
        const validation = Validation.validateNode(node);
        if (!validation.isValid) {
            throw new Error(`invalid node: ${validation.errors.join(', ')}`);
        }

        this.nodes.push(node);
        this.emit('nodeAdded', node);
        this.emit('stateChanged');
        
        return node;
    }

    updateNode(nodeId, updates) {
        const node = this.getNode(nodeId);
        if (!node) return false;

        // update width if name changed
        if (updates.name && updates.name !== node.name) {
            updates.width = Geometry.getNodeWidth(updates.name);
        }

        // normalize pythonFile in updates
        if (typeof updates.pythonFile === 'string') {
            updates.pythonFile = this.normalizePythonFile(updates.pythonFile);
        }
        
        Object.assign(node, updates);
        
        // validate updated node
        const validation = Validation.validateNode(node);
        if (!validation.isValid) {
            throw new Error(`invalid node update: ${validation.errors.join(', ')}`);
        }

        this.emit('nodeUpdated', node);
        this.emit('stateChanged');
        
        return true;
    }

    removeNode(nodeId, skipValidation = false) {
        const index = this.nodes.findIndex(n => n.id === nodeId);
        if (index === -1) return false;
        
        const node = this.nodes[index];
        
        // prevent deletion of input nodes unless explicitly allowed
        if (!skipValidation && node.type === 'input_node') {
            return false;
        }
        
        // remove from selection
        this.selectedNodes.delete(nodeId);
        
        // remove node
        this.nodes.splice(index, 1);
        
        this.emit('nodeRemoved', node);
        this.emit('stateChanged');
        
        return true;
    }

    getNode(nodeId) {
        return this.nodes.find(n => n.id === nodeId);
    }

    getNodesByType(type) {
        return this.nodes.filter(n => n.type === type);
    }

    getNodesInGroup(groupId) {
        return this.nodes.filter(n => n.groupId === groupId);
    }

    // selection management
    selectNode(nodeId, isMultiSelect = false) {
        if (!isMultiSelect) {
            this.selectedNodes.clear();
        }
        
        const node = this.getNode(nodeId);
        if (node) {
            this.selectedNodes.add(nodeId);
            this.emit('nodeSelected', { nodeId, isMultiSelect });
            this.emit('selectionChanged', {
                nodes: Array.from(this.selectedNodes),
                link: null,
                group: null
            });
        }
    }

    deselectNode(nodeId) {
        this.selectedNodes.delete(nodeId);
        this.emit('nodeDeselected', nodeId);
        this.emit('selectionChanged', {
            nodes: Array.from(this.selectedNodes),
            link: null,
            group: null
        });
    }

    clearNodeSelection() {
        this.selectedNodes.clear();
        this.emit('selectionCleared');
    }

    // position management
    updateNodePosition(nodeId, x, y) {
        const node = this.getNode(nodeId);
        if (node) {
            node.x = x;
            node.y = y;
            this.emit('nodePositionUpdated', { nodeId, x, y });
            this.emit('stateChanged');
        }
    }

    moveNodes(nodeIds, deltaX, deltaY) {
        nodeIds.forEach(nodeId => {
            const node = this.getNode(nodeId);
            if (node) {
                node.x += deltaX;
                node.y += deltaY;
            }
        });
        this.emit('nodesMoved', { nodeIds, deltaX, deltaY });
        this.emit('stateChanged');
    }

    // utility methods
    normalizePythonFile(pythonFile) {
        const s = (pythonFile || '').toString().replace(/\\/g, '/');
        if (!s) return '';
        return s.replace(/^(?:nodes\/)*/i, '');
    }

    calculateNodeWidth(nodeData) {
        if (nodeData.type === 'data_save') {
            return Geometry.getDataSaveNodeWidth(nodeData.name || 'data save');
        }
        return Geometry.getNodeWidth(nodeData.name || 'python node');
    }

    findNodeAtPosition(x, y) {
        for (let i = this.nodes.length - 1; i >= 0; i--) {
            const node = this.nodes[i];
            if (Geometry.isPointInNode(x, y, node)) {
                return node;
            }
        }
        return null;
    }

    // serialization
    getSerializableNodes() {
        return this.nodes.map(node => {
            const { runtimeStatus, ...rest } = node;
            return rest;
        });
    }

    importNodes(nodes) {
        this.nodes = nodes || [];
        this.emit('nodesImported');
        this.emit('stateChanged');
    }

    getStats() {
        return {
            nodeCount: this.nodes.length,
            selectedCount: this.selectedNodes.size,
            nodeTypes: this.nodes.reduce((acc, node) => {
                acc[node.type] = (acc[node.type] || 0) + 1;
                return acc;
            }, {})
        };
    }
}

window.NodeManager = NodeManager;
})();
