// main flowchart builder orchestrator - now a simple wrapper
(function(){
    'use strict';
    if (window.FlowchartBuilder) { return; }

class FlowchartBuilder {
    constructor(autoInit = true) {
        // this is now just a wrapper - all initialization is handled in Index.js
        if (autoInit) {
            console.warn('FlowchartBuilder autoInit is deprecated - initialization is now handled in Index.js');
        }
    }

    // delegate all methods to the actual app instance
    get state() { return window.flowchartApp?.state; }
    get createNode() { return window.flowchartApp?.createNode; }
    get events() { return window.flowchartApp?.events; }
    get sidebar() { return window.flowchartApp?.sidebar; }
    get nodeRenderer() { return window.flowchartApp?.nodeRenderer; }
    get linkRenderer() { return window.flowchartApp?.linkRenderer; }
    get groupRenderer() { return window.flowchartApp?.groupRenderer; }
    get annotationRenderer() { return window.flowchartApp?.annotationRenderer; }
    get dragHandler() { return window.flowchartApp?.dragHandler; }
    get selectionHandler() { return window.flowchartApp?.selectionHandler; }
    get connectionHandler() { return window.flowchartApp?.connectionHandler; }
    get canvasHandler() { return window.flowchartApp?.canvasHandler; }
    get statusBar() { return window.flowchartApp?.statusBar; }
    get toolbars() { return window.flowchartApp?.toolbars; }
    get svg() { return window.flowchartApp?.svg; }
    get zoom() { return window.flowchartApp?.zoom; }
    get zoomGroup() { return window.flowchartApp?.zoomGroup; }
    get viewportTracker() { return window.flowchartApp?.viewportTracker; }
    get executionLogic() { return window.flowchartApp?.executionLogic; }
    get nodeStateManager() { return window.flowchartApp?.nodeStateManager; }
    get variableManager() { return window.flowchartApp?.variableManager; }
    get resumeExecution() { return window.flowchartApp?.resumeExecution; }
    get executionStatus() { return window.flowchartApp?.executionStatus; }
    get outputManager() { return window.flowchartApp?.outputManager; }

    // delegate all methods to the actual app instance
    updateStatusBar(message) { return window.flowchartApp?.updateStatusBar(message); }
    handleError(message, error) { return window.flowchartApp?.handleError(message, error); }
    getViewportStorageKey() { return window.flowchartApp?.getViewportStorageKey(); }
    scheduleViewportSave() { return window.flowchartApp?.scheduleViewportSave(); }
    saveViewportToStorage() { return window.flowchartApp?.saveViewportToStorage(); }
    restoreViewportFromStorage() { return window.flowchartApp?.restoreViewportFromStorage(); }
    disableZoom() { return window.flowchartApp?.disableZoom(); }
    enableZoom() { return window.flowchartApp?.enableZoom(); }
    zoomToFit() { return window.flowchartApp?.zoomToFit(); }
    resetZoom() { return window.flowchartApp?.resetZoom(); }
    resetViewToFirstNode() { return window.flowchartApp?.resetViewToFirstNode(); }
    updateCanvasDimensions() { return window.flowchartApp?.updateCanvasDimensions(); }
    handleResize() { return window.flowchartApp?.handleResize(); }
    loadInitialData() { return window.flowchartApp?.loadInitialData(); }
    saveData() { return window.flowchartApp?.saveData(); }
    exportData() { return window.flowchartApp?.exportData(); }
    importData(file) { return window.flowchartApp?.importData(file); }
    getStats() { return window.flowchartApp?.getStats(); }
    calculateNodeOrder() { return window.flowchartApp?.calculateNodeOrder(); }
    switchToRunMode(clearRuntimeIndicators) { return window.flowchartApp?.switchToRunMode(clearRuntimeIndicators); }
    toggleFlowView() { return window.flowchartApp?.toggleFlowView(); }
    toggleErrorView() { return window.flowchartApp?.toggleErrorView(); }
    toggleGroupSelectMode() { return window.flowchartApp?.toggleGroupSelectMode(); }
    updateFlowViewUI(isFlowView) { return window.flowchartApp?.updateFlowViewUI(isFlowView); }
    startExecution() { return window.flowchartApp?.startExecution(); }
    stopExecution() { return window.flowchartApp?.stopExecution(); }
    updateExecutionUI(isExecuting) { return window.flowchartApp?.updateExecutionUI(isExecuting); }
    executeNodeLive(node, nodeIndex, totalNodes, accumulatedVariables) { return window.flowchartApp?.executeNodeLive(node, nodeIndex, totalNodes, accumulatedVariables); }
    clearIfRuntimeIndicators() { return window.flowchartApp?.clearIfRuntimeIndicators(); }
    resetNodeStates() { return window.flowchartApp?.resetNodeStates(); }
    getCurrentFlowchartName() { return window.flowchartApp?.getCurrentFlowchartName(); }
    gatherInputVariables(targetNode) { return window.flowchartApp?.gatherInputVariables(targetNode); }
    persistDataSaveForNode(pythonNode) { return window.flowchartApp?.persistDataSaveForNode(pythonNode); }
    getVariablesForResume(resumeNodeId, executionOrder) { return window.flowchartApp?.getVariablesForResume(resumeNodeId, executionOrder); }
    updateConnectedInputNodes(sourceNodeId, returnValue) { return window.flowchartApp?.updateConnectedInputNodes(sourceNodeId, returnValue); }
    analyzePythonFunction(pythonFile) { return window.flowchartApp?.analyzePythonFunction(pythonFile); }
    matchVariableToParameter(sourceNode, returnValue, expectedParams, existingVariables) { return window.flowchartApp?.matchVariableToParameter(sourceNode, returnValue, expectedParams, existingVariables); }
    getVariableNameForNode(sourceNode, returnValue) { return window.flowchartApp?.getVariableNameForNode(sourceNode, returnValue); }
    setNodeState(nodeId, state) { return window.flowchartApp?.setNodeState(nodeId, state); }
    addNodeLoadingAnimation(nodeId) { return window.flowchartApp?.addNodeLoadingAnimation(nodeId); }
    removeNodeLoadingAnimation(nodeId) { return window.flowchartApp?.removeNodeLoadingAnimation(nodeId); }
    clearAllNodeColorState() { return window.flowchartApp?.clearAllNodeColorState(); }
    logState() { return window.flowchartApp?.logState(); }
    destroy() { return window.flowchartApp?.destroy(); }
    clearRunModeState() { return window.flowchartApp?.clearRunModeState(); }
    setupSidebarToggle() { return window.flowchartApp?.setupSidebarToggle(); }

    // getter methods to access execution logic data
    get nodeExecutionResults() { return window.flowchartApp?.nodeExecutionResults; }
    get nodeVariables() { return window.flowchartApp?.nodeVariables; }
    get blockedNodeIds() { return window.flowchartApp?.blockedNodeIds; }
    get isExecuting() { return window.flowchartApp?.isExecuting; }
    get executionAborted() { return window.flowchartApp?.executionAborted; }

    // setter methods to access execution logic data
    set nodeExecutionResults(results) { if (window.flowchartApp) window.flowchartApp.nodeExecutionResults = results; }
    set nodeVariables(variables) { if (window.flowchartApp) window.flowchartApp.nodeVariables = variables; }
    set blockedNodeIds(blockedIds) { if (window.flowchartApp) window.flowchartApp.blockedNodeIds = blockedIds; }
    set isExecuting(value) { if (window.flowchartApp) window.flowchartApp.isExecuting = value; }
    set executionAborted(value) { if (window.flowchartApp) window.flowchartApp.executionAborted = value; }

    // node state enum - delegate to node state manager
    static get NODE_STATES() {
        return NodeStateManager.NODE_STATES;
    }
}

window.FlowchartBuilder = FlowchartBuilder;
})();