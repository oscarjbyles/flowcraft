// viewport tracking for execution
(function(){
    'use strict';
    if (window.ViewportTracker) { return; }

class ViewportTracker {
    constructor(flowchartBuilder) {
        this.flowchartBuilder = flowchartBuilder;
        this.state = flowchartBuilder.state;
        this.svg = flowchartBuilder.svg;
        this.zoom = flowchartBuilder.zoom;
    }

    // smoothly center a node in both axes at a specific zoom level
    centerOnNodeCentered(nodeId, duration = 400, scaleOverride = null, easeFn = d3.easeCubicOut) {
        const node = this.state.getNode(nodeId);
        if (!node) return;
        const currentScale = this.state.transform && this.state.transform.k ? this.state.transform.k : 1;
        const scale = scaleOverride || currentScale;

        const svgEl = this.svg && typeof this.svg.node === 'function' ? this.svg.node() : null;
        const containerEl = document.querySelector('.canvas_container');
        if (!svgEl || !containerEl) return;

        const svgRect = svgEl.getBoundingClientRect();
        const containerRect = containerEl.getBoundingClientRect();

        const desiredSvgX = (containerRect.left - svgRect.left) + (containerRect.width / 2);
        const desiredSvgY = (containerRect.top - svgRect.top) + (containerRect.height / 2);

        const targetTranslateX = desiredSvgX - (scale * node.x);
        const targetTranslateY = desiredSvgY - (scale * node.y);

        this.svg
            .transition()
            .duration(Math.max(0, duration | 0))
            .ease(easeFn || d3.easeCubicOut)
            .call(this.zoom.transform, d3.zoomIdentity.translate(targetTranslateX, targetTranslateY).scale(scale));
    }

    // smoothly center horizontally and position a node offset from top at a specific zoom level
    centerOnNodeWithTopOffset(nodeId, offsetTopPx = 400, duration = 400, scaleOverride = null, easeFn = d3.easeCubicOut) {
        const node = this.state.getNode(nodeId);
        if (!node) return;
        const currentScale = this.state.transform && this.state.transform.k ? this.state.transform.k : 1;
        const scale = scaleOverride || currentScale;

        const svgEl = this.svg && typeof this.svg.node === 'function' ? this.svg.node() : null;
        const containerEl = document.querySelector('.canvas_container');
        if (!svgEl || !containerEl) return;

        const svgRect = svgEl.getBoundingClientRect();
        const containerRect = containerEl.getBoundingClientRect();

        // center horizontally, offset vertically from the top by offsetTopPx
        const desiredSvgX = (containerRect.left - svgRect.left) + (containerRect.width / 2);
        const desiredSvgY = (containerRect.top - svgRect.top) + offsetTopPx;

        const targetTranslateX = desiredSvgX - (scale * node.x);
        const targetTranslateY = desiredSvgY - (scale * node.y);

        this.svg
            .transition()
            .duration(Math.max(0, duration | 0))
            .ease(easeFn || d3.easeCubicOut)
            .call(this.zoom.transform, d3.zoomIdentity.translate(targetTranslateX, targetTranslateY).scale(scale));
    }

    // smooth center on a node by id
    centerOnNode(nodeId) {
        console.log('[ViewportTracker] centerOnNode called with nodeId:', nodeId);
        const node = this.state.getNode(nodeId);
        if (!node) {
            console.log('[ViewportTracker] node not found for nodeId:', nodeId);
            return;
        }
        // nodes are positioned by translate(x, y) with their rect centered at (x, y)
        const scale = this.state.transform.k || 1;
        console.log('[ViewportTracker] scale:', scale, 'node position:', { x: node.x, y: node.y });

        // target placement rules:
        // - horizontal: align node center with the horizontal center of the .canvas_container
        // - vertical: keep node center 250px from the top of the browser window
        console.log('[ViewportTracker] svg debug:', {
            hasSvg: !!this.svg,
            svgType: typeof this.svg,
            hasNodeMethod: this.svg && typeof this.svg.node === 'function',
            svgKeys: this.svg ? Object.keys(this.svg) : null
        });
        const svgEl = this.svg && typeof this.svg.node === 'function' ? this.svg.node() : null;
        const containerEl = document.querySelector('.canvas_container');
        if (!svgEl || !containerEl) {
            console.log('[ViewportTracker] missing elements:', { svgEl: !!svgEl, containerEl: !!containerEl });
            return;
        }

        const svgRect = svgEl.getBoundingClientRect();
        const containerRect = containerEl.getBoundingClientRect();

        // desired position of the node center in svg screen coords
        const desiredSvgX = (containerRect.left - svgRect.left) + (containerRect.width / 2);
        const desiredSvgY = (250 - svgRect.top);

        // translate so that: scale * node.(x|y) + translate = desiredSvg(X|Y)
        const targetTranslateX = desiredSvgX - (scale * node.x);
        const targetTranslateY = desiredSvgY - (scale * node.y);

        console.log('[ViewportTracker] viewport calculation:', {
            desiredSvgX,
            desiredSvgY,
            targetTranslateX,
            targetTranslateY,
            scale
        });

        this.svg
            .transition()
            .duration(600)
            .ease(d3.easeCubicOut)
            .call(this.zoom.transform, d3.zoomIdentity.translate(targetTranslateX, targetTranslateY).scale(scale));
        
        console.log('[ViewportTracker] transform applied');
    }
}

window.ViewportTracker = ViewportTracker;
})();
