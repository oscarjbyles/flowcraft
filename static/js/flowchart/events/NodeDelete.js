// delete node and annotation functionality
(function() {
    'use strict';
    if (window.DeleteNode) { return; }

class DeleteNode {
    constructor(stateManager) {
        this.state = stateManager;
    }

    // core node deletion logic moved from CreateNode.js
    removeNode(nodeId, force = false) {
        const nodeIndex = this.state.nodes.findIndex(n => n.id === nodeId);
        if (nodeIndex === -1) return false;

        const node = this.state.nodes[nodeIndex];
        
        // prevent deletion of input nodes unless forced (for cascading deletion)
        if (node.type === 'input_node' && !force) {
            this.state.emit('inputNodeDeletionAttempted', node);
            return false;
        }
        
        // if deleting a python node, also delete its associated input nodes
        if (node.type === 'python_file') {
            const associatedInputNodes = this.state.nodes.filter(n => 
                n.type === 'input_node' && n.targetNodeId === nodeId
            );
            
            // force delete associated input nodes
            associatedInputNodes.forEach(inputNode => {
                this.removeNode(inputNode.id, true);
            });
        }
        
        // remove associated links
        this.state.links = this.state.links.filter(l => l.source !== nodeId && l.target !== nodeId);
        
        // remove from selection - delegate to SelectionHandler
        if (this.state.selectionHandler) {
            this.state.selectionHandler.removeNodeFromSelection(nodeId);
        }
        
        // remove from groups
        this.state.groups.forEach(group => {
            const nodeIdIndex = group.nodeIds.indexOf(nodeId);
            if (nodeIdIndex > -1) {
                group.nodeIds.splice(nodeIdIndex, 1);
            }
        });

        // remove empty groups
        this.state.groups = this.state.groups.filter(g => g.nodeIds.length > 1);
        
        this.state.nodes.splice(nodeIndex, 1);
        
        this.state.emit('nodeRemoved', node);
        this.state.emit('stateChanged');
        if (this.state.saving) this.state.saving.scheduleAutosave();
        
        return true;
    }

    // node deletion functionality - now calls internal removeNode
    deleteNode(nodeId, force = false) {
        return this.removeNode(nodeId, force);
    }

    // delete selected nodes with proper feedback moved from EventManager.js
    deleteSelectedNodes() {
        if (!this.state.selectionHandler || this.state.selectionHandler.selectedNodes.size === 0) return false;

        // check if we're in run mode - nodes cannot be deleted in run mode
        if (this.state.currentMode === 'run') {
            this.state.emit('statusUpdate', 'cannot delete nodes in run mode');
            return false;
        }
        
        const nodeIds = Array.from(this.state.selectionHandler.selectedNodes);
        let deletedCount = 0;
        let inputNodeAttempts = 0;
        
        nodeIds.forEach(nodeId => {
            const node = this.state.nodes.find(n => n.id === nodeId);
            if (node && node.type === 'input_node') {
                inputNodeAttempts++;
            } else {
                const success = this.removeNode(nodeId);
                if (success) deletedCount++;
            }
        });
        
        // provide appropriate feedback
        if (inputNodeAttempts > 0 && deletedCount === 0) {
            this.state.emit('statusUpdate', 'input nodes cannot be deleted directly');
        } else if (inputNodeAttempts > 0 && deletedCount > 0) {
            this.state.emit('statusUpdate', `deleted ${deletedCount} node(s) - input nodes cannot be deleted directly`);
        } else if (deletedCount > 0) {
            this.state.emit('statusUpdate', `deleted ${deletedCount} node(s)`);
        }
        
        return deletedCount > 0;
    }

    // delete selected node (single node)
    deleteSelectedNode() {
        const selectedNodes = this.state.selectionHandler ? this.state.selectionHandler.getSelectedNodes() : [];
        if (selectedNodes.length > 0) {
            return this.deleteSelectedNodes();
        }
        return false;
    }

    // delete link
    deleteLink(sourceId, targetId) {
        const linkIndex = this.state.links.findIndex(l => 
            (l.source === sourceId && l.target === targetId) ||
            (l.source === targetId && l.target === sourceId)
        );
        
        if (linkIndex === -1) return false;

        const link = this.state.links[linkIndex];
        this.state.links.splice(linkIndex, 1);
        
        // clear link selection - delegate to SelectionHandler
        if (this.state.selectionHandler) {
            this.state.selectionHandler.clearLinkSelection();
        }

        this.state.emit('linkRemoved', link);
        this.state.emit('stateChanged');
        if (this.state.saving) this.state.saving.scheduleAutosave();
        
        return true;
    }

    // delete selected link
    deleteSelectedLink() {
        if (this.state.selectionHandler && this.state.selectionHandler.selectedLink) {
            const success = this.deleteLink(this.state.selectionHandler.selectedLink.source, this.state.selectionHandler.selectedLink.target);
            if (success) {
                this.state.emit('statusUpdate', 'link deleted');
            }
            return success;
        }
        return false;
    }

    // delete group
    deleteGroup(groupId) {
        const groupIndex = this.state.groups.findIndex(g => g.id === groupId);
        if (groupIndex === -1) return false;

        const group = this.state.groups[groupIndex];
        
        // remove group id from nodes
        this.state.nodes.forEach(node => {
            if (node.groupId === groupId) {
                node.groupId = null;
            }
        });

        this.state.groups.splice(groupIndex, 1);
        
        // clear group selection - delegate to SelectionHandler
        if (this.state.selectionHandler) {
            this.state.selectionHandler.clearGroupSelection(groupId);
        }

        this.state.emit('groupRemoved', group);
        this.state.emit('stateChanged');
        if (this.state.saving) this.state.saving.scheduleAutosave();
        
        return true;
    }

    // delete selected group
    deleteSelectedGroup() {
        if (this.state.selectionHandler && this.state.selectionHandler.selectedGroup) {
            const groupName = this.state.selectionHandler.selectedGroup.name;
            const success = this.deleteGroup(this.state.selectionHandler.selectedGroup.id);
            if (success) {
                this.state.emit('statusUpdate', `group "${groupName}" deleted`);
            }
            return success;
        }
        return false;
    }

    // annotation deletion functionality moved from StateManager
    removeAnnotation(annotationId) {
        const idx = this.state.annotations.findIndex(a => a.id === annotationId);
        if (idx === -1) return false;
        const ann = this.state.annotations[idx];
        this.state.annotations.splice(idx, 1);
        this.state.emit('annotationRemoved', ann);
        this.state.emit('stateChanged');
        if (this.state.saving) this.state.saving.scheduleAutosave();
        return true;
    }

    // delete selected annotation
    deleteSelectedAnnotation() {
        if (this.state.selectionHandler && this.state.selectionHandler.selectedAnnotation) {
            const annotationText = this.state.selectionHandler.selectedAnnotation.text || 'text';
            const success = this.removeAnnotation(this.state.selectionHandler.selectedAnnotation.id);
            if (success) {
                this.state.emit('statusUpdate', `deleted text: ${annotationText}`);
            }
            return success;
        }
        return false;
    }

    // handle delete key press - consolidated from EventManager.js
    handleDelete() {
        if (this.state.selectionHandler && this.state.selectionHandler.selectedNodes.size > 0) {
            return this.deleteSelectedNodes();
        } else if (this.state.selectionHandler && this.state.selectionHandler.selectedAnnotation) {
            return this.deleteSelectedAnnotation();
        } else if (this.state.selectionHandler && this.state.selectionHandler.selectedLink) {
            return this.deleteSelectedLink();
        } else if (this.state.selectionHandler && this.state.selectionHandler.selectedGroup) {
            return this.deleteSelectedGroup();
        }
        return false;
    }

    // delete node from sidebar context
    deleteNodeFromSidebar(nodeId) {
        const node = this.state.nodes.find(n => n.id === nodeId);
        if (!node) return false;

        const success = this.removeNode(nodeId);
        if (success) {
            this.state.emit('statusUpdate', `deleted node: ${node.name}`);
        }
        return success;
    }

    // delete multiple nodes from sidebar context
    deleteNodesFromSidebar(nodeIds) {
        let deletedCount = 0;
        let inputNodeAttempts = 0;
        
        nodeIds.forEach(nodeId => {
            const node = this.state.nodes.find(n => n.id === nodeId);
            if (node && node.type === 'input_node') {
                inputNodeAttempts++;
            } else {
                const success = this.removeNode(nodeId);
                if (success) deletedCount++;
            }
        });
        
        // provide appropriate feedback
        if (inputNodeAttempts > 0 && deletedCount === 0) {
            this.state.emit('statusUpdate', 'input nodes cannot be deleted directly');
        } else if (inputNodeAttempts > 0 && deletedCount > 0) {
            this.state.emit('statusUpdate', `deleted ${deletedCount} node(s) - input nodes cannot be deleted directly`);
        } else if (deletedCount > 0) {
            this.state.emit('statusUpdate', `deleted ${deletedCount} node(s)`);
        }
        
        return deletedCount > 0;
    }
}

window.DeleteNode = DeleteNode;
})();
