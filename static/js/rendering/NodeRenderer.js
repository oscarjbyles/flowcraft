// node rendering and visual management
class NodeRenderer {
    constructor(stateManager, container) {
        this.state = stateManager;
        this.container = container;
        
        // create node group
        this.nodeGroup = this.container.append('g').attr('class', 'nodes');
        
        // setup event listeners
        this.setupEventListeners();
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
        
        // add rectangle
        const rect = nodeEnter.append('rect')
            .attr('class', 'node')
            .attr('height', nodeHeight)
            .attr('y', -nodeHeight/2)
            .attr('rx', 8);

        // add special styling for if nodes
        rect.each(function(d) {
            if (d.type === 'if_node') {
                d3.select(this)
                    // set dark cyan background for if nodes (dark mode)
                    .style('fill', '#091516')
                    .style('stroke-dasharray', '5,5')
                    .style('stroke-width', '2');
            }
        });

        // add text
        nodeEnter.append('text')
            .attr('class', 'node_text')
            .attr('dy', '0.15em')
            .text(d => d.name);

        // add connection dots
        this.addConnectionDots(nodeEnter);

        // add play button for run mode (initially hidden)
        this.addPlayButton(nodeEnter);
        
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
                
                // update rectangle width and height
                if (!d.width) {
                    d.width = Geometry.getNodeWidth(d.name);
                }
                const nodeHeight = Geometry.getNodeHeight(d);
                const nodeRect = nodeSelection.select('.node')
                    .attr('width', d.width)
                    .attr('x', -d.width/2)
                    .attr('height', nodeHeight)
                    .attr('y', -nodeHeight/2);
                
                // maintain special styling for if nodes
                if (d.type === 'if_node') {
                    nodeRect
                           // ensure dark cyan background persists for if nodes (dark mode)
                           .style('fill', '#091516')
                           .style('stroke-dasharray', '5,5')
                           .style('stroke-width', '2');
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
        }, 0);
    }
    
    renderSingleRegularNode(nodeGroup, node) {
        // calculate height for this node
        const nodeHeight = Geometry.getNodeHeight(node);
        
        // add rectangle
        const rect = nodeGroup.append('rect')
            .attr('class', 'node')
            .attr('height', nodeHeight)
            .attr('y', -nodeHeight/2)
            .attr('rx', 8)
            .attr('width', node.width || 120)
            .attr('x', -(node.width || 120)/2);

        // add special styling for if nodes
        if (node.type === 'if_node') {
            rect
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

        // add connection dots
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

        // add play button for run mode (initially hidden)
        this.addPlayButtonToNode(nodeGroup, node);
        
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
        this.nodeGroup.selectAll('.node')
            .classed('selection_preview', false) // clear preview styling
            .classed('selected', d => 
                this.state.selectedNodes.has(d.id) && this.state.selectedNodes.size === 1)
            .classed('multi_selected', d => 
                this.state.selectedNodes.has(d.id) && this.state.selectedNodes.size > 1);

        // ensure all nodes show the same blue selection regardless of base background
        // some nodes (like input_node and if_node) use inline fill which overrides css
        // override inline fill on single selection and restore appropriately otherwise
        const isSingleSelection = this.state.selectedNodes.size === 1;
        const isMultiSelection = this.state.selectedNodes.size > 1;

        this.nodeGroup.selectAll('.node').each((d, i, nodes) => {
            const rect = d3.select(nodes[i]);
            if (!d) return;

            const isThisSelected = this.state.selectedNodes.has(d.id);

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
                rect.style('fill', '#170d1d');
                rect.style('stroke', null);
                rect.style('stroke-width', null);
            } else if (d.type === 'if_node') {
                rect.style('fill', '#091516');
                rect.style('stroke', null);
                // restore dashed outline for if_node
                rect.style('stroke-dasharray', '5,5');
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

        // show play button only in run mode for selected nodes
        if (this.state.currentMode === 'run' && this.state.selectedNodes.size === 1) {
            const selectedNodeId = Array.from(this.state.selectedNodes)[0];
            this.showPlayButton(selectedNodeId);
        }
    }

    updateRefreshButtonVisibility() {
        // hide all refresh buttons first
        this.hideAllRefreshButtons();

        // show refresh button for selected python nodes
        if (this.state.selectedNodes.size === 1) {
            const selectedNodeId = Array.from(this.state.selectedNodes)[0];
            const selectedNode = this.state.getNode(selectedNodeId);
            
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
        if (this.state.selectedNodes.size === 1) {
            const selectedNodeId = Array.from(this.state.selectedNodes)[0];
            const selectedNode = this.state.getNode(selectedNodeId);

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
                await this.state.checkAndCreateInputNode(node);
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
        const node = this.state.getNode(nodeId);
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
                // update the node with new parameters
                const updatedInputValues = {};
                
                // preserve existing values for parameters that still exist
                result.parameters.forEach(param => {
                    updatedInputValues[param] = node.inputValues[param] || '';
                });
                
                // update the node
                this.state.updateNode(node.id, {
                    parameters: result.parameters,
                    inputValues: updatedInputValues
                });
                
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
        const completeEdit = () => {
            const newValue = input.value;
            node.inputValues[paramName] = newValue;
            
            // update the text display
            rowGroup.select('.input_field_text').text(newValue);
            
            // update the node in state
            this.state.updateNode(node.id, { inputValues: node.inputValues });
            
            // remove the input element
            document.body.removeChild(input);
        };
        
        // handle enter key and blur
        input.addEventListener('blur', completeEdit);
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
}

window.NodeRenderer = NodeRenderer;