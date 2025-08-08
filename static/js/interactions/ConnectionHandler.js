// connection creation interaction handler
class ConnectionHandler {
    constructor(stateManager, eventManager) {
        this.state = stateManager;
        this.events = eventManager;
        this.connectionLine = null;
        this.connectionDots = [];
    }

    startConnection(event, sourceNode, dotSide = null) {
        event.stopPropagation();
        
        // prevent connections in run mode
        if (this.state.isRunMode) {
            return;
        }
        
        this.state.setConnecting(true, sourceNode);
        
        // get the starting point from the connection dot if available
        const startPoint = this.getConnectionStartPoint(sourceNode, dotSide);
        this.connectionStartPoint = startPoint;
        
        // create temporary connection line
        this.createConnectionLine(sourceNode, startPoint);
        
        this.events.handleConnectionStart(event, sourceNode);
    }

    updateConnection(event, coordinates) {
        if (!this.state.isConnecting) return;
        
        // get the connection start point (could be from a specific dot)
        const startPoint = this.connectionStartPoint || { x: this.state.sourceNode.x, y: this.state.sourceNode.y };
        
        this.state.emit('updateConnectionLine', {
            startX: startPoint.x,
            startY: startPoint.y,
            endX: coordinates.x,
            endY: coordinates.y
        });
    }

    endConnection(event, targetNode = null, coordinates = null) {
        if (!this.state.isConnecting) return;
        
        // if no target node provided, try to find one at coordinates
        if (!targetNode && coordinates) {
            targetNode = this.state.findNodeAtPosition(coordinates.x, coordinates.y, this.state.sourceNode.id);
        }
        
        if (targetNode && targetNode.id !== this.state.sourceNode.id) {
            this.events.handleConnectionEnd(event, this.state.sourceNode, targetNode);
        } else {
            this.events.handleConnectionCancel();
        }
        
        this.cleanupConnection();
    }

    cancelConnection() {
        if (!this.state.isConnecting) return;
        
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
        this.state.setConnecting(false);
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
        return this.state.addLink(sourceId, targetId);
    }

    createBezierConnection(sourceId, targetId) {
        const link = this.state.addLink(sourceId, targetId);
        if (link) {
            link.type = 'bezier';
        }
        return link;
    }

    // bulk connection operations
    connectSelectedNodes() {
        const selectedNodes = this.state.getSelectedNodes();
        if (selectedNodes.length < 2) return;
        
        // create connections between consecutive nodes
        for (let i = 0; i < selectedNodes.length - 1; i++) {
            const sourceId = selectedNodes[i].id;
            const targetId = selectedNodes[i + 1].id;
            
            if (this.canCreateConnection(sourceId, targetId)) {
                this.state.addLink(sourceId, targetId);
            }
        }
    }

    connectInSeries(nodeIds) {
        for (let i = 0; i < nodeIds.length - 1; i++) {
            if (this.canCreateConnection(nodeIds[i], nodeIds[i + 1])) {
                this.state.addLink(nodeIds[i], nodeIds[i + 1]);
            }
        }
    }

    connectInParallel(sourceId, targetIds) {
        targetIds.forEach(targetId => {
            if (this.canCreateConnection(sourceId, targetId)) {
                this.state.addLink(sourceId, targetId);
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