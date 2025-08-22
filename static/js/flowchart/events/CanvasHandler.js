// canvas interaction handler
(function(){
    'use strict';
    if (window.CanvasHandler) { return; }

class CanvasHandler {
    constructor(stateManager, selectionHandler, connectionHandler, createNode) {
        this.state = stateManager;
        this.selectionHandler = selectionHandler;
        this.connectionHandler = connectionHandler;
        this.createNode = createNode;
        this.svg = null;
        this.zoomGroup = null;
    }

    setupCanvasInteractions(svg, zoomGroup) {
        this.svg = svg;
        this.zoomGroup = zoomGroup;

        // canvas mouse down handler for group selection and annotation deselect
        this.svg.on('mousedown', (event) => {
            // check if clicking on empty canvas area (not on nodes, links, etc.)
            const clickedOnCanvas = event.target === this.svg.node() || 
                                  event.target.tagName === 'g' || 
                                  event.target.id === 'zoom_group';
            
            if (clickedOnCanvas && this.isGroupSelectMode()) {
                const coordinates = d3.pointer(event, this.zoomGroup.node());
                const started = this.selectionHandler.startAreaSelection(event, { x: coordinates[0], y: coordinates[1] });
                if (started) {
                    event.preventDefault();
                    event.stopPropagation();
                }
            }
            // clear annotation selection when clicking empty canvas
            if (clickedOnCanvas && this.state.selectionHandler.hasAnnotationSelection()) {
                this.state.selectionHandler.safeClearSelection();
            }
        });

        // canvas click handler
        this.svg.on('click', (event) => {
            if (event.target === this.svg.node()) {
                const coordinates = d3.pointer(event, this.zoomGroup.node());
                
                // in group select mode, only clear selection on intentional clicks (not after drag)
                if (this.isGroupSelectMode()) {
                    // only clear if this wasn't part of a drag operation
                    if (!this.selectionHandler.isAreaSelecting && !this.justFinishedDragSelection()) {
                                            if (!event.ctrlKey && !event.shiftKey) {
                        this.selectionHandler.safeClearSelection();
                    }
                    }
                } else {
                    // if a drag operation or annotation drag just occurred, suppress node creation
                    if (this.state.suppressNextCanvasClick) {
                        this.state.suppressNextCanvasClick = false;
                        return;
                    }
                    this.createNode.addNodeAtCenter(coordinates);
                }
            }
        });

        // canvas context menu
        this.svg.on('contextmenu', (event) => {
            event.preventDefault();
            this.hideContextMenu();
        });

        // canvas mouse move for connection dragging and group selection
        this.svg.on('mousemove', (event) => {
            if (this.state.connectionHandler.isConnecting) {
                const coordinates = d3.pointer(event, this.zoomGroup.node());
                this.connectionHandler.updateConnection(event, { x: coordinates[0], y: coordinates[1] });
            } else if (this.isGroupSelectMode() && this.selectionHandler.isAreaSelecting) {
                const coordinates = d3.pointer(event, this.zoomGroup.node());
                this.selectionHandler.updateAreaSelection(event, { x: coordinates[0], y: coordinates[1] });
            }
        });

        // canvas mouse up for connection ending and group selection
        this.svg.on('mouseup', (event) => {
            if (this.state.connectionHandler.isConnecting) {
                const coordinates = d3.pointer(event, this.zoomGroup.node());
                this.connectionHandler.endConnection(event, null, { x: coordinates[0], y: coordinates[1] });
            } else if (this.isGroupSelectMode() && this.selectionHandler.isAreaSelecting) {
                this.selectionHandler.endAreaSelection(event);
            }
        });
    }

    setupContextMenu() {
        this.contextMenu = document.getElementById('context_menu');
        
        // context menu handlers
        document.getElementById('edit_node').addEventListener('click', () => {
            this.events.editSelectedNode();
            this.events.hideContextMenu();
        });
        
        document.getElementById('delete_node').addEventListener('click', () => {
            this.events.state.deleteNode.deleteSelectedNodes();
            this.events.hideContextMenu();
        });

        // hide context menu on click elsewhere
        document.addEventListener('click', () => this.events.hideContextMenu());

        // context menu display handler
        this.state.on('showContextMenu', (data) => {
            this.events.showContextMenu(data.x, data.y, data.item);
        });
    }

    setupWindowEvents(events) {
        this.events = events;
        
        // window resize
        window.addEventListener('resize', () => this.handleResize());
        
        // prevent default drag behavior on images/links
        document.addEventListener('dragstart', (e) => e.preventDefault());
        
        // keyboard delete functionality
        document.addEventListener('keydown', (event) => {
            if (event.key === 'Delete' || event.key === 'Backspace') {
                this.events.handleDeleteKey(event);
            }
        });
    }



    handleResize() {
        // delegate to FlowchartBuilder for canvas dimension updates
        if (window.flowchartApp && typeof window.flowchartApp.handleResize === 'function') {
            window.flowchartApp.handleResize();
        }
    }

    isGroupSelectMode() {
        return window.flowchartApp && window.flowchartApp.isGroupSelectMode;
    }

    justFinishedDragSelection() {
        return window.flowchartApp && window.flowchartApp.justFinishedDragSelection;
    }

    // cleanup
    destroy() {
        if (this.svg) {
            this.svg.on('mousedown', null);
            this.svg.on('click', null);
            this.svg.on('contextmenu', null);
            this.svg.on('mousemove', null);
            this.svg.on('mouseup', null);
        }
        document.removeEventListener('keydown', this.handleKeyDown);
        document.removeEventListener('dragstart', this.handleDragStart);
        window.removeEventListener('resize', this.handleResize);
    }
}

window.CanvasHandler = CanvasHandler;
})();
