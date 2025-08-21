// error circles rendering module
(function(){
    'use strict';
    if (window.ErrorCircles) { return; }

class ErrorCircles {
    /**
     * render error circles on nodes that have errors or missing python files
     * @param {Object} nodeRenderer - the node renderer instance
     */
    static renderErrorCircles(nodeRenderer) {
        // remove previous error indicators
        nodeRenderer.nodeGroup.selectAll('.error_circle, .error_text').remove();
        // draw an error marker for nodes in error state
        nodeRenderer.nodeGroup.selectAll('.node-group').each(function(d) {
            const group = d3.select(this);
            const rect = group.select('.node');
            const isErr = rect.classed('error');
            // also flag python nodes with no associated python file
            const isPythonMissingFile = d && d.type === 'python_file' && (!d.pythonFile || String(d.pythonFile).trim() === '');
            const shouldMark = isErr || isPythonMissingFile;
            if (!shouldMark) return;
            const width = d.width || 120;
            const height = Geometry.getNodeHeight(d);
            // place the badge left of the node and align its top with the node's top edge
            const topLeftX = -width / 2;
            const topLeftY = -height / 2;
            const offsetX = -18; // moved 4px further left
            const x = topLeftX + offsetX;
            const y = topLeftY + 12; // circle radius is 12, so top aligns with node top
            group.append('circle')
                .attr('class', 'error_circle')
                .attr('cx', x)
                .attr('cy', y)
                .attr('r', 12);
            group.append('text')
                .attr('class', 'error_text')
                .attr('x', x)
                .attr('y', y)
                .text('!');
        });
    }

    /**
     * hide error circles from the flowchart canvas
     * @param {Object} nodeRenderer - the node renderer instance
     * @param {Object} linkRenderer - the link renderer instance (optional)
     */
    static hideErrorCircles(nodeRenderer, linkRenderer) {
        try {
            nodeRenderer.nodeGroup.selectAll('.error_circle, .error_text').remove();
            // also remove link coverage alerts when hiding error view
            if (linkRenderer && linkRenderer.linkGroup) {
                linkRenderer.linkGroup.selectAll('.link-coverage-alert').remove();
            }
        } catch (e) {
            console.warn('[error_view] hideErrorCircles error', e);
        }
    }

    /**
     * update the error view toggle button UI state
     * @param {boolean} isErrorView - whether error view is currently active
     */
    static updateErrorViewUI(isErrorView) {
        const errorToggleBtn = document.getElementById('error_toggle_btn');
        if (!errorToggleBtn) return;
        if (isErrorView) {
            errorToggleBtn.classList.add('active');
            errorToggleBtn.innerHTML = '<span class="material-icons">stop</span>';
            errorToggleBtn.title = 'stop error view';
        } else {
            errorToggleBtn.classList.remove('active');
            errorToggleBtn.innerHTML = '<span class="material-icons">priority_high</span>';
            errorToggleBtn.title = 'show error circles';
        }
    }
}

window.ErrorCircles = ErrorCircles;
})();
