# FlowchartBuilder Modularization Plan

## Overview
The current FlowchartBuilder.js is a monolithic 5,154-line file that handles multiple responsibilities. This plan outlines how to split it into focused, maintainable modules while preserving functionality and improving code organization.

## Current Issues
- **Monolithic Architecture**: Single class handling rendering, execution, UI, state management, and interactions
- **Tight Coupling**: Direct DOM manipulation mixed with business logic
- **Code Duplication**: Multiple execution methods and status update patterns
- **Poor Testability**: Large class with many dependencies
- **Maintenance Difficulty**: Changes in one area can affect unrelated functionality

## Modular Architecture Plan

### 1. Core Orchestrator (FlowchartBuilder.js) - ~400 lines
**Purpose**: Main application coordinator and dependency injection container

**Responsibilities**:
- Initialize and coordinate all subsystems
- Manage component lifecycle
- Handle high-level application events
- Provide dependency injection

**Key Methods**:
```javascript
class FlowchartBuilder {
    constructor() {
        this.state = new StateManager();
        this.events = new EventManager(this.state);
        this.executionEngine = new ExecutionEngine(this.state, this.events);
        this.viewportManager = new ViewportManager(this.state, this.svg);
        this.uiManager = new UIManager(this.state, this.events);
        this.renderingOrchestrator = new RenderingOrchestrator(this.state, this.svg);
        this.interactionManager = new InteractionManager(this.state, this.events);
    }
    
    initializeApp() { /* coordinate initialization */ }
    destroy() { /* cleanup all components */ }
}
```

### 2. Execution Engine (ExecutionEngine.js) - ~1,200 lines
**Purpose**: Handle all execution-related functionality

**Responsibilities**:
- Node execution orchestration
- Python function calling
- Variable management and flow
- Execution history and persistence
- Resume functionality
- If-node condition evaluation

**Key Methods**:
```javascript
class ExecutionEngine {
    constructor(stateManager, eventEmitter) {
        this.state = stateManager;
        this.events = eventEmitter;
        this.isExecuting = false;
        this.executionAborted = false;
        this.currentExecutionController = null;
        this.nodeExecutionResults = new Map();
        this.nodeVariables = new Map();
        this.blockedNodeIds = new Set();
        this.executionFeed = [];
    }
    
    async startExecution() { /* extracted from startExecution */ }
    async stopExecution() { /* extracted from stopExecution */ }
    async executeNodeLive(node, nodeIndex, totalNodes) { /* extracted */ }
    async callNodeExecution(node, inputVariables) { /* extracted */ }
    async evaluateIfNodeAndBlockBranches(ifNode) { /* extracted */ }
    async gatherInputVariables(targetNode) { /* extracted */ }
    async persistDataSaveForNode(pythonNode) { /* extracted */ }
    async analyzePythonFunction(pythonFile) { /* extracted */ }
    async saveExecutionHistory(status, executionOrder, errorMessage) { /* extracted */ }
    async viewExecutionHistory(executionId) { /* extracted */ }
    async handleResumeExecution(data) { /* extracted */ }
    async startResumeExecution(nodesToExecute, initialVariables, startNodeId) { /* extracted */ }
    updateExecutionStatus(type, message) { /* extracted */ }
    updateExecutionUI(isExecuting) { /* extracted */ }
    resetNodeStates() { /* extracted */ }
    setNodeState(nodeId, state) { /* extracted */ }
    addNodeLoadingAnimation(nodeId) { /* extracted */ }
    removeNodeLoadingAnimation(nodeId) { /* extracted */ }
}
```

### 3. Viewport Manager (ViewportManager.js) - ~600 lines
**Purpose**: Handle canvas zoom, pan, and viewport management

**Responsibilities**:
- Zoom and pan functionality
- Viewport persistence
- Auto-tracking during execution
- Canvas dimension management
- View reset and centering

**Key Methods**:
```javascript
class ViewportManager {
    constructor(stateManager, svgElement) {
        this.state = stateManager;
        this.svg = svgElement;
        this.zoom = null;
        this.zoomGroup = null;
        this.viewportSaveTimer = null;
        this.viewportSaveDelay = 250;
        this.isAutoTrackEnabled = false;
        this.userDisabledTracking = false;
    }
    
    setupZoomPan() { /* extracted from setupZoomPan */ }
    getViewportStorageKey() { /* extracted */ }
    scheduleViewportSave() { /* extracted */ }
    saveViewportToStorage() { /* extracted */ }
    restoreViewportFromStorage() { /* extracted */ }
    disableZoom() { /* extracted */ }
    enableZoom() { /* extracted */ }
    zoomToFit() { /* extracted */ }
    resetZoom() { /* extracted */ }
    resetViewToFirstNode() { /* extracted */ }
    centerOnNode(nodeId) { /* extracted */ }
    centerOnNodeCentered(nodeId, duration, scaleOverride) { /* extracted */ }
    centerOnNodeWithTopOffset(nodeId, offsetTopPx, duration, scaleOverride) { /* extracted */ }
    updateCanvasDimensions() { /* extracted */ }
    handleResize() { /* extracted */ }
}
```

### 4. UI Manager (UIManager.js) - ~800 lines
**Purpose**: Handle all UI-related functionality and DOM interactions

**Responsibilities**:
- Navigation button setup
- Status bar management
- Context menu handling
- Coordinate input management
- Mode switching UI updates
- Toolbar management

**Key Methods**:
```javascript
class UIManager {
    constructor(stateManager, eventEmitter) {
        this.state = stateManager;
        this.events = eventEmitter;
        this.statusText = null;
        this.nodeCount = null;
        this.nodeCoordinates = null;
        this.statusProgress = null;
        this.statusBar = null;
        this.contextMenu = null;
    }
    
    setupNavigationButtons() { /* extracted from setupNavigationButtons */ }
    setupStatusBar() { /* extracted from setupStatusBar */ }
    setupContextMenu() { /* extracted from setupContextMenu */ }
    setupCoordinateInputs() { /* extracted from setupCoordinateInputs */ }
    updateStatus(type, message, options) { /* extracted from updateStatus */ }
    updateStatusBar(message) { /* extracted from updateStatusBar */ }
    showStatusProgress(percent) { /* extracted from showStatusProgress */ }
    setStatusProgress(percent) { /* extracted from setStatusProgress */ }
    hideStatusProgress() { /* extracted from hideStatusProgress */ }
    updateStats() { /* extracted from updateStats */ }
    updateNodeCoordinates() { /* extracted from updateNodeCoordinates */ }
    handleCoordinateChange(property, value) { /* extracted from handleCoordinateChange */ }
    showContextMenu(x, y, item) { /* extracted from showContextMenu */ }
    hideContextMenu() { /* extracted from hideContextMenu */ }
    updateModeUI(mode, previousMode) { /* extracted from updateModeUI */ }
    updateFlowViewUI(isFlowView) { /* extracted from updateFlowViewUI */ }
    updateErrorViewUI(isErrorView) { /* extracted from updateErrorViewUI */ }
    toggleFlowView() { /* extracted from toggleFlowView */ }
    toggleErrorView() { /* extracted from toggleErrorView */ }
    toggleGroupSelectMode() { /* extracted from toggleGroupSelectMode */ }
    deselectAll() { /* extracted from deselectAll */ }
    showExecutionPanel() { /* extracted from showExecutionPanel */ }
    hideExecutionPanel() { /* extracted from hideExecutionPanel */ }
}
```

### 5. Rendering Orchestrator (RenderingOrchestrator.js) - ~400 lines
**Purpose**: Coordinate all rendering components and manage visual state

**Responsibilities**:
- Initialize and manage renderers
- Coordinate rendering updates
- Handle node order visualization
- Manage error circles and visual indicators
- Coordinate renderer lifecycle

**Key Methods**:
```javascript
class RenderingOrchestrator {
    constructor(stateManager, svgElement) {
        this.state = stateManager;
        this.svg = svgElement;
        this.zoomGroup = null;
        this.groupRenderer = null;
        this.linkRenderer = null;
        this.nodeRenderer = null;
        this.annotationRenderer = null;
    }
    
    initializeRenderers() { /* extracted from initializeRenderers */ }
    setupSvgDefinitions() { /* extracted from setupSvgDefinitions */ }
    renderNodeOrder() { /* extracted from renderNodeOrder */ }
    hideNodeOrder() { /* extracted from hideNodeOrder */ }
    renderErrorCircles() { /* extracted from renderErrorCircles */ }
    hideErrorCircles() { /* extracted from hideErrorCircles */ }
    showSelectionRect(rect) { /* extracted from showSelectionRect */ }
    updateSelectionRect(rect) { /* extracted from updateSelectionRect */ }
    hideSelectionRect() { /* extracted from hideSelectionRect */ }
    clearAllNodeColorState() { /* extracted from clearAllNodeColorState */ }
    clearIfRuntimeIndicators() { /* extracted from clearIfRuntimeIndicators */ }
}
```

### 6. Interaction Manager (InteractionManager.js) - ~500 lines
**Purpose**: Handle all user interactions and event management

**Responsibilities**:
- Canvas interaction setup
- Node interaction management
- Keyboard event handling
- Window event management
- Core event listener setup

**Key Methods**:
```javascript
class InteractionManager {
    constructor(stateManager, eventEmitter) {
        this.state = stateManager;
        this.events = eventEmitter;
        this.dragHandler = null;
        this.selectionHandler = null;
        this.connectionHandler = null;
    }
    
    initializeInteractions() { /* extracted from initializeInteractions */ }
    setupCanvasInteractions() { /* extracted from setupCanvasInteractions */ }
    setupNodeInteractions() { /* extracted from setupNodeInteractions */ }
    setupSingleNodeInteractions(node) { /* extracted from setupSingleNodeInteractions */ }
    setupWindowEvents() { /* extracted from setupWindowEvents */ }
    handleDeleteKey(event) { /* extracted from handleDeleteKey */ }
    handleResize() { /* extracted from handleResize */ }
}
```

### 7. Node Management (NodeManager.js) - ~400 lines
**Purpose**: Handle node creation, modification, and management

**Responsibilities**:
- Node creation and addition
- Node editing and deletion
- Node state management
- Node coordinate handling
- Node type-specific operations

**Key Methods**:
```javascript
class NodeManager {
    constructor(stateManager, eventEmitter) {
        this.state = stateManager;
        this.events = eventEmitter;
    }
    
    addNodeAtCenter() { /* extracted from addNodeAtCenter */ }
    addPythonNode() { /* extracted from addPythonNode */ }
    addIfNode() { /* extracted from addIfNode */ }
    addCallAiNode() { /* extracted from addCallAiNode */ }
    addTextAnnotation() { /* extracted from addTextAnnotation */ }
    addArrowAnnotation() { /* extracted from addArrowAnnotation */ }
    editSelectedNode() { /* extracted from editSelectedNode */ }
    deleteSelectedNode() { /* extracted from deleteSelectedNode */ }
    calculateNodeHeight(node) { /* extracted from calculateNodeHeight */ }
    calculateNodeOrder() { /* extracted from calculateNodeOrder */ }
    matchVariableToParameter(sourceNode, returnValue, expectedParams, existingVariables) { /* extracted */ }
    getVariableNameForNode(sourceNode, returnValue) { /* extracted */ }
}
```

### 8. Output Manager (OutputManager.js) - ~300 lines
**Purpose**: Handle execution output and logging

**Responsibilities**:
- Console output management
- Execution log handling
- Output formatting and display
- Feed management
- Output clearing

**Key Methods**:
```javascript
class OutputManager {
    constructor(stateManager, eventEmitter) {
        this.state = stateManager;
        this.events = eventEmitter;
        this.globalExecutionLog = '';
    }
    
    appendOutput(text) { /* extracted from appendOutput */ }
    showGlobalExecutionLog() { /* extracted from showGlobalExecutionLog */ }
    appendToExecutionLog(message) { /* extracted from appendToExecutionLog */ }
    clearOutput() { /* extracted from clearOutput */ }
    clearExecutionFeed() { /* extracted from clearExecutionFeed */ }
    formatNodeOutput(output) { /* extracted from formatNodeOutput */ }
    looksLikeVariableOutput(line) { /* extracted from looksLikeVariableOutput */ }
    formatVariableOutput(line) { /* extracted from formatVariableOutput */ }
    formatStringVariable(title, value) { /* extracted from formatStringVariable */ }
    formatArrayVariable(title, arrayStr) { /* extracted from formatArrayVariable */ }
    formatRegularOutput(line) { /* extracted from formatRegularOutput */ }
    escapeHtml(text) { /* extracted from escapeHtml */ }
    scrollRunFeedToNode(nodeId) { /* extracted from scrollRunFeedToNode */ }
}
```

### 9. Data Manager (DataManager.js) - ~200 lines
**Purpose**: Handle data operations and persistence

**Responsibilities**:
- Data loading and saving
- Import/export operations
- Data validation
- Backup management

**Key Methods**:
```javascript
class DataManager {
    constructor(stateManager, eventEmitter) {
        this.state = stateManager;
        this.events = eventEmitter;
    }
    
    async loadInitialData() { /* extracted from loadInitialData */ }
    async saveData() { /* extracted from saveData */ }
    exportData() { /* extracted from exportData */ }
    async importData(file) { /* extracted from importData */ }
    getStats() { /* extracted from getStats */ }
    getCurrentFlowchartName() { /* extracted from getCurrentFlowchartName */ }
}
```

## Implementation Strategy

### Phase 1: Extract Execution Engine (Week 1)
1. Create `ExecutionEngine.js` with all execution-related methods
2. Move execution state variables and properties
3. Update FlowchartBuilder to use ExecutionEngine
4. Test execution functionality

### Phase 2: Extract Viewport Manager (Week 2)
1. Create `ViewportManager.js` with zoom/pan functionality
2. Move viewport-related state and methods
3. Update FlowchartBuilder to use ViewportManager
4. Test viewport functionality

### Phase 3: Extract UI Manager (Week 3)
1. Create `UIManager.js` with UI-related methods
2. Move UI state and DOM interaction methods
3. Update FlowchartBuilder to use UIManager
4. Test UI functionality

### Phase 4: Extract Rendering Orchestrator (Week 4)
1. Create `RenderingOrchestrator.js` with rendering coordination
2. Move renderer initialization and management
3. Update FlowchartBuilder to use RenderingOrchestrator
4. Test rendering functionality

### Phase 5: Extract Remaining Managers (Week 5)
1. Create `InteractionManager.js`, `NodeManager.js`, `OutputManager.js`, `DataManager.js`
2. Move remaining methods to appropriate managers
3. Update FlowchartBuilder to use all managers
4. Test all functionality

### Phase 6: Refactor Core Orchestrator (Week 6)
1. Simplify FlowchartBuilder to focus on orchestration
2. Implement proper dependency injection
3. Add comprehensive error handling
4. Final testing and cleanup

## Benefits of This Approach

### 1. Single Responsibility Principle
Each module has a clear, focused purpose and responsibility.

### 2. Improved Testability
Smaller, focused modules are easier to unit test in isolation.

### 3. Better Maintainability
Changes to one area (e.g., execution) don't affect unrelated functionality.

### 4. Enhanced Reusability
Modules can be reused or replaced independently.

### 5. Clearer Dependencies
Explicit dependency injection makes relationships between components clear.

### 6. Easier Debugging
Issues can be isolated to specific modules rather than a large monolithic class.

## Migration Strategy

### 1. Gradual Extraction
Extract modules one at a time while maintaining functionality.

### 2. Backward Compatibility
Maintain the same public API during transition.

### 3. Comprehensive Testing
Test each extracted module thoroughly before proceeding.

### 4. Documentation
Update documentation to reflect the new modular architecture.

### 5. Performance Monitoring
Monitor performance impact and optimize as needed.

## File Structure After Refactoring

```
static/js/core/
├── FlowchartBuilder.js          (400 lines) - Core orchestrator
├── ExecutionEngine.js           (1,200 lines) - Execution logic
├── ViewportManager.js           (600 lines) - Zoom/pan management
├── UIManager.js                 (800 lines) - UI interactions
├── RenderingOrchestrator.js     (400 lines) - Renderer coordination
├── InteractionManager.js        (500 lines) - User interactions
├── NodeManager.js               (400 lines) - Node operations
├── OutputManager.js             (300 lines) - Output handling
└── DataManager.js               (200 lines) - Data operations
```

## Risk Mitigation

### 1. Incremental Approach
Extract modules gradually to minimize risk of breaking changes.

### 2. Comprehensive Testing
Maintain full test coverage throughout the refactoring process.

### 3. Rollback Plan
Keep original FlowchartBuilder.js as backup until refactoring is complete.

### 4. Performance Monitoring
Monitor for any performance regressions during extraction.

### 5. Documentation Updates
Update all documentation to reflect the new architecture.

This modular approach will significantly improve the maintainability, testability, and scalability of the FlowchartBuilder while preserving all existing functionality.
