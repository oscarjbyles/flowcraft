// link state management
(function() {
    'use strict';
    if (window.LinkManager) { return; }

class LinkManager extends EventEmitter {
    constructor(nodeManager) {
        super();
        this.nodeManager = nodeManager;
        this.links = [];
        this.selectedLink = null;
        this.isConnecting = false;
        this.sourceNode = null;
    }

    // link crud operations
    addLink(sourceId, targetId, linkData = {}) {
        // check if link already exists
        const existingLink = this.findLink(sourceId, targetId);
        if (existingLink) {
            return existingLink;
        }

        const link = {
            source: sourceId,
            target: targetId,
            ...linkData
        };

        // validate link
        const validation = Validation.validateLink(link, this.nodeManager.nodes);
        if (!validation.isValid) {
            throw new Error(`invalid link: ${validation.errors.join(', ')}`);
        }

        this.links.push(link);
        this.emit('linkAdded', link);
        this.emit('stateChanged');
        
        return link;
    }

    updateLink(sourceId, targetId, updates) {
        const link = this.findLink(sourceId, targetId);
        if (!link) return false;

        Object.assign(link, updates);
        
        this.emit('linkUpdated', link);
        this.emit('stateChanged');
        
        return true;
    }

    removeLink(sourceId, targetId) {
        const index = this.links.findIndex(l => 
            l.source === sourceId && l.target === targetId
        );
        
        if (index === -1) return false;
        
        const link = this.links[index];
        
        // clear selection if this link was selected
        if (this.selectedLink && 
            this.selectedLink.source === sourceId && 
            this.selectedLink.target === targetId) {
            this.selectedLink = null;
        }
        
        this.links.splice(index, 1);
        
        this.emit('linkRemoved', link);
        this.emit('stateChanged');
        
        return true;
    }

    findLink(sourceId, targetId) {
        return this.links.find(l => 
            l.source === sourceId && l.target === targetId
        );
    }

    // selection management
    selectLink(link) {
        this.selectedLink = link;
        this.emit('linkSelected', link);
        this.emit('selectionChanged', {
            nodes: [],
            link: link,
            group: null
        });
    }

    clearLinkSelection() {
        this.selectedLink = null;
        this.emit('selectionCleared');
    }

    // connection management
    setConnecting(isConnecting, sourceNode = null) {
        this.isConnecting = isConnecting;
        this.sourceNode = sourceNode;
        this.emit('connectingStateChanged', { isConnecting, sourceNode });
    }

    // query methods
    getLinksForNode(nodeId) {
        return this.links.filter(l => 
            l.source === nodeId || l.target === nodeId
        );
    }

    getIncomingLinks(nodeId) {
        return this.links.filter(l => l.target === nodeId);
    }

    getOutgoingLinks(nodeId) {
        return this.links.filter(l => l.source === nodeId);
    }

    hasLink(sourceId, targetId) {
        return this.links.some(l => 
            l.source === sourceId && l.target === targetId
        );
    }

    // validation
    canConnect(sourceId, targetId) {
        if (sourceId === targetId) return false;
        if (this.hasLink(sourceId, targetId)) return false;
        
        const sourceNode = this.nodeManager.getNode(sourceId);
        const targetNode = this.nodeManager.getNode(targetId);
        
        if (!sourceNode || !targetNode) return false;
        
        // check node type constraints
        if (sourceNode.type === 'data_save') return false;
        if (targetNode.type === 'data_save' && sourceNode.type !== 'python_file') return false;
        
        return true;
    }

    // cleanup
    removeLinksForNode(nodeId) {
        this.links = this.links.filter(l => 
            l.source !== nodeId && l.target !== nodeId
        );
        this.emit('linksRemoved', { nodeId });
        this.emit('stateChanged');
    }

    removeLinksForNodes(nodeIds) {
        const nodeIdSet = new Set(nodeIds);
        this.links = this.links.filter(l => 
            !nodeIdSet.has(l.source) && !nodeIdSet.has(l.target)
        );
        this.emit('linksRemoved', { nodeIds });
        this.emit('stateChanged');
    }

    // serialization
    getSerializableLinks() {
        return [...this.links];
    }

    importLinks(links) {
        this.links = links || [];
        this.selectedLink = null;
        this.emit('linksImported');
        this.emit('stateChanged');
    }

    getStats() {
        return {
            linkCount: this.links.length,
            hasSelection: !!this.selectedLink
        };
    }
}

window.LinkManager = LinkManager;
})();
