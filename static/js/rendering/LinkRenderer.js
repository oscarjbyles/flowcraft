// link rendering and visual management
class LinkRenderer {
    constructor(stateManager, container) {
        this.state = stateManager;
        this.container = container;
        
        // create link group
        this.linkGroup = this.container.append('g').attr('class', 'links');
        
        // create temporary connection line group
        this.connectionGroup = this.container.append('g').attr('class', 'connections');
        this.connectionLine = null;
        
        // setup event listeners
        this.setupEventListeners();
    }

    setupEventListeners() {
        this.state.on('linkAdded', (link) => this.renderSingleLink(link));
        this.state.on('linkRemoved', (link) => this.removeSingleLink(link));
        this.state.on('updateLinkStyles', () => this.updateLinkStyles());
        this.state.on('nodeUpdated', () => this.render()); // re-render links when nodes move
        this.state.on('stateChanged', () => this.render());
        this.state.on('updateLinksForNode', (nodeId) => this.updateLinksForNode(nodeId));
        
        // connection line events
        this.state.on('createConnectionLine', (data) => this.createConnectionLine(data));
        this.state.on('updateConnectionLine', (data) => this.updateConnectionLine(data));
        this.state.on('removeConnectionLine', () => this.removeConnectionLine());
    }

    render() {
        // render link paths
        const linkSelection = this.linkGroup
            .selectAll('.link')
            .data(this.state.links, d => `${d.source}-${d.target}`);

        // enter new links
        const linkEnter = linkSelection.enter()
            .append('path')
            .attr('class', 'link');

        // update all links
        const linkMerge = linkEnter.merge(linkSelection);
        this.updateLinkElements(linkMerge);
        
        // remove old links
        linkSelection.exit().remove();
        
        // render double lines for if-to-python connections
        this.renderDoubleLines();
        
        // render arrow markers
        this.renderLinkArrows();
        
        this.updateLinkStyles();
    }

    renderDoubleLines() {
        // find links that go from if nodes to python nodes
        const ifToPythonLinks = this.state.links.filter(link => {
            const sourceNode = this.state.getNode(link.source);
            const targetNode = this.state.getNode(link.target);
            return sourceNode && targetNode && 
                   sourceNode.type === 'if_node' && 
                   targetNode.type === 'python_file';
        });

        // remove existing double lines
        this.linkGroup.selectAll('.double-line').remove();

        // create double lines for if-to-python connections
        ifToPythonLinks.forEach(link => {
            const sourceNode = this.state.getNode(link.source);
            const targetNode = this.state.getNode(link.target);
            
            if (!sourceNode || !targetNode) return;

            const path = this.calculateLinkPath(link);
            const offset = 3; // distance between the two lines

            // create two parallel paths
            const path1 = this.createOffsetPath(path, -offset);
            const path2 = this.createOffsetPath(path, offset);

            // add the double lines with link data for proper removal
            this.linkGroup.append('path')
                .datum(link)
                .attr('class', 'double-line')
                .attr('data-link-id', `${link.source}-${link.target}`)
                .attr('d', path1)
                .style('stroke', '#666')
                .style('stroke-width', '1')
                .style('stroke-linecap', 'butt')
                .style('stroke-linejoin', 'miter')
                .style('fill', 'none')
                .style('pointer-events', 'none');

            this.linkGroup.append('path')
                .datum(link)
                .attr('class', 'double-line')
                .attr('data-link-id', `${link.source}-${link.target}`)
                .attr('d', path2)
                .style('stroke', '#666')
                .style('stroke-width', '1')
                .style('stroke-linecap', 'butt')
                .style('stroke-linejoin', 'miter')
                .style('fill', 'none')
                .style('pointer-events', 'none');
        });
    }

    createOffsetPath(originalPath, offset) {
        // simple offset calculation for straight lines
        // for more complex paths, we'd need a more sophisticated algorithm
        const pathElement = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        pathElement.setAttribute('d', originalPath);
        
        // get the path length and create points along it
        const pathLength = pathElement.getTotalLength();
        const points = [];
        
        for (let i = 0; i <= pathLength; i += 5) {
            const point = pathElement.getPointAtLength(i);
            points.push(point);
        }
        
        // calculate offset points, including endpoints, so lines stay parallel and don't taper
        const offsetPoints = points.map((point, index) => {
            let dirX = 0;
            let dirY = 0;
            
            if (points.length === 1) {
                return point; // degenerate case
            }
            
            if (index === 0) {
                // use direction towards next point
                const next = points[index + 1];
                dirX = next.x - point.x;
                dirY = next.y - point.y;
            } else if (index === points.length - 1) {
                // use direction from previous point
                const prev = points[index - 1];
                dirX = point.x - prev.x;
                dirY = point.y - prev.y;
            } else {
                // average direction using prev and next for smoother perpendicular
                const prev = points[index - 1];
                const next = points[index + 1];
                dirX = next.x - prev.x;
                dirY = next.y - prev.y;
            }
            
            const length = Math.sqrt(dirX * dirX + dirY * dirY);
            if (length === 0) return point;
            
            // perpendicular vector (normalized)
            const perpX = -dirY / length;
            const perpY = dirX / length;
            
            return {
                x: point.x + perpX * offset,
                y: point.y + perpY * offset
            };
        });
        
        // create path from offset points, extending endpoints slightly so they touch node edges
        if (offsetPoints.length < 2) return originalPath;

        const extendedPoints = [...offsetPoints];
        const overshoot = 6; // pixels to extend so lines meet node borders

        // extend start
        const start = extendedPoints[0];
        const next = extendedPoints[1];
        let vx = start.x - next.x;
        let vy = start.y - next.y;
        let vlen = Math.hypot(vx, vy);
        if (vlen > 0) {
            extendedPoints[0] = { x: start.x + (vx / vlen) * overshoot, y: start.y + (vy / vlen) * overshoot };
        }

        // extend end
        const end = extendedPoints[extendedPoints.length - 1];
        const prev = extendedPoints[extendedPoints.length - 2];
        vx = end.x - prev.x;
        vy = end.y - prev.y;
        vlen = Math.hypot(vx, vy);
        if (vlen > 0) {
            extendedPoints[extendedPoints.length - 1] = { x: end.x + (vx / vlen) * overshoot, y: end.y + (vy / vlen) * overshoot };
        }

        let offsetPath = `M ${extendedPoints[0].x} ${extendedPoints[0].y}`;
        for (let i = 1; i < extendedPoints.length; i++) {
            offsetPath += ` L ${extendedPoints[i].x} ${extendedPoints[i].y}`;
        }

        return offsetPath;
    }

    updateLinkElements(linkMerge) {
        linkMerge
            .attr('d', d => this.calculateLinkPath(d))
            .attr('class', d => {
                let classes = 'link';
                if (d.type === 'input_connection') {
                    classes += ' input_connection';
                }
                return classes;
            })
            .style('cursor', d => d.selectable === false ? 'default' : 'pointer')
            .style('stroke-dasharray', d => d.style === 'dashed' ? '5,5' : null)
            .style('marker-end', d => d.type === 'input_connection' ? 'none' : null)
            .style('stroke', d => {
                // hide original line for if-to-python connections
                const sourceNode = this.state.getNode(d.source);
                const targetNode = this.state.getNode(d.target);
                if (sourceNode && targetNode && 
                    sourceNode.type === 'if_node' && 
                    targetNode.type === 'python_file') {
                    return 'transparent';
                }
                return null; // use default stroke
            })
            .on('click', (event, d) => {
                // only handle clicks for selectable links
                if (d.selectable !== false) {
                    this.state.emit('linkClicked', { event, link: d });
                }
            })
            .on('mouseenter', (event, d) => {
                // update arrow color on hover
                if (d.selectable !== false && d.type !== 'input_connection') {
                    this.updateArrowColor(d, true);
                }
            })
            .on('mouseleave', (event, d) => {
                // reset arrow color when not hovering
                if (d.selectable !== false && d.type !== 'input_connection') {
                    this.updateArrowColor(d, false);
                }
            });
    }

    calculateLinkPath(link) {
        const sourceNode = this.state.getNode(link.source);
        const targetNode = this.state.getNode(link.target);
        
        if (!sourceNode || !targetNode) return '';
        
        // determine link type and calculate path accordingly
        switch (link.type) {
            case 'bezier':
                return this.calculateBezierPath(sourceNode, targetNode);
            case 'orthogonal':
                return this.calculateOrthogonalPath(sourceNode, targetNode);
            default:
                return this.calculateStraightPath(sourceNode, targetNode);
        }
    }

    calculateStraightPath(sourceNode, targetNode) {
        // calculate connection points on node edges
        const sourcePoint = this.getNodeConnectionPoint(sourceNode, targetNode);
        const targetPoint = this.getNodeConnectionPoint(targetNode, sourceNode);
        
        return `M${sourcePoint.x},${sourcePoint.y} L${targetPoint.x},${targetPoint.y}`;
    }

    calculateBezierPath(sourceNode, targetNode, curvature = 0.3) {
        const sourcePoint = this.getNodeConnectionPoint(sourceNode, targetNode);
        const targetPoint = this.getNodeConnectionPoint(targetNode, sourceNode);
        
        const dx = targetPoint.x - sourcePoint.x;
        const dy = targetPoint.y - sourcePoint.y;
        
        const controlPoint1X = sourcePoint.x + dx * curvature;
        const controlPoint1Y = sourcePoint.y;
        
        const controlPoint2X = targetPoint.x - dx * curvature;
        const controlPoint2Y = targetPoint.y;
        
        return `M${sourcePoint.x},${sourcePoint.y} C${controlPoint1X},${controlPoint1Y} ${controlPoint2X},${controlPoint2Y} ${targetPoint.x},${targetPoint.y}`;
    }

    calculateOrthogonalPath(sourceNode, targetNode) {
        const sourcePoint = this.getNodeConnectionPoint(sourceNode, targetNode);
        const targetPoint = this.getNodeConnectionPoint(targetNode, sourceNode);
        
        // create orthogonal path with right angles
        const midX = (sourcePoint.x + targetPoint.x) / 2;
        
        return `M${sourcePoint.x},${sourcePoint.y} L${midX},${sourcePoint.y} L${midX},${targetPoint.y} L${targetPoint.x},${targetPoint.y}`;
    }

    getNodeConnectionPoint(fromNode, toNode) {
        const fromWidth = fromNode.width || 120;
        const fromHeight = 60;
        
        // calculate direction from fromNode to toNode
        const dx = toNode.x - fromNode.x;
        const dy = toNode.y - fromNode.y;
        
        // determine which edge of the node to connect to
        const absX = Math.abs(dx);
        const absY = Math.abs(dy);
        
        if (absX > absY) {
            // connect to left or right edge
            if (dx > 0) {
                return { x: fromNode.x + fromWidth/2, y: fromNode.y }; // right edge
            } else {
                return { x: fromNode.x - fromWidth/2, y: fromNode.y }; // left edge
            }
        } else {
            // connect to top or bottom edge
            if (dy > 0) {
                return { x: fromNode.x, y: fromNode.y + fromHeight/2 }; // bottom edge
            } else {
                return { x: fromNode.x, y: fromNode.y - fromHeight/2 }; // top edge
            }
        }
    }

    renderSingleLink(link) {
        const linkElement = this.linkGroup
            .append('path')
            .datum(link)
            .attr('class', d => {
                let classes = 'link';
                if (d.type === 'input_connection') {
                    classes += ' input_connection';
                }
                return classes;
            })
            .attr('d', this.calculateLinkPath(link))
            .style('cursor', link.selectable === false ? 'default' : 'pointer')
            .style('stroke-dasharray', link.style === 'dashed' ? '5,5' : null)
            .style('marker-end', link.type === 'input_connection' ? 'none' : null)
            .style('stroke', () => {
                // hide original line for if-to-python connections
                const sourceNode = this.state.getNode(link.source);
                const targetNode = this.state.getNode(link.target);
                if (sourceNode && targetNode && 
                    sourceNode.type === 'if_node' && 
                    targetNode.type === 'python_file') {
                    return 'transparent';
                }
                return null; // use default stroke
            })
            .on('click', (event, d) => {
                // only handle clicks for selectable links
                if (d.selectable !== false) {
                    this.state.emit('linkClicked', { event, link: d });
                }
            })
            .on('mouseenter', (event, d) => {
                // update arrow color on hover
                if (d.selectable !== false && d.type !== 'input_connection') {
                    this.updateArrowColor(d, true);
                }
            })
            .on('mouseleave', (event, d) => {
                // reset arrow color when not hovering
                if (d.selectable !== false && d.type !== 'input_connection') {
                    this.updateArrowColor(d, false);
                }
            });
            
        this.animateLinkCreation(linkElement);
        
        // render double lines if this is an if-to-python connection
        const sourceNode = this.state.getNode(link.source);
        const targetNode = this.state.getNode(link.target);
        if (sourceNode && targetNode && 
            sourceNode.type === 'if_node' && 
            targetNode.type === 'python_file') {
            this.renderDoubleLines();
        }
        
        // render arrow for this specific link (but not for input connections)
        if (link.type !== 'input_connection') {
            this.renderLinkArrows();
        } else {
            // for input connections, ensure no arrows exist for this link
            this.linkGroup.selectAll('.link-arrow')
                .filter(d => d.source === link.source && d.target === link.target)
                .remove();
        }
        
        // render if-to-python nodes if this is an if-to-python connection
        if (sourceNode && targetNode && 
            sourceNode.type === 'if_node' && 
            targetNode.type === 'python_file') {
            this.renderIfToPythonNodes();
        }
    }

    removeSingleLink(link) {
        this.linkGroup
            .selectAll('.link')
            .filter(d => d.source === link.source && d.target === link.target)
            .remove();
        
        // also remove corresponding arrows
        this.linkGroup
            .selectAll('.link-arrow')
            .filter(d => d.source === link.source && d.target === link.target)
            .remove();
        
        // also remove corresponding double lines
        this.linkGroup
            .selectAll('.double-line')
            .filter(d => d.getAttribute('data-link-id') === `${link.source}-${link.target}`)
            .remove();
        
        // also remove corresponding if-to-python nodes
        this.linkGroup
            .selectAll('.if-to-python-node')
            .filter(d => d.getAttribute('data-link-id') === `${link.source}-${link.target}`)
            .remove();
    }

    updateLinkStyles() {
        this.linkGroup.selectAll('.link')
            .classed('selected', d => 
                this.state.selectedLink && 
                d.source === this.state.selectedLink.source && 
                d.target === this.state.selectedLink.target);
        
        // also update arrow colors when link selection changes
        this.renderLinkArrows();
        
        // also update if-to-python node colors when link selection changes
        this.updateIfToPythonNodeStyles();
    }

    updateLinksForNode(nodeId) {
        // efficiently update only links connected to the specified node
        this.linkGroup.selectAll('.link')
            .filter(d => d.source === nodeId || d.target === nodeId)
            .attr('d', d => this.calculateLinkPath(d));
        
        // also update arrows for these links
        this.renderLinkArrows();
        
        // also update double lines
        this.renderDoubleLines();
        
        // also update if-to-python nodes
        this.renderIfToPythonNodes();
    }

    renderLinkArrows() {
        // render arrow markers at the middle of each link (excluding input connections)
        const linksWithArrows = this.state.links.filter(link => link.type !== 'input_connection');
        
        const arrowSelection = this.linkGroup
            .selectAll('.link-arrow')
            .data(linksWithArrows, d => `${d.source}-${d.target}`);

        // enter new arrows
        const arrowEnter = arrowSelection.enter()
            .append('polygon')
            .attr('class', 'link-arrow');

        // update all arrows
        const arrowMerge = arrowEnter.merge(arrowSelection);
        this.updateArrowElements(arrowMerge);
        
        // remove old arrows
        arrowSelection.exit().remove();
        
        // render small nodes for if-to-python connections instead of arrows
        this.renderIfToPythonNodes();
    }

    updateArrowElements(arrowMerge) {
        arrowMerge.each((d, i, nodes) => {
            const arrow = d3.select(nodes[i]);
            const midPoint = this.getLinkMidpoint(d);
            const angle = this.getLinkAngle(d);
            
            // check if this is an if-to-python connection - if so, don't render arrow
            const sourceNode = this.state.getNode(d.source);
            const targetNode = this.state.getNode(d.target);
            if (sourceNode && targetNode && 
                sourceNode.type === 'if_node' && 
                targetNode.type === 'python_file') {
                return; // skip arrow rendering for if-to-python connections
            }
            
            if (midPoint) {
                // create arrow shape (triangle pointing in direction of link)
                const arrowSize = 9; // increased from 6 to 9 (50% larger)
                const points = [
                    [arrowSize, 0],
                    [-arrowSize/2, -arrowSize/2],
                    [-arrowSize/2, arrowSize/2]
                ];
                
                const pointsStr = points.map(p => p.join(',')).join(' ');
                
                // determine arrow color based on link selection state
                const isSelected = this.state.selectedLink && 
                    d.source === this.state.selectedLink.source && 
                    d.target === this.state.selectedLink.target;
                
                const arrowColor = isSelected ? 'var(--primary-color)' : 'var(--border-color)';
                
                arrow
                    .attr('points', pointsStr)
                    .attr('transform', `translate(${midPoint.x},${midPoint.y}) rotate(${angle})`)
                    .style('fill', arrowColor)
                    .style('stroke', 'none')
                    .style('pointer-events', 'none')
                    .attr('data-link-id', `${d.source}-${d.target}`); // add identifier for hover handling
            }
        });
    }

    renderIfToPythonNodes() {
        // find links that go from if nodes to python nodes
        const ifToPythonLinks = this.state.links.filter(link => {
            const sourceNode = this.state.getNode(link.source);
            const targetNode = this.state.getNode(link.target);
            return sourceNode && targetNode && 
                   sourceNode.type === 'if_node' && 
                   targetNode.type === 'python_file';
        });

        // remove existing if-to-python nodes
        this.linkGroup.selectAll('.if-to-python-node').remove();

        // create small nodes for if-to-python connections
        ifToPythonLinks.forEach(link => {
            const midPoint = this.getLinkMidpoint(link);
            
            if (midPoint) {
                // determine node color based on link selection state
                const isSelected = this.state.selectedLink && 
                    link.source === this.state.selectedLink.source && 
                    link.target === this.state.selectedLink.target;
                
                const nodeColor = isSelected ? 'var(--primary-color)' : 'var(--border-color)';
                const fillColor = isSelected ? 'var(--primary-color)' : 'var(--surface)';
                
                // create small circular node
                this.linkGroup.append('circle')
                    .datum(link)
                    .attr('class', 'if-to-python-node')
                    .attr('data-link-id', `${link.source}-${link.target}`)
                    .attr('cx', midPoint.x)
                    .attr('cy', midPoint.y)
                    .attr('r', 9) // 50% larger radius
                    .style('fill', fillColor)
                    .style('stroke', nodeColor)
                    .style('stroke-width', '2')
                    .style('cursor', 'pointer')
                    .style('pointer-events', 'all')
                    .on('click', (event, d) => {
                        // treat circle click like link click
                        this.state.emit('linkClicked', { event, link: d });
                    })
                    .on('mouseenter', (event, d) => {
                        // highlight on hover similar to arrows/links
                        const circle = d3.select(event.currentTarget);
                        circle.style('stroke', 'var(--primary-color)')
                              .style('fill', 'var(--surface)');
                    })
                    .on('mouseleave', (event, d) => {
                        // restore style based on selection state
                        this.updateIfToPythonNodeStyles();
                    });
            }
        });
    }

    getLinkMidpoint(link) {
        const sourceNode = this.state.getNode(link.source);
        const targetNode = this.state.getNode(link.target);
        
        if (!sourceNode || !targetNode) return null;
        
        const sourcePoint = this.getNodeConnectionPoint(sourceNode, targetNode);
        const targetPoint = this.getNodeConnectionPoint(targetNode, sourceNode);
        
        return {
            x: (sourcePoint.x + targetPoint.x) / 2,
            y: (sourcePoint.y + targetPoint.y) / 2
        };
    }

    getLinkAngle(link) {
        const sourceNode = this.state.getNode(link.source);
        const targetNode = this.state.getNode(link.target);
        
        if (!sourceNode || !targetNode) return 0;
        
        const sourcePoint = this.getNodeConnectionPoint(sourceNode, targetNode);
        const targetPoint = this.getNodeConnectionPoint(targetNode, sourceNode);
        
        const dx = targetPoint.x - sourcePoint.x;
        const dy = targetPoint.y - sourcePoint.y;
        
        return Math.atan2(dy, dx) * 180 / Math.PI;
    }

    updateArrowColor(link, isHovered) {
        // find the arrow for this specific link
        const arrow = this.linkGroup
            .selectAll('.link-arrow')
            .filter(d => d.source === link.source && d.target === link.target);
        
        if (!arrow.empty()) {
            // determine arrow color based on selection and hover state
            const isSelected = this.state.selectedLink && 
                link.source === this.state.selectedLink.source && 
                link.target === this.state.selectedLink.target;
            
            let arrowColor;
            if (isSelected || isHovered) {
                arrowColor = 'var(--primary-color)';
            } else {
                arrowColor = 'var(--border-color)';
            }
            
            arrow.style('fill', arrowColor);
        }
    }

    updateIfToPythonNodeStyles() {
        // update colors of if-to-python nodes based on selection state
        this.linkGroup.selectAll('.if-to-python-node').each((d, i, nodes) => {
            const node = d3.select(nodes[i]);
            const isSelected = this.state.selectedLink && 
                d.source === this.state.selectedLink.source && 
                d.target === this.state.selectedLink.target;
            
            const nodeColor = isSelected ? 'var(--primary-color)' : 'var(--border-color)';
            const fillColor = isSelected ? 'var(--primary-color)' : 'var(--surface)';
            
            node
                .style('stroke', nodeColor)
                .style('fill', fillColor);
        });
    }

    // connection line management (for drag connections)
    createConnectionLine(data) {
        this.connectionLine = this.connectionGroup
            .append('line')
            .attr('class', 'connection_line')
            .attr('x1', data.startX)
            .attr('y1', data.startY)
            .attr('x2', data.endX)
            .attr('y2', data.endY)
            .style('stroke', 'var(--primary-color)')
            .style('stroke-width', '2px')
            .style('stroke-dasharray', '5,5')
            .style('fill', 'none')
            .style('pointer-events', 'none');
    }

    updateConnectionLine(data) {
        if (this.connectionLine) {
            this.connectionLine
                .attr('x1', data.startX)
                .attr('y1', data.startY)
                .attr('x2', data.endX)
                .attr('y2', data.endY);
        }
    }

    removeConnectionLine() {
        if (this.connectionLine) {
            this.connectionLine.remove();
            this.connectionLine = null;
        }
    }

    // link animations
    animateLinkCreation(linkElement) {
        const totalLength = linkElement.node().getTotalLength();
        
        linkElement
            .attr('stroke-dasharray', totalLength + ' ' + totalLength)
            .attr('stroke-dashoffset', totalLength)
            .transition()
            .duration(500)
            .attr('stroke-dashoffset', 0)
            .on('end', function() {
                d3.select(this).attr('stroke-dasharray', null);
            });
    }

    animateLinkRemoval(linkElement, callback) {
        const totalLength = linkElement.node().getTotalLength();
        
        linkElement
            .attr('stroke-dasharray', totalLength + ' ' + totalLength)
            .attr('stroke-dashoffset', 0)
            .transition()
            .duration(300)
            .attr('stroke-dashoffset', totalLength)
            .on('end', callback);
    }

    // link highlighting and theming
    highlightLink(sourceId, targetId, highlight = true) {
        this.linkGroup
            .selectAll('.link')
            .filter(d => d.source === sourceId && d.target === targetId)
            .classed('highlighted', highlight);
    }

    setLinkTheme(sourceId, targetId, theme) {
        const linkElement = this.linkGroup
            .selectAll('.link')
            .filter(d => d.source === sourceId && d.target === targetId);

        switch (theme) {
            case 'error':
                linkElement.style('stroke', '#f44336');
                break;
            case 'warning':
                linkElement.style('stroke', '#ff9800');
                break;
            case 'success':
                linkElement.style('stroke', '#4caf50');
                break;
            case 'active':
                linkElement.style('stroke', '#2196f3');
                break;
            default:
                linkElement.style('stroke', null);
        }
    }

    // link flow animation
    animateLinkFlow(sourceId, targetId, duration = 2000) {
        const linkElement = this.linkGroup
            .selectAll('.link')
            .filter(d => d.source === sourceId && d.target === targetId);

        if (linkElement.empty()) return;

        const totalLength = linkElement.node().getTotalLength();
        const dashLength = 10;
        const gapLength = 5;
        
        linkElement
            .attr('stroke-dasharray', `${dashLength} ${gapLength}`)
            .attr('stroke-dashoffset', 0)
            .transition()
            .duration(duration)
            .ease(d3.easeLinear)
            .attr('stroke-dashoffset', -(dashLength + gapLength))
            .on('end', function() {
                // reset to normal
                d3.select(this)
                    .attr('stroke-dasharray', null)
                    .attr('stroke-dashoffset', null);
            });
    }

    // link clustering and bundling
    bundleLinks(links) {
        // todo: implement edge bundling for cleaner visualization
        // this would group similar links together to reduce visual clutter
    }

    // utility methods
    getLinkElement(sourceId, targetId) {
        return this.linkGroup
            .selectAll('.link')
            .filter(d => d.source === sourceId && d.target === targetId);
    }

    getLinkBounds(sourceId, targetId) {
        const linkElement = this.getLinkElement(sourceId, targetId);
        if (linkElement.empty()) return null;

        return linkElement.node().getBBox();
    }

    isLinkVisible(sourceId, targetId) {
        return !this.getLinkElement(sourceId, targetId).empty();
    }

    // link statistics
    getLinkStats() {
        return {
            totalLinks: this.state.links.length,
            straightLinks: this.state.links.filter(l => !l.type || l.type === 'straight').length,
            bezierLinks: this.state.links.filter(l => l.type === 'bezier').length,
            orthogonalLinks: this.state.links.filter(l => l.type === 'orthogonal').length
        };
    }

    // cleanup
    destroy() {
        this.linkGroup.remove();
        this.connectionGroup.remove();
    }
}

window.LinkRenderer = LinkRenderer;