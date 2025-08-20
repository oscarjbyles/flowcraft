// FlowchartBuilder Nodes Module
// Contains all node-related methods for the FlowchartBuilder class

(function() {
    'use strict';

    // Extend the FlowchartBuilder prototype with node methods
    const NodesModule = {

        // Node creation methods
        addNodeAtCenter() {
            const centerX = this.state.canvasWidth / 2;
            const centerY = this.state.canvasHeight / 2;

            // transform screen coordinates to world coordinates
            const worldCoords = this.state.transform.invert([centerX, centerY]);

            try {
                const node = this.state.addNode({
                    x: worldCoords[0],
                    y: worldCoords[1]
                });
                this.updateStatusBar(`added node: ${node.name}`);
            } catch (error) {
                this.updateStatusBar(`error adding node: ${error.message}`);
            }
        },

        addPythonNode() {
            const centerX = this.state.canvasWidth / 2;
            const centerY = this.state.canvasHeight / 2;

            // transform screen coordinates to world coordinates
            const worldCoords = this.state.transform.invert([centerX, centerY]);

            try {
                const node = this.state.addNode({
                    x: worldCoords[0],
                    y: worldCoords[1],
                    name: 'python node',
                    type: 'python_file'
                });
                this.updateStatusBar(`added python node: ${node.name}`);
            } catch (error) {
                this.updateStatusBar(`error adding python node: ${error.message}`);
            }
        },

        addIfNode() {
            const centerX = this.state.canvasWidth / 2;
            const centerY = this.state.canvasHeight / 2;

            // transform screen coordinates to world coordinates
            const worldCoords = this.state.transform.invert([centerX, centerY]);

            try {
                const node = this.state.addNode({
                    x: worldCoords[0],
                    y: worldCoords[1],
                    name: 'if condition',
                    type: 'if_node'
                });
                this.updateStatusBar(`added if node: ${node.name}`);
            } catch (error) {
                this.updateStatusBar(`error adding if node: ${error.message}`);
            }
        },

        addCallAiNode() {
            try {
                let position = { x: 200, y: 200 };
                try {
                    // center-ish default if helper not present
                    const canvas = document.getElementById('flowchart_canvas');
                    if (canvas && this.state && this.state.transform) {
                        const rect = canvas.getBoundingClientRect();
                        const cx = rect.left + rect.width * 0.5;
                        const cy = rect.top + rect.height * 0.35;
                        const world = this.state.transform.invert([cx, cy]);
                        position = { x: world[0], y: world[1] };
                    }
                } catch (_) {}
                const node = this.state.addNode({
                    x: position.x,
                    y: position.y,
                    name: 'ai node',
                    type: 'call_ai'
                });
                this.state.selectNode(node.id, false);
                this.updateStatusBar('added ai');
            } catch (error) {
                this.updateStatusBar('error adding ai');
            }
        },

        addTextAnnotation() {
            // only in build mode
            if (!this.state.isBuildMode) {
                this.updateStatusBar('text annotation only available in build mode');
                return;
            }
            const centerX = this.state.canvasWidth / 2;
            const centerY = this.state.canvasHeight / 2;
            const [wx, wy] = this.state.transform.invert([centerX, centerY]);
            try {
                const ann = this.state.addAnnotation({ x: wx, y: wy, text: 'text' });
                this.updateStatusBar('added text');
            } catch (e) {
                this.updateStatusBar('error adding text');
            }
        },

        addArrowAnnotation() {
            // only in build mode
            if (!this.state.isBuildMode) {
                this.updateStatusBar('arrow annotation only available in build mode');
                return;
            }
            const centerX = this.state.canvasWidth / 2;
            const centerY = this.state.canvasHeight / 2;
            const [wx, wy] = this.state.transform.invert([centerX, centerY]);
            try {
                const ann = this.state.addAnnotation({
                    x: wx,
                    y: wy,
                    type: 'arrow',
                    startX: wx - 50,
                    startY: wy,
                    endX: wx + 50,
                    endY: wy,
                    strokeWidth: 2,
                    strokeColor: 'var(--on-surface)'
                });
                this.updateStatusBar('added arrow');
            } catch (e) {
                this.updateStatusBar('error adding arrow');
            }
        },

        // Node editing methods
        editSelectedNode() {
            if (this.state.selectedNodes.size === 1) {
                const nodeId = Array.from(this.state.selectedNodes)[0];
                this.state.currentEditingNode = this.state.getNode(nodeId);
                this.sidebar.updateFromState();
            }
        },

        deleteSelectedNode() {
            const selectedNodes = Array.from(this.state.selectedNodes);
            let deletedCount = 0;
            let inputNodeAttempts = 0;

            selectedNodes.forEach(nodeId => {
                const node = this.state.getNode(nodeId);
                if (node && node.type === 'input_node') {
                    inputNodeAttempts++;
                } else {
                    const success = this.state.removeNode(nodeId);
                    if (success) deletedCount++;
                }
            });

            // provide appropriate feedback
            if (inputNodeAttempts > 0 && deletedCount === 0) {
                this.updateStatusBar('input nodes cannot be deleted directly');
            } else if (inputNodeAttempts > 0 && deletedCount > 0) {
                this.updateStatusBar(`deleted ${deletedCount} node(s) - input nodes cannot be deleted directly`);
            } else if (deletedCount > 0) {
                this.updateStatusBar(`deleted ${deletedCount} node(s)`);
            }
        },

        handleDeleteKey(event) {
            // prevent default behavior if we're in an input field
            if (event.target.tagName === 'INPUT' || event.target.tagName === 'TEXTAREA') {
                return;
            }

            event.preventDefault();

            // delete selected nodes
            if (this.state.selectedNodes.size > 0) {
                const selectedNodes = Array.from(this.state.selectedNodes);
                let deletedCount = 0;
                let inputNodeAttempts = 0;

                selectedNodes.forEach(nodeId => {
                    const node = this.state.getNode(nodeId);
                    if (node && node.type === 'input_node') {
                        inputNodeAttempts++;
                    } else {
                        const success = this.state.removeNode(nodeId);
                        if (success) deletedCount++;
                    }
                });

                // provide appropriate feedback
                if (inputNodeAttempts > 0 && deletedCount === 0) {
                    this.updateStatusBar('input nodes cannot be deleted directly');
                } else if (inputNodeAttempts > 0 && deletedCount > 0) {
                    this.updateStatusBar(`deleted ${deletedCount} node(s) - input nodes cannot be deleted directly`);
                } else if (deletedCount > 0) {
                    this.updateStatusBar(`deleted ${deletedCount} node(s)`);
                }
            }

            // delete selected link
            if (this.state.selectedLink) {
                this.state.removeLink(this.state.selectedLink.source, this.state.selectedLink.target);
                this.updateStatusBar('deleted link');
            }

            // delete selected group
            if (this.state.selectedGroup) {
                this.state.removeGroup(this.state.selectedGroup.id);
                this.updateStatusBar('deleted group');
            }
        },

        // Node state management
        setNodeState(nodeId, state) {
            // validate state against enum
            const validStates = Object.values(FlowchartBuilder.NODE_STATES);
            if (!validStates.includes(state)) {
                console.warn(`invalid node state: ${state}. valid states: ${validStates.join(', ')}`);
                return;
            }

            // find the node element and update its class
            const nodeElement = this.nodeRenderer.nodeGroup
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
            const nodeGroup = this.nodeRenderer.nodeGroup
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
        },

        resetNodeStates() {
            // reset all nodes to default state
            this.nodeRenderer.nodeGroup.selectAll('.node')
                .classed('running', false)
                .classed('completed', false)
                .classed('error', false);

            // remove all loading icons
            this.nodeRenderer.nodeGroup.selectAll('.node_loading_icon').remove();

            // clear any runtimeStatus flags on nodes (e.g., data_save success coloring)
            try {
                this.state.nodes.forEach(n => { if (n && n.runtimeStatus) delete n.runtimeStatus; });
                this.nodeRenderer && this.nodeRenderer.updateNodeStyles();
            } catch (_) {}
        },

        // clear all visual colour state for nodes (classes, inline fills, and runtime flags)
        clearAllNodeColorState() {
            // clear state classes
            try {
                this.nodeRenderer.nodeGroup.selectAll('.node')
                    .classed('running', false)
                    .classed('completed', false)
                    .classed('error', false)
                    // clear inline colours to allow base css/theme to apply
                    .style('fill', null)
                    .style('stroke', null)
                    .style('stroke-width', null);
            } catch (_) {}

            // remove loading icons
            this.nodeRenderer.nodeGroup.selectAll('.node_loading_icon').remove();

            // clear any runtimeStatus flags (e.g., data_save success/error)
            const nodes = Array.isArray(this.state.nodes) ? this.state.nodes : [];
            nodes.forEach(n => { if (n && n.runtimeStatus) delete n.runtimeStatus; });

            // refresh renderer to restore base styles for special node types
            if (this.nodeRenderer) this.nodeRenderer.updateNodeStyles();
        },

        // Node order visualization
        renderNodeOrder() {
            const order = this.calculateNodeOrder();

            // first, remove all existing order elements
            this.nodeRenderer.nodeGroup.selectAll('.node_order_circle, .node_order_text').remove();

            if (order.length === 0) {
                this.updateStatusBar('run view enabled - no connected nodes to execute');
                return;
            }

            // render order numbers only for nodes in the execution order
            this.nodeRenderer.nodeGroup.selectAll('.node-group').each(function(d) {
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

            this.updateStatusBar(`run view enabled - ${order.length} nodes in execution order`);
        },

        hideNodeOrder() {
            this.nodeRenderer.nodeGroup.selectAll('.node_order_circle, .node_order_text').remove();
        },

        // Error visualization
        renderErrorCircles() {
            // remove previous error indicators
            this.nodeRenderer.nodeGroup.selectAll('.error_circle, .error_text').remove();
            // draw an error marker for nodes in error state
            this.nodeRenderer.nodeGroup.selectAll('.node-group').each(function(d) {
                const group = d3.select(this);
                const rect = group.select('.node');
                const isErr = rect.classed('error');
                // also flag python nodes with no associated python file
                const isPythonMissingFile = d && d.type === 'python_file' && (!d.pythonFile || String(d.pythonFile).trim() === '');
                const shouldMark = isErr || isPythonMissingFile;
                if (!shouldMark) return;
                const width = d.width || 120;
                const height = Geometry.getNodeHeight(d);
                // place the badge left of the node and align its top with the node's top edge
                const topLeftX = -width / 2;
                const topLeftY = -height / 2;
                const offsetX = -18; // moved 4px further left
                const x = topLeftX + offsetX;
                const y = topLeftY + 12; // circle radius is 12, so top aligns with node top
                group.append('circle')
                    .attr('class', 'error_circle')
                    .attr('cx', x)
                    .attr('cy', y)
                    .attr('r', 12);
                group.append('text')
                    .attr('class', 'error_text')
                    .attr('x', x)
                    .attr('y', y)
                    .text('!');
            });
        },

        hideErrorCircles() {
            try {
                this.nodeRenderer.nodeGroup.selectAll('.error_circle, .error_text').remove();
                // also remove link coverage alerts when hiding error view
                if (this.linkRenderer && this.linkRenderer.linkGroup) {
                    this.linkRenderer.linkGroup.selectAll('.link-coverage-alert').remove();
                }
            } catch (e) {
                console.warn('[error_view] hideErrorCircles error', e);
            }
        },

        // View toggles
        toggleFlowView() {
            // allow flow view toggle in both build and run modes
            this.state.setFlowView(!this.state.isFlowView);
            if (this.state.isFlowView) {
                this.renderNodeOrder();
                this.updateStatusBar('flow view enabled - showing execution order');
            } else {
                this.hideNodeOrder();
                this.updateStatusBar('flow view disabled');
            }
        },

        toggleErrorView() {
            // allow error view toggle in both build and run modes
            const next = !this.state.isErrorView;
            this.state.setErrorView(next);
            if (this.state.isErrorView) {
                this.renderErrorCircles();
                // also show coverage alerts if any
                if (this.nodeRenderer && this.nodeRenderer.updateCoverageAlerts) {
                    this.nodeRenderer.updateCoverageAlerts();
                } else {
                    console.warn('[error_view] nodeRenderer.updateCoverageAlerts unavailable');
                }
                // recompute link coverage now that error view is enabled
                if (this.linkRenderer && this.linkRenderer.computeLinkCoverageFromAnalysis) {
                    this.linkRenderer.computeLinkCoverageFromAnalysis();
                    this.linkRenderer.updateLinkCoverageAlerts();
                }
                this.updateStatusBar('error view enabled - showing errors');
            } else {
                this.hideErrorCircles();
                // ensure legacy coverage alerts are removed while disabled
                if (this.nodeRenderer && this.nodeRenderer.updateCoverageAlerts) {
                    this.nodeRenderer.updateCoverageAlerts();
                } else {
                    console.warn('[error_view] nodeRenderer.updateCoverageAlerts unavailable');
                }
                this.updateStatusBar('error view disabled');
            }
        }

    };

    // Apply the nodes methods to FlowchartBuilder prototype
    Object.assign(FlowchartBuilder.prototype, NodesModule);

})();
