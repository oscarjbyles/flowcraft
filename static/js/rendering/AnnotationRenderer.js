// annotation rendering and interactions (text labels)
class AnnotationRenderer {
    constructor(stateManager, container) {
        this.state = stateManager;
        this.container = container;
        this.annotationGroup = this.container.append('g').attr('class', 'annotations');
        this.setupEventListeners();
    }

    setupEventListeners() {
        this.state.on('stateChanged', () => this.render());
        this.state.on('annotationAdded', () => this.render());
        this.state.on('annotationUpdated', () => this.render());
        this.state.on('annotationRemoved', () => this.render());
    }

    render() {
        const data = this.state.annotations || [];

        const selection = this.annotationGroup
            .selectAll('.annotation_item')
            .data(data, d => d.id);

        const enter = selection.enter()
            .append('g')
            .attr('class', 'annotation_item')
            .attr('transform', d => `translate(${d.x},${d.y})`);

        // selection box (sized after text renders)
        enter.append('rect')
            .attr('class', 'annotation_box')
            .attr('x', -4)
            .attr('y', -12)
            .attr('width', 0)
            .attr('height', 24)
            .lower();

        // text label
        enter.append('text')
            .attr('class', 'annotation_text')
            .attr('text-anchor', 'start')
            .attr('dy', '.35em')
            .style('font-family', 'Roboto, sans-serif')
            .style('font-size', d => `${d.fontSize || 14}px`)
            .style('fill', 'var(--on-surface)')
            .text(d => d.text);

        // drag behavior for annotations
        const self = this;
        const dragBehavior = d3.drag()
            // only allow dragging in build mode
            .filter(() => self.state.isBuildMode)
            .container(() => self.container.node())
            .on('start', (event, d) => {
                // compute pointer in content coords using inverse zoom
                const svgNode = self.container.node() && self.container.node().ownerSVGElement;
                const [px, py] = d3.pointer(event, svgNode || self.container.node());
                const t = self.state.transform || d3.zoomIdentity;
                const cx = (px - t.x) / t.k;
                const cy = (py - t.y) / t.k;
                // store original and offset to prevent jump on drag start
                d._dragStartX = d.x;
                d._dragStartY = d.y;
                d._offsetX = d.x - cx;
                d._offsetY = d.y - cy;
                this.state.setDragging(true);
                // disable zoom for smooth drag
                this.state.emit('disableZoom');
                // suppress any subsequent canvas click (even if drag is minimal)
                this.state.suppressNextCanvasClick = true;
                // prevent the canvas from seeing this as a click origin
                if (event.sourceEvent && typeof event.sourceEvent.stopPropagation === 'function') {
                    event.sourceEvent.stopPropagation();
                    if (typeof event.sourceEvent.preventDefault === 'function') {
                        event.sourceEvent.preventDefault();
                    }
                }
            })
            // use function() so `this` is the dragged element
            .on('drag', function(event, d) {
                // compute pointer in content coords using inverse zoom
                const svgNode = self.container.node() && self.container.node().ownerSVGElement;
                const [px, py] = d3.pointer(event, svgNode || self.container.node());
                const t = self.state.transform || d3.zoomIdentity;
                const cx = (px - t.x) / t.k;
                const cy = (py - t.y) / t.k;
                d.x = cx + (d._offsetX || 0);
                d.y = cy + (d._offsetY || 0);
                d3.select(this).attr('transform', `translate(${d.x},${d.y})`);
            })
            .on('end', (event, d) => {
                // check if position actually changed
                const positionChanged = d._dragStartX !== d.x || d._dragStartY !== d.y;
                
                // persist new position
                this.state.updateAnnotation(d.id, { x: d.x, y: d.y });
                
                // only suppress canvas click if we actually dragged
                if (positionChanged) {
                    this.state.suppressNextCanvasClick = true;
                }
                
                delete d._dragStartX; delete d._dragStartY; delete d._offsetX; delete d._offsetY;
                this.state.setDragging(false);
                // re-enable zoom
                this.state.emit('enableZoom');
                
                // stop event propagation to prevent canvas click
                if (event.sourceEvent && typeof event.sourceEvent.stopPropagation === 'function') {
                    event.sourceEvent.stopPropagation();
                    if (typeof event.sourceEvent.preventDefault === 'function') {
                        event.sourceEvent.preventDefault();
                    }
                }
            });

        // update (merge enter and existing)
        const merged = enter.merge(selection);
        merged.attr('transform', d => `translate(${d.x},${d.y})`);
        merged.select('text.annotation_text')
            .text(d => d.text)
            .style('font-size', d => `${d.fontSize || 14}px`);
            
        // set up click and drag behavior on merged selection
        merged.on('mousedown', (event, d) => {
            // stop propagation to prevent canvas from handling this
            event.stopPropagation();
            if (event.preventDefault) event.preventDefault();
            this.state.selectAnnotation(d.id);
        }).call(dragBehavior);

        // size selection box to text bbox
        merged.each(function(d) {
            const g = d3.select(this);
            const textEl = g.select('text.annotation_text').node();
            if (!textEl) return;
            const bbox = textEl.getBBox();
            g.select('rect.annotation_box')
                .attr('x', bbox.x - 6)
                .attr('y', bbox.y - 4)
                .attr('width', bbox.width + 12)
                .attr('height', bbox.height + 8);
        });

        // selection styling
        merged.classed('selected', d => this.state.selectedAnnotation && this.state.selectedAnnotation.id === d.id);

        // exit
        selection.exit().remove();
    }
}

window.AnnotationRenderer = AnnotationRenderer;



