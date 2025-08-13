// selection interaction handler
(function(){
    'use strict';
    if (window.SelectionHandler) { return; }

class SelectionHandler {
    constructor(stateManager, eventManager) {
        this.state = stateManager;
        this.events = eventManager;
        
        // selection rectangle for area selection
        this.selectionRect = null;
        this.isAreaSelecting = false;
        this.selectionStart = null;
    }

    handleNodeClick(event, node) {
        event.stopPropagation();
        
        // check if we're in group select mode
        const isGroupSelectMode = window.flowchartApp && window.flowchartApp.isGroupSelectMode;
        
        if (isGroupSelectMode) {
            // in group select mode, clicking toggles node selection
            if (this.state.selectedNodes.has(node.id)) {
                // deselect if already selected
                this.state.selectedNodes.delete(node.id);
            } else {
                // select if not selected
                this.state.selectedNodes.add(node.id);
            }
            
            // update ui
            this.state.emit('selectionChanged', {
                nodes: Array.from(this.state.selectedNodes),
                link: null,
                group: null
            });
        } else {
            // normal selection behavior
            const isMultiSelect = event.shiftKey;
            this.events.handleNodeClick(event, node);
        }
        
        // when in run mode, ensure the right sidebar is open on node click
        // (remove collapsed classes and sync the toggle button state)
        if (this.state && this.state.isRunMode) {
            try {
                if (window.flowchartApp && window.flowchartApp.sidebar && typeof window.flowchartApp.sidebar.setCollapsed === 'function') {
                    window.flowchartApp.sidebar.setCollapsed(false);
                } else if (this.state && this.state.emit) {
                    // fallback: remove classes directly if sidebar instance is not exposed yet
                    const propertiesSidebar = document.getElementById('properties_sidebar');
                    if (propertiesSidebar && propertiesSidebar.classList.contains('collapsed')) {
                        propertiesSidebar.classList.remove('collapsed');
                        const mainContent = document.querySelector('.main_content');
                        const runFeedBar = document.getElementById('run_feed_bar');
                        const startButtonContainer = document.getElementById('start_button_container');
                        const toggleSidebarBtn = document.getElementById('toggle_sidebar_btn');
                        if (mainContent) mainContent.classList.remove('sidebar_collapsed');
                        if (runFeedBar) runFeedBar.classList.remove('sidebar_collapsed');
                        if (startButtonContainer) startButtonContainer.classList.remove('sidebar_collapsed');
                        if (toggleSidebarBtn) {
                            toggleSidebarBtn.title = 'hide properties';
                            toggleSidebarBtn.innerHTML = '<span class="material-icons">chevron_right</span>';
                        }
                    }
                }
            } catch (_) {}
        }

        // emit selection update for ui
        this.state.emit('updateNodeStyles');
        this.state.emit('updateLinkStyles');
        this.state.emit('updateSidebar');
    }

    handleLinkClick(event, link) {
        event.stopPropagation();
        this.events.handleLinkClick(event, link);
        
        // when in run mode, ensure the right sidebar is open on link click (e.g., if→python circle)
        // all comments in lower case
        if (this.state && this.state.isRunMode) {
            try {
                if (window.flowchartApp && window.flowchartApp.sidebar && typeof window.flowchartApp.sidebar.setCollapsed === 'function') {
                    window.flowchartApp.sidebar.setCollapsed(false);
                } else {
                    const propertiesSidebar = document.getElementById('properties_sidebar');
                    if (propertiesSidebar && propertiesSidebar.classList.contains('collapsed')) {
                        propertiesSidebar.classList.remove('collapsed');
                        const mainContent = document.querySelector('.main_content');
                        const runFeedBar = document.getElementById('run_feed_bar');
                        const startButtonContainer = document.getElementById('start_button_container');
                        const toggleSidebarBtn = document.getElementById('toggle_sidebar_btn');
                        if (mainContent) mainContent.classList.remove('sidebar_collapsed');
                        if (runFeedBar) runFeedBar.classList.remove('sidebar_collapsed');
                        if (startButtonContainer) startButtonContainer.classList.remove('sidebar_collapsed');
                        if (toggleSidebarBtn) {
                            toggleSidebarBtn.title = 'hide properties';
                            toggleSidebarBtn.innerHTML = '<span class="material-icons">chevron_right</span>';
                        }
                    }
                }
            } catch(_) {}
        }

        // ensure any previously selected nodes are visually deselected when a link (including the if condition circle) is selected
        this.state.emit('updateNodeStyles');
        this.state.emit('updateLinkStyles');
        this.state.emit('updateSidebar');
    }

    handleGroupClick(event, group) {
        event.stopPropagation();
        this.events.handleGroupClick(event, group);
        
        this.state.emit('updateSidebar');
    }

    handleCanvasClick(event, coordinates) {
        // if not holding shift, this will clear selection and add new node
        if (!event.shiftKey) {
            this.events.handleCanvasClick(event, coordinates);
            this.state.emit('updateNodeStyles');
            this.state.emit('updateLinkStyles');
            this.state.emit('updateSidebar');
        }
    }

    // area selection with drag rectangle
    startAreaSelection(event, startCoordinates) {
        // allow area selection with shift key or when in group select mode
        const isGroupSelectMode = window.flowchartApp && window.flowchartApp.isGroupSelectMode;

        
        if (!event.shiftKey && !isGroupSelectMode) {

            return false;
        }
        

        this.isAreaSelecting = true;
        this.selectionStart = startCoordinates;
        
        // create selection rectangle
        this.selectionRect = {
            startX: startCoordinates.x,
            startY: startCoordinates.y,
            endX: startCoordinates.x,
            endY: startCoordinates.y
        };
        
        this.state.emit('showSelectionRect', this.selectionRect);
        return true;
    }

    updateAreaSelection(event, currentCoordinates) {
        if (!this.isAreaSelecting) return;
        
        this.selectionRect.endX = currentCoordinates.x;
        this.selectionRect.endY = currentCoordinates.y;
        
        this.state.emit('updateSelectionRect', this.selectionRect);
        
        // find nodes within selection rectangle
        const selectedNodes = this.getNodesInRectangle(this.selectionRect);
        
        // update selection preview
        this.state.emit('previewSelection', selectedNodes.map(n => n.id));
    }

    endAreaSelection(event) {
        if (!this.isAreaSelecting) return;
        
        // finalize selection
        const selectedNodes = this.getNodesInRectangle(this.selectionRect);
        
        if (!event.ctrlKey) {
            this.state.selectedNodes.clear();
        }
        
        selectedNodes.forEach(node => {
            this.state.selectedNodes.add(node.id);
        });
        
        // cleanup
        this.isAreaSelecting = false;
        this.selectionRect = null;
        this.selectionStart = null;
        
        // set flag to prevent immediate canvas click from clearing selection
        if (window.flowchartApp) {
            window.flowchartApp.justFinishedDragSelection = true;
            setTimeout(() => {
                window.flowchartApp.justFinishedDragSelection = false;
            }, 100); // clear flag after 100ms
        }
        
        this.state.emit('hideSelectionRect');
        this.state.emit('previewSelection', []); // clear preview
        this.state.emit('selectionChanged', {
            nodes: Array.from(this.state.selectedNodes),
            link: null,
            group: null
        });
        this.state.emit('updateNodeStyles');
        this.state.emit('updateSidebar');
    }

    getNodesInRectangle(rect) {
        const minX = Math.min(rect.startX, rect.endX);
        const maxX = Math.max(rect.startX, rect.endX);
        const minY = Math.min(rect.startY, rect.endY);
        const maxY = Math.max(rect.startY, rect.endY);
        

        
        return this.state.nodes.filter(node => {
            const nodeWidth = node.width || 120;
            const nodeHeight = 60;
            
            const nodeMinX = node.x - nodeWidth / 2;
            const nodeMaxX = node.x + nodeWidth / 2;
            const nodeMinY = node.y - nodeHeight / 2;
            const nodeMaxY = node.y + nodeHeight / 2;
            
            // check if node touches or overlaps with selection rectangle
            // a node is selected if any part of it intersects with the selection box
            const intersects = (nodeMaxX >= minX && nodeMinX <= maxX && nodeMaxY >= minY && nodeMinY <= maxY);
            

            
            return intersects;
        });
    }

    // selection utilities
    selectAll() {
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
        this.state.emit('updateNodeStyles');
        this.state.emit('updateSidebar');
    }

    selectNone() {
        this.state.clearSelection();
        this.state.emit('updateNodeStyles');
        this.state.emit('updateLinkStyles');
        this.state.emit('updateSidebar');
    }

    invertSelection() {
        const currentSelection = new Set(this.state.selectedNodes);
        this.state.selectedNodes.clear();
        
        this.state.nodes.forEach(node => {
            if (!currentSelection.has(node.id)) {
                this.state.selectedNodes.add(node.id);
            }
        });
        
        this.state.emit('selectionChanged', {
            nodes: Array.from(this.state.selectedNodes),
            link: null,
            group: null
        });
        this.state.emit('updateNodeStyles');
        this.state.emit('updateSidebar');
    }

    selectByType(nodeType) {
        this.state.selectedNodes.clear();
        
        this.state.nodes
            .filter(node => node.type === nodeType)
            .forEach(node => {
                this.state.selectedNodes.add(node.id);
            });
        
        this.state.emit('selectionChanged', {
            nodes: Array.from(this.state.selectedNodes),
            link: null,
            group: null
        });
        this.state.emit('updateNodeStyles');
        this.state.emit('updateSidebar');
    }

    selectConnectedNodes(startNodeId) {
        const visited = new Set();
        const toVisit = [startNodeId];
        
        while (toVisit.length > 0) {
            const nodeId = toVisit.pop();
            if (visited.has(nodeId)) continue;
            
            visited.add(nodeId);
            this.state.selectedNodes.add(nodeId);
            
            // find connected nodes
            this.state.links.forEach(link => {
                if (link.source === nodeId && !visited.has(link.target)) {
                    toVisit.push(link.target);
                } else if (link.target === nodeId && !visited.has(link.source)) {
                    toVisit.push(link.source);
                }
            });
        }
        
        this.state.emit('selectionChanged', {
            nodes: Array.from(this.state.selectedNodes),
            link: null,
            group: null
        });
        this.state.emit('updateNodeStyles');
        this.state.emit('updateSidebar');
    }

    // group selection
    selectGroupNodes(groupId) {
        const groupNodes = this.state.getGroupNodes(groupId);
        
        this.state.selectedNodes.clear();
        groupNodes.forEach(node => {
            this.state.selectedNodes.add(node.id);
        });
        
        this.state.selectedLink = null;
        this.state.selectedGroup = null;
        
        this.state.emit('selectionChanged', {
            nodes: Array.from(this.state.selectedNodes),
            link: null,
            group: null
        });
        this.state.emit('updateNodeStyles');
        this.state.emit('updateSidebar');
    }
}

window.SelectionHandler = SelectionHandler;
})();