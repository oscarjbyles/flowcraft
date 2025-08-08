// drag and drop interaction handler
class DragHandler {
    constructor(stateManager, eventManager) {
        this.state = stateManager;
        this.events = eventManager;
        this.dragAnimationFrame = null;
        
        // group dragging state
        this.isDraggingGroup = false;
        this.groupDragStartPositions = null;
        
        // bind methods
        this.handleDragStart = this.handleDragStart.bind(this);
        this.handleDragging = this.handleDragging.bind(this);
        this.handleDragEnd = this.handleDragEnd.bind(this);
    }

    createDragBehavior(container) {
        return d3.drag()
            .container(container)
            .on('start', this.handleDragStart)
            .on('drag', this.handleDragging)
            .on('end', this.handleDragEnd);
    }

    handleDragStart(event, d) {
        // prevent dragging in run mode
        if (this.state.isRunMode) {
            event.sourceEvent.preventDefault();
            return;
        }
        
        // disable zoom during drag
        this.state.emit('disableZoom');
        
        // set drag state
        this.state.setDragging(true, d);
        
        // check if this node is part of a multi-selection
        this.isDraggingGroup = this.state.selectedNodes.has(d.id) && this.state.selectedNodes.size > 1;
        
        if (this.isDraggingGroup) {
            // store initial positions for all selected nodes
            this.groupDragStartPositions = new Map();
            this.state.selectedNodes.forEach(nodeId => {
                const node = this.state.nodes.find(n => n.id === nodeId);
                if (node) {
                    this.groupDragStartPositions.set(nodeId, { x: node.x, y: node.y });
                    // add dragging class to all selected nodes
                    this.addDraggingClass(node);
                }
            });
        } else {
            // add dragging class to prevent css transitions
            this.addDraggingClass(d);
        }
        
        // store initial position
        d.dragStartX = d.x;
        d.dragStartY = d.y;
        
        this.events.handleDragStart(event, d);
    }

    handleDragging(event, d) {
        // update node position
        d.x = event.x;
        d.y = event.y;
        
        // if dragging a group, update all selected nodes
        if (this.isDraggingGroup) {
            // calculate offset from initial position
            const offsetX = d.x - d.dragStartX;
            const offsetY = d.y - d.dragStartY;
            
            // update positions of all selected nodes
            this.state.selectedNodes.forEach(nodeId => {
                if (nodeId !== d.id) { // don't update the dragged node twice
                    const node = this.state.nodes.find(n => n.id === nodeId);
                    if (node && this.groupDragStartPositions.has(nodeId)) {
                        const startPos = this.groupDragStartPositions.get(nodeId);
                        node.x = startPos.x + offsetX;
                        node.y = startPos.y + offsetY;
                    }
                }
            });
        }
        
        // cancel previous animation frame
        if (this.dragAnimationFrame) {
            cancelAnimationFrame(this.dragAnimationFrame);
        }
        
        // use requestAnimationFrame for smooth updates
        this.dragAnimationFrame = requestAnimationFrame(() => {
            if (this.isDraggingGroup) {
                this.updateGroupDraggedPositions();
            } else {
                this.updateDraggedNodePosition(d);
            }
            this.dragAnimationFrame = null;
        });
    }

    handleDragEnd(event, d) {
        // cancel any pending animation frame
        if (this.dragAnimationFrame) {
            cancelAnimationFrame(this.dragAnimationFrame);
            this.dragAnimationFrame = null;
        }
        
        // check if position actually changed
        const positionChanged = d.dragStartX !== d.x || d.dragStartY !== d.y;
        
        if (this.isDraggingGroup) {
            // remove dragging class from all selected nodes
            this.state.selectedNodes.forEach(nodeId => {
                const node = this.state.nodes.find(n => n.id === nodeId);
                if (node) {
                    this.removeDraggingClass(node);
                }
            });
            
            // final position update for all nodes
            this.updateGroupDraggedPositions();
            
            // update all selected nodes in state manager if positions changed
            if (positionChanged) {
                this.state.selectedNodes.forEach(nodeId => {
                    const node = this.state.nodes.find(n => n.id === nodeId);
                    if (node) {
                        this.state.updateNode(node.id, { x: node.x, y: node.y });
                        
                        // update groups if node belongs to one
                        if (node.groupId) {
                            this.state.emit('updateGroupBounds', node.groupId);
                        }
                    }
                });
            }
            
            // cleanup
            this.groupDragStartPositions = null;
            this.isDraggingGroup = false;
        } else {
            // remove dragging class
            this.removeDraggingClass(d);
            
            // final position update
            this.updateDraggedNodePosition(d);
            
            // update node data in state manager and trigger autosave if position changed
            if (positionChanged) {
                this.state.updateNode(d.id, { x: d.x, y: d.y });
            }
            
            // update groups if node belongs to one
            if (d.groupId) {
                this.state.emit('updateGroupBounds', d.groupId);
            }
        }
        
        // re-enable zoom
        this.state.emit('enableZoom');
        
        // clear drag state
        this.state.setDragging(false);
        
        // clean up drag properties
        delete d.dragStartX;
        delete d.dragStartY;
        
        this.events.handleDragEnd(event, d);
    }

    updateDraggedNodePosition(draggedNode) {
        this.state.emit('updateNodePosition', {
            nodeId: draggedNode.id,
            x: draggedNode.x,
            y: draggedNode.y
        });
        
        // update connected links in real-time
        this.state.emit('updateLinksForNode', draggedNode.id);
    }

    updateGroupDraggedPositions() {
        // update positions for all selected nodes
        this.state.selectedNodes.forEach(nodeId => {
            const node = this.state.nodes.find(n => n.id === nodeId);
            if (node) {
                this.state.emit('updateNodePosition', {
                    nodeId: node.id,
                    x: node.x,
                    y: node.y
                });
                
                // update connected links in real-time for each node
                this.state.emit('updateLinksForNode', node.id);
            }
        });
    }

    addDraggingClass(node) {
        this.state.emit('addNodeClass', {
            nodeId: node.id,
            className: 'dragging'
        });
    }

    removeDraggingClass(node) {
        this.state.emit('removeNodeClass', {
            nodeId: node.id,
            className: 'dragging'
        });
    }

    // multi-node drag support
    handleMultiNodeDrag(selectedNodes, primaryNode, deltaX, deltaY) {
        selectedNodes.forEach(node => {
            if (node.id !== primaryNode.id) {
                node.x += deltaX;
                node.y += deltaY;
                this.updateDraggedNodePosition(node);
                // update node data in state manager for autosave
                this.state.updateNode(node.id, { x: node.x, y: node.y });
            }
        });
    }

    // snap to grid functionality
    snapToGrid(x, y, gridSize = 20) {
        return {
            x: Math.round(x / gridSize) * gridSize,
            y: Math.round(y / gridSize) * gridSize
        };
    }

    // drag constraints
    constrainToBounds(x, y, bounds) {
        return {
            x: Math.max(bounds.minX, Math.min(bounds.maxX, x)),
            y: Math.max(bounds.minY, Math.min(bounds.maxY, y))
        };
    }
}

window.DragHandler = DragHandler;