---

## Current State Analysis

### Major Issues Identified

1. **Monolithic Architecture**: FlowchartBuilder handles rendering, execution, UI management, state management, and event handling
2. **Code Duplication**: Multiple execution methods, status update patterns, and UI setup functions
3. **Excessive Error Handling**: 50+ try-catch blocks with empty catch handlers
4. **Debug Code**: 100+ console.log/warn/error statements throughout
5. **Unused Features**: TODO comments, placeholder code, and incomplete implementations
6. **Tight Coupling**: Direct DOM manipulation mixed with business logic

## Refactoring Strategy

### Phase 1: Extract Core Services (Week 1)

### 1.1 ExecutionEngine Service

**Extract from FlowchartBuilder.js lines 2380-3356**

```jsx
// static/js/services/ExecutionEngine.js
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
    async executeNodeLive(node, nodeIndex, totalNodes) { /* extracted */ }
    async callNodeExecution(node, inputVariables) { /* extracted */ }
    async evaluateIfNodeAndBlockBranches(ifNode) { /* extracted */ }
    async gatherInputVariables(targetNode) { /* extracted */ }
    async persistDataSaveForNode(pythonNode) { /* extracted */ }
    async analyzePythonFunction(pythonFile) { /* extracted */ }
    async saveExecutionHistory(status, executionOrder, errorMessage) { /* extracted */ }
    async viewExecutionHistory(executionId) { /* extracted */ }
    async handleResumeExecution(data) { /* extracted */ }
}

```

**Benefits**:

- Separates execution logic from UI concerns
- Makes execution logic testable in isolation
- Reduces FlowchartBuilder by ~1000 lines

### 1.2 ViewportManager Service

**Extract from FlowchartBuilder.js lines 350-540, 1130-1250**

```jsx
// static/js/services/ViewportManager.js
class ViewportManager {
    constructor(stateManager, svgElement) {
        this.state = stateManager;
        this.svg = svgElement;
        this.zoom = null;
        this.zoomGroup = null;
        this.viewportSaveTimer = null;
        this.viewportSaveDelay = 250;
    }

    setupZoomPan() { /* extracted from setupZoomPan */ }
    getViewportStorageKey() { /* extracted */ }
    scheduleViewportSave() { /* extracted */ }
    saveViewportToStorage() { /* extracted */ }
    restoreViewportFromStorage() { /* extracted */ }
    zoomToFit() { /* extracted */ }
    resetZoom() { /* extracted */ }
    centerOnNode(nodeId) { /* extracted */ }
    centerOnNodeWithTopOffset(nodeId, offsetTopPx, duration, scaleOverride) { /* extracted */ }
}

```

**Benefits**:

- Isolates viewport/zoom logic
- Makes viewport behavior configurable
- Reduces FlowchartBuilder by ~400 lines

### 1.3 UIManager Service

**Extract from FlowchartBuilder.js lines 541-860, 1249-1320**

```jsx
// static/js/services/UIManager.js
class UIManager {
    constructor(stateManager, eventEmitter) {
        this.state = stateManager;
        this.events = eventEmitter;
        this.statusText = null;
        this.nodeCount = null;
        this.nodeCoordinates = null;
        this.statusProgress = null;
        this.statusProgressBar = null;
        this.statusBar = null;
    }

    setupNavigationButtons() { /* extracted */ }
    setupStatusBar() { /* extracted */ }
    setupContextMenu() { /* extracted */ }
    updateStatusBar(message) { /* extracted */ }
    updateStats() { /* extracted */ }
    updateNodeCoordinates() { /* extracted */ }
    updateExecutionStatus(type, message) { /* extracted */ }
    showStatusProgress(percent) { /* extracted */ }
    setStatusProgress(percent) { /* extracted */ }
    hideStatusProgress() { /* extracted */ }
}

```

**Benefits**:

- Centralizes UI update logic
- Makes UI behavior consistent
- Reduces FlowchartBuilder by ~600 lines

### Phase 2: Consolidate Duplicated Code (Week 2)

### 2.1 Execution Method Consolidation

**Current Duplication**: `executeNodeLive` and `executeNodeLiveWithVariables` are nearly identical

```jsx
// In ExecutionEngine.js - consolidate to single method
async executeNode(node, nodeIndex, totalNodes, options = {}) {
    const {
        accumulatedVariables = {},
        isResume = false
    } = options;

    // unified execution logic
    if (this.blockedNodeIds.has(node.id)) return true;

    if (node.type === 'if_node') {
        await this.evaluateIfNodeAndBlockBranches(node);
        this.setNodeState(node.id, 'completed');
        return true;
    }

    // rest of unified logic...
}

```

**Benefits**: Eliminates ~200 lines of duplicated code

### 2.2 Status Update Consolidation

**Current Duplication**: Multiple status update patterns throughout

```jsx
// In UIManager.js - create unified status system
class StatusManager {
    updateStatus(type, message, options = {}) {
        const { suppressNotification = false, duration = 3000 } = options;

        switch(type) {
            case 'info':
                this.updateStatusBar(message);
                break;
            case 'execution':
                this.updateExecutionStatus(message.status, message.text);
                break;
            case 'progress':
                this.updateStats();
                break;
        }

        if (!suppressNotification) {
            this.showNotification(message, duration);
        }
    }
}

```

**Benefits**: Eliminates ~50 status update calls and standardizes messaging

### 2.3 Error Handling Consolidation

**Current Issue**: 50+ try-catch blocks with empty handlers

```jsx
// Create ErrorBoundary utility
class ErrorBoundary {
    static wrap(fn, context = 'unknown') {
        return async (...args) => {
            try {
                return await fn(...args);
            } catch (error) {
                console.error(`Error in ${context}:`, error);
                // centralized error handling
                return null;
            }
        };
    }

    static safe(fn, fallback = null) {
        return (...args) => {
            try {
                return fn(...args);
            } catch {
                return fallback;
            }
        };
    }
}

// Usage throughout codebase
const safeUpdateUI = ErrorBoundary.wrap(this.updateUI, 'UI update');
const safeGetElement = ErrorBoundary.safe(() => document.getElementById(id), null);

```

**Benefits**: Eliminates 50+ try-catch blocks, provides consistent error handling

### Phase 3: Remove Debug Code and Bloat (Week 3)

### 3.1 Console Statement Removal

**Current Issue**: 100+ console statements

```jsx
// Create Logger utility for production builds
class Logger {
    static isDebug = false; // controlled by build process

    static log(...args) {
        if (Logger.isDebug) console.log(...args);
    }

    static warn(...args) {
        if (Logger.isDebug) console.warn(...args);
    }

    static error(...args) {
        // Always log errors in production
        console.error(...args);
    }
}

// Replace all console statements
// Before: console.log('debug info');
// After: Logger.log('debug info');

```

**Benefits**: Eliminates 100+ console statements, provides controlled logging

### 3.2 Remove TODO and Placeholder Code

**Current Issues**: Incomplete features and placeholder code

```jsx
// Remove from EventManager.js
// Before:
case 'z':
    if (event.ctrlKey) {
        event.preventDefault();
        // todo: implement undo
        console.log('undo not implemented yet');
    }
    break;

// After:
case 'z':
    if (event.ctrlKey) {
        event.preventDefault();
        // Undo functionality will be implemented in future version
    }
    break;

```

**Benefits**: Eliminates ~20 TODO comments and placeholder implementations

### 3.3 Remove Unused Methods

**Current Issues**: Methods that are never called or serve no purpose

```jsx
// Remove from FlowchartBuilder.js:
// - formatNodeOutput() - unused
// - looksLikeVariableOutput() - unused
// - formatVariableOutput() - unused
// - inferArrayTitle() - unused
// - inferValueTitle() - unused
// - formatStringVariable() - unused
// - formatArrayVariable() - unused
// - formatRegularOutput() - unused
// - escapeHtml() - unused

```

**Benefits**: Eliminates ~200 lines of unused code

### Phase 4: Improve Architecture (Week 4)

### 4.1 Dependency Injection

**Current Issue**: Tight coupling between components

```jsx
// Before: Direct instantiation
class FlowchartBuilder {
    constructor() {
        this.state = new StateManager();
        this.events = new EventManager(this.state);
        // ...
    }
}

// After: Dependency injection
class FlowchartBuilder {
    constructor(dependencies = {}) {
        this.state = dependencies.stateManager || new StateManager();
        this.events = dependencies.eventManager || new EventManager(this.state);
        this.executionEngine = dependencies.executionEngine || new ExecutionEngine(this.state, this.events);
        this.viewportManager = dependencies.viewportManager || new ViewportManager(this.state, this.svg);
        this.uiManager = dependencies.uiManager || new UIManager(this.state, this.events);
    }
}

```

**Benefits**: Makes components testable and loosely coupled

### 4.2 Event-Driven Architecture

**Current Issue**: Direct method calls between components

```jsx
// Before: Direct calls
this.nodeRenderer.updateNodeStyles();
this.linkRenderer.updateLinkStyles();

// After: Event-driven
this.events.emit('nodeStylesChanged');
this.events.emit('linkStylesChanged');

// Components listen for events
this.state.on('nodeStylesChanged', () => this.nodeRenderer.updateNodeStyles());
this.state.on('linkStylesChanged', () => this.linkRenderer.updateLinkStyles());

```

**Benefits**: Reduces coupling, makes system more modular

### 4.3 Configuration Management

**Current Issue**: Hardcoded values throughout

```jsx
// Create Config service
class Config {
    static defaults = {
        viewport: {
            saveDelay: 250,
            minZoom: 0.1,
            maxZoom: 4
        },
        execution: {
            timeout: 30000,
            retryAttempts: 3
        },
        ui: {
            statusTimeout: 3000,
            animationDuration: 400
        }
    };

    static get(key) {
        return key.split('.').reduce((obj, k) => obj?.[k], Config.defaults);
    }
}

```

**Benefits**: Centralizes configuration, makes system more maintainable