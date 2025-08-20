// FlowchartBuilder Canvas Module
// Contains all canvas-related methods for the FlowchartBuilder class

(function() {
    'use strict';

    // Extend the FlowchartBuilder prototype with canvas methods
    const CanvasModule = {

        setupZoomPan() {
            this.zoom = d3.zoom()
                .scaleExtent([0.1, 4])
                .filter((event) => {
                    // allow wheel zoom always; block panning during drags/selections
                    if (event.type === 'wheel') return true;
                    return !this.state.isDragging && !this.state.isConnecting && !this.isGroupSelectMode && event.button !== 2;
                })
                .on('zoom', (event) => {
                    this.state.setTransform(event.transform);
                    this.zoomGroup.attr('transform', event.transform);
                    // persist viewport changes with debounce
                    this.scheduleViewportSave();
                    // if the user moved the viewport while executing, disable auto tracking until re-enabled
                    // do not disable for programmatic transforms (event.sourceEvent is null for programmatic)
                    const isUserGesture = !!(event && event.sourceEvent);
                    if (isUserGesture && this.isExecuting && this.isAutoTrackEnabled && !this.userDisabledTracking) {
                        this.userDisabledTracking = true;
                        this._refreshTrackBtnUI();
                    }
                });

            this.svg.call(this.zoom);
        },

        // viewport persistence helpers
        getViewportStorageKey() {
            // use current flowchart name to scope viewport
            const name = this.state.storage.getCurrentFlowchart() || 'default.json';
            return `flowchart_viewport:${name}`;
        },

        scheduleViewportSave() {
            // debounce saves to avoid excessive writes
            if (this.viewportSaveTimer) {
                clearTimeout(this.viewportSaveTimer);
            }
            this.viewportSaveTimer = setTimeout(() => {
                this.saveViewportToStorage();
            }, this.viewportSaveDelay);
        },

        saveViewportToStorage() {
            try {
                const t = this.state.transform || d3.zoomIdentity;
                const payload = { x: t.x, y: t.y, k: t.k };
                localStorage.setItem(this.getViewportStorageKey(), JSON.stringify(payload));
            } catch (_) {
                // ignore storage errors silently
            }
        },

        restoreViewportFromStorage() {
            try {
                const raw = localStorage.getItem(this.getViewportStorageKey());
                if (!raw) return;
                const parsed = JSON.parse(raw);
                if (typeof parsed?.x !== 'number' || typeof parsed?.y !== 'number' || typeof parsed?.k !== 'number') return;
                const transform = d3.zoomIdentity.translate(parsed.x, parsed.y).scale(parsed.k);
                // apply via d3 to keep behavior state in sync
                if (this.svg && this.zoom) {
                    this.svg.call(this.zoom.transform, transform);
                }
            } catch (_) {
                // ignore parse/storage errors
            }
        },

        setupSvgDefinitions() {
            const defs = this.svg.select('defs').empty()
                ? this.svg.append('defs')
                : this.svg.select('defs');

            // svg definitions can be added here if needed
            // removed arrowhead marker since we use custom middle arrows instead
        },

        disableZoom() {
            this.svg.on('.zoom', null);
        },

        enableZoom() {
            this.svg.call(this.zoom);
        },

        zoomToFit() {
            if (this.state.nodes.length === 0) return;

            const bounds = Geometry.calculateGroupBounds(this.state.nodes);
            const padding = 50;

            const scale = Math.min(
                this.state.canvasWidth / (bounds.width + 2 * padding),
                this.state.canvasHeight / (bounds.height + 2 * padding)
            );

            const translateX = this.state.canvasWidth / 2 - bounds.centerX * scale;
            const translateY = this.state.canvasHeight / 2 - bounds.centerY * scale;

            this.svg.transition()
                .duration(750)
                .call(this.zoom.transform, d3.zoomIdentity.translate(translateX, translateY).scale(scale));
        },

        resetZoom() {
            this.svg.transition()
                .duration(500)
                .call(this.zoom.transform, d3.zoomIdentity);
        },

        // reset zoom to 1 and center the first node in flow order (works in build and run modes)
        resetViewToFirstNode() {
            // temporarily pause auto-tracking while we reposition the viewport
            const prevAutoTrack = this.isAutoTrackEnabled;
            const prevUserDisabled = this.userDisabledTracking;
            // mark as user-disabled to prevent immediate re-centering during programmatic transforms
            this.userDisabledTracking = true;

            // choose target node: first in flow order, fallback to id 1
            let targetNode = null;
            const order = this.calculateNodeOrder();
            targetNode = (order && order.length > 0) ? order[0] : null;
            if (!targetNode) {
                targetNode = this.state.getNode(1) || null;
            }

            // animate center to the chosen node at zoom 1
            if (targetNode && typeof targetNode.id !== 'undefined') {
                this.centerOnNodeWithTopOffset(targetNode.id, 300, 400, 1);
            }

            // restore previous auto-tracking state but remain user-disabled until next explicit toggle
            // this preserves run-mode preference and avoids snapping away immediately
            this.isAutoTrackEnabled = prevAutoTrack;
            this.userDisabledTracking = true;
            this._refreshTrackBtnUI();
        },

        // smoothly center a node in both axes at a specific zoom level
        centerOnNodeCentered(nodeId, duration = 400, scaleOverride = null, easeFn = d3.easeCubicOut) {
            const node = this.state.getNode(nodeId);
            if (!node) return;
            const currentScale = this.state.transform && this.state.transform.k ? this.state.transform.k : 1;
            const scale = scaleOverride || currentScale;

            const svgEl = this.svg && this.svg.node ? this.svg.node() : null;
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
        },

        // smoothly center horizontally and position a node offset from top at a specific zoom level
        centerOnNodeWithTopOffset(nodeId, offsetTopPx = 400, duration = 400, scaleOverride = null, easeFn = d3.easeCubicOut) {
            const node = this.state.getNode(nodeId);
            if (!node) return;
            const currentScale = this.state.transform && this.state.transform.k ? this.state.transform.k : 1;
            const scale = scaleOverride || currentScale;

            const svgEl = this.svg && this.svg.node ? this.svg.node() : null;
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
        },

        updateCanvasDimensions() {
            const width = window.innerWidth - 600; // both sidebars
            const height = window.innerHeight - 32; // status bar

            this.state.setCanvasSize(width, height);
        },

        handleResize() {
            this.updateCanvasDimensions();

            if (this.svg) {
                this.svg
                    .attr('width', this.state.canvasWidth)
                    .attr('height', this.state.canvasHeight);
            }
        },

        // selection rectangle methods
        showSelectionRect(rect) {
            // remove any existing selection rectangle
            this.zoomGroup.select('.selection_rect').remove();

            // create new selection rectangle
            this.selectionRect = this.zoomGroup.append('rect')
                .attr('class', 'selection_rect')
                .attr('x', Math.min(rect.startX, rect.endX))
                .attr('y', Math.min(rect.startY, rect.endY))
                .attr('width', Math.abs(rect.endX - rect.startX))
                .attr('height', Math.abs(rect.endY - rect.startY))
                .style('fill', 'rgba(74, 165, 245, 0.1)')
                .style('stroke', '#4aa5f5')
                .style('stroke-width', '1px')
                .style('stroke-dasharray', '5,5')
                .style('pointer-events', 'none');
        },

        updateSelectionRect(rect) {
            if (this.selectionRect) {
                this.selectionRect
                    .attr('x', Math.min(rect.startX, rect.endX))
                    .attr('y', Math.min(rect.startY, rect.endY))
                    .attr('width', Math.abs(rect.endX - rect.startX))
                    .attr('height', Math.abs(rect.endY - rect.startY));
            }
        },

        hideSelectionRect() {
            if (this.selectionRect) {
                this.selectionRect.remove();
                this.selectionRect = null;
            }
        },

        toggleGroupSelectMode() {
            // only allow in build mode
            if (!this.state.isBuildMode) {
                this.updateStatusBar('group select only available in build mode');
                return;
            }

            // explicitly toggle the state
            this.isGroupSelectMode = !this.isGroupSelectMode;


            // update button appearance
            const button = document.getElementById('group_select_btn');
            if (!button) {
                console.error('Group select button not found!');
                return;
            }

            if (this.isGroupSelectMode) {
                button.classList.add('active');
                this.updateStatusBar('group select mode enabled - drag to select multiple nodes');
            } else {
                button.classList.remove('active');
                this.updateStatusBar('group select mode disabled');
                // hide any existing selection rectangle
                this.hideSelectionRect();
            }

            // update cursor style
            const canvas = document.getElementById('flowchart_canvas');
            if (this.isGroupSelectMode) {
                canvas.style.cursor = 'crosshair';
            } else {
                canvas.style.cursor = '';
            }
        },

        // smooth center on a node by id
        centerOnNode(nodeId) {
            const node = this.state.getNode(nodeId);
            if (!node) return;
            // nodes are positioned by translate(x, y) with their rect centered at (x, y)
            const scale = this.state.transform.k || 1;

            // target placement rules:
            // - horizontal: align node center with the horizontal center of the .canvas_container
            // - vertical: keep node center 250px from the top of the browser window
            const svgEl = this.svg && this.svg.node ? this.svg.node() : null;
            const containerEl = document.querySelector('.canvas_container');
            if (!svgEl || !containerEl) return;

            const svgRect = svgEl.getBoundingClientRect();
            const containerRect = containerEl.getBoundingClientRect();

            // desired position of the node center in svg screen coords
            const desiredSvgX = (containerRect.left - svgRect.left) + (containerRect.width / 2);
            const desiredSvgY = (250 - svgRect.top);

            // translate so that: scale * node.(x|y) + translate = desiredSvg(X|Y)
            const targetTranslateX = desiredSvgX - (scale * node.x);
            const targetTranslateY = desiredSvgY - (scale * node.y);

            this.svg
                .transition()
                .duration(600)
                .ease(d3.easeCubicOut)
                .call(this.zoom.transform, d3.zoomIdentity.translate(targetTranslateX, targetTranslateY).scale(scale));
        }

    };

    // Apply the canvas methods to FlowchartBuilder prototype
    Object.assign(FlowchartBuilder.prototype, CanvasModule);

})();
