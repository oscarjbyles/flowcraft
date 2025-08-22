// connection creation interaction handler
(function(){
    'use strict';
    if (window.ConnectionHandler) { return; }

class ConnectionHandler {
    constructor(stateManager, eventManager) {
        this.state = stateManager;
        this.events = eventManager;
        this.connectionLine = null;
        this.connectionDots = [];
        
        // connection state
        this.isConnecting = false;
        this.sourceNode = null;
    }

    // link management operations moved from StateManager
    addLink(sourceId, targetId) {
        // check if link already exists
        const exists = this.state.links.some(l => 
            (l.source === sourceId && l.target === targetId) ||
            (l.source === targetId && l.target === sourceId)
        );

        if (exists) return null;

        const link = { source: sourceId, target: targetId };
        
        // make python→if links non-selectable
        const sourceNode = this.state.createNode ? this.state.createNode.getNode(sourceId) : null;
        const targetNode = this.state.createNode ? this.state.createNode.getNode(targetId) : null;
        if (sourceNode && targetNode && sourceNode.type === 'python_file' && targetNode.type === 'if_node') {
            link.selectable = false;
        }
        
        // validate link (will also block data_save connections)
        const validation = Validation.validateLink(link, this.state.nodes);
        if (!validation.isValid) {
            throw new Error(`invalid link: ${validation.errors.join(', ')}`);
        }

        this.state.links.push(link);
        this.state.emit('linkAdded', link);
        this.state.emit('stateChanged');
        if (this.state.saving) this.state.saving.triggerAutosave();
        
        return link;
    }

    // helper to retrieve a link by endpoints
    getLink(sourceId, targetId) {
        return this.state.links.find(l =>
            (l.source === sourceId && l.target === targetId) ||
            (l.source === targetId && l.target === sourceId)
        );
    }

    // update link metadata (e.g., conditions for if→python)
    updateLink(sourceId, targetId, updates) {
        const link = this.getLink(sourceId, targetId);
        if (!link) return false;
        Object.assign(link, updates);
        this.state.emit('linkUpdated', link);
        this.state.emit('stateChanged');
        if (this.state.saving) this.state.saving.triggerAutosave();
        return true;
    }



    getLinks() {
        return [...this.state.links];
    }

    // connection state management
    setConnecting(isConnecting, sourceNode = null) {
        this.isConnecting = isConnecting;
        this.sourceNode = sourceNode;
        this.state.emit('connectionStateChanged', { isConnecting, sourceNode });
    }

    // get dependencies for a node (nodes that must run before this node)
    getDependencies(node) {
        const dependencies = [];
        const visited = new Set();
        
        const findDependencies = (currentNode) => {
            // find all links where this node is the target
            const incomingLinks = this.state.links.filter(link => link.target === currentNode.id);
            
            incomingLinks.forEach(link => {
                const sourceNode = this.state.createNode ? this.state.createNode.getNode(link.source) : null;
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

    startConnection(event, sourceNode, dotSide = null) {
        // use underlying dom event for propagation control (d3 drag provides a wrapper event)
        const srcEvt = (event && event.sourceEvent) ? event.sourceEvent : event;
        if (srcEvt && typeof srcEvt.stopPropagation === 'function') {
            srcEvt.stopPropagation();
        }
        if (srcEvt && typeof srcEvt.preventDefault === 'function') {
            srcEvt.preventDefault();
        }
        // suppress canvas click to avoid accidental node creation when starting a connection
        this.state.suppressNextCanvasClick = true;
        
        // prevent connections in run mode
        if (this.state.isRunMode) {
            return;
        }
        
        this.setConnecting(true, sourceNode);
        
        // get the starting point from the connection dot if available
        const startPoint = this.getConnectionStartPoint(sourceNode, dotSide);
        this.connectionStartPoint = startPoint;
        
        // create temporary connection line
        this.createConnectionLine(sourceNode, startPoint);
        
        this.events.handleConnectionStart(event, sourceNode);
    }

    updateConnection(event, coordinates) {
        if (!this.isConnecting) return;
        
        // get the connection start point (could be from a specific dot)
        const startPoint = this.connectionStartPoint || { x: this.sourceNode.x, y: this.sourceNode.y };
        
        this.state.emit('updateConnectionLine', {
            startX: startPoint.x,
            startY: startPoint.y,
            endX: coordinates.x,
            endY: coordinates.y
        });
    }

    endConnection(event, targetNode = null, coordinates = null) {
        if (!this.isConnecting) return;
        
        // if no target node provided, try to find one at coordinates
        if (!targetNode && coordinates) {
            targetNode = this.state.findNodeAtPosition(coordinates.x, coordinates.y, this.sourceNode.id);
        }
        
        if (targetNode && targetNode.id !== this.sourceNode.id) {
            this.events.handleConnectionEnd(event, this.sourceNode, targetNode);
        } else {
            this.events.handleConnectionCancel();
        }
        
        this.cleanupConnection();
    }

    cancelConnection() {
        if (!this.isConnecting) return;
        
        this.events.handleConnectionCancel();
        this.cleanupConnection();
    }

    createConnectionLine(sourceNode, startPoint = null) {
        const start = startPoint || { x: sourceNode.x, y: sourceNode.y };
        
        this.state.emit('createConnectionLine', {
            startX: start.x,
            startY: start.y,
            endX: start.x,
            endY: start.y
        });
    }

    getConnectionStartPoint(sourceNode, dotSide) {
        if (!dotSide) {
            return { x: sourceNode.x, y: sourceNode.y };
        }
        
        const nodeWidth = sourceNode.width || 120;
        const nodeHeight = 60;
        
        switch (dotSide) {
            case 'top':
                return { x: sourceNode.x, y: sourceNode.y - nodeHeight/2 };
            case 'right':
                return { x: sourceNode.x + nodeWidth/2, y: sourceNode.y };
            case 'bottom':
                return { x: sourceNode.x, y: sourceNode.y + nodeHeight/2 };
            case 'left':
                return { x: sourceNode.x - nodeWidth/2, y: sourceNode.y };
            default:
                return { x: sourceNode.x, y: sourceNode.y };
        }
    }

    cleanupConnection() {
        this.setConnecting(false);
        this.state.emit('removeConnectionLine');
        this.connectionLine = null;
        this.connectionStartPoint = null;
    }

    // connection dot management
    showConnectionDots(node) {
        const dotPositions = this.getConnectionDotPositions(node);
        
        this.state.emit('showConnectionDots', {
            nodeId: node.id,
            positions: dotPositions
        });
    }

    hideConnectionDots(node) {
        this.state.emit('hideConnectionDots', {
            nodeId: node.id
        });
    }

    getConnectionDotPositions(node) {
        const nodeWidth = node.width || 120;
        
        return [
            { side: 'top', x: 0, y: -30 },
            { side: 'right', x: nodeWidth/2, y: 0 },
            { side: 'bottom', x: 0, y: 30 },
            { side: 'left', x: -nodeWidth/2, y: 0 }
        ];
    }

    handleDotDragStart(event, node, dotSide = null) {
        this.startConnection(event, node, dotSide);
    }

    handleDotDrag(event, coordinates) {
        this.updateConnection(event, coordinates);
    }

    handleDotDragEnd(event, coordinates) {
        this.endConnection(event, null, coordinates);
    }

    // connection validation
    canCreateConnection(sourceId, targetId) {
        // can't connect to self
        if (sourceId === targetId) return false;
        
        // check if connection already exists
        const exists = this.state.links.some(l => 
            (l.source === sourceId && l.target === targetId) ||
            (l.source === targetId && l.target === sourceId)
        );
        
        return !exists;
    }

    // smart connection routing
    calculateConnectionPath(sourceNode, targetNode) {
        // simple straight line for now
        return `M${sourceNode.x},${sourceNode.y} L${targetNode.x},${targetNode.y}`;
    }

    calculateBezierPath(sourceNode, targetNode, curvature = 0.3) {
        const dx = targetNode.x - sourceNode.x;
        const dy = targetNode.y - sourceNode.y;
        
        const controlPoint1X = sourceNode.x + dx * curvature;
        const controlPoint1Y = sourceNode.y;
        
        const controlPoint2X = targetNode.x - dx * curvature;
        const controlPoint2Y = targetNode.y;
        
        return `M${sourceNode.x},${sourceNode.y} C${controlPoint1X},${controlPoint1Y} ${controlPoint2X},${controlPoint2Y} ${targetNode.x},${targetNode.y}`;
    }

    // connection types
    createStraightConnection(sourceId, targetId) {
        return this.addLink(sourceId, targetId);
    }

    createBezierConnection(sourceId, targetId) {
        const link = this.addLink(sourceId, targetId);
        if (link) {
            link.type = 'bezier';
        }
        return link;
    }

    // bulk connection operations
    connectSelectedNodes() {
        const selectedNodes = this.state.selectionHandler ? this.state.selectionHandler.getSelectedNodes() : [];
        if (selectedNodes.length < 2) return;
        
        // create connections between consecutive nodes
        for (let i = 0; i < selectedNodes.length - 1; i++) {
            const sourceId = selectedNodes[i].id;
            const targetId = selectedNodes[i + 1].id;
            
            if (this.canCreateConnection(sourceId, targetId)) {
                this.addLink(sourceId, targetId);
            }
        }
    }

    connectInSeries(nodeIds) {
        for (let i = 0; i < nodeIds.length - 1; i++) {
            if (this.canCreateConnection(nodeIds[i], nodeIds[i + 1])) {
                this.addLink(nodeIds[i], nodeIds[i + 1]);
            }
        }
    }

    connectInParallel(sourceId, targetIds) {
        targetIds.forEach(targetId => {
            if (this.canCreateConnection(sourceId, targetId)) {
                this.addLink(sourceId, targetId);
            }
        });
    }

    // connection analysis
    getNodeConnections(nodeId) {
        return this.state.links.filter(l => 
            l.source === nodeId || l.target === nodeId
        );
    }

    getIncomingConnections(nodeId) {
        return this.state.links.filter(l => l.target === nodeId);
    }

    getOutgoingConnections(nodeId) {
        return this.state.links.filter(l => l.source === nodeId);
    }

    findShortestPath(sourceId, targetId) {
        // bfs to find shortest path
        const queue = [{ nodeId: sourceId, path: [sourceId] }];
        const visited = new Set([sourceId]);
        
        while (queue.length > 0) {
            const { nodeId, path } = queue.shift();
            
            if (nodeId === targetId) {
                return path;
            }
            
            // find connected nodes
            this.state.links.forEach(link => {
                let nextNodeId = null;
                if (link.source === nodeId) {
                    nextNodeId = link.target;
                } else if (link.target === nodeId) {
                    nextNodeId = link.source;
                }
                
                if (nextNodeId && !visited.has(nextNodeId)) {
                    visited.add(nextNodeId);
                    queue.push({
                        nodeId: nextNodeId,
                        path: [...path, nextNodeId]
                    });
                }
            });
        }
        
        return null; // no path found
    }
}

window.ConnectionHandler = ConnectionHandler;
})();