// node rendering and visual management
(function(){
    'use strict';
    if (window.NodeRenderer) { return; }

class NodeRenderer {
    constructor(stateManager, container, createNode) {
        this.state = stateManager;
        this.container = container;
        this.createNode = createNode;
        
        // create node group
        this.nodeGroup = this.container.append('g').attr('class', 'nodes');
        // create snap preview layer above nodes but below links rendered later
        this.snapPreviewLayer = this.container.append('g').attr('class', 'snap_preview_layer');
        
        // setup event listeners
        this.setupEventListeners();
    }

    updateCoverageAlerts(data = null) {
        // data: { sourceNodeId, hasMissing }
        // hide coverage alerts unless error view is enabled
        try {
            if (!this.state.isErrorView) {
        
                this.nodeGroup.selectAll('.coverage_alert').remove();
                return;
            }
        } catch (e) {
            console.warn('[error_view] updateCoverageAlerts guard failed', e);
        }
        const alertClass = 'coverage_alert';
        if (data && typeof data.sourceNodeId !== 'undefined') {
            const nodeSel = this.nodeGroup.selectAll('.node-group').filter(d => d.id === data.sourceNodeId);
            if (nodeSel.empty()) return;
            const g = nodeSel;
            const existing = g.selectAll(`.${alertClass}`);
            if (data.hasMissing) {
                // create or update alert circle with '!'
                let alert = existing;
                if (alert.empty()) {
                    alert = g.append('g').attr('class', alertClass).style('pointer-events', 'none');
                    alert.append('circle').attr('r', 12).style('fill', '#f44336').style('stroke', '#ffffff').style('stroke-width', 2);
                    alert.append('text').attr('class', 'alert_mark').attr('dy', '0.35em').attr('text-anchor', 'middle').text('!')
                        .style('font-weight', '700').style('fill', '#ffffff').style('font-size', '14px');
                }
                // position to the left of the top-left corner of node rect
                g.each((d, i, nodes) => {
                    const width = d.width || 120;
                    const height = Geometry.getNodeHeight(d);
                    const topLeftX = -width / 2;
                    const topLeftY = -height / 2;
                    const offsetX = -14; // a bit left outside
                    const offsetY = -14; // a bit above
                    g.select(`.${alertClass}`).attr('transform', `translate(${topLeftX + offsetX}, ${topLeftY + offsetY})`);
                });
            } else {
                existing.remove();
            }
            return;
        }

        // general pass: keep alerts aligned after layout/resize
        const groups = this.nodeGroup.selectAll(`.node-group`).filter(d => !d || d.type !== 'input_node');
        groups.each((d, i, nodes) => {
            const g = d3.select(nodes[i]);
            const alert = g.selectAll(`.${alertClass}`);
            if (alert.empty()) return;
            const width = d.width || 120;
            const height = Geometry.getNodeHeight(d);
            const topLeftX = -width / 2;
            const topLeftY = -height / 2;
            const offsetX = -14;
            const offsetY = -14;
            alert.attr('transform', `translate(${topLeftX + offsetX}, ${topLeftY + offsetY})`);
        });
    }

    setupEventListeners() {
        this.state.on('nodeAdded', (node) => this.renderSingleNode(node));
        this.state.on('nodeUpdated', (node) => this.updateSingleNode(node));
        this.state.on('nodeRemoved', (node) => this.removeSingleNode(node));
        this.state.on('updateNodeStyles', () => this.updateNodeStyles());
        this.state.on('previewSelection', (nodeIds) => this.previewSelection(nodeIds));
        this.state.on('updateNodePosition', (data) => this.updateNodePosition(data));
        this.state.on('addNodeClass', (data) => this.addNodeClass(data));
        this.state.on('removeNodeClass', (data) => this.removeNodeClass(data));
        this.state.on('stateChanged', () => this.render());
        // custom event to update coverage alerts
        this.state.on('updateCoverageAlerts', (data) => this.updateCoverageAlerts(data));
        // snap preview events
        this.state.on('updateSnapPreview', (data) => this.updateSnapPreview(data));
        this.state.on('clearSnapPreview', () => this.clearSnapPreview());
    }

    render() {
        const nodeSelection = this.nodeGroup
            .selectAll('.node-group')
            .data(this.state.nodes, d => d.id);

        // enter new nodes
        const nodeEnter = this.createNodeElements(nodeSelection.enter());
        
        // update existing nodes
        const nodeMerge = nodeEnter.merge(nodeSelection);
        this.updateNodeElements(nodeMerge);
        
        // remove old nodes
        nodeSelection.exit().remove();
        
        this.updateNodeStyles();
        // apply any pending coverage alerts
        this.updateCoverageAlerts();
    }

    // snap preview management
    updateSnapPreview(data) {
        // data: { x, y, width, height }
        if (!data || typeof data.x !== 'number' || typeof data.y !== 'number') return;
        const width = Math.max(40, data.width || 120);
        const height = Math.max(20, data.height || 60);
        // ensure a single preview group exists
        let g = this.snapPreviewLayer.selectAll('.snap_preview').data([0]);
        const gEnter = g.enter().append('g').attr('class', 'snap_preview');
        g = gEnter.merge(g);
        g.attr('transform', `translate(${data.x},${data.y})`);
        // rectangle outline centered at (x,y)
        let rect = g.selectAll('.snap_preview_rect').data([0]);
        const rectEnter = rect.enter().append('rect').attr('class', 'snap_preview_rect');
        rect = rectEnter.merge(rect);
        rect
            .attr('x', -width / 2)
            .attr('y', -height / 2)
            .attr('width', width)
            .attr('height', height)
            .attr('rx', 8)
            .style('fill', 'none')
            .style('stroke', 'var(--primary-color, #1976d2)')
            .style('stroke-width', '2px')
            .style('stroke-dasharray', '6,4')
            .style('opacity', 0.35)
            .style('pointer-events', 'none');
        // add a subtle top-corner rounding indicator above python node bottom
        let topArc = g.selectAll('.snap_preview_top_arc').data([0]);
        const topArcEnter = topArc.enter().append('line').attr('class', 'snap_preview_top_arc');
        topArc = topArcEnter.merge(topArc);
        // short horizontal line across the top edge of the preview for extra visibility on dark backgrounds
        topArc
            .attr('x1', -width / 2 + 8)
            .attr('y1', -height / 2)
            .attr('x2', width / 2 - 8)
            .attr('y2', -height / 2)
            .style('stroke', 'var(--primary-color, #1976d2)')
            .style('stroke-width', '1.5px')
            .style('opacity', 0.35)
            .style('pointer-events', 'none');
        // keep preview above nodes and links
        this.snapPreviewLayer.raise();
    }

    clearSnapPreview() {
        this.snapPreviewLayer.selectAll('.snap_preview').remove();
    }

    createNodeElements(enterSelection) {
        const self = this;
        const nodeEnter = enterSelection
            .append('g')
            .attr('class', 'node-group')
            .attr('transform', d => `translate(${d.x},${d.y})`);

        // handle each node individually to check its type
        nodeEnter.each(function(d) {
            const currentSelection = d3.select(this);
            
            // check if this is an input node
            if (d.type === 'input_node') {
                self.createInputNodeElements(currentSelection);
            } else {
                self.createRegularNodeElements(currentSelection);
            }
        });
        
        return nodeEnter;
    }
    
    createRegularNodeElements(nodeEnter) {
        // calculate height for this node
        const d = nodeEnter.datum();
        const nodeHeight = Geometry.getNodeHeight(d);
        
        // add base shape: rectangle for most nodes; capsule for data_save
        let baseShape;
        if (d.type === 'data_save') {
            const width = d.width || Geometry.getDataSaveNodeWidth(d.name || 'data save');
            baseShape = nodeEnter.append('rect')
                .attr('class', 'node data_save_node')
                .attr('height', nodeHeight)
                .attr('y', -nodeHeight/2)
                .attr('width', width)
                .attr('x', -width/2)
                .attr('rx', nodeHeight/2)
                .style('fill', 'rgb(62, 32, 0)');
        } else {
            baseShape = nodeEnter.append('rect')
                .attr('class', 'node')
                .attr('height', nodeHeight)
                .attr('y', -nodeHeight/2)
                .attr('rx', 8);
        }

        // add special styling for if nodes
        baseShape.each(function(d) {
            if (d.type === 'if_node') {
                d3.select(this)
                    // set dark cyan background for if nodes (dark mode)
                    .style('fill', '#091516')
                    .style('stroke-dasharray', '5,5')
                    .style('stroke-width', '2');
            } else if (d.type === 'call_ai') {
                // custom styling for call_ai: same radius, double 1px border, background #031c40
                const rect = d3.select(this);
                rect.style('fill', '#031c40');
                rect.style('stroke', '#031c40');
                rect.style('stroke-width', '1');
                // add inner stroke inset by 3px (gap visible), matching radius reduced by 3
                const width = d.width || Geometry.getNodeWidth(d.name || 'ai node');
                const height = Geometry.getNodeHeight(d);
                const inset = 3;
                nodeEnter.append('rect')
                    .attr('class', 'node call_ai_inner')
                    .attr('x', -width/2 + inset)
                    .attr('y', -height/2 + inset)
                    .attr('width', width - inset * 2)
                    .attr('height', height - inset * 2)
                    .attr('rx', Math.max(0, 8 - inset))
                    .style('fill', 'none')
                    .style('pointer-events', 'none')
                    .style('stroke', '#123a70')
                    .style('stroke-width', '1');
            } else if (d.type === 'data_save') {
                // keep orange fill and solid stroke for data_save
                d3.select(this)
                    .style('fill', 'rgb(62, 32, 0)')
                    .style('stroke-width', '2');
            }
        });

        // add text
        nodeEnter.append('text')
            .attr('class', 'node_text')
            .attr('dy', '0.15em')
            .text(d => d.name);

        // add connection dots (skip for data_save nodes so they don't show on hover)
        if (d.type !== 'data_save') {
            this.addConnectionDots(nodeEnter);
        }

        // add play button for run mode (initially hidden) - skip for data_save nodes
        if (d.type !== 'data_save') {
            this.addPlayButton(nodeEnter);
        }
        
        // add refresh button for input nodes (initially hidden)
        this.addRefreshButton(nodeEnter);

        // add pen button between refresh and play (initially hidden)
        this.addPenButton(nodeEnter);
    }
    
    createInputNodeElements(nodeEnter) {
        const d = nodeEnter.datum();
        const parameters = d.parameters || [];
        const rowHeight = 40;
        const padding = 20; // top and bottom padding
        const nodeHeight = Geometry.getNodeHeight(d);

        // fixed layout for input nodes
        const fixedWidth = 300;
        const leftPadding = 12;
        const rightPadding = 12;
        const inputWidth = fixedWidth * 0.5; // 50% of node width
        const inputX = fixedWidth / 2 - rightPadding - inputWidth; // right-align the input inside the node

        // update node width to fixed value
        d.width = fixedWidth;

        // add main rectangle with fixed width
        nodeEnter.append('rect')
            .attr('class', 'node input_node')
            .attr('width', fixedWidth)
            .attr('x', -fixedWidth/2)
            .attr('height', nodeHeight)
            .attr('y', -nodeHeight/2)
            .attr('rx', 8)
            // set dark purple background for input nodes (dark mode)
            .style('fill', '#170d1d');

        // create input rows pinned to the left edge of the node
        const inputGroup = nodeEnter.append('g')
            .attr('class', 'input_rows')
            .attr('transform', `translate(0, 0)`);

        parameters.forEach((param, index) => {
            const rowY = -nodeHeight/2 + padding/2 + (index * rowHeight) + rowHeight/2;

            // parameter row group
            const rowGroup = inputGroup.append('g')
                .attr('class', 'input_row')
                .attr('transform', `translate(0, ${rowY})`);

            // parameter name label pinned to left edge
            rowGroup.append('text')
                .attr('class', 'input_param_label')
                .attr('x', -fixedWidth/2 + leftPadding)
                .attr('y', 0)
                .attr('dy', '.35em')
                .attr('text-anchor', 'start')
                .text(param);

            // input field background at 50% width, right-aligned inside the node
            rowGroup.append('rect')
                .attr('class', 'input_field_bg')
                .attr('x', inputX)
                .attr('y', -12)
                .attr('width', inputWidth)
                .attr('height', 24)
                .attr('rx', 4)
                .style('cursor', 'text')
                .on('click', (event) => {
                    event.stopPropagation();
                    this.handleInputFieldClick(d, param, rowGroup);
                });

            // input field text (will be updated when user types)
            rowGroup.append('text')
                .attr('class', 'input_field_text')
                .attr('x', inputX + 5)
                .attr('y', 0)
                .attr('dy', '.35em')
                .text(d.inputValues[param] || '');
        });

        // add connection dots (only right side for output)
        this.addInputNodeConnectionDots(nodeEnter, nodeHeight);
    }
    
    addInputNodeConnectionDots(nodeEnter, nodeHeight) {
        // only add right side connection dot for input nodes
        nodeEnter.append('circle')
            .attr('class', 'connection_dot')
            .attr('r', 6)
            .attr('cx', d => (d.width || 120) / 2)
            .attr('cy', 0)
            .attr('data-side', 'right')
            .style('cursor', 'crosshair');
    }

    addConnectionDots(nodeEnter) {
        const d = nodeEnter.datum();
        const nodeHeight = Geometry.getNodeHeight(d);
        
        const dotData = [
            { side: 'top', x: 0, y: -nodeHeight/2 },
            { side: 'right', x: 0, y: 0 }, // will be updated based on width
            { side: 'bottom', x: 0, y: nodeHeight/2 },
            { side: 'left', x: 0, y: 0 }   // will be updated based on width
        ];

        dotData.forEach((dotInfo) => {
            nodeEnter.append('circle')
                .attr('class', 'connection_dot')
                .attr('r', 6)
                .attr('cx', dotInfo.x)
                .attr('cy', dotInfo.y)
                .attr('data-side', dotInfo.side)
                .style('cursor', 'crosshair');
        });
    }

    // method to reapply node interactions after updates
    reapplyNodeInteractions(nodeMerge) {
        // emit event to notify that nodes need interaction setup
        nodeMerge.each((d) => {
            this.state.emit('nodeInteractionNeeded', d);
        });
    }
    
    updateInputNodeElements(nodeSelection, nodeData) {
        // update input field values based on current data
        const parameters = nodeData.parameters || [];
        const inputValues = nodeData.inputValues || {};
        
        // update each input field text
        parameters.forEach((param) => {
            const inputFieldText = nodeSelection
                .select('.input_rows')
                .selectAll('.input_row')
                .filter(function() {
                    // find the row that matches this parameter
                    const paramLabel = d3.select(this).select('.input_param_label').text();
                    return paramLabel === param;
                })
                .select('.input_field_text');
                
            if (!inputFieldText.empty()) {
                inputFieldText.text(inputValues[param] || '');
            }
        });
        
        // enforce fixed width for input nodes
        nodeData.width = 300;
        nodeSelection.select('.node.input_node')
            .attr('width', 300)
            .attr('x', -150);
    }

    updateNodeElements(nodeMerge) {
        // update positions
        nodeMerge.attr('transform', d => `translate(${d.x},${d.y})`);

        // handle updates differently based on node type
        const self = this;
        nodeMerge.each(function(d) {
            const nodeSelection = d3.select(this);
            
            if (d.type === 'input_node') {
                // for input nodes, update input field values and parameters
                self.updateInputNodeElements(nodeSelection, d);
            } else {
                // for regular nodes, update text and dimensions
                nodeSelection.select('.node_text').text(d.name);

                if (!d.width) {
                    d.width = (d.type === 'data_save')
                        ? Geometry.getDataSaveNodeWidth(d.name)
                        : Geometry.getNodeWidth(d.name);
                }
                const nodeHeight = Geometry.getNodeHeight(d);

                if (d.type === 'data_save') {
                    // update capsule rect attributes
                    const width = d.width || Geometry.getDataSaveNodeWidth(d.name);
                    nodeSelection.select('rect.node')
                        .attr('width', width)
                        .attr('x', -width/2)
                        .attr('height', nodeHeight)
                        .attr('y', -nodeHeight/2)
                        .attr('rx', nodeHeight/2)
                        .style('fill', 'rgb(62, 32, 0)');
                } else {
                    nodeSelection.select('rect.node')
                        .attr('width', d.width)
                        .attr('x', -d.width/2)
                        .attr('height', nodeHeight)
                        .attr('y', -nodeHeight/2);
                    // refresh inner border for call_ai
                    if (d.type === 'call_ai') {
                        const width = d.width || Geometry.getNodeWidth(d.name || 'ai node');
                        // remove any previous inner rects to avoid duplicates
                        nodeSelection.selectAll('rect.call_ai_inner').remove();
                        const inset = 3;
                        nodeSelection.append('rect')
                            .attr('class', 'node call_ai_inner')
                            .attr('x', -width/2 + inset)
                            .attr('y', -nodeHeight/2 + inset)
                            .attr('width', width - inset * 2)
                            .attr('height', nodeHeight - inset * 2)
                            .attr('rx', Math.max(0, 8 - inset))
                            .style('fill', 'none')
                            .style('pointer-events', 'none')
                            .style('stroke', '#123a70')
                            .style('stroke-width', '1');
                    }
                }

                // maintain special styling for if nodes
                if (d.type === 'if_node') {
                    nodeSelection.select('.node')
                        // ensure dark cyan background persists for if nodes (dark mode)
                        .style('fill', '#091516')
                        .style('stroke-dasharray', '5,5')
                        .style('stroke-width', '2');
                } else if (d.type === 'call_ai') {
                    nodeSelection.select('.node')
                        .style('fill', '#031c40')
                        .style('stroke', '#031c40')
                        .style('stroke-width', '1')
                        .style('stroke-dasharray', null);
                }
            }
        });

        // update connection dot positions
        this.updateConnectionDotPositions(nodeMerge);

        // position buttons from the left edge with 10px gaps
        nodeMerge.each((d, i, nodes) => {
            const group = d3.select(nodes[i]);
            const width = d.width || 120;
            const height = Geometry.getNodeHeight(d);
            const rowY = -height / 2 - 20;
            const r = 12;
            const gap = 10;
            const spacing = r * 2 + gap; // 34 px center spacing
            const baseX = -width / 2 + r;
            group.select('.refresh_button').attr('transform', `translate(${baseX}, ${rowY})`);
            group.select('.pen_button').attr('transform', `translate(${baseX + spacing}, ${rowY})`);
            group.select('.play_button').attr('transform', `translate(${baseX + spacing * 2}, ${rowY})`);
        });
        
        // reapply interactions to ensure drag behavior works
        this.reapplyNodeInteractions(nodeMerge);
        // keep coverage alerts positioned
        this.updateCoverageAlerts();
    }

    updateConnectionDotPositions(nodeMerge) {
        nodeMerge.selectAll('.connection_dot').each(function(d) {
            const dot = d3.select(this);
            const side = dot.attr('data-side');
            const width = d.width || 120;
            const height = Geometry.getNodeHeight(d);
            
            let cx, cy;
            switch(side) {
                case 'top':
                    cx = 0;
                    cy = -height/2;
                    break;
                case 'bottom':
                    cx = 0;
                    cy = height/2;
                    break;
                case 'right':
                    cx = width/2;
                    cy = 0;
                    break;
                case 'left':
                    cx = -width/2;
                    cy = 0;
                    break;
                default:
                    cx = 0;
                    cy = 0;
            }
            
            dot.attr('cx', cx).attr('cy', cy);
        });
    }

    renderSingleNode(node) {
        // add single node without full re-render
        const nodeGroup = this.nodeGroup
            .append('g')
            .datum(node)
            .attr('class', 'node-group')
            .attr('transform', `translate(${node.x},${node.y})`);

        if (node.type === 'input_node') {
            this.renderSingleInputNode(nodeGroup, node);
        } else {
            this.renderSingleRegularNode(nodeGroup, node);
        }
        
        // use setTimeout to ensure the DOM element is fully created before setting up interactions
        setTimeout(() => {
            this.state.emit('nodeInteractionNeeded', node);
            this.updateCoverageAlerts();
        }, 0);
    }
    
    renderSingleRegularNode(nodeGroup, node) {
        // calculate height for this node
        const nodeHeight = Geometry.getNodeHeight(node);
        
        // add base shape
        let shapeSel;
        if (node.type === 'data_save') {
            const width = node.width || Geometry.getDataSaveNodeWidth(node.name || 'data save');
            shapeSel = nodeGroup.append('rect')
                .attr('class', 'node data_save_node')
                .attr('height', nodeHeight)
                .attr('y', -nodeHeight/2)
                .attr('width', width)
                .attr('x', -width/2)
                .attr('rx', nodeHeight/2)
                .style('fill', 'rgb(62, 32, 0)');
        } else {
            shapeSel = nodeGroup.append('rect')
                .attr('class', 'node')
                .attr('height', nodeHeight)
                .attr('y', -nodeHeight/2)
                .attr('rx', 8)
                .attr('width', node.width || 120)
                .attr('x', -(node.width || 120)/2);
        }

        // add special styling for if nodes
        if (node.type === 'if_node') {
            shapeSel
                // set dark cyan background for if nodes (dark mode)
                .style('fill', '#091516')
                .style('stroke-dasharray', '5,5')
                .style('stroke-width', '2');
        }

        // add text
        nodeGroup.append('text')
            .attr('class', 'node_text')
            .attr('dy', '0.15em')
            .text(node.name);

        // add connection dots for non data_save nodes only
        if (node.type !== 'data_save') {
            const dotData = [
                { side: 'top', x: 0, y: -nodeHeight/2 },
                { side: 'right', x: (node.width || 120)/2, y: 0 },
                { side: 'bottom', x: 0, y: nodeHeight/2 },
                { side: 'left', x: -(node.width || 120)/2, y: 0 }
            ];

            dotData.forEach((dotInfo) => {
                nodeGroup.append('circle')
                    .attr('class', 'connection_dot')
                    .attr('r', 6)
                    .attr('cx', dotInfo.x)
                    .attr('cy', dotInfo.y)
                    .attr('data-side', dotInfo.side)
                    .style('cursor', 'crosshair');
            });
        }

        // add play button for run mode (initially hidden) - skip for data_save nodes
        if (node.type !== 'data_save') {
            this.addPlayButtonToNode(nodeGroup, node);
        }
        
        // add refresh button for input nodes (initially hidden)
        this.addRefreshButtonToNode(nodeGroup, node);

        // add pen button between refresh and play (initially hidden)
        this.addPenButtonToNode(nodeGroup, node);
    }
    
    renderSingleInputNode(nodeGroup, node) {
        const parameters = node.parameters || [];
        const rowHeight = 40;
        const padding = 20; // top and bottom padding
        const nodeHeight = Geometry.getNodeHeight(node);

        // fixed layout for input nodes
        const fixedWidth = 300;
        const leftPadding = 12;
        const rightPadding = 12;
        const inputWidth = fixedWidth * 0.5; // 50% of node width
        const inputX = fixedWidth / 2 - rightPadding - inputWidth; // right-align the input inside the node

        // update node width
        node.width = fixedWidth;

        // add main rectangle with fixed width
        nodeGroup.append('rect')
            .attr('class', 'node input_node')
            .attr('height', nodeHeight)
            .attr('y', -nodeHeight/2)
            .attr('rx', 8)
            .attr('width', fixedWidth)
            .attr('x', -fixedWidth/2)
            // set dark purple background for input nodes (dark mode)
            .style('fill', '#170d1d');

        // create input rows for each parameter
        const inputGroup = nodeGroup.append('g')
            .attr('class', 'input_rows')
            .attr('transform', 'translate(0, 0)');

        parameters.forEach((param, index) => {
            const rowY = -nodeHeight/2 + padding/2 + (index * rowHeight) + rowHeight/2;

            // parameter row group
            const rowGroup = inputGroup.append('g')
                .attr('class', 'input_row')
                .attr('transform', `translate(0, ${rowY})`);

            // parameter name label pinned to left edge
            rowGroup.append('text')
                .attr('class', 'input_param_label')
                .attr('x', -fixedWidth/2 + leftPadding)
                .attr('y', 0)
                .attr('dy', '.35em')
                .attr('text-anchor', 'start')
                .text(param);

            // input field background at 50% width, right-aligned inside the node
            rowGroup.append('rect')
                .attr('class', 'input_field_bg')
                .attr('x', inputX)
                .attr('y', -12)
                .attr('width', inputWidth)
                .attr('height', 24)
                .attr('rx', 4)
                .style('cursor', 'text')
                .on('click', (event) => {
                    event.stopPropagation();
                    this.handleInputFieldClick(node, param, rowGroup);
                });

            // input field text (will be updated when user types)
            rowGroup.append('text')
                .attr('class', 'input_field_text')
                .attr('x', inputX + 5)
                .attr('y', 0)
                .attr('dy', '.35em')
                .text(node.inputValues[param] || '');
        });

        // add connection dot (only right side for input nodes)
        nodeGroup.append('circle')
            .attr('class', 'connection_dot')
            .attr('r', 6)
            .attr('cx', fixedWidth/2)
            .attr('cy', 0)
            .attr('data-side', 'right')
            .style('cursor', 'crosshair');
    }

    updateSingleNode(node) {
        const nodeGroup = this.nodeGroup
            .selectAll('.node-group')
            .filter(d => d.id === node.id);

        this.updateNodeElements(nodeGroup);
    }

    removeSingleNode(node) {
        this.nodeGroup
            .selectAll('.node-group')
            .filter(d => d.id === node.id)
            .remove();
    }

    updateNodeStyles() {
        // guard against undefined selectedNodes
        if (!this.state.selectionHandler || !this.state.selectionHandler.selectedNodes) {
            return;
        }
        
        // update selection styles for all node types including text nodes
        this.nodeGroup.selectAll('.node, .node_text')
            .classed('selection_preview', false) // clear preview styling
            .classed('selected', d => 
                this.state.selectionHandler.isNodeSelected(d.id) && this.state.selectionHandler.getSelectedNodeCount() === 1)
            .classed('multi_selected', d => 
                this.state.selectionHandler.isNodeSelected(d.id) && this.state.selectionHandler.getSelectedNodeCount() > 1);

        // ensure all nodes show the same blue selection regardless of base background
        // some nodes (like input_node and if_node) use inline fill which overrides css
        // override inline fill on single selection and restore appropriately otherwise
        const isSingleSelection = this.state.selectionHandler.getSelectedNodeCount() === 1;
        const isMultiSelection = this.state.selectionHandler.getSelectedNodeCount() > 1;

        this.nodeGroup.selectAll('.node').each((d, i, nodes) => {
            const rect = d3.select(nodes[i]);
            if (!d) return;

            const isThisSelected = this.state.selectionHandler.isNodeSelected(d.id);

            if (isSingleSelection && isThisSelected) {
                // single selected: force blue background and matching stroke
                rect.style('fill', 'var(--primary-color)');
                rect.style('stroke', 'var(--primary-dark)');
                rect.style('stroke-width', null); // let css handle width
                // keep any shape-specific attributes like if_node dash array intact
                return;
            }

            if (isMultiSelection && isThisSelected) {
                // multi selection: clear inline fill so css .multi_selected can apply
                rect.style('fill', null);
                rect.style('stroke', null);
                rect.style('stroke-width', null);
                return;
            }

            // not selected: restore base styling for special nodes that use inline fills
            if (d.type === 'input_node') {
                if (d.runtimeStatus === 'success') {
                    rect.style('fill', '#4caf50');
                    rect.style('stroke', '#388e3c');
                } else if (d.runtimeStatus === 'error') {
                    rect.style('fill', '#f44336');
                    rect.style('stroke', '#d32f2f');
                } else {
                    rect.style('fill', '#170d1d');
                    rect.style('stroke', null);
                }
                rect.style('stroke-width', null);
            } else if (d.type === 'if_node') {
                rect.style('fill', '#091516');
                rect.style('stroke', null);
                // restore dashed outline for if_node
                rect.style('stroke-dasharray', '5,5');
                rect.style('stroke-width', '2');
            } else if (d.type === 'data_save') {
                if (d.runtimeStatus === 'success') {
                    rect.style('fill', '#4caf50');
                    rect.style('stroke', '#388e3c');
                } else if (d.runtimeStatus === 'error') {
                    rect.style('fill', '#f44336');
                    rect.style('stroke', '#d32f2f');
                } else {
                    rect.style('fill', 'rgb(62, 32, 0)');
                    rect.style('stroke', null);
                }
                rect.style('stroke-dasharray', null);
                rect.style('stroke-width', '2');
            } else {
                // clear inline styles for standard nodes to allow css theme
                rect.style('fill', null);
                rect.style('stroke', null);
                rect.style('stroke-width', null);
            }
        });

        // update refresh button visibility for python nodes with input nodes
        this.updateRefreshButtonVisibility();

        // update play button visibility based on selection and mode
        this.updatePlayButtonVisibility();

        // update pen button visibility for selected python nodes
        this.updatePenButtonVisibility();
    }

    updatePlayButtonVisibility() {
        // hide all play buttons first
        this.hideAllPlayButtons();

        // guard against undefined selectionHandler
        if (!this.state.selectionHandler) {
            return;
        }

        // show play button only in run mode for selected nodes
        if (this.state.currentMode === 'run' && this.state.selectionHandler.hasNodeSelection() && this.state.selectionHandler.getSelectedNodeCount() === 1) {
            const nodeIds = this.state.selectionHandler.getSelectedNodeIds();
            const selectedNodeId = nodeIds[0];
            this.showPlayButton(selectedNodeId);
        }
    }

    updateRefreshButtonVisibility() {
        // hide all refresh buttons first
        this.hideAllRefreshButtons();

        // show refresh button for selected python nodes
        if (this.state.selectionHandler && this.state.selectionHandler.hasNodeSelection() && this.state.selectionHandler.getSelectedNodeCount() === 1) {
            const nodeIds = this.state.selectionHandler.getSelectedNodeIds();
            const selectedNodeId = nodeIds[0];
            const selectedNode = this.state.createNode ? this.state.createNode.getNode(selectedNodeId) : null;
            
            if (selectedNode && selectedNode.type === 'python_file') {
                this.showRefreshButton(selectedNodeId);
            }
        }
    }

    previewSelection(nodeIds) {
        // show preview of what will be selected during drag
        this.nodeGroup.selectAll('.node')
            .classed('selection_preview', d => nodeIds.includes(d.id));
    }

    updateNodePosition(data) {
        this.nodeGroup
            .selectAll('.node-group')
            .filter(d => d.id === data.nodeId)
            .attr('transform', `translate(${data.x},${data.y})`);
    }

    addNodeClass(data) {
        this.nodeGroup
            .selectAll('.node-group')
            .filter(d => d.id === data.nodeId)
            .select('.node')
            .classed(data.className, true);
    }

    removeNodeClass(data) {
        this.nodeGroup
            .selectAll('.node-group')
            .filter(d => d.id === data.nodeId)
            .select('.node')
            .classed(data.className, false);
    }

    // connection dot visibility
    showConnectionDots(nodeId) {
        this.nodeGroup
            .selectAll('.node-group')
            .filter(d => d.id === nodeId)
            .selectAll('.connection_dot')
            .style('opacity', 1);
    }

    hideConnectionDots(nodeId) {
        this.nodeGroup
            .selectAll('.node-group')
            .filter(d => d.id === nodeId)
            .selectAll('.connection_dot')
            .style('opacity', 0);
    }

    // play button functionality
    addPlayButton(nodeEnter) {
        const self = this;
        nodeEnter.each(function(d) {
            self.addPlayButtonToNode(d3.select(this), d);
        });
    }

    addPlayButtonToNode(nodeGroup, node) {
        // position buttons in a row starting from the left edge with 10px gaps
        const nodeHeightForPlay = Geometry.getNodeHeight(node);
        const buttonRowYForPlay = -nodeHeightForPlay / 2 - 20; // above the node
        const widthForPlay = node.width || 120;
        const r = 12; // circle radius
        const gap = 10; // gap between buttons
        const spacing = r * 2 + gap; // center-to-center spacing
        const baseX = -widthForPlay / 2 + r; // first button center
        const playButtonX = baseX + spacing * 2; // third button in the row

        const playButton = nodeGroup.append('g')
            .attr('class', 'play_button')
            .attr('transform', () => `translate(${playButtonX}, ${buttonRowYForPlay})`)
            .style('cursor', 'pointer')
            .style('opacity', 0)
            .style('transform-origin', 'center')
            .on('click', (event) => {
                event.stopPropagation();
                this.handlePlayButtonClick(node);
            });

        // play button background circle
        playButton.append('circle')
            .attr('r', 12)
            .attr('class', 'play_button_bg')
            .style('fill', '#4CAF50')
            .style('stroke', 'none');

        // play icon (triangle)
        playButton.append('path')
            .attr('class', 'play_button_icon')
            .attr('d', 'M-2.8,-4.2 L-2.8,4.2 L4.2,0 Z')
            .style('fill', 'white');
    }

    showPlayButton(nodeId) {
        this.nodeGroup
            .selectAll('.node-group')
            .filter(d => d.id === nodeId)
            .select('.play_button')
            .style('opacity', 1);
    }

    hidePlayButton(nodeId) {
        this.nodeGroup
            .selectAll('.node-group')
            .filter(d => d.id === nodeId)
            .select('.play_button')
            .style('opacity', 0);
    }

    hideAllPlayButtons() {
        this.nodeGroup
            .selectAll('.play_button')
            .style('opacity', 0);
    }

    handlePlayButtonClick(node) {
        // emit event to flowchart builder to handle resume execution
        this.state.emit('resumeExecutionFromNode', { nodeId: node.id, node: node });
    }

    // refresh button functionality
    addRefreshButton(nodeEnter) {
        const self = this;
        nodeEnter.each(function(d) {
            self.addRefreshButtonToNode(d3.select(this), d);
        });
    }

    addRefreshButtonToNode(nodeGroup, node) {
        // position refresh button as the first button in the row aligned to left edge
        const nodeHeightForRefresh = Geometry.getNodeHeight(node);
        const buttonRowYForRefresh = -nodeHeightForRefresh / 2 - 20; // above the node
        const widthForRefresh = node.width || 120;
        const r = 12;
        const refreshButtonX = -widthForRefresh / 2 + r; // first button center

        const refreshButton = nodeGroup.append('g')
            .attr('class', 'refresh_button')
            .attr('transform', () => `translate(${refreshButtonX}, ${buttonRowYForRefresh})`)
            .style('cursor', 'pointer')
            .style('opacity', 0)
            .style('transform-origin', 'center')
            .on('click', (event) => {
                event.stopPropagation();
                // for newly created nodes, ensure python file analysis works even if pythonFile isn't set yet
                this.handleRefreshButtonClick(node);
            });

        // refresh button background circle
        refreshButton.append('circle')
            .attr('r', 12)
            .attr('class', 'refresh_button_bg')
            .style('stroke', 'none');

        // refresh icon (⟳)
        refreshButton.append('text')
            .attr('class', 'refresh_button_text')
            .attr('text-anchor', 'middle')
            .attr('dy', '.35em')
            .style('font-size', '14px')
            .text('⟳');
    }

    // pen button (non-functional placeholder)
    addPenButton(nodeEnter) {
        const self = this;
        nodeEnter.each(function(d) {
            self.addPenButtonToNode(d3.select(this), d);
        });
    }

    addPenButtonToNode(nodeGroup, node) {
        // position pen button as the second button with 10px gap
        const nodeHeightForPen = Geometry.getNodeHeight(node);
        const buttonRowYForPen = -nodeHeightForPen / 2 - 20; // above the node
        const widthForPen = node.width || 120;
        const r = 12;
        const gap = 10;
        const spacing = r * 2 + gap;
        const baseX = -widthForPen / 2 + r;
        const penButtonX = baseX + spacing; // second button center

        const penButton = nodeGroup.append('g')
            .attr('class', 'pen_button')
            .attr('transform', () => `translate(${penButtonX}, ${buttonRowYForPen})`)
            .style('cursor', 'pointer')
            .style('opacity', 0)
            .style('transform-origin', 'center')
            .on('click', (event) => {
                event.stopPropagation();
                this.handlePenButtonClick(node);
            });

        // background circle
        penButton.append('circle')
            .attr('r', 12)
            .attr('class', 'pen_button_bg')
            .style('stroke', 'none')
            .style('fill', '#7e57c2'); // purple

        // pen icon
        penButton.append('text')
            .attr('class', 'pen_button_text')
            .attr('text-anchor', 'middle')
            .attr('dy', '.35em')
            .style('font-size', '12px')
            .style('fill', '#ffffff') // white icon
            .text('✎');
    }

    async handlePenButtonClick(node) {
        // open the associated python file in the editor
        // if node has no associated file, surface a warning via the existing status bar
        if (!node) return;
        if (!node.pythonFile) {
            try {
                if (this.state && this.state.emit) {
                    this.state.emit('statusUpdate', 'warning: no python file assigned to this node');
                }
            } catch (_) { /* no-op */ }
            return;
        }
        try {
            // show quick progress while opening
            this.state.emit && this.state.emit('statusUpdate', 'opening file...');
            if (window.flowchartApp && window.flowchartApp.showStatusProgress) {
                window.flowchartApp.showStatusProgress(15);
            }

            // read preferred editor from local storage if set in settings
            let preferredEditorPath = '';
            try {
                const saved = localStorage.getItem('flowcraft_default_editor');
                if (saved) {
                    const parsed = JSON.parse(saved);
                    preferredEditorPath = parsed.path || '';
                }
            } catch (_) {}

            const res = await fetch('/api/open-file', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ python_file: node.pythonFile, preferred_editor_path: preferredEditorPath })
            });
            // bump progress briefly and hide
            if (window.flowchartApp && window.flowchartApp.setStatusProgress) {
                window.flowchartApp.setStatusProgress(90);
            }
            setTimeout(() => {
                if (window.flowchartApp && window.flowchartApp.hideStatusProgress) {
                    window.flowchartApp.hideStatusProgress();
                }
                if (this.state && this.state.emit) {
                    this.state.emit('statusUpdate', 'file open request sent');
                }
            }, 150);
        } catch (e) {
            console.error('error opening file:', e);
            if (window.flowchartApp && window.flowchartApp.hideStatusProgress) {
                window.flowchartApp.hideStatusProgress();
            }
            if (this.state && this.state.emit) {
                this.state.emit('statusUpdate', 'failed to open file');
            }
        }
    }

    showPenButton(nodeId) {
        this.nodeGroup
            .selectAll('.node-group')
            .filter(d => d.id === nodeId)
            .select('.pen_button')
            .style('opacity', 1);
    }

    hideAllPenButtons() {
        this.nodeGroup
            .selectAll('.pen_button')
            .style('opacity', 0);
    }

    updatePenButtonVisibility() {
        // hide all pen buttons first
        this.hideAllPenButtons();

        // show pen button for selected python nodes
        if (this.state.selectionHandler && this.state.selectionHandler.hasNodeSelection() && this.state.selectionHandler.getSelectedNodeCount() === 1) {
            const nodeIds = this.state.selectionHandler.getSelectedNodeIds();
            const selectedNodeId = nodeIds[0];
            const selectedNode = this.state.createNode ? this.state.createNode.getNode(selectedNodeId) : null;

            if (selectedNode && selectedNode.type === 'python_file') {
                this.showPenButton(selectedNodeId);
            }
        }
    }

    showRefreshButton(nodeId) {
        this.nodeGroup
            .selectAll('.node-group')
            .filter(d => d.id === nodeId)
            .select('.refresh_button')
            .style('opacity', 1);
    }

    hideAllRefreshButtons() {
        this.nodeGroup
            .selectAll('.refresh_button')
            .style('opacity', 0);
    }

    async handleRefreshButtonClick(node) {
        // find associated input nodes for this Python node
        const inputNodes = this.state.nodes.filter(n => 
            n.type === 'input_node' && n.targetNodeId === node.id
        );
        
        if (inputNodes.length === 0) {
            // if no input node exists yet, try to create one via the standard check
            try {
                await this.createNode.checkAndCreateInputNode(node);
            } catch (e) {
                console.error('failed to create input node on refresh:', e);
            }
            return;
        }

        // refresh inputs for all associated input nodes
        for (const inputNode of inputNodes) {
            await this.handleRefreshInputs(inputNode);
        }
    }

    // node theming and styling
    setNodeTheme(nodeId, theme) {
        const nodeGroup = this.nodeGroup
            .selectAll('.node-group')
            .filter(d => d.id === nodeId);

        switch (theme) {
            case 'error':
                nodeGroup.select('.node')
                    .style('fill', '#f44336')
                    .style('stroke', '#d32f2f');
                break;
            case 'warning':
                nodeGroup.select('.node')
                    .style('fill', '#ff9800')
                    .style('stroke', '#f57c00');
                break;
            case 'success':
                nodeGroup.select('.node')
                    .style('fill', '#4caf50')
                    .style('stroke', '#388e3c');
                break;
            default:
                nodeGroup.select('.node')
                    .style('fill', null)
                    .style('stroke', null);
        }
    }

    // animation helpers
    animateNodeCreation(nodeId) {
        const nodeGroup = this.nodeGroup
            .selectAll('.node-group')
            .filter(d => d.id === nodeId);

        nodeGroup
            .style('opacity', 0)
            .style('transform', 'scale(0)')
            .transition()
            .duration(300)
            .style('opacity', 1)
            .style('transform', 'scale(1)');
    }

    animateNodeRemoval(nodeId, callback) {
        const nodeGroup = this.nodeGroup
            .selectAll('.node-group')
            .filter(d => d.id === nodeId);

        nodeGroup
            .transition()
            .duration(200)
            .style('opacity', 0)
            .style('transform', 'scale(0)')
            .on('end', callback);
    }

    // node highlighting
    highlightNode(nodeId, highlight = true) {
        this.nodeGroup
            .selectAll('.node-group')
            .filter(d => d.id === nodeId)
            .select('.node')
            .classed('highlighted', highlight);
    }

    pulseNode(nodeId, duration = 1000) {
        const nodeGroup = this.nodeGroup
            .selectAll('.node-group')
            .filter(d => d.id === nodeId)
            .select('.node');

        nodeGroup
            .transition()
            .duration(duration / 2)
            .style('stroke-width', '4px')
            .transition()
            .duration(duration / 2)
            .style('stroke-width', '2px');
    }

    // utility methods
    getNodeBounds(nodeId) {
        const node = this.state.createNode ? this.state.createNode.getNode(nodeId) : null;
        if (!node) return null;

        const width = node.width || 120;
        const height = 60;

        return {
            x: node.x - width/2,
            y: node.y - height/2,
            width: width,
            height: height
        };
    }

    isNodeVisible(nodeId) {
        const nodeGroup = this.nodeGroup
            .selectAll('.node-group')
            .filter(d => d.id === nodeId);

        return !nodeGroup.empty();
    }

    // handle refresh button clicks to re-analyze inputs
    async handleRefreshInputs(node) {
        if (!node.pythonFile) return;
        
        try {
            // re-analyze the python file
            const response = await fetch('/api/analyze-python-function', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    python_file: node.pythonFile
                })
            });
            
            const result = await response.json();
            
            if (result.success && result.parameters) {
                // preserve the input node even if no parameters are found
                // this prevents losing user input when parameters are temporarily empty
                if (Array.isArray(result.parameters) && result.parameters.length === 0) {
                    // keep the existing input node with current values instead of deleting it
                    return;
                }
                
                // update the node with new parameters
                const updatedInputValues = {};
                
                // preserve existing values for parameters that still exist
                result.parameters.forEach(param => {
                    updatedInputValues[param] = node.inputValues[param] || '';
                });
                
                // update the node
                if (this.state.createNode) {
                    await this.state.createNode.updateNode(node.id, {
                        parameters: result.parameters,
                        inputValues: updatedInputValues
                    });
                }
                
                // force re-render of this node
                this.removeSingleNode(node);
                setTimeout(() => {
                    this.renderSingleNode({...node, parameters: result.parameters, inputValues: updatedInputValues});
                }, 10);
            }
        } catch (error) {
            console.error('error refreshing inputs:', error);
        }
    }

    // handle input field clicks to allow editing
    handleInputFieldClick(node, paramName, rowGroup) {
        // create a temporary HTML input element
        const rect = rowGroup.select('.input_field_bg').node().getBoundingClientRect();
        
        // create input element
        const input = document.createElement('input');
        input.type = 'text';
        input.value = node.inputValues[paramName] || '';
        input.style.position = 'absolute';
        input.style.left = rect.left + 'px';
        input.style.top = rect.top + 'px';
        input.style.width = rect.width + 'px';
        input.style.height = rect.height + 'px';
        input.style.fontSize = '11px';
        input.style.border = '1px solid #1976d2';
        input.style.backgroundColor = '#121212';
        input.style.color = '#ffffff';
        input.style.padding = '2px 4px';
        input.style.borderRadius = '4px';
        input.style.zIndex = '1000';
        
        document.body.appendChild(input);
        input.focus();
        input.select();
        
        // handle input completion
        const completeEdit = async () => {
            const newValue = input.value;
            node.inputValues[paramName] = newValue;
            
            // update the text display
            rowGroup.select('.input_field_text').text(newValue);
            
            // update the node in state
            if (this.state.createNode) {
                await this.state.createNode.updateNode(node.id, { inputValues: node.inputValues });
            }
            
            // remove the input element
            document.body.removeChild(input);
        };
        
        // handle enter key and blur
        input.addEventListener('blur', () => completeEdit());
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                completeEdit();
            } else if (e.key === 'Escape') {
                document.body.removeChild(input);
            }
        });
    }

    // cleanup
    destroy() {
        this.nodeGroup.remove();
    }

    // node interaction setup (moved from FlowchartBuilder.js)
    setupNodeInteractions() {
        // these will be setup by the node renderer when nodes are created
        this.state.on('nodeAdded', (node) => {
            this.setupSingleNodeInteractions(node);
        });
        
        // reapply interactions when nodes are updated/re-rendered
        this.state.on('nodeInteractionNeeded', (node) => {
            this.setupSingleNodeInteractions(node);
        });
    }

    setupSingleNodeInteractions(node) {
        // get node element
        const nodeElement = this.nodeGroup
            .selectAll('.node-group')
            .filter(d => d.id === node.id);

        // setup node click
        nodeElement.select('.node')
            .on('click', (event, d) => {
                if (window.flowchartApp && window.flowchartApp.selectionHandler) {
                    window.flowchartApp.selectionHandler.handleNodeClick(event, d);
                }
            })
            .on('contextmenu', (event, d) => {
                if (window.flowchartApp && window.flowchartApp.events) {
                    window.flowchartApp.events.handleContextMenu(event, { type: 'node', ...d });
                }
            })
            .call(this.createDragBehavior());

        // setup connection dots (none exist for data_save nodes)
        nodeElement.selectAll('.connection_dot')
            .on('mousedown', (event, d) => {
                event.stopPropagation();
                const dotSide = d3.select(event.target).attr('data-side');
                if (window.flowchartApp && window.flowchartApp.connectionHandler) {
                    window.flowchartApp.connectionHandler.startConnection(event, d, dotSide);
                }
            })
            .call(d3.drag()
                .on('start', (event, d) => {
                    const dotSide = d3.select(event.sourceEvent.target).attr('data-side');
                    if (window.flowchartApp && window.flowchartApp.connectionHandler) {
                        window.flowchartApp.connectionHandler.handleDotDragStart(event, d, dotSide);
                    }
                })
                .on('drag', (event, d) => {
                    const coords = d3.pointer(event, this.container.node());
                    if (window.flowchartApp && window.flowchartApp.connectionHandler) {
                        window.flowchartApp.connectionHandler.handleDotDrag(event, { x: coords[0], y: coords[1] });
                    }
                })
                .on('end', (event, d) => {
                    const coords = d3.pointer(event, this.container.node());
                    if (window.flowchartApp && window.flowchartApp.connectionHandler) {
                        window.flowchartApp.connectionHandler.handleDotDragEnd(event, { x: coords[0], y: coords[1] });
                    }
                })
            );
    }

    createDragBehavior() {
        if (window.flowchartApp && window.flowchartApp.dragHandler) {
            return window.flowchartApp.dragHandler.createDragBehavior(this.container.node());
        }
        return d3.drag(); // fallback
    }
}

window.NodeRenderer = NodeRenderer;
})();