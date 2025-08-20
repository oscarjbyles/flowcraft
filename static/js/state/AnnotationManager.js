// annotation state management
(function() {
    'use strict';
    if (window.AnnotationManager) { return; }

class AnnotationManager extends EventEmitter {
    constructor() {
        super();
        this.annotations = [];
        this.selectedAnnotation = null;
    }

    // annotation crud operations
    addAnnotation(annotationData) {
        const annotation = {
            id: Date.now() + Math.random(),
            x: annotationData.x || 0,
            y: annotationData.y || 0,
            text: annotationData.text || 'new annotation',
            fontSize: annotationData.fontSize || 14,
            color: annotationData.color || '#666666',
            ...annotationData
        };

        this.annotations.push(annotation);
        this.emit('annotationAdded', annotation);
        this.emit('stateChanged');
        
        return annotation;
    }

    updateAnnotation(annotationId, updates) {
        const annotation = this.getAnnotation(annotationId);
        if (!annotation) return false;

        Object.assign(annotation, updates);
        
        this.emit('annotationUpdated', annotation);
        this.emit('stateChanged');
        
        return true;
    }

    removeAnnotation(annotationId) {
        const index = this.annotations.findIndex(a => a.id === annotationId);
        if (index === -1) return false;
        
        const annotation = this.annotations[index];
        
        // clear selection if this annotation was selected
        if (this.selectedAnnotation && this.selectedAnnotation.id === annotationId) {
            this.selectedAnnotation = null;
        }
        
        this.annotations.splice(index, 1);
        
        this.emit('annotationRemoved', annotation);
        this.emit('stateChanged');
        
        return true;
    }

    getAnnotation(annotationId) {
        return this.annotations.find(a => a.id === annotationId);
    }

    // selection management
    selectAnnotation(annotationId) {
        const annotation = this.getAnnotation(annotationId);
        if (annotation) {
            this.selectedAnnotation = annotation;
            this.emit('annotationSelected', annotation);
            this.emit('selectionChanged', {
                nodes: [],
                link: null,
                group: null,
                annotation: annotation
            });
        }
    }

    clearAnnotationSelection() {
        this.selectedAnnotation = null;
        this.emit('selectionCleared');
    }

    // position management
    updateAnnotationPosition(annotationId, x, y) {
        const annotation = this.getAnnotation(annotationId);
        if (annotation) {
            annotation.x = x;
            annotation.y = y;
            this.emit('annotationPositionUpdated', { annotationId, x, y });
            this.emit('stateChanged');
        }
    }

    findAnnotationAtPosition(x, y, threshold = 10) {
        for (let i = this.annotations.length - 1; i >= 0; i--) {
            const annotation = this.annotations[i];
            const distance = Math.sqrt(
                Math.pow(x - annotation.x, 2) + 
                Math.pow(y - annotation.y, 2)
            );
            if (distance <= threshold) {
                return annotation;
            }
        }
        return null;
    }

    // serialization
    getSerializableAnnotations() {
        return [...this.annotations];
    }

    importAnnotations(annotations) {
        this.annotations = annotations || [];
        this.selectedAnnotation = null;
        this.emit('annotationsImported');
        this.emit('stateChanged');
    }

    getStats() {
        return {
            annotationCount: this.annotations.length,
            hasSelection: !!this.selectedAnnotation
        };
    }
}

window.AnnotationManager = AnnotationManager;
})();
