// centralized event management for the flowchart
(function(){
    'use strict';
    if (window.EventManager) { return; }

class EventManager {
    constructor(stateManager) {
        this.state = stateManager;
        this.setupKeyboardShortcuts();
    }

    setupKeyboardShortcuts() {
        document.addEventListener('keydown', (event) => {
            this.handleKeyDown(event);
        });

        document.addEventListener('keyup', (event) => {
            this.handleKeyUp(event);
        });
    }

    handleKeyDown(event) {
        // prevent default for our shortcuts
        const shortcuts = ['Delete', 'Backspace', 'Escape', 'g'];
        if (shortcuts.includes(event.key) || (event.ctrlKey && shortcuts.includes(event.key))) {
            // only prevent default if we're going to handle it
            if (this.shouldHandleShortcut(event)) {
                event.preventDefault();
            }
        }

        switch (event.key) {
            case 'Delete':
            case 'Backspace':
                this.handleDelete();
                break;
                
            case 'Escape':
                this.handleEscape();
                break;
                
            case 'g':
                if (event.ctrlKey) {
                    this.handleGroupShortcut();
                }
                break;
                
            case 'a':
                if (event.ctrlKey) {
                    // only handle shortcut when not focused on form fields
                    if (this.shouldHandleShortcut(event)) {
                        event.preventDefault();
                        this.handleSelectAll();
                    }
                    // else: allow native select-all in inputs/textareas
                }
                break;
                

        }
    }

    handleKeyUp(event) {
        // handle key releases if needed
    }

    shouldHandleShortcut(event) {
        // don't handle shortcuts if user is typing in an input
        const activeElement = document.activeElement;
        const inputElements = ['INPUT', 'TEXTAREA', 'SELECT'];
        
        return !inputElements.includes(activeElement.tagName);
    }

    handleDelete() {
        if (!this.shouldHandleShortcut({ key: 'Delete' })) return;

        if (this.state.selectedNodes.size > 0) {
            // check if we're in run mode - nodes cannot be deleted in run mode
            if (this.state.currentMode === 'run') {
                return;
            }
            
            const nodeIds = Array.from(this.state.selectedNodes);
            let deletedCount = 0;
            let inputNodeAttempts = 0;
            
            nodeIds.forEach(nodeId => {
                const node = this.state.getNode(nodeId);
                if (node && node.type === 'input_node') {
                    inputNodeAttempts++;
                } else {
                    const success = this.state.removeNode(nodeId);
                    if (success) deletedCount++;
                }
            });
            

            
        } else if (this.state.selectedAnnotation) {
            // delete selected text node (annotation)
            const annotationText = this.state.selectedAnnotation.text || 'text';
            this.state.removeAnnotation(this.state.selectedAnnotation.id);

            
        } else if (this.state.selectedLink) {
            this.state.removeLink(this.state.selectedLink.source, this.state.selectedLink.target);

            
        } else if (this.state.selectedGroup) {
            const groupName = this.state.selectedGroup.name;
            this.state.removeGroup(this.state.selectedGroup.id);

        }
    }

    handleEscape() {
        if (!this.shouldHandleShortcut({ key: 'Escape' })) return;

        // exit group select mode
        if (window.flowchartApp && window.flowchartApp.isGroupSelectMode) {
            window.flowchartApp.toggleGroupSelectMode();
            return; // don't clear selections when exiting group select mode
        }

        // cancel connection mode
        if (this.state.isConnecting) {
            this.state.setConnecting(false);
            this.state.emit('connectionCancelled');

        }
        
        // clear selections
        this.state.clearSelection();

    }

    handleGroupShortcut() {
        if (!this.shouldHandleShortcut({ key: 'g', ctrlKey: true })) return;

        if (this.state.selectedNodes.size >= 2) {
            const nodeIds = Array.from(this.state.selectedNodes);
            try {
                const group = this.state.createGroup(nodeIds);
            } catch (error) {
            }
        }
    }

    handleSelectAll() {
        if (!this.shouldHandleShortcut({ key: 'a', ctrlKey: true })) return;

        this.state.nodes.forEach(node => {
            this.state.selectedNodes.add(node.id);
        });
        
        this.state.selectedLink = null;
        this.state.selectedGroup = null;
        
        this.state.emit('selectionChanged', {
            nodes: Array.from(this.state.selectedNodes),
            link: null,
            group: null
        });
        

    }

    // canvas event handlers
    handleCanvasClick(event, coordinates) {
        // check if clicking on empty space
        const clickedNode = this.state.findNodeAtPosition(coordinates.x, coordinates.y);
        
        if (!clickedNode) {
            // if a group drag just completed, suppress this click to avoid unintended node creation
            if (this.state.suppressNextCanvasClick) {
                this.state.suppressNextCanvasClick = false;
                return;
            }
            // only allow node creation in build mode
            if (this.state.isBuildMode) {
                // clicked on empty space - add new node
                try {
                    const node = this.state.addNode({
                        x: coordinates.x,
                        y: coordinates.y
                    });
                } catch (error) {
                }
            }
            
            // clear selections
            this.state.clearSelection();
        }
    }

    handleNodeClick(event, node) {
        const isMultiSelect = event.shiftKey;
        
        try {
            this.state.selectNode(node.id, isMultiSelect);
            
            const selectedCount = this.state.selectedNodes.size;
        } catch (error) {
        }
    }

    handleLinkClick(event, link) {
        try {
            this.state.selectLink(link);
        } catch (error) {
        }
    }

    handleGroupClick(event, group) {
        try {
            this.state.selectGroup(group.id);
        } catch (error) {
        }
    }

    // drag event handlers
    handleDragStart(event, node) {
        this.state.setDragging(true, node);

    }

    handleDragEnd(event, node) {
        this.state.setDragging(false);

    }

    // connection event handlers
    handleConnectionStart(event, sourceNode) {
        this.state.setConnecting(true, sourceNode);

    }

    handleConnectionEnd(event, sourceNode, targetNode) {
        if (sourceNode && targetNode && sourceNode.id !== targetNode.id) {
            try {
                const link = this.state.addLink(sourceNode.id, targetNode.id);
            } catch (error) {
            }
        }
        
        this.state.setConnecting(false);
    }

    handleConnectionCancel() {
        this.state.setConnecting(false);

    }

    // context menu handlers
    handleContextMenu(event, item) {
        event.preventDefault();
        
        if (item.type === 'node') {
            this.state.selectNode(item.id, false);
            this.state.emit('showContextMenu', {
                x: event.pageX,
                y: event.pageY,
                type: 'node',
                item: item
            });
        }
    }

    // api event handlers
    handleApiAction(action, data = {}) {
        switch (action) {
            case 'build':
                this.handleBuildAction(data);
                break;
                
            case 'run':
                this.handleRunAction(data);
                break;
                
            default:
                break;
        }
    }

    async handleBuildAction(data) {
        try {
            const response = await fetch('/api/build', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });

            if (response.ok) {
                const result = await response.json();
            }
        } catch (error) {
        }
    }

    async handleRunAction(data) {
        try {
            const response = await fetch('/api/run', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });

            if (response.ok) {
                const result = await response.json();
            }
        } catch (error) {
        }
    }

    // cleanup
    destroy() {
        document.removeEventListener('keydown', this.handleKeyDown);
        document.removeEventListener('keyup', this.handleKeyUp);
    }
}

window.EventManager = EventManager;
})();