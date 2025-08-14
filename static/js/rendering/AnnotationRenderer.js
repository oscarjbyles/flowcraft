// annotation rendering and interactions (text labels)
(function(){
    'use strict';
    if (window.AnnotationRenderer) { return; }

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
            // allow dragging whenever not in run mode (build/settings ok)
            .filter(() => !self.state.isRunMode)
            .container(() => self.container.node())
            // explicitly set the subject so event.x/y track the datum position with correct offset
            .subject((event, d) => ({ x: d.x, y: d.y }))
            .on('start', function(event, d) {
                d._dragStartX = d.x;
                d._dragStartY = d.y;
                self.state.setDragging(true);
                // disable zoom for smooth drag
                self.state.emit('disableZoom');
                // suppress any subsequent canvas click (even if drag is minimal)
                self.state.suppressNextCanvasClick = true;
                // prevent the canvas from seeing this as a click origin
                if (event.sourceEvent && typeof event.sourceEvent.stopPropagation === 'function') {
                    event.sourceEvent.stopPropagation();
                    if (typeof event.sourceEvent.preventDefault === 'function') {
                        event.sourceEvent.preventDefault();
                    }
                }
                // ensure the dragged annotation group is above others
                try {
                    const groupEl = this.tagName === 'g' ? this : this.parentNode;
                    d3.select(groupEl).raise();
                } catch (_) {}
            })
            // use function() so `this` is the dragged element
            .on('drag', function(event, d) {
                // event.x/event.y are the subject coords including pointer offset, in container space
                d.x = event.x;
                d.y = event.y;
                const groupEl = this.tagName === 'g' ? this : this.parentNode;
                d3.select(groupEl).attr('transform', `translate(${d.x},${d.y})`);
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
                
                delete d._dragStartX; delete d._dragStartY;
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
        }).style('cursor', 'move').call(dragBehavior);

        // also bind drag to child elements to ensure reliable hit testing across browsers
        merged.select('rect.annotation_box')
            .style('pointer-events', 'all')
            .style('cursor', 'move')
            .call(dragBehavior);
        merged.select('text.annotation_text')
            .style('pointer-events', 'all')
            .style('cursor', 'move')
            .call(dragBehavior);

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
})();



