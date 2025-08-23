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
        
        // selection state (migrated from StateManager)
        this.selectedNodes = new Set();
        this.selectedLink = null;
        this.selectedGroup = null;
        this.selectedAnnotation = null;
    }

    handleNodeClick(event, node) {
        event.stopPropagation();
        
        // check if we're in group select mode
        const isGroupSelectMode = window.flowchartApp && window.flowchartApp.isGroupSelectMode;
        
        if (isGroupSelectMode) {
            // in group select mode, clicking toggles node selection
            if (this.selectedNodes.has(node.id)) {
                // deselect if already selected
                this.selectedNodes.delete(node.id);
            } else {
                // select if not selected
                this.selectedNodes.add(node.id);
            }
            
            // update ui
            this.state.emit('selectionChanged', {
                nodes: Array.from(this.selectedNodes),
                link: this.selectedLink,
                group: this.selectedGroup
            });
        } else {
            // normal selection behavior
            const isMultiSelect = event.shiftKey;
            
            try {
                this.selectNode(node.id, isMultiSelect);
                
                const selectedCount = this.getSelectedNodeCount();
                if (selectedCount === 1) {
                    this.state.emit('statusUpdate', `selected: ${node.name}`);
                } else {
                    this.state.emit('statusUpdate', `selected ${selectedCount} nodes`);
                }
            } catch (error) {
                this.state.emit('statusUpdate', `error selecting node: ${error.message}`);
            }
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
        
        try {
            this.selectLink(link);
            this.state.emit('statusUpdate', 'link selected - press delete to remove');
        } catch (error) {
            this.state.emit('statusUpdate', `error selecting link: ${error.message}`);
        }
        
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
        
        try {
            this.selectGroup(group.id);
            this.state.emit('statusUpdate', `selected group: ${group.name}`);
        } catch (error) {
            this.state.emit('statusUpdate', `error selecting group: ${error.message}`);
        }
        
        this.state.emit('updateSidebar');
    }

    handleCanvasClick(event, coordinates) {
        // if not holding shift, this will clear selection and add new node
        if (!event.shiftKey) {
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
                        const node = this.state.createNode.addNode({
                            x: coordinates.x,
                            y: coordinates.y
                        });
                        this.state.emit('statusUpdate', `added node: ${node.name}`);
                    } catch (error) {
                        this.state.emit('statusUpdate', `error adding node: ${error.message}`);
                    }
                }
                
                // clear selections
                this.safeClearSelection();
            }
            
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
            this.selectedNodes.clear();
        }
        
        selectedNodes.forEach(node => {
            this.selectedNodes.add(node.id);
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
        this.emitSelectionChange();
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
            this.selectedNodes.add(node.id);
        });
        
        this.selectedLink = null;
        this.selectedGroup = null;
        
        this.emitSelectionChange();
    }

    handleSelectAll() {
        // only handle shortcut when not focused on form fields
        const activeElement = document.activeElement;
        const inputElements = ['INPUT', 'TEXTAREA', 'SELECT'];
        
        if (inputElements.includes(activeElement.tagName)) {
            return; // don't handle shortcuts if user is typing in an input
        }
        
        this.selectAll();
        this.state.emit('statusUpdate', `selected all ${this.state.nodes.length} nodes`);
    }

    selectNone() {
        this.clearSelection();
        this.emitSelectionChange();
    }

    invertSelection() {
        const currentSelection = new Set(this.selectedNodes);
        this.selectedNodes.clear();
        
        this.state.nodes.forEach(node => {
            if (!currentSelection.has(node.id)) {
                this.selectedNodes.add(node.id);
            }
        });
        
        this.emitSelectionChange();
    }

    selectByType(nodeType) {
        this.selectedNodes.clear();
        
        this.state.nodes
            .filter(node => node.type === nodeType)
            .forEach(node => {
                this.selectedNodes.add(node.id);
            });
        
        this.emitSelectionChange();
    }

    selectConnectedNodes(startNodeId) {
        const visited = new Set();
        const toVisit = [startNodeId];
        
        while (toVisit.length > 0) {
            const nodeId = toVisit.pop();
            if (visited.has(nodeId)) continue;
            
            visited.add(nodeId);
            this.selectedNodes.add(nodeId);
            
            // find connected nodes
            this.state.links.forEach(link => {
                if (link.source === nodeId && !visited.has(link.target)) {
                    toVisit.push(link.target);
                } else if (link.target === nodeId && !visited.has(link.source)) {
                    toVisit.push(link.source);
                }
            });
        }
        
        this.emitSelectionChange();
    }

    // group selection
    selectGroupNodes(groupId) {
        const groupNodes = this.state.getGroupNodes(groupId);
        
        this.selectedNodes.clear();
        groupNodes.forEach(node => {
            this.selectedNodes.add(node.id);
        });
        
        this.selectedLink = null;
        this.selectedGroup = null;
        
        this.emitSelectionChange();
    }

    // migrated selection management methods
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
        this.selectedAnnotation = null;
        
        this.emitSelectionChange();
    }

    selectLink(link) {
        this.selectedNodes.clear();
        this.selectedLink = link;
        this.selectedGroup = null;
        this.selectedAnnotation = null;
        
        this.emitSelectionChange();
    }

    selectGroup(groupId) {
        this.selectedNodes.clear();
        this.selectedLink = null;
        this.selectedGroup = this.state.getGroup(groupId);
        this.selectedAnnotation = null;
        
        this.emitSelectionChange();
    }

    clearSelection() {
        this.selectedNodes.clear();
        this.selectedLink = null;
        this.selectedGroup = null;
        this.state.currentEditingNode = null;
        this.selectedAnnotation = null;
        
        this.emitSelectionChange();
    }

    selectAnnotation(annotationId) {
        this.selectedNodes.clear();
        this.selectedLink = null;
        this.selectedGroup = null;
        this.selectedAnnotation = this.state.annotations.find(a => a.id === annotationId) || null;
        this.emitSelectionChange();
    }

    getSelectedNodes() {
        return this.state.nodes.filter(n => this.selectedNodes.has(n.id));
    }

    // selection cleanup methods for use by StateManager
    removeNodeFromSelection(nodeId) {
        this.selectedNodes.delete(nodeId);
    }

    clearLinkSelection() {
        this.selectedLink = null;
    }

    clearGroupSelection(groupId) {
        if (this.selectedGroup && this.selectedGroup.id === groupId) {
            this.selectedGroup = null;
        }
    }

    getSelectedNodeCount() {
        return this.selectedNodes.size;
    }

    // Safe access methods for external use
    hasNodeSelection() {
        return this.selectedNodes.size > 0;
    }

    hasLinkSelection() {
        return this.selectedLink !== null;
    }

    hasGroupSelection() {
        return this.selectedGroup !== null;
    }

    hasAnnotationSelection() {
        return this.selectedAnnotation !== null;
    }

    hasAnySelection() {
        return this.hasNodeSelection() || this.hasLinkSelection() || 
               this.hasGroupSelection() || this.hasAnnotationSelection();
    }

    // Safe wrapper methods for external calls
    safeClearSelection() {
        this.clearSelection();
    }

    safeSelectNode(nodeId, multiSelect = false) {
        this.selectNode(nodeId, multiSelect);
    }

    safeSelectLink(link) {
        this.selectLink(link);
    }

    safeSelectGroup(groupId) {
        this.selectGroup(groupId);
    }

    // Batch selection operations
    selectMultipleNodes(nodeIds, clearExisting = true) {
        if (clearExisting) {
            this.selectedNodes.clear();
        }
        nodeIds.forEach(id => this.selectedNodes.add(id));
        this.emitSelectionChange();
    }

    // Selection state queries
    isNodeSelected(nodeId) {
        return this.selectedNodes.has(nodeId);
    }

    getSelectedNodeIds() {
        return Array.from(this.selectedNodes);
    }

    // Enhanced selection change emission
    emitSelectionChange() {
        this.state.emit('selectionChanged', {
            nodes: Array.from(this.selectedNodes),
            link: this.selectedLink,
            group: this.selectedGroup,
            annotation: this.selectedAnnotation
        });
        this.state.emit('updateNodeStyles');
        this.state.emit('updateLinkStyles');
        this.state.emit('updateSidebar');
    }

    // Selection state validation
    validateSelectionState() {
        // ensure selected nodes still exist
        const validNodeIds = new Set(this.state.nodes.map(n => n.id));
        const invalidNodeIds = Array.from(this.selectedNodes).filter(id => !validNodeIds.has(id));
        
        if (invalidNodeIds.length > 0) {
            console.warn('cleaning up invalid node selections:', invalidNodeIds);
            invalidNodeIds.forEach(id => this.selectedNodes.delete(id));
        }
        
        // ensure selected link still exists
        if (this.selectedLink) {
            const linkExists = this.state.links.some(l => 
                l.source === this.selectedLink.source && l.target === this.selectedLink.target
            );
            if (!linkExists) {
                console.warn('cleaning up invalid link selection');
                this.selectedLink = null;
            }
        }
        
        // ensure selected group still exists
        if (this.selectedGroup) {
            const groupExists = this.state.groups.some(g => g.id === this.selectedGroup.id);
            if (!groupExists) {
                console.warn('cleaning up invalid group selection');
                this.selectedGroup = null;
            }
        }
        
        // ensure selected annotation still exists
        if (this.selectedAnnotation) {
            const annotationExists = this.state.annotations.some(a => a.id === this.selectedAnnotation.id);
            if (!annotationExists) {
                console.warn('cleaning up invalid annotation selection');
                this.selectedAnnotation = null;
            }
        }
    }

    // Call validation when state changes
    onStateChanged() {
        this.validateSelectionState();
    }

    // selection rectangle methods (moved from FlowchartBuilder.js)
    showSelectionRect(rect) {
        // remove any existing selection rectangle
        if (window.flowchartApp && window.flowchartApp.zoomGroup) {
            window.flowchartApp.zoomGroup.select('.selection_rect').remove();
            
            // create new selection rectangle
            this.selectionRect = window.flowchartApp.zoomGroup.append('rect')
                .attr('class', 'selection_rect')
                .attr('x', Math.min(rect.startX, rect.endX))
                .attr('y', Math.min(rect.startY, rect.endY))
                .attr('width', Math.abs(rect.endX - rect.startX))
                .attr('height', Math.abs(rect.endY - rect.startY))
                .style('fill', 'rgba(74, 165, 245, 0.1)')
                .style('stroke', '#4aa5f5')
                .style('stroke-width', '1px')
                .style('stroke-dasharray', '5,5')
                .style('pointer-events', 'none');
        }
    }

    updateSelectionRect(rect) {
        if (this.selectionRect) {
            this.selectionRect
                .attr('x', Math.min(rect.startX, rect.endX))
                .attr('y', Math.min(rect.startY, rect.endY))
                .attr('width', Math.abs(rect.endX - rect.startX))
                .attr('height', Math.abs(rect.endY - rect.startY));
        }
    }

    hideSelectionRect() {
        if (this.selectionRect) {
            this.selectionRect.remove();
            this.selectionRect = null;
        }
    }

    // comprehensive deselect all method (moved from FlowchartBuilder.js)
    deselectAll() {
        // if group select mode is active, turn it off and enable pan tool
        if (window.flowchartApp && window.flowchartApp.isGroupSelectMode) {
            window.flowchartApp.isGroupSelectMode = false;
            
            // update group select button appearance
            const groupSelectButton = document.getElementById('group_select_btn');
            if (groupSelectButton) {
                groupSelectButton.classList.remove('active');
            }
            
            // hide any existing selection rectangle
            this.hideSelectionRect();
            
            // update cursor style
            const canvas = document.getElementById('flowchart_canvas');
            if (canvas) {
                canvas.style.cursor = '';
            }
            
            if (window.flowchartApp && window.flowchartApp.updateStatusBar) {
                window.flowchartApp.updateStatusBar('pan tool enabled');
            }
        }
        
        // clear all selections
        this.clearSelection();
        
        // update visual state
        if (window.flowchartApp && window.flowchartApp.nodeRenderer) {
            window.flowchartApp.nodeRenderer.updateNodeStyles();
        }
        if (window.flowchartApp && window.flowchartApp.linkRenderer) {
            window.flowchartApp.linkRenderer.updateLinkStyles();
        }
        
        // update properties sidebar depending on mode
        if (this.state.isRunMode) {
            // keep execution panel visible and show run-mode default (status + progress)
            this.showExecutionPanel();
            this.state.emit('updateSidebar');
            // when in run mode and nothing is selected, ensure global status reflects the last run outcome
            if (window.flowchartApp && window.flowchartApp.lastExecutionStatus) {
                const s = String(window.flowchartApp.lastExecutionStatus || 'idle');
                if (['completed', 'stopped', 'failed', 'error'].includes(s)) {
                    if (window.flowchartApp.executionStatus) {
                        window.flowchartApp.executionStatus.updateExecutionStatus(s, '');
                    }
                }
            }
        } else {
            if (window.flowchartApp && window.flowchartApp.sidebar) {
                window.flowchartApp.sidebar.showDefaultPanel();
            }
        }
        
        if (window.flowchartApp && window.flowchartApp.updateStatusBar) {
            window.flowchartApp.updateStatusBar('all selections cleared');
        }
    }

    // execution panel helper method
    showExecutionPanel() {
        // only show execution panel in run mode
        if (this.state.isRunMode) {
            // hide all other panels
            document.querySelectorAll('.properties_content').forEach(panel => {
                panel.classList.remove('active');
            });
            
            // show execution panel
            const executionPanel = document.getElementById('run_execution_properties');
            if (executionPanel) {
                executionPanel.classList.add('active');
            }

            // force sidebar to render default run view (status + progress only)
            this.clearSelection();
            this.state.emit('updateSidebar');
        }
    }

    hideExecutionPanel() {
        // hide execution panel
        const executionPanel = document.getElementById('run_execution_properties');
        if (executionPanel) {
            executionPanel.classList.remove('active');
        }
        
        // let sidebar handle showing the appropriate panel
        if (this.state.isBuildMode) {
            // trigger sidebar update to show correct panel for current selection
            this.state.emit('updateSidebar');
        }
    }
}

window.SelectionHandler = SelectionHandler;
})();