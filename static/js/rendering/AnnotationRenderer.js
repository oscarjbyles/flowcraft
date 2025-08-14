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
        this.state.on('selectionChanged', () => this.updateAnnotationStyles());
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
                // store initial pointer position for click detection
                d._pointerStartX = event.x;
                d._pointerStartY = event.y;
                // store whether this annotation was already selected
                d._wasSelected = self.state.selectedAnnotation && self.state.selectedAnnotation.id === d.id;
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
                
                // check if this was a click (minimal movement) or a drag
                const clickThreshold = 5; // pixels
                const pointerDistance = Math.sqrt(
                    Math.pow(event.x - d._pointerStartX, 2) + 
                    Math.pow(event.y - d._pointerStartY, 2)
                );
                const wasClick = pointerDistance < clickThreshold;
                
                // handle selection logic
                if (wasClick && !positionChanged) {
                    // pure click - toggle selection if it was already selected, otherwise select it
                    if (d._wasSelected) {
                        // was already selected, deselect it
                        this.state.clearSelection();
                    } else {
                        // wasn't selected, select it
                        this.state.selectAnnotation(d.id);
                    }
                } else if (positionChanged) {
                    // this was a drag - ensure the annotation stays selected
                    if (!d._wasSelected) {
                        // if it wasn't selected before dragging, select it now
                        this.state.selectAnnotation(d.id);
                    }
                    // if it was already selected, keep it selected (no action needed)
                }
                
                // persist new position if it changed
                if (positionChanged) {
                    this.state.updateAnnotation(d.id, { x: d.x, y: d.y });
                }
                
                // only suppress canvas click if we actually dragged
                if (positionChanged) {
                    this.state.suppressNextCanvasClick = true;
                }
                
                delete d._dragStartX; delete d._dragStartY;
                delete d._pointerStartX; delete d._pointerStartY;
                delete d._wasSelected;
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
            
        // set up drag behavior on merged selection (selection handled in drag end)
        merged.style('cursor', 'move').call(dragBehavior);

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

        // exit
        selection.exit().remove();
        
        // update selection styles
        this.updateAnnotationStyles();
    }

    updateAnnotationStyles() {
        const selectedAnnotation = this.state.selectedAnnotation;
        this.annotationGroup.selectAll('.annotation_item')
            .classed('selected', d => selectedAnnotation && selectedAnnotation.id === d.id);
    }
}

window.AnnotationRenderer = AnnotationRenderer;
})();



