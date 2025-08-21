// node state manager module - node visual state and animation
(function(){
    'use strict';
    if (window.NodeStateManager) { return; }

class NodeStateManager {
    constructor(flowchartBuilder) {
        this.builder = flowchartBuilder;
        this.state = flowchartBuilder.state;
    }

    // node state enum for better type safety and consistency
    static get NODE_STATES() {
        return {
            IDLE: 'idle',
            RUNNING: 'running', 
            COMPLETED: 'completed',
            ERROR: 'error',
            CANCELLED: 'cancelled',
            SUCCESS: 'success'
        };
    }

    setNodeState(nodeId, state) {
        // validate state against enum
        const validStates = Object.values(NodeStateManager.NODE_STATES);
        if (!validStates.includes(state)) {
            console.warn(`invalid node state: ${state}. valid states: ${validStates.join(', ')}`);
            return;
        }

        // find the node element and update its class
        const nodeElement = this.builder.nodeRenderer.nodeGroup
            .selectAll('.node-group')
            .filter(d => d.id === nodeId)
            .select('.node');
            
        // remove all state classes
        nodeElement.classed('running', false)
                  .classed('completed', false)
                  .classed('error', false);
        
        // add the new state class
        nodeElement.classed(state, true);
        
        // add/remove loading icon for running state
        const nodeGroup = this.builder.nodeRenderer.nodeGroup
            .selectAll('.node-group')
            .filter(d => d.id === nodeId);
            
        if (state === 'running') {
            // add loading icon
            nodeGroup.append('text')
                .attr('class', 'node_loading_icon material-icons')
                .attr('x', (d) => (d.width || 120) / 2 + 25)
                .attr('y', 5)
                .style('font-size', '16px')
                .style('fill', '#2196f3')
                .text('hourglass_empty');
        } else {
            // remove loading icon
            nodeGroup.select('.node_loading_icon').remove();
        }
    }

    addNodeLoadingAnimation(nodeId) {
        // add spinning loading animation around the node
        const nodeGroup = this.builder.nodeRenderer.nodeGroup
            .selectAll('.node-group')
            .filter(d => d.id === nodeId);
            
        // add loading circle around the node
        nodeGroup.append('circle')
            .attr('class', 'node_loading_circle')
            .attr('r', 45)
            .attr('cx', 0)
            .attr('cy', 0)
            .style('fill', 'none')
            .style('stroke', '#2196f3')
            .style('stroke-width', '3')
            .style('stroke-dasharray', '10,5')
            .style('animation', 'spin 1s linear infinite');
    }

    removeNodeLoadingAnimation(nodeId) {
        // remove the loading animation
        const nodeGroup = this.builder.nodeRenderer.nodeGroup
            .selectAll('.node-group')
            .filter(d => d.id === nodeId);
            
        nodeGroup.select('.node_loading_circle').remove();
    }

    // clear all visual colour state for nodes (classes, inline fills, and runtime flags)
    clearAllNodeColorState() {
        // clear state classes
        try {
            this.builder.nodeRenderer.nodeGroup.selectAll('.node')
                .classed('running', false)
                .classed('completed', false)
                .classed('error', false)
                // clear inline colours to allow base css/theme to apply
                .style('fill', null)
                .style('stroke', null)
                .style('stroke-width', null);
        } catch (_) {}

        // remove loading icons
        this.builder.nodeRenderer.nodeGroup.selectAll('.node_loading_icon').remove();

        // clear any runtimeStatus flags (e.g., data_save success/error)
        const nodes = Array.isArray(this.state.nodes) ? this.state.nodes : [];
        nodes.forEach(n => { if (n && n.runtimeStatus) delete n.runtimeStatus; });

        // refresh renderer to restore base styles for special node types
        if (this.builder.nodeRenderer) this.builder.nodeRenderer.updateNodeStyles();
    }
}

window.NodeStateManager = NodeStateManager;
})();
