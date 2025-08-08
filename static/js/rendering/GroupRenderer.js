// group rendering and visual management
class GroupRenderer {
    constructor(stateManager, container) {
        this.state = stateManager;
        this.container = container;
        
        // create group container (should be behind nodes)
        this.groupsGroup = this.container.append('g').attr('class', 'groups');
        
        // setup event listeners
        this.setupEventListeners();
    }

    setupEventListeners() {
        this.state.on('groupCreated', (group) => this.handleGroupCreated(group));
        this.state.on('groupUpdated', (group) => this.updateSingleGroup(group));
        this.state.on('groupRemoved', (group) => this.removeSingleGroup(group));
        this.state.on('updateGroupBounds', (groupId) => this.updateGroupBounds(groupId));
        this.state.on('nodeUpdated', () => this.updateAllGroupBounds());
        this.state.on('stateChanged', () => this.render());
        this.state.on('selectionChanged', () => this.updateGroupStyles());
    }

    render() {
        const groupSelection = this.groupsGroup
            .selectAll('.group-container')
            .data(this.state.groups, d => d.id);

        // enter new groups
        const groupEnter = this.createGroupElements(groupSelection.enter());
        
        // update existing groups
        const groupMerge = groupEnter.merge(groupSelection);
        this.updateGroupElements(groupMerge);
        
        // remove old groups
        groupSelection.exit().remove();
        
        // update group styles
        this.updateGroupStyles();
    }

    createGroupElements(enterSelection) {
        const groupEnter = enterSelection
            .append('g')
            .attr('class', 'group-container');

        // add group background rectangle
        groupEnter.append('rect')
            .attr('class', 'group_container')
            .attr('rx', 12);

        // add group label
        groupEnter.append('text')
            .attr('class', 'group_label')
            .attr('dy', '-8px');

        // add resize handles (optional)
        this.addResizeHandles(groupEnter);
        
        // setup group interactions
        this.setupGroupInteractions(groupEnter);
        
        return groupEnter;
    }

    addResizeHandles(groupEnter) {
        const handleSize = 8;
        const handles = [
            { position: 'nw', cursor: 'nw-resize' },
            { position: 'ne', cursor: 'ne-resize' },
            { position: 'sw', cursor: 'sw-resize' },
            { position: 'se', cursor: 'se-resize' }
        ];

        const handleGroup = groupEnter.append('g')
            .attr('class', 'resize-handles')
            .style('opacity', 0);

        handles.forEach(handle => {
            handleGroup.append('rect')
                .attr('class', `resize-handle resize-handle-${handle.position}`)
                .attr('width', handleSize)
                .attr('height', handleSize)
                .style('cursor', handle.cursor)
                .style('fill', 'var(--primary-color)')
                .style('stroke', 'var(--on-primary)')
                .style('stroke-width', 1);
        });
    }

    updateGroupElements(groupMerge) {
        groupMerge.each((d, i, nodes) => {
            const groupElement = d3.select(nodes[i]);
            const groupNodes = this.state.getGroupNodes(d.id);
            
            if (groupNodes.length === 0) return;

            // calculate group bounds
            const bounds = Geometry.calculateGroupBounds(groupNodes);
            const padding = 20;

            // update rectangle
            groupElement.select('.group_container')
                .attr('x', bounds.minX - padding)
                .attr('y', bounds.minY - padding)
                .attr('width', bounds.width + 2 * padding)
                .attr('height', bounds.height + 2 * padding);

            // update label
            groupElement.select('.group_label')
                .attr('x', bounds.minX - padding + 8)
                .attr('y', bounds.minY - padding)
                .text(d.name);

            // update resize handles
            this.updateResizeHandles(groupElement, bounds, padding);
        });
    }

    updateResizeHandles(groupElement, bounds, padding) {
        const handleSize = 8;
        const handleOffset = handleSize / 2;
        
        const handlePositions = {
            'nw': { x: bounds.minX - padding - handleOffset, y: bounds.minY - padding - handleOffset },
            'ne': { x: bounds.minX + bounds.width + padding - handleOffset, y: bounds.minY - padding - handleOffset },
            'sw': { x: bounds.minX - padding - handleOffset, y: bounds.minY + bounds.height + padding - handleOffset },
            'se': { x: bounds.minX + bounds.width + padding - handleOffset, y: bounds.minY + bounds.height + padding - handleOffset }
        };

        Object.keys(handlePositions).forEach(position => {
            const pos = handlePositions[position];
            groupElement.select(`.resize-handle-${position}`)
                .attr('x', pos.x)
                .attr('y', pos.y);
        });
    }

    handleGroupCreated(group) {
        // the render method will handle creating the group element
        // we just need to trigger animation after a short delay to ensure the element exists
        setTimeout(() => {
            this.animateGroupCreation(group.id);
        }, 50);
    }

    updateSingleGroup(group) {
        const groupElement = this.groupsGroup
            .selectAll('.group-container')
            .filter(d => d.id === group.id);

        this.updateGroupElements(groupElement);
        this.updateGroupStyles(); // update styles after group update
    }

    removeSingleGroup(group) {
        this.animateGroupRemoval(group.id, () => {
            this.groupsGroup
                .selectAll('.group-container')
                .filter(d => d.id === group.id)
                .remove();
        });
    }

    updateGroupBounds(groupId) {
        const groupElement = this.groupsGroup
            .selectAll('.group-container')
            .filter(d => d.id === groupId);

        this.updateGroupElements(groupElement);
    }

    updateAllGroupBounds() {
        const groupElements = this.groupsGroup
            .selectAll('.group-container');

        this.updateGroupElements(groupElements);
    }

    updateGroupStyles() {
        // update visual styles based on selection state
        this.groupsGroup.selectAll('.group-container').each((d, i, nodes) => {
            const groupElement = d3.select(nodes[i]);
            const isSelected = this.state.selectedGroup && this.state.selectedGroup.id === d.id;
            
            // update container styles using CSS classes
            groupElement.select('.group_container')
                .classed('selected', isSelected);
            
            // update label styles using CSS classes
            groupElement.select('.group_label')
                .classed('selected', isSelected);
        });
    }

    // group interactions
    setupGroupInteractions(groupElement) {
        groupElement
            .on('click', (event, d) => {
                event.stopPropagation();
                this.state.selectGroup(d.id);
            })
            .on('mouseenter', (event, d) => {
                this.showResizeHandles(d.id);
                this.highlightGroupNodes(d.id, true);
            })
            .on('mouseleave', (event, d) => {
                this.hideResizeHandles(d.id);
                this.highlightGroupNodes(d.id, false);
            });
    }

    showResizeHandles(groupId) {
        this.groupsGroup
            .selectAll('.group-container')
            .filter(d => d.id === groupId)
            .select('.resize-handles')
            .transition()
            .duration(200)
            .style('opacity', 1);
    }

    hideResizeHandles(groupId) {
        this.groupsGroup
            .selectAll('.group-container')
            .filter(d => d.id === groupId)
            .select('.resize-handles')
            .transition()
            .duration(200)
            .style('opacity', 0);
    }

    highlightGroupNodes(groupId, highlight) {
        const groupNodes = this.state.getGroupNodes(groupId);
        groupNodes.forEach(node => {
            this.state.emit('highlightNode', { nodeId: node.id, highlight });
        });
    }

    // group animations
    animateGroupCreation(groupId) {
        const groupElement = this.groupsGroup
            .selectAll('.group-container')
            .filter(d => d.id === groupId);

        groupElement
            .style('opacity', 0)
            .transition()
            .duration(400)
            .style('opacity', 1);

        groupElement.select('.group_container')
            .attr('stroke-dasharray', '8,4')
            .attr('stroke-dashoffset', 0)
            .transition()
            .duration(800)
            .attr('stroke-dashoffset', -12);
    }

    animateGroupRemoval(groupId, callback) {
        const groupElement = this.groupsGroup
            .selectAll('.group-container')
            .filter(d => d.id === groupId);

        groupElement
            .transition()
            .duration(300)
            .style('opacity', 0)
            .on('end', callback);
    }

    // group theming
    setGroupTheme(groupId, theme) {
        const groupElement = this.groupsGroup
            .selectAll('.group-container')
            .filter(d => d.id === groupId);

        const container = groupElement.select('.group_container');
        const label = groupElement.select('.group_label');

        switch (theme) {
            case 'error':
                container.style('stroke', '#f44336');
                label.style('fill', '#f44336');
                break;
            case 'warning':
                container.style('stroke', '#ff9800');
                label.style('fill', '#ff9800');
                break;
            case 'success':
                container.style('stroke', '#4caf50');
                label.style('fill', '#4caf50');
                break;
            case 'active':
                container.style('stroke', '#2196f3');
                label.style('fill', '#2196f3');
                break;
            default:
                container.style('stroke', null);
                label.style('fill', null);
        }
    }

    // group operations
    expandGroup(groupId, factor = 1.2) {
        const group = this.state.getGroup(groupId);
        if (!group) return;

        const groupNodes = this.state.getGroupNodes(groupId);
        const bounds = Geometry.calculateGroupBounds(groupNodes);
        
        const centerX = bounds.centerX;
        const centerY = bounds.centerY;

        groupNodes.forEach(node => {
            const dx = node.x - centerX;
            const dy = node.y - centerY;
            
            node.x = centerX + dx * factor;
            node.y = centerY + dy * factor;
        });

        this.state.emit('stateChanged');
    }

    contractGroup(groupId, factor = 0.8) {
        this.expandGroup(groupId, factor);
    }

    // group layout algorithms
    arrangeGroupInCircle(groupId, radius = 100) {
        const groupNodes = this.state.getGroupNodes(groupId);
        if (groupNodes.length === 0) return;

        const bounds = Geometry.calculateGroupBounds(groupNodes);
        const centerX = bounds.centerX;
        const centerY = bounds.centerY;

        const angleStep = (2 * Math.PI) / groupNodes.length;

        groupNodes.forEach((node, index) => {
            const angle = index * angleStep;
            node.x = centerX + radius * Math.cos(angle);
            node.y = centerY + radius * Math.sin(angle);
        });

        this.state.emit('stateChanged');
    }

    arrangeGroupInGrid(groupId, spacing = 150) {
        const groupNodes = this.state.getGroupNodes(groupId);
        Geometry.arrangeNodesInGrid(groupNodes, spacing);
        this.state.emit('stateChanged');
    }

    // utility methods
    getGroupBounds(groupId) {
        const groupNodes = this.state.getGroupNodes(groupId);
        return Geometry.calculateGroupBounds(groupNodes);
    }

    isGroupVisible(groupId) {
        const groupElement = this.groupsGroup
            .selectAll('.group-container')
            .filter(d => d.id === groupId);

        return !groupElement.empty();
    }

    // group statistics
    getGroupStats() {
        return {
            totalGroups: this.state.groups.length,
            averageGroupSize: this.state.groups.length > 0 
                ? this.state.groups.reduce((sum, g) => sum + g.nodeIds.length, 0) / this.state.groups.length 
                : 0,
            largestGroup: this.state.groups.length > 0 
                ? Math.max(...this.state.groups.map(g => g.nodeIds.length)) 
                : 0
        };
    }

    // cleanup
    destroy() {
        this.groupsGroup.remove();
    }
}

window.GroupRenderer = GroupRenderer;