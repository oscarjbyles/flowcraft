// group state management
(function() {
    'use strict';
    if (window.GroupManager) { return; }

class GroupManager extends EventEmitter {
    constructor(nodeManager) {
        super();
        this.nodeManager = nodeManager;
        this.groups = [];
        this.groupCounter = 0;
        this.selectedGroup = null;
    }

    // group crud operations
    createGroup(nodeIds, groupData = {}) {
        if (!Array.isArray(nodeIds) || nodeIds.length < 2) {
            throw new Error('group must contain at least 2 nodes');
        }

        const group = {
            id: Date.now() + Math.random(),
            name: groupData.name || `group ${++this.groupCounter}`,
            nodeIds: [...nodeIds],
            color: groupData.color || this.generateGroupColor(),
            ...groupData
        };

        // validate group
        const validation = Validation.validateGroup(group, this.nodeManager.nodes);
        if (!validation.isValid) {
            throw new Error(`invalid group: ${validation.errors.join(', ')}`);
        }

        // update nodes to reference group
        nodeIds.forEach(nodeId => {
            const node = this.nodeManager.getNode(nodeId);
            if (node) {
                node.groupId = group.id;
            }
        });

        this.groups.push(group);
        this.emit('groupCreated', group);
        this.emit('stateChanged');
        
        return group;
    }

    updateGroup(groupId, updates) {
        const group = this.getGroup(groupId);
        if (!group) return false;

        // if nodeIds are being updated, update node references
        if (updates.nodeIds) {
            // clear old references
            group.nodeIds.forEach(nodeId => {
                const node = this.nodeManager.getNode(nodeId);
                if (node && node.groupId === groupId) {
                    node.groupId = null;
                }
            });
            
            // set new references
            updates.nodeIds.forEach(nodeId => {
                const node = this.nodeManager.getNode(nodeId);
                if (node) {
                    node.groupId = groupId;
                }
            });
        }

        Object.assign(group, updates);
        
        // validate updated group
        const validation = Validation.validateGroup(group, this.nodeManager.nodes);
        if (!validation.isValid) {
            throw new Error(`invalid group update: ${validation.errors.join(', ')}`);
        }

        this.emit('groupUpdated', group);
        this.emit('stateChanged');
        
        return true;
    }

    removeGroup(groupId) {
        const index = this.groups.findIndex(g => g.id === groupId);
        if (index === -1) return false;
        
        const group = this.groups[index];
        
        // clear group references from nodes
        group.nodeIds.forEach(nodeId => {
            const node = this.nodeManager.getNode(nodeId);
            if (node && node.groupId === groupId) {
                node.groupId = null;
            }
        });
        
        // clear selection if this group was selected
        if (this.selectedGroup && this.selectedGroup.id === groupId) {
            this.selectedGroup = null;
        }
        
        this.groups.splice(index, 1);
        
        this.emit('groupRemoved', group);
        this.emit('stateChanged');
        
        return true;
    }

    getGroup(groupId) {
        return this.groups.find(g => g.id === groupId);
    }

    // selection management
    selectGroup(groupId) {
        const group = this.getGroup(groupId);
        if (group) {
            this.selectedGroup = group;
            this.emit('groupSelected', group);
            this.emit('selectionChanged', {
                nodes: [],
                link: null,
                group: group
            });
        }
    }

    clearGroupSelection() {
        this.selectedGroup = null;
        this.emit('selectionCleared');
    }

    // node management
    addNodeToGroup(nodeId, groupId) {
        const group = this.getGroup(groupId);
        const node = this.nodeManager.getNode(nodeId);
        
        if (!group || !node) return false;
        
        if (!group.nodeIds.includes(nodeId)) {
            group.nodeIds.push(nodeId);
            node.groupId = groupId;
            this.emit('nodeAddedToGroup', { nodeId, groupId });
            this.emit('stateChanged');
        }
        
        return true;
    }

    removeNodeFromGroup(nodeId, groupId) {
        const group = this.getGroup(groupId);
        const node = this.nodeManager.getNode(nodeId);
        
        if (!group || !node) return false;
        
        const index = group.nodeIds.indexOf(nodeId);
        if (index > -1) {
            group.nodeIds.splice(index, 1);
            if (node.groupId === groupId) {
                node.groupId = null;
            }
            
            // remove group if it has less than 2 nodes
            if (group.nodeIds.length < 2) {
                this.removeGroup(groupId);
            } else {
                this.emit('nodeRemovedFromGroup', { nodeId, groupId });
                this.emit('stateChanged');
            }
        }
        
        return true;
    }

    // utility methods
    generateGroupColor() {
        const colors = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7', '#DDA0DD', '#98D8C8'];
        return colors[this.groupCounter % colors.length];
    }

    getGroupBounds(groupId) {
        const group = this.getGroup(groupId);
        if (!group) return null;
        
        const nodes = group.nodeIds.map(id => this.nodeManager.getNode(id)).filter(Boolean);
        return Geometry.calculateGroupBounds(nodes);
    }

    // serialization
    getSerializableGroups() {
        return [...this.groups];
    }

    importGroups(groups) {
        this.groups = groups || [];
        this.groupCounter = this.groups.length;
        this.selectedGroup = null;
        this.emit('groupsImported');
        this.emit('stateChanged');
    }

    getStats() {
        return {
            groupCount: this.groups.length,
            hasSelection: !!this.selectedGroup,
            totalNodesInGroups: this.groups.reduce((sum, g) => sum + g.nodeIds.length, 0)
        };
    }
}

window.GroupManager = GroupManager;
})();
