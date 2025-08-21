// node order calculation module
(function(){
    'use strict';
    if (window.NodeOrder) { return; }

class NodeOrder {
    /**
     * calculate the execution order of nodes in a flowchart
     * @param {Array} nodes - array of node objects
     * @param {Array} links - array of link objects  
     * @param {Array} groups - array of group objects
     * @returns {Array} ordered array of nodes for execution
     */
    static calculateNodeOrder(nodes, links, groups) {
        // step 1: identify connected nodes only (nodes that are part of execution flow)
        // first filter out input nodes and data_save nodes and their connections
        const nonInputNodes = nodes.filter(node => node.type !== 'input_node' && node.type !== 'data_save');
        const nonInputLinks = links.filter(link => {
            const sourceNode = nodes.find(n => n.id === link.source);
            const targetNode = nodes.find(n => n.id === link.target);
            // exclude links that involve input nodes or data_save nodes or input connections
            return sourceNode?.type !== 'input_node' && 
                   targetNode?.type !== 'input_node' &&
                   sourceNode?.type !== 'data_save' &&
                   targetNode?.type !== 'data_save' &&
                   link.type !== 'input_connection';
        });
        
        const connectedNodeIds = new Set();
        nonInputLinks.forEach(link => {
            connectedNodeIds.add(link.source);
            connectedNodeIds.add(link.target);
        });
        
        // filter to only connected nodes (already excluding input nodes)
        const connectedNodes = nonInputNodes.filter(node => 
            connectedNodeIds.has(node.id)
        );
        
        if (connectedNodes.length === 0) {
            return []; // no connected nodes, no execution order
        }
        
        // step 2: build dependency graph
        const incomingLinks = new Map(); // node -> list of source nodes
        const outgoingLinks = new Map(); // node -> list of target nodes
        
        // initialize maps
        connectedNodes.forEach(node => {
            incomingLinks.set(node.id, []);
            outgoingLinks.set(node.id, []);
        });
        
        // populate dependency relationships using filtered links
        nonInputLinks.forEach(link => {
            if (connectedNodeIds.has(link.source) && connectedNodeIds.has(link.target)) {
                incomingLinks.get(link.target).push(link.source);
                outgoingLinks.get(link.source).push(link.target);
            }
        });
        
        // step 3: group nodes by their group membership
        const nodeToGroup = new Map(); // nodeId -> group
        const groupToNodes = new Map(); // groupId -> Set of nodeIds
        
        // initialize group mappings
        connectedNodes.forEach(node => {
            if (node.groupId) {
                nodeToGroup.set(node.id, node.groupId);
                if (!groupToNodes.has(node.groupId)) {
                    groupToNodes.set(node.groupId, new Set());
                }
                groupToNodes.get(node.groupId).add(node.id);
            }
        });
        
        // step 4: find execution order using group-aware topological sort
        const result = [];
        const processed = new Set();
        const processing = new Set();
        
        // helper function to check if all dependencies are satisfied
        const canExecute = (nodeId) => {
            const dependencies = incomingLinks.get(nodeId) || [];
            return dependencies.every(depId => processed.has(depId));
        };
        
        // helper function to get ready nodes (all dependencies satisfied)
        const getReadyNodes = () => {
            return connectedNodes.filter(node => 
                !processed.has(node.id) && 
                !processing.has(node.id) && 
                canExecute(node.id)
            );
        };
        
        // helper function to check if all nodes in a group are ready
        const isGroupReady = (groupId) => {
            const groupNodeIds = groupToNodes.get(groupId);
            if (!groupNodeIds) return false;
            
            const groupNodes = connectedNodes.filter(node => groupNodeIds.has(node.id));
            return groupNodes.every(node => 
                !processed.has(node.id) && 
                !processing.has(node.id) && 
                canExecute(node.id)
            );
        };
        
        // helper function to get all nodes in a group that are ready
        const getReadyNodesInGroup = (groupId) => {
            const groupNodeIds = groupToNodes.get(groupId);
            if (!groupNodeIds) return [];
            
            return connectedNodes.filter(node => 
                groupNodeIds.has(node.id) &&
                !processed.has(node.id) && 
                !processing.has(node.id) && 
                canExecute(node.id)
            );
        };
        
        // step 5: process nodes in group-aware execution order
        while (processed.size < connectedNodes.length) {
            const readyNodes = getReadyNodes();
            
            if (readyNodes.length === 0) {
                // this shouldn't happen in a valid dag, but handle it gracefully
                console.warn('circular dependency detected or disconnected components');
                break;
            }
            
            // prioritize nodes that belong to groups that are ready to be processed
            const readyGroups = new Set();
            readyNodes.forEach(node => {
                if (node.groupId && isGroupReady(node.groupId)) {
                    readyGroups.add(node.groupId);
                }
            });
            
            let nodesToProcess = [];
            
            if (readyGroups.size > 0) {
                // process entire groups that are ready
                readyGroups.forEach(groupId => {
                    const groupReadyNodes = getReadyNodesInGroup(groupId);
                    nodesToProcess.push(...groupReadyNodes);
                });
            } else {
                // fallback to original logic for ungrouped nodes or when no groups are ready
                // sort ready nodes by y-position (top to bottom) then x-position (left to right)
                readyNodes.sort((a, b) => {
                    if (Math.abs(a.y - b.y) < 10) { // if roughly same height
                        return a.x - b.x; // sort left to right
                    }
                    return a.y - b.y; // sort top to bottom
                });
                
                // process the topmost ready node(s)
                const currentY = readyNodes[0].y;
                const currentLevelNodes = readyNodes.filter(node => 
                    Math.abs(node.y - currentY) < 10 // nodes at roughly same level
                );
                nodesToProcess = currentLevelNodes;
            }
            
            // add nodes to result in left-to-right order within their group or level
            nodesToProcess.sort((a, b) => a.x - b.x);
            nodesToProcess.forEach(node => {
                processing.add(node.id);
                result.push(node);
                processed.add(node.id);
                processing.delete(node.id);
            });
        }
        
        return result;
    }

    /**
     * render node order numbers on the flowchart canvas
     * @param {Object} nodeRenderer - the node renderer instance
     * @param {Function} updateStatusBar - function to update status bar
     * @param {Array} nodes - array of node objects
     * @param {Array} links - array of link objects
     * @param {Array} groups - array of group objects
     */
    static renderNodeOrder(nodeRenderer, updateStatusBar, nodes, links, groups) {
        const order = NodeOrder.calculateNodeOrder(nodes, links, groups);
        
        // first, remove all existing order elements
        nodeRenderer.nodeGroup.selectAll('.node_order_circle, .node_order_text').remove();
        
        if (order.length === 0) {
            updateStatusBar('run view enabled - no connected nodes to execute');
            return;
        }
        
        // render order numbers only for nodes in the execution order
        nodeRenderer.nodeGroup.selectAll('.node-group').each(function(d) {
            const nodeGroup = d3.select(this);
            
            // find this node's position in the execution order
            const orderIndex = order.findIndex(node => node.id === d.id);
            
            // only show numbers for nodes that are part of the execution flow
            if (orderIndex !== -1) {
                // determine node width based on type
                let nodeWidth = 120; // default width
                if (d.type === 'input_node') {
                    // fixed width for input nodes
                    nodeWidth = d.width || 300;
                } else if (d.width) {
                    nodeWidth = d.width;
                }
                
                // add circle background (no border, orange, radius 12)
                nodeGroup.append('circle')
                    .attr('class', 'node_order_circle')
                    .attr('cx', nodeWidth / 2 + 18)
                    .attr('cy', -18) // moved down slightly for spacing
                    .attr('r', 12)
                    .style('fill', '#ff9800')
                    .style('stroke', 'none')
                    .style('stroke-width', '0');
                
                // add order number text
                nodeGroup.append('text')
                    .attr('class', 'node_order_text')
                    .attr('x', nodeWidth / 2 + 18)
                    .attr('y', -18)
                    .attr('text-anchor', 'middle')
                    .attr('dominant-baseline', 'central')
                    .style('fill', '#000000')
                    .style('font-size', '12px')
                    .style('font-weight', 'bold')
                    .style('pointer-events', 'none')
                    .text(orderIndex + 1);
            }
        });
        
        updateStatusBar(`run view enabled - ${order.length} nodes in execution order`);
    }

    /**
     * hide node order numbers from the flowchart canvas
     * @param {Object} nodeRenderer - the node renderer instance
     */
    static hideNodeOrder(nodeRenderer) {
        nodeRenderer.nodeGroup.selectAll('.node_order_circle, .node_order_text').remove();
    }
}

window.NodeOrder = NodeOrder;
})();
