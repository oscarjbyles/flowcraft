// drag and drop interaction handler
(function(){
    'use strict';
    if (window.DragHandler) { return; }

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
            // disallow dragging in run or history modes
            .filter(() => !this.state.isRunMode && !this.state.isHistoryMode)
            .container(container)
            .on('start', this.handleDragStart)
            .on('drag', this.handleDragging)
            .on('end', this.handleDragEnd);
    }

    handleDragStart(event, d) {
        // prevent dragging in run or history mode
        if (this.state.isRunMode || this.state.isHistoryMode) {
            event.sourceEvent.preventDefault();
            return;
        }
        // suppress any subsequent canvas click triggered by this drag interaction to avoid accidental node creation
        this.state.suppressNextCanvasClick = true;
        // stop propagation so the canvas does not interpret this as a click origin
        if (event.sourceEvent && typeof event.sourceEvent.stopPropagation === 'function') {
            event.sourceEvent.stopPropagation();
            if (typeof event.sourceEvent.preventDefault === 'function') {
                event.sourceEvent.preventDefault();
            }
        }
        // clear any existing snap preview at the start of a drag
        this.state.emit('clearSnapPreview');
        
        // disable zoom during drag
        this.state.emit('disableZoom');
        
        // set drag state
        this.state.setDragging(true, d);
        
        // check if this node is part of a multi-selection
        this.isDraggingGroup = this.state.selectionHandler && this.state.selectionHandler.selectedNodes && this.state.selectionHandler.selectedNodes.has(d.id) && this.state.selectionHandler.selectedNodes.size > 1;
        
        if (this.isDraggingGroup) {
            // store initial positions for all selected nodes
            this.groupDragStartPositions = new Map();
            this.state.selectionHandler.selectedNodes.forEach(nodeId => {
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
            if (this.state.selectionHandler && this.state.selectionHandler.selectedNodes) {
                this.state.selectionHandler.selectedNodes.forEach(nodeId => {
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
                // if this node is magnetized to a partner, move partner accordingly during drag
                const partner = this.state.createNode ? this.state.createNode.getMagnetPartner(d.id) : null;
                if (partner) {
                    // if the dragged node is the python, keep the if node aligned beneath it
                    if (d.type === 'python_file' && partner.type === 'if_node') {
                        const py = d;
                        const ifn = partner;
                        const pyHeight = 60;
                        const ifHeight = 60;
                        const gap = 20;
                        const desiredY = py.y + pyHeight / 2 + gap + ifHeight / 2;
                        const desiredX = py.x;
                        ifn.x = desiredX;
                        ifn.y = desiredY;
                        this.updateDraggedNodePosition(ifn);
                    }
                    // if the dragged node is the if node, allow free movement (potentially detaching on drop)
                }

                // show snap preview if dragging an if node near a candidate python node
                this.updateSnapPreviewDuringDrag(d);
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
            if (this.state.selectionHandler && this.state.selectionHandler.selectedNodes) {
                this.state.selectionHandler.selectedNodes.forEach(nodeId => {
                    const node = this.state.nodes.find(n => n.id === nodeId);
                    if (node) {
                        this.removeDraggingClass(node);
                    }
                });
            }
            
            // final position update for all nodes
            this.updateGroupDraggedPositions();
            
            // update all selected nodes in state manager if positions changed
            if (positionChanged && this.state.selectionHandler && this.state.selectionHandler.selectedNodes) {
                this.state.selectionHandler.selectedNodes.forEach(nodeId => {
                    const node = this.state.nodes.find(n => n.id === nodeId);
                    if (node) {
                        if (this.state.createNode) {
                            this.state.createNode.updateNode(node.id, { x: node.x, y: node.y });
                        }
                        
                        // update groups if node belongs to one
                        if (node.groupId) {
                            this.state.emit('updateGroupBounds', node.groupId);
                        }
                    }
                });
            }
            
            // if positions actually changed during a group drag, suppress the next canvas click
            if (positionChanged) {
                this.state.suppressNextCanvasClick = true;
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
                if (this.state.createNode) {
                    this.state.createNode.updateNode(d.id, { x: d.x, y: d.y });
                }
                // suppress next canvas click if a real drag occurred to prevent accidental node creation
                this.state.suppressNextCanvasClick = true;
            }

            // detach if dragged if node moves away from its magnet partner
            const partner = this.state.createNode ? this.state.createNode.getMagnetPartner(d.id) : null;
            if (partner && d.type === 'if_node' && partner.type === 'python_file') {
                const shouldKeep = this.isNearSnapZone(d, partner);
                if (!shouldKeep) {
                    if (this.state.createNode) {
                        this.state.createNode.clearMagnetForNode(d.id);
                    }
                }
            }

            // magnetize on drop: if an if node is dropped near its associated python node, snap and pair
            this.tryMagnetizeOnDrop(d);
            // clear any snap preview
            this.state.emit('clearSnapPreview');
            
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
        if (!this.state.selectionHandler || !this.state.selectionHandler.selectedNodes) return;
        
        this.state.selectionHandler.selectedNodes.forEach(nodeId => {
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
                if (this.state.createNode) {
                    this.state.createNode.updateNode(node.id, { x: node.x, y: node.y });
                }
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

    // magnet drop logic
    tryMagnetizeOnDrop(node) {
        const SNAP_X_TOL = 80; // px allowed horizontal offset before snapping
        const SNAP_Y_TOL = 100; // px distance below python to consider a snap
        const GAP = 20; // vertical gap below python when snapped

        // determine if there is an if<->python association via existing links
        let pythonNode = null;
        let ifNode = null;
        if (node.type === 'if_node') {
            ifNode = node;
            pythonNode = this.state.createNode ? this.state.createNode.getAssociatedPythonForIf(node.id) : null;
        } else if (node.type === 'python_file') {
            pythonNode = node;
            ifNode = this.state.createNode ? this.state.createNode.getAssociatedIfForPython(node.id) : null;
        }

		// fallback: if dragging a disconnected if node, find nearest python candidate within snap zone
		if (!pythonNode && node.type === 'if_node') {
			let bestCandidate = null;
			let bestScore = Infinity;
			const pyHeight = 60;
			const ifHeight = 60;
			(this.state.nodes || []).forEach(n => {
				if (!n || n.type !== 'python_file') return;
				const desiredXLocal = n.x;
				const desiredYLocal = n.y + pyHeight / 2 + GAP + ifHeight / 2;
				const dxLocal = node.x - desiredXLocal;
				const dyLocal = node.y - desiredYLocal;
				const nearHorizLocal = Math.abs(dxLocal) <= SNAP_X_TOL;
				const nearVertLocal = Math.abs(dyLocal) <= SNAP_Y_TOL;
				if (nearHorizLocal && nearVertLocal) {
					const score = Math.abs(dxLocal) + Math.abs(dyLocal);
					if (score < bestScore) {
						bestScore = score;
						bestCandidate = n;
					}
				}
			});
			if (bestCandidate) {
				pythonNode = bestCandidate;
				ifNode = node;
			}
		}

		if (!pythonNode || !ifNode) return;

        // compute desired position: if under python, centered, with spacing between node borders
        const pyHeight = 60;
        const ifHeight = 60;
        const desiredX = pythonNode.x;
        const desiredY = pythonNode.y + pyHeight / 2 + GAP + ifHeight / 2;

        // see if the dropping node is close enough to snap
        const dx = (node.type === 'if_node' ? node.x : ifNode.x) - desiredX;
        const dy = (node.type === 'if_node' ? node.y : ifNode.y) - desiredY;
        const nearHoriz = Math.abs(dx) <= SNAP_X_TOL;
        const nearVert = Math.abs(dy) <= SNAP_Y_TOL;

		if (nearHoriz && nearVert) {
			// snap if node to desired position and set magnet pair both ways
			ifNode.x = desiredX;
			ifNode.y = desiredY;
			if (this.state.createNode) {
				this.state.createNode.updateNode(ifNode.id, { x: ifNode.x, y: ifNode.y });
			}
			this.updateDraggedNodePosition(ifNode);
			// clear any previous magnets to prevent stale pairings
			if (this.state.createNode) {
				this.state.createNode.clearMagnetForNode(pythonNode.id);
				this.state.createNode.clearMagnetForNode(ifNode.id);
				this.state.createNode.setMagnetPair(ifNode.id, pythonNode.id);
			}
		}
    }

    // helper to test if an if node is within snap zone of a given python node
    isNearSnapZone(ifNode, pythonNode) {
        const SNAP_X_TOL = 80;
        const SNAP_Y_TOL = 100;
        const GAP = 20;
        const pyHeight = 60;
        const ifHeight = 60;
        const desiredX = pythonNode.x;
        const desiredY = pythonNode.y + pyHeight / 2 + GAP + ifHeight / 2;
        const dx = ifNode.x - desiredX;
        const dy = ifNode.y - desiredY;
        const nearHoriz = Math.abs(dx) <= SNAP_X_TOL;
        const nearVert = Math.abs(dy) <= SNAP_Y_TOL;
        return nearHoriz && nearVert;
    }

	updateSnapPreviewDuringDrag(node) {
		// only preview when dragging an if node
		if (node.type !== 'if_node') {
			this.state.emit('clearSnapPreview');
			return;
		}
		let pythonNode = this.state.createNode ? this.state.createNode.getAssociatedPythonForIf(node.id) : null;
		const GAP = 20;
		const pyHeight = 60;
		const ifHeight = 60;
		const SNAP_X_TOL = 80;
		const SNAP_Y_TOL = 100;

		// fallback: if no linked python, search nearest python within snap tolerances
		let desiredX, desiredY;
		if (!pythonNode) {
			let bestCandidate = null;
			let bestScore = Infinity;
			(this.state.nodes || []).forEach(n => {
				if (!n || n.type !== 'python_file') return;
				const dxLocal = node.x - n.x;
				const dyLocal = node.y - (n.y + pyHeight / 2 + GAP + ifHeight / 2);
				const nearHorizLocal = Math.abs(dxLocal) <= SNAP_X_TOL;
				const nearVertLocal = Math.abs(dyLocal) <= SNAP_Y_TOL;
				if (nearHorizLocal && nearVertLocal) {
					const score = Math.abs(dxLocal) + Math.abs(dyLocal);
					if (score < bestScore) {
						bestScore = score;
						bestCandidate = n;
					}
				}
			});
			if (bestCandidate) {
				pythonNode = bestCandidate;
			}
		}

		if (!pythonNode) {
			this.state.emit('clearSnapPreview');
			return;
		}

		desiredX = pythonNode.x;
		desiredY = pythonNode.y + pyHeight / 2 + GAP + ifHeight / 2;
		const nearHoriz = Math.abs(node.x - desiredX) <= SNAP_X_TOL;
		const nearVert = Math.abs(node.y - desiredY) <= SNAP_Y_TOL;
		if (nearHoriz && nearVert) {
			// preview should match the python node width and regular node height
			const previewWidth = pythonNode.width || 120;
			const previewHeight = 60;
			this.state.emit('updateSnapPreview', {
				x: desiredX,
				y: desiredY,
				width: previewWidth,
				height: previewHeight
			});
		} else {
			this.state.emit('clearSnapPreview');
		}
	}
}

window.DragHandler = DragHandler;
})();