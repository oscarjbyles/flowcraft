// annotation rendering and interactions (text labels and arrows)
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
        this.state.on('modeChanged', () => {
            // force a complete re-render when mode changes to ensure proper visibility
            setTimeout(() => this.render(), 0);
        });
        this.state.on('transformChanged', () => this.render()); // re-render when zoom/pan changes
    }

    render() {
        const data = this.state.annotations || [];
        const isBuildMode = this.state.isBuildMode;

        const selection = this.annotationGroup
            .selectAll('.annotation_item')
            .data(data, d => d.id);

        const enter = selection.enter()
            .append('g')
            .attr('class', 'annotation_item')
            .attr('transform', d => `translate(${d.x},${d.y})`);

        // render different annotation types
        enter.each((d, i, nodes) => {
            const group = d3.select(nodes[i]);
            if (d.type === 'text') {
                this.renderTextAnnotation(group, d);
            } else if (d.type === 'arrow') {
                this.renderArrowAnnotation(group, d, isBuildMode);
            }
        });

        // update (merge enter and existing)
        const merged = enter.merge(selection);
        merged.attr('transform', d => `translate(${d.x},${d.y})`);
        
        // update text annotations
        merged.select('text.annotation_text')
            .text(d => d.type === 'text' ? d.text : '')
            .style('font-size', d => d.type === 'text' ? `${d.fontSize || 14}px` : '14px');
            
        // update arrow annotations
        merged.select('line.annotation_arrow')
            .attr('x1', d => d.type === 'arrow' ? d.startX - d.x : 0)
            .attr('y1', d => d.type === 'arrow' ? d.startY - d.y : 0)
            .attr('x2', d => d.type === 'arrow' ? d.endX - d.x : 0)
            .attr('y2', d => d.type === 'arrow' ? d.endY - d.y : 0)
            .style('stroke-width', d => d.type === 'arrow' ? `${d.strokeWidth || 2}px` : '2px')
            .style('stroke', d => d.type === 'arrow' ? d.strokeColor : 'var(--on-surface)');

        // update arrow end points with proper visibility
        merged.select('circle.arrow_start')
            .attr('cx', d => d.type === 'arrow' ? d.startX - d.x : 0)
            .attr('cy', d => d.type === 'arrow' ? d.startY - d.y : 0)
            .style('display', d => d.type === 'arrow' && isBuildMode ? 'block' : 'none');
            
        merged.select('circle.arrow_end')
            .attr('cx', d => d.type === 'arrow' ? d.endX - d.x : 0)
            .attr('cy', d => d.type === 'arrow' ? d.endY - d.y : 0)
            .style('display', d => d.type === 'arrow' && isBuildMode ? 'block' : 'none');
            
        // update arrow heads
        merged.select('polygon.arrow_head')
            .attr('points', d => {
                if (d.type !== 'arrow') return '';
                const startX = d.startX - d.x;
                const startY = d.startY - d.y;
                const endX = d.endX - d.x;
                const endY = d.endY - d.y;
                
                const arrowLength = 15;
                const arrowAngle = Math.PI / 6;
                const dx = endX - startX;
                const dy = endY - startY;
                const angle = Math.atan2(dy, dx);
                
                const x1 = endX - arrowLength * Math.cos(angle - arrowAngle);
                const y1 = endY - arrowLength * Math.sin(angle - arrowAngle);
                const x2 = endX - arrowLength * Math.cos(angle + arrowAngle);
                const y2 = endY - arrowLength * Math.sin(angle + arrowAngle);
                
                return `${endX},${endY} ${x1},${y1} ${x2},${y2}`;
            });

        // set up drag behaviors only in build mode
        if (isBuildMode) {
            this.setupDragBehaviors(merged);
        } else {
            // remove drag behaviors in run mode
            merged.on('.drag', null);
            merged.select('rect.annotation_box').on('.drag', null);
            merged.select('text.annotation_text').on('.drag', null);
            merged.select('circle.arrow_start').on('.drag', null);
            merged.select('circle.arrow_end').on('.drag', null);
        }

        // size selection boxes
        merged.each((d, i, nodes) => {
            const group = d3.select(nodes[i]);
            if (d.type === 'text') {
                this.sizeTextSelectionBox(group, d);
            } else if (d.type === 'arrow') {
                this.sizeArrowSelectionBox(group, d);
            }
        });

        // exit
        selection.exit().remove();
        
        // update selection styles
        this.updateAnnotationStyles();
    }

    renderTextAnnotation(group, data) {
        // selection box (sized after text renders)
        group.append('rect')
            .attr('class', 'annotation_box')
            .attr('x', -4)
            .attr('y', -12)
            .attr('width', 0)
            .attr('height', 24)
            .lower();

        // text label
        group.append('text')
            .attr('class', 'annotation_text')
            .attr('text-anchor', 'start')
            .attr('dy', '.35em')
            .style('font-family', 'Roboto, sans-serif')
            .style('font-size', `${data.fontSize || 14}px`)
            .style('fill', 'var(--on-surface)')
            .text(data.text);
    }

    renderArrowAnnotation(group, data, isBuildMode) {
        // arrow line
        group.append('line')
            .attr('class', 'annotation_arrow')
            .attr('x1', data.startX - data.x)
            .attr('y1', data.startY - data.y)
            .attr('x2', data.endX - data.x)
            .attr('y2', data.endY - data.y)
            .style('stroke', data.strokeColor || 'var(--on-surface)')
            .style('stroke-width', `${data.strokeWidth || 2}px`)
            .style('fill', 'none')
            .style('pointer-events', 'none');

        // arrow head
        const arrowLength = 15;
        const arrowAngle = Math.PI / 6; // 30 degrees
        const startX = data.startX - data.x;
        const startY = data.startY - data.y;
        const endX = data.endX - data.x;
        const endY = data.endY - data.y;
        const dx = endX - startX;
        const dy = endY - startY;
        const angle = Math.atan2(dy, dx);
        
        const arrowHead = group.append('polygon')
            .attr('class', 'arrow_head')
            .attr('points', () => {
                const x1 = endX - arrowLength * Math.cos(angle - arrowAngle);
                const y1 = endY - arrowLength * Math.sin(angle - arrowAngle);
                const x2 = endX - arrowLength * Math.cos(angle + arrowAngle);
                const y2 = endY - arrowLength * Math.sin(angle + arrowAngle);
                return `${endX},${endY} ${x1},${y1} ${x2},${y2}`;
            })
            .style('fill', data.strokeColor || 'var(--on-surface)')
            .style('pointer-events', 'none');

        // draggable end points - only visible in build mode
        group.append('circle')
            .attr('class', 'arrow_start')
            .attr('cx', data.startX - data.x)
            .attr('cy', data.startY - data.y)
            .attr('r', 6)
            .style('fill', 'var(--surface-variant)')
            .style('stroke', 'var(--border-color)')
            .style('stroke-width', '2px')
            .style('cursor', 'move')
            .style('pointer-events', 'all')
            .style('display', isBuildMode ? 'block' : 'none');

        group.append('circle')
            .attr('class', 'arrow_end')
            .attr('cx', data.endX - data.x)
            .attr('cy', data.endY - data.y)
            .attr('r', 6)
            .style('fill', 'var(--surface-variant)')
            .style('stroke', 'var(--border-color)')
            .style('stroke-width', '2px')
            .style('cursor', 'move')
            .style('pointer-events', 'all')
            .style('display', isBuildMode ? 'block' : 'none');

        // selection box
        group.append('rect')
            .attr('class', 'annotation_box')
            .attr('x', -4)
            .attr('y', -4)
            .attr('width', 0)
            .attr('height', 0)
            .lower();
    }

    setupDragBehaviors(selection) {
        const self = this;
        
        // main annotation drag behavior
        const dragBehavior = d3.drag()
            .filter(() => !self.state.isRunMode)
            .container(() => self.container.node())
            .subject((event, d) => ({ x: d.x, y: d.y }))
            .on('start', function(event, d) {
                d._dragStartX = d.x;
                d._dragStartY = d.y;
                d._pointerStartX = event.x;
                d._pointerStartY = event.y;
                d._wasSelected = self.state.selectionHandler && self.state.selectionHandler.selectedAnnotation && self.state.selectionHandler.selectedAnnotation.id === d.id;
                self.state.setDragging(true);
                self.state.emit('disableZoom');
                self.state.suppressNextCanvasClick = true;
                
                if (event.sourceEvent && typeof event.sourceEvent.stopPropagation === 'function') {
                    event.sourceEvent.stopPropagation();
                    if (typeof event.sourceEvent.preventDefault === 'function') {
                        event.sourceEvent.preventDefault();
                    }
                }
                
                try {
                    const groupEl = this.tagName === 'g' ? this : this.parentNode;
                    d3.select(groupEl).raise();
                } catch (_) {}
            })
            .on('drag', function(event, d) {
                d.x = event.x;
                d.y = event.y;
                const groupEl = this.tagName === 'g' ? this : this.parentNode;
                d3.select(groupEl).attr('transform', `translate(${d.x},${d.y})`);
            })
            .on('end', (event, d) => {
                const positionChanged = d._dragStartX !== d.x || d._dragStartY !== d.y;
                const clickThreshold = 5;
                const pointerDistance = Math.sqrt(
                    Math.pow(event.x - d._pointerStartX, 2) + 
                    Math.pow(event.y - d._pointerStartY, 2)
                );
                const wasClick = pointerDistance < clickThreshold;
                
                if (wasClick && !positionChanged) {
                    if (d._wasSelected) {
                        if (this.state.selectionHandler && typeof this.state.selectionHandler.clearSelection === 'function') {
                            this.state.selectionHandler.clearSelection();
                        }
                    } else {
                        if (this.state.selectionHandler && typeof this.state.selectionHandler.selectAnnotation === 'function') {
                            this.state.selectionHandler.selectAnnotation(d.id);
                        }
                    }
                } else if (positionChanged) {
                    if (!d._wasSelected) {
                        if (this.state.selectionHandler && typeof this.state.selectionHandler.selectAnnotation === 'function') {
                            this.state.selectionHandler.selectAnnotation(d.id);
                        }
                    }
                }
                
                if (positionChanged) {
                    this.state.updateAnnotation(d.id, { x: d.x, y: d.y });
                }
                
                if (positionChanged) {
                    this.state.suppressNextCanvasClick = true;
                }
                
                delete d._dragStartX; delete d._dragStartY;
                delete d._pointerStartX; delete d._pointerStartY;
                delete d._wasSelected;
                this.state.setDragging(false);
                this.state.emit('enableZoom');
                
                if (event.sourceEvent && typeof event.sourceEvent.stopPropagation === 'function') {
                    event.sourceEvent.stopPropagation();
                    if (typeof event.sourceEvent.preventDefault === 'function') {
                        event.sourceEvent.preventDefault();
                    }
                }
            });

        // arrow end point drag behavior with improved coordinate handling
        const arrowEndDragBehavior = d3.drag()
            .filter(() => !self.state.isRunMode)
            .container(() => self.container.node())
            .on('start', function(event, d) {
                d._arrowDragStartX = event.x;
                d._arrowDragStartY = event.y;
                d._arrowDragEnd = this.classList.contains('arrow_end');
                self.state.setDragging(true);
                self.state.emit('disableZoom');
                self.state.suppressNextCanvasClick = true;
                
                if (event.sourceEvent && typeof event.sourceEvent.stopPropagation === 'function') {
                    event.sourceEvent.stopPropagation();
                    if (typeof event.sourceEvent.preventDefault === 'function') {
                        event.sourceEvent.preventDefault();
                    }
                }
            })
            .on('drag', function(event, d) {
                // find the annotation by looking at the parent group's data
                const groupEl = this.parentNode;
                const groupData = d3.select(groupEl).datum();
                const annotation = self.state.annotations.find(a => a.id === groupData.id);
                if (!self.validateAnnotationData(annotation)) return;
                
                // get world coordinates from screen coordinates
                const [wx, wy] = self.getWorldCoordinates(event);
                
                // store the new coordinates temporarily
                let newStartX = annotation.startX;
                let newStartY = annotation.startY;
                let newEndX = annotation.endX;
                let newEndY = annotation.endY;
                
                if (d._arrowDragEnd) {
                    newEndX = wx;
                    newEndY = wy;
                } else {
                    newStartX = wx;
                    newStartY = wy;
                }
                
                // update the visual representation immediately
                const group = d3.select(this.parentNode);
                const startX = newStartX - annotation.x;
                const startY = newStartY - annotation.y;
                const endX = newEndX - annotation.x;
                const endY = newEndY - annotation.y;
                
                group.select('line.annotation_arrow')
                    .attr('x1', startX)
                    .attr('y1', startY)
                    .attr('x2', endX)
                    .attr('y2', endY);
                
                group.select('circle.arrow_start')
                    .attr('cx', startX)
                    .attr('cy', startY);
                    
                group.select('circle.arrow_end')
                    .attr('cx', endX)
                    .attr('cy', endY);
                
                // update arrow head with proper coordinates
                const arrowLength = 15;
                const arrowAngle = Math.PI / 6;
                const dx = endX - startX;
                const dy = endY - startY;
                const angle = Math.atan2(dy, dx);
                
                const x1 = endX - arrowLength * Math.cos(angle - arrowAngle);
                const y1 = endY - arrowLength * Math.sin(angle - arrowAngle);
                const x2 = endX - arrowLength * Math.cos(angle + arrowAngle);
                const y2 = endY - arrowLength * Math.sin(angle + arrowAngle);
                
                group.select('polygon.arrow_head')
                    .attr('points', `${endX},${endY} ${x1},${y1} ${x2},${y2}`);
                    
                // store the new coordinates in the group data for the end event
                groupData._newStartX = newStartX;
                groupData._newStartY = newStartY;
                groupData._newEndX = newEndX;
                groupData._newEndY = newEndY;
            })
            .on('end', (event, d) => {
                // find the annotation by looking at the parent group's data
                const groupEl = event.sourceEvent.target.parentNode;
                const groupData = d3.select(groupEl).datum();
                const annotation = this.state.annotations.find(a => a.id === groupData.id);
                if (this.validateAnnotationData(annotation) && groupData._newStartX !== undefined) {
                    // update the annotation with the new coordinates
                    this.state.updateAnnotation(groupData.id, {
                        startX: groupData._newStartX,
                        startY: groupData._newStartY,
                        endX: groupData._newEndX,
                        endY: groupData._newEndY
                    });
                }
                
                delete d._arrowDragStartX;
                delete d._arrowDragStartY;
                delete d._arrowDragEnd;
                delete groupData._newStartX;
                delete groupData._newStartY;
                delete groupData._newEndX;
                delete groupData._newEndY;
                this.state.setDragging(false);
                this.state.emit('enableZoom');
                
                if (event.sourceEvent && typeof event.sourceEvent.stopPropagation === 'function') {
                    event.sourceEvent.stopPropagation();
                    if (typeof event.sourceEvent.preventDefault === 'function') {
                        event.sourceEvent.preventDefault();
                    }
                }
            });

        // apply main drag behavior to annotation groups
        selection.style('cursor', 'move').call(dragBehavior);
        
        // apply main drag behavior to selection boxes
        selection.select('rect.annotation_box')
            .style('pointer-events', 'all')
            .style('cursor', 'move')
            .call(dragBehavior);
            
        // apply main drag behavior to text elements
        selection.select('text.annotation_text')
            .style('pointer-events', 'all')
            .style('cursor', 'move')
            .call(dragBehavior);
            
        // apply arrow end drag behavior to arrow end points
        selection.select('circle.arrow_start')
            .call(arrowEndDragBehavior);
            
        selection.select('circle.arrow_end')
            .call(arrowEndDragBehavior);
    }

    sizeTextSelectionBox(group, data) {
        const textEl = group.select('text.annotation_text').node();
        if (!textEl) return;
        const bbox = textEl.getBBox();
        group.select('rect.annotation_box')
            .attr('x', bbox.x - 6)
            .attr('y', bbox.y - 4)
            .attr('width', bbox.width + 12)
            .attr('height', bbox.height + 8);
    }

    sizeArrowSelectionBox(group, data) {
        const minX = Math.min(data.startX - data.x, data.endX - data.x) - 10;
        const maxX = Math.max(data.startX - data.x, data.endX - data.x) + 10;
        const minY = Math.min(data.startY - data.y, data.endY - data.y) - 10;
        const maxY = Math.max(data.startY - data.y, data.endY - data.y) + 10;
        
        group.select('rect.annotation_box')
            .attr('x', minX)
            .attr('y', minY)
            .attr('width', maxX - minX)
            .attr('height', maxY - minY);
    }

    updateAnnotationStyles() {
        const selectedAnnotation = this.state.selectionHandler ? this.state.selectionHandler.selectedAnnotation : null;
        const isBuildMode = this.state.isBuildMode;
        
        this.annotationGroup.selectAll('.annotation_item')
            .classed('selected', d => selectedAnnotation && selectedAnnotation.id === d.id);
            
        // update arrow end point visibility based on mode and selection
        this.annotationGroup.selectAll('.annotation_item')
            .selectAll('circle.arrow_start, circle.arrow_end')
            .style('display', function() {
                const group = d3.select(this.parentNode);
                const annotation = group.datum();
                return annotation && annotation.type === 'arrow' && isBuildMode ? 'block' : 'none';
            });
    }

    // helper method to ensure proper coordinate transformation
    getWorldCoordinates(event) {
        if (!this.state.transform) {
            return [event.x, event.y];
        }
        try {
            return this.state.transform.invert([event.x, event.y]);
        } catch (error) {
            console.warn('Failed to transform coordinates:', error);
            return [event.x, event.y];
        }
    }

    // helper method to validate annotation data
    validateAnnotationData(annotation) {
        if (!annotation || typeof annotation !== 'object') return false;
        if (annotation.type !== 'arrow') return false;
        if (typeof annotation.startX !== 'number' || typeof annotation.startY !== 'number') return false;
        if (typeof annotation.endX !== 'number' || typeof annotation.endY !== 'number') return false;
        if (typeof annotation.x !== 'number' || typeof annotation.y !== 'number') return false;
        return true;
    }
}

window.AnnotationRenderer = AnnotationRenderer;
})();
