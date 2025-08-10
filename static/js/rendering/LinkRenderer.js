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

        // storage for link alert states
        this.linkAlerts = new Map(); // key: `${source}-${target}` -> boolean
    }

    setupEventListeners() {
        this.state.on('linkAdded', (link) => this.renderSingleLink(link));
        this.state.on('linkRemoved', (link) => this.removeSingleLink(link));
        this.state.on('updateLinkStyles', () => this.updateLinkStyles());
        this.state.on('nodeUpdated', () => this.render()); // re-render links when nodes move
        this.state.on('stateChanged', () => this.render());
        this.state.on('updateLinksForNode', (nodeId) => this.updateLinksForNode(nodeId));
        // position alerts during live updates
        this.state.on('updateLinksForNode', () => this.updateLinkCoverageAlerts());
        
        // recompute coverage when data or topology changes
        this.state.on('dataLoaded', () => this.computeLinkCoverageFromAnalysis());
        this.state.on('nodeUpdated', () => this.computeLinkCoverageFromAnalysis());
        this.state.on('linkAdded', () => this.computeLinkCoverageFromAnalysis());
        this.state.on('linkRemoved', () => this.computeLinkCoverageFromAnalysis());
        
        // connection line events
        this.state.on('createConnectionLine', (data) => this.createConnectionLine(data));
        this.state.on('updateConnectionLine', (data) => this.updateConnectionLine(data));
        this.state.on('removeConnectionLine', () => this.removeConnectionLine());

        // coverage alert events from sidebar analysis
        this.state.on('updateLinkCoverageAlert', ({ sourceId, targetId, hasMissing }) => {
            const key = `${sourceId}-${targetId}`;
            if (hasMissing) {
                this.linkAlerts.set(key, true);
            } else {
                this.linkAlerts.delete(key);
            }
            this.updateLinkCoverageAlerts();
        });
        this.state.on('clearNodeCoverageAlerts', () => {
            // nothing to do here; kept for legacy compatibility
        });
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
        // after full render, ensure coverage alerts are drawn
        this.computeLinkCoverageFromAnalysis();
        this.updateLinkCoverageAlerts();
    }

    renderDoubleLines() {
        // find links that should render as double lines (if→python and python→if)
        const doubleLineLinks = this.state.links.filter(link => {
            const sourceNode = this.state.getNode(link.source);
            const targetNode = this.state.getNode(link.target);
            if (!sourceNode || !targetNode) return false;
            const isIfToPython = sourceNode.type === 'if_node' && targetNode.type === 'python_file';
            const isPythonToIf = sourceNode.type === 'python_file' && targetNode.type === 'if_node';
            return isIfToPython || isPythonToIf;
        });

        // remove existing double lines
        this.linkGroup.selectAll('.double-line').remove();

        // create double lines for targeted connections
        doubleLineLinks.forEach(link => {
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
            .style('cursor', d => {
                const src = this.state.getNode(d.source);
                const tgt = this.state.getNode(d.target);
                const isPyToIf = src && tgt && src.type === 'python_file' && tgt.type === 'if_node';
                return (d.selectable === false || isPyToIf) ? 'default' : 'pointer';
            })
            .style('stroke-dasharray', d => d.style === 'dashed' ? '5,5' : null)
            .style('marker-end', d => d.type === 'input_connection' ? 'none' : null)
            .style('stroke', d => {
                // hide original line for double-line connections
                const sourceNode = this.state.getNode(d.source);
                const targetNode = this.state.getNode(d.target);
                if (sourceNode && targetNode && (
                    (sourceNode.type === 'if_node' && targetNode.type === 'python_file') ||
                    (sourceNode.type === 'python_file' && targetNode.type === 'if_node')
                )) {
                    return 'transparent';
                }
                return null; // use default stroke
            })
            .on('click', (event, d) => {
                // only handle clicks for selectable links
                const src = this.state.getNode(d.source);
                const tgt = this.state.getNode(d.target);
                const isPyToIf = src && tgt && src.type === 'python_file' && tgt.type === 'if_node';
                if (d.selectable !== false && !isPyToIf) {
                    this.state.emit('linkClicked', { event, link: d });
                }
            })
            .on('mouseenter', (event, d) => {
                // update arrow color on hover
                const src = this.state.getNode(d.source);
                const tgt = this.state.getNode(d.target);
                const isPyToIf = src && tgt && src.type === 'python_file' && tgt.type === 'if_node';
                if (d.selectable !== false && d.type !== 'input_connection' && !isPyToIf) {
                    this.updateArrowColor(d, true);
                }
            })
            .on('mouseleave', (event, d) => {
                // reset arrow color when not hovering
                const src = this.state.getNode(d.source);
                const tgt = this.state.getNode(d.target);
                const isPyToIf = src && tgt && src.type === 'python_file' && tgt.type === 'if_node';
                if (d.selectable !== false && d.type !== 'input_connection' && !isPyToIf) {
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
        // determine if this link is from a python node to an if node
        const sourceNodeForSelect = this.state.getNode(link.source);
        const targetNodeForSelect = this.state.getNode(link.target);
        const isPythonToIf = !!(sourceNodeForSelect && targetNodeForSelect &&
            sourceNodeForSelect.type === 'python_file' && targetNodeForSelect.type === 'if_node');

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
            .style('cursor', (link.selectable === false || isPythonToIf) ? 'default' : 'pointer')
            .style('stroke-dasharray', link.style === 'dashed' ? '5,5' : null)
            .style('marker-end', link.type === 'input_connection' ? 'none' : null)
            .style('stroke', () => {
                // hide original line for double-line connections
                const sourceNode = this.state.getNode(link.source);
                const targetNode = this.state.getNode(link.target);
                if (sourceNode && targetNode && (
                    (sourceNode.type === 'if_node' && targetNode.type === 'python_file') ||
                    (sourceNode.type === 'python_file' && targetNode.type === 'if_node')
                )) {
                    return 'transparent';
                }
                return null; // use default stroke
            })
            .on('click', (event, d) => {
                // only handle clicks for selectable links
                const src = this.state.getNode(d.source);
                const tgt = this.state.getNode(d.target);
                const isPyToIf = src && tgt && src.type === 'python_file' && tgt.type === 'if_node';
                if (d.selectable !== false && !isPyToIf) {
                    this.state.emit('linkClicked', { event, link: d });
                }
            })
            .on('mouseenter', (event, d) => {
                // update arrow color on hover
                const src = this.state.getNode(d.source);
                const tgt = this.state.getNode(d.target);
                const isPyToIf = src && tgt && src.type === 'python_file' && tgt.type === 'if_node';
                if (d.selectable !== false && d.type !== 'input_connection' && !isPyToIf) {
                    this.updateArrowColor(d, true);
                }
            })
            .on('mouseleave', (event, d) => {
                // reset arrow color when not hovering
                const src = this.state.getNode(d.source);
                const tgt = this.state.getNode(d.target);
                const isPyToIf = src && tgt && src.type === 'python_file' && tgt.type === 'if_node';
                if (d.selectable !== false && d.type !== 'input_connection' && !isPyToIf) {
                    this.updateArrowColor(d, false);
                }
            });
            
        this.animateLinkCreation(linkElement);
        
        // render double lines if this is a targeted connection
        const sourceNode = this.state.getNode(link.source);
        const targetNode = this.state.getNode(link.target);
        if (sourceNode && targetNode && (
            (sourceNode.type === 'if_node' && targetNode.type === 'python_file') ||
            (sourceNode.type === 'python_file' && targetNode.type === 'if_node')
        )) {
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
        
        // render if-to-python nodes only for if-to-python connections
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
        // maintain coverage alert positions
        this.updateLinkCoverageAlerts();
    }

    updateLinksForNode(nodeId) {
        // efficiently update only links connected to the specified node
        this.linkGroup.selectAll('.link')
            .filter(d => d.source === nodeId || d.target === nodeId)
            .attr('d', d => this.calculateLinkPath(d));
        
        // ensure draw order: double lines first, arrows on top
        this.renderDoubleLines();
        this.renderLinkArrows();
        
        // also update if-to-python nodes
        this.renderIfToPythonNodes();
        // refresh alert positions
        this.updateLinkCoverageAlerts();
    }

    renderLinkArrows() {
        // render arrow markers at the middle of each link
        // exclude: input connections and python→if connections (no triangle arrow requested)
        const linksWithArrows = this.state.links.filter(link => {
            if (link.type === 'input_connection') return false;
            const sourceNode = this.state.getNode(link.source);
            const targetNode = this.state.getNode(link.target);
            // remove triangle arrowhead for python→if connections
            if (sourceNode && targetNode && sourceNode.type === 'python_file' && targetNode.type === 'if_node') {
                return false;
            }
            return true;
        });
        
        // do not render background polygons/bars for python→if arrows anymore (we removed triangle arrow)
        // bind empty data so any existing backgrounds are cleaned up
        const pythonToIfLinks = [];
        
        // add a resilient bar under the arrow to mask double lines during movement
        const bgLineSelection = this.linkGroup
            .selectAll('.link_arrow_bg_line')
            .data(pythonToIfLinks, d => `${d.source}-${d.target}`);

        const bgLineEnter = bgLineSelection.enter()
            .append('line')
            .attr('class', 'link_arrow_bg_line')
            .attr('vector-effect', 'non-scaling-stroke')
            .style('stroke', '#121212')
            .style('stroke-width', '10px')
            .style('stroke-linecap', 'round')
            .style('opacity', '1')
            .style('pointer-events', 'none')
            .attr('stroke', '#121212')
            .attr('stroke-width', '10')
            .attr('stroke-linecap', 'round');

        const bgLineMerge = bgLineEnter.merge(bgLineSelection);
        this.updateArrowBackgroundLineElements(bgLineMerge);

        const bgSelection = this.linkGroup
            .selectAll('.link_arrow_bg')
            .data(pythonToIfLinks, d => `${d.source}-${d.target}`);
        
        const bgEnter = bgSelection.enter()
            .append('polygon')
            .attr('class', 'link_arrow_bg')
            .style('fill', '#121212')
            .style('stroke', '#121212')
            .style('stroke-width', '4px')
            .style('pointer-events', 'none');
        
        const bgMerge = bgEnter.merge(bgSelection);
        this.updateArrowBackgroundElements(bgMerge);
        
        const arrowSelection = this.linkGroup
            .selectAll('.link-arrow')
            .data(linksWithArrows, d => `${d.source}-${d.target}`);

        // enter new arrows with explicit base styles to prevent inherited transparency
        const arrowEnter = arrowSelection.enter()
            .append('polygon')
            .attr('class', 'link-arrow')
            .style('fill', 'var(--border-color)')
            .style('stroke', 'none')
            .style('stroke-width', null)
            .style('fill-opacity', '1')
            .style('pointer-events', 'none');

        // update all arrows
        const arrowMerge = arrowEnter.merge(arrowSelection);
        this.updateArrowElements(arrowMerge);
        // ensure z-order: double lines (bottom) < bg line < bg polygon < arrow (top)
        bgLineMerge.raise();
        bgMerge.raise();
        arrowMerge.raise();
        
        // remove old arrows
        arrowSelection.exit().remove();
        // remove old backgrounds
        bgSelection.exit().remove();
        bgLineSelection.exit().remove();
        
        // render small nodes for if-to-python connections instead of arrows
        this.renderIfToPythonNodes();
    }

    updateLinkCoverageAlerts() {
        // draw alert circle with exclamation at the midpoint for any link flagged in linkAlerts
        const entries = Array.from(this.linkAlerts.entries());
        const data = entries.map(([key]) => {
            const [s, t] = key.split('-');
            return { source: Number(s), target: Number(t) };
        });

        const alertSel = this.linkGroup.selectAll('.link-coverage-alert').data(data, d => `${d.source}-${d.target}`);

        const alertEnter = alertSel.enter().append('g')
            .attr('class', 'link-coverage-alert')
            .style('pointer-events', 'all')
            .style('cursor', 'pointer')
            .on('click', (event, d) => {
                const link = this.state.getLink(d.source, d.target);
                if (link) {
                    this.state.emit('linkClicked', { event, link });
                }
            });

        alertEnter.append('circle')
            .attr('r', 12)
            .style('fill', '#f44336');

        alertEnter.append('text')
            .attr('class', 'alert_mark')
            .attr('dy', '0.35em')
            .attr('text-anchor', 'middle')
            .text('!')
            .style('font-weight', '700')
            .style('fill', '#ffffff')
            .style('font-size', '14px');

        const alertMerge = alertEnter.merge(alertSel);
        alertMerge
            .style('pointer-events', 'all')
            .style('cursor', 'pointer')
            .on('click', (event, d) => {
                const link = this.state.getLink(d.source, d.target);
                if (link) {
                    this.state.emit('linkClicked', { event, link });
                }
            });
        alertMerge.each((d, i, nodes) => {
            const g = d3.select(nodes[i]);
            const mid = this.getLinkMidpoint(d);
            const sourceNode = this.state.getNode(d.source);
            const targetNode = this.state.getNode(d.target);
            // position only for python→python; otherwise remove
            if (!sourceNode || !targetNode || sourceNode.type !== 'python_file' || targetNode.type !== 'python_file' || !mid) {
                g.remove();
                return;
            }
            // align to the right of the line (perpendicular offset from the line direction)
            const angleRad = this.getLinkAngle(d) * Math.PI / 180;
            const offset = 20; // px perpendicular shift to the right side (slightly more)
            // right-hand normal of (cos, sin) is (sin, -cos)
            const nx = Math.sin(angleRad);
            const ny = -Math.cos(angleRad);
            const ox = nx * offset;
            const oy = ny * offset;
            g.attr('transform', `translate(${mid.x + ox}, ${mid.y + oy})`);
        });

        alertSel.exit().remove();
    }

    computeLinkCoverageFromAnalysis() {
        // compute coverage for all python→python links using available analysis endpoint
        // note: to keep ui responsive, only compute when both files exist
        const pyPyLinks = this.state.links.filter(l => {
            const s = this.state.getNode(l.source);
            const t = this.state.getNode(l.target);
            return s && t && s.type === 'python_file' && t.type === 'python_file' && s.pythonFile && t.pythonFile;
        });
        // clear alerts before recomputation
        this.linkAlerts.clear();
        // fire off computations sequentially to avoid flooding; best-effort only
        const run = async () => {
            for (const link of pyPyLinks) {
                try {
                    const respSrc = await fetch('/api/analyze-python-function', {
                        method: 'POST', headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ python_file: this.state.getNode(link.source).pythonFile })
                    });
                    const respTgt = await fetch('/api/analyze-python-function', {
                        method: 'POST', headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ python_file: this.state.getNode(link.target).pythonFile })
                    });
                    const srcData = await respSrc.json();
                    const tgtData = await respTgt.json();
                    if (!srcData.success || !tgtData.success) continue;
                    // returns set
                    const returns = [];
                    (srcData.returns || []).forEach(r => {
                        if (!r) return;
                        if (r.type === 'variable' && typeof r.name === 'string') returns.push(r.name);
                        else if (r.type === 'tuple' && Array.isArray(r.items)) r.items.forEach(it => { if (it?.name) returns.push(it.name); });
                        else if (r.type === 'dict' && Array.isArray(r.items)) r.items.forEach(it => { if (it?.key) returns.push(it.key); });
                    });
                    const retSet = new Set(returns);
                    const args = Array.isArray(tgtData.formal_parameters) ? tgtData.formal_parameters.filter(n => n !== 'self' && n !== 'cls') : [];
                    const hasMissing = args.some(a => !retSet.has(a));
                    const key = `${link.source}-${link.target}`;
                    if (hasMissing) this.linkAlerts.set(key, true);
                } catch (_) {
                    // ignore network errors; no alert
                }
            }
            this.updateLinkCoverageAlerts();
        };
        run();
    }

    updateArrowBackgroundElements(bgMerge) {
        // update background polygons for python→if arrows
        bgMerge.each((d, i, nodes) => {
            const bg = d3.select(nodes[i]);
            const midPoint = this.getLinkMidpoint(d);
            const angle = this.getLinkAngle(d);

            if (!midPoint) return;

            // geometry mirrors the python→if arrow
            const arrowWidth = 10;
            const arrowHeight = 12;
            const points = [
                [arrowWidth, 0],
                [-arrowWidth / 2, -arrowHeight / 2],
                [-arrowWidth / 2, arrowHeight / 2]
            ];
            const pointsStr = points.map(p => p.join(',')).join(' ');

            bg
                .attr('points', pointsStr)
                .attr('transform', `translate(${midPoint.x},${midPoint.y}) rotate(${angle})`)
                .attr('data-link-id', `${d.source}-${d.target}`)
                .style('fill', '#121212')
                .style('stroke', '#121212')
                .style('stroke-width', '4px')
                .style('pointer-events', 'none')
                .attr('fill', '#121212')
                .attr('stroke', '#121212')
                .attr('opacity', '1');
        });
    }

    updateArrowBackgroundLineElements(bgLineMerge) {
        // draw a short thick bar under the arrow to guarantee a solid #121212 backdrop
        const halfLength = 9; // total ~18px long bar under arrow
        bgLineMerge.each((d, i, nodes) => {
            const line = d3.select(nodes[i]);
            const midPoint = this.getLinkMidpoint(d);
            const angleRad = this.getLinkAngle(d) * Math.PI / 180;
            if (!midPoint) return;

            const dx = Math.cos(angleRad) * halfLength;
            const dy = Math.sin(angleRad) * halfLength;

            line
                .attr('x1', midPoint.x - dx)
                .attr('y1', midPoint.y - dy)
                .attr('x2', midPoint.x + dx)
                .attr('y2', midPoint.y + dy)
                .style('stroke', '#121212')
                .style('stroke-width', '10px')
                .attr('stroke', '#121212')
                .attr('stroke-width', '10')
                .attr('opacity', '1')
                .style('opacity', '1')
                .style('pointer-events', 'none')
                .attr('data-link-id', `${d.source}-${d.target}`);
        });
    }

    updateArrowElements(arrowMerge) {
        arrowMerge.each((d, i, nodes) => {
            const arrow = d3.select(nodes[i]);
            const midPoint = this.getLinkMidpoint(d);
            const angle = this.getLinkAngle(d);
            
            // check if this is an if-to-python connection - if so, don't render arrow
            const sourceNode = this.state.getNode(d.source);
            const targetNode = this.state.getNode(d.target);
            if (sourceNode && targetNode) {
                // no triangle arrows for python→if
                if (sourceNode.type === 'python_file' && targetNode.type === 'if_node') {
                    return;
                }
                // still skip for if→python (handled by special circle elsewhere)
                if (sourceNode.type === 'if_node' && targetNode.type === 'python_file') {
                    return;
                }
            }
            
            // customize arrow specifically for python→if connections
            const isPythonToIf = sourceNode && targetNode &&
                sourceNode.type === 'python_file' && targetNode.type === 'if_node';
            
            if (midPoint) {
                if (isPythonToIf) {
                    // removed triangle arrow for python→if; ensure any lingering elems are cleaned
                    this.linkGroup
                        .selectAll('.link_arrow_bg')
                        .filter(e => e.source === d.source && e.target === d.target)
                        .remove();
                    this.linkGroup
                        .selectAll('.link_arrow_bg_line')
                        .filter(e => e.source === d.source && e.target === d.target)
                        .remove();
                    arrow.remove();
                } else {
                    // default arrow style
                    const arrowSize = 9; // standard arrow
                    const points = [
                        [arrowSize, 0],
                        [-arrowSize/2, -arrowSize/2],
                        [-arrowSize/2, arrowSize/2]
                    ];
                    const pointsStr = points.map(p => p.join(',')).join(' ');
                    
                    const isSelected = this.state.selectedLink && 
                        d.source === this.state.selectedLink.source && 
                        d.target === this.state.selectedLink.target;
                    const arrowColor = isSelected ? 'var(--primary-color)' : 'var(--border-color)';
                    
                    // ensure any lingering background for this link is removed if not python→if
                    this.linkGroup
                        .selectAll('.link_arrow_bg')
                        .filter(e => e.source === d.source && e.target === d.target)
                        .remove();
                    this.linkGroup
                        .selectAll('.link_arrow_bg_line')
                        .filter(e => e.source === d.source && e.target === d.target)
                        .remove();

                    arrow
                        .attr('points', pointsStr)
                        .attr('transform', `translate(${midPoint.x},${midPoint.y}) rotate(${angle})`)
                        .style('fill', arrowColor)
                        .style('stroke', 'none')
                        .attr('fill', arrowColor)
                        .attr('opacity', '1')
                        .style('pointer-events', 'none')
                        .attr('data-link-id', `${d.source}-${d.target}`);
                }
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
            // determine color based on selection and hover state
            const isSelected = this.state.selectedLink && 
                link.source === this.state.selectedLink.source && 
                link.target === this.state.selectedLink.target;
            const sourceNode = this.state.getNode(link.source);
            const targetNode = this.state.getNode(link.target);
            const isPythonToIf = sourceNode && targetNode &&
                sourceNode.type === 'python_file' && targetNode.type === 'if_node';

            const activeColor = (isSelected || isHovered) ? 'var(--primary-color)' : 'var(--border-color)';
            if (isPythonToIf) {
                // python→if: keep fill constant and fixed stroke (also force opacity)
                arrow.style('fill', '#121212')
                     .style('stroke', '#666666')
                     .style('stroke-width', '1px')
                     .style('fill-opacity', '1');
            } else {
                // default: update fill color
                arrow.style('fill', activeColor)
                     .style('stroke', 'none')
                     .style('fill-opacity', '1');
            }
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