# flowchart builder - modular architecture

this directory contains the modular javascript architecture for the flowchart builder application.

## architecture overview

the application is built using a modular, event-driven architecture that separates concerns and enables easy maintenance and extension.

### directory structure

```
static/js/
├── utils/              # utility modules
│   ├── EventEmitter.js     # event system for component communication
│   ├── Geometry.js         # geometric calculations and node positioning
│   ├── Storage.js          # data persistence and api communication
│   └── Validation.js       # input validation and data integrity
├── core/               # core application logic
│   ├── StateManager.js     # centralized state management
│   ├── EventManager.js     # global event coordination
│   └── FlowchartBuilder.js # main application orchestrator
├── interactions/       # user interaction handlers
│   ├── DragHandler.js      # drag and drop operations
│   ├── SelectionHandler.js # node/link selection logic
│   └── ConnectionHandler.js # node connection creation
├── rendering/          # visual rendering modules
│   ├── NodeRenderer.js     # node visualization and styling
│   ├── LinkRenderer.js     # link/connection rendering
│   └── GroupRenderer.js    # group container visualization
├── components/         # ui components
│   └── Sidebar.js          # properties sidebar management
└── main.js             # application entry point
```

## key design principles

### 1. separation of concerns
- **state management**: centralized in StateManager
- **rendering**: separated by entity type (nodes, links, groups)
- **interactions**: modular handlers for different interaction types
- **ui components**: self-contained with clear interfaces

### 2. event-driven architecture
- components communicate via events, not direct method calls
- loose coupling enables easy testing and modification
- centralized event coordination prevents conflicts

### 3. single responsibility
- each module has one clear purpose
- easy to locate and modify specific functionality
- reduced cognitive load when working on features

### 4. extensibility
- new interaction types can be added as separate modules
- rendering can be enhanced without affecting business logic
- ui components can be swapped or extended independently

## module descriptions

### utilities (`utils/`)

**EventEmitter.js**
- simple pub/sub event system
- enables loose coupling between components
- supports one-time listeners and listener removal

**Geometry.js**
- geometric calculations (distance, bounds, intersections)
- node positioning algorithms (grid, circle, alignment)
- text measurement for responsive sizing

**Storage.js**
- handles data persistence to server
- export/import functionality
- api communication wrapper

**Validation.js**
- input validation for nodes, links, and groups
- data integrity checks
- sanitization utilities

### core (`core/`)

**StateManager.js**
- centralized application state
- data manipulation methods (crud operations)
- state change event emission
- auto-save coordination

**EventManager.js**
- global event coordination
- keyboard shortcut handling
- api action dispatching
- canvas event processing

**FlowchartBuilder.js**
- main application orchestrator
- component initialization and coordination
- canvas setup and management
- high-level application operations

### interactions (`interactions/`)

**DragHandler.js**
- smooth drag and drop implementation
- multi-node drag support
- drag constraints and snapping
- animation frame optimization

**SelectionHandler.js**
- single and multi-select logic
- area selection with drag rectangle
- selection utilities (select all, by type, connected)
- keyboard selection shortcuts

**ConnectionHandler.js**
- node connection creation
- connection validation
- smart connection routing
- bulk connection operations

### rendering (`rendering/`)

**NodeRenderer.js**
- node visual representation
- connection dot management
- node animations and theming
- responsive node sizing

**LinkRenderer.js**
- link/connection visualization
- multiple path types (straight, bezier, orthogonal)
- link animations and flow effects
- connection line management

**GroupRenderer.js**
- group container visualization
- dynamic bounds calculation
- group interactions and animations
- resize handle management

### components (`components/`)

**Sidebar.js**
- properties panel management
- form handling and validation
- real-time updates and auto-save
- user feedback (toasts, status)

## event system

the application uses a centralized event system for component communication:

### core events
- `stateChanged` - fired when application state changes
- `nodeAdded/Updated/Removed` - node lifecycle events
- `linkAdded/Removed` - link lifecycle events
- `groupCreated/Updated/Removed` - group lifecycle events
- `selectionChanged` - selection state changes

### interaction events
- `dragStateChanged` - drag operation state
- `connectionStateChanged` - connection mode state
- `statusUpdate` - status bar messages

### rendering events
- `updateNodeStyles` - refresh node visual styles
- `updateNodePosition` - move node to new position
- `highlightNode` - highlight/unhighlight node

## adding new features

### new interaction type
1. create new handler in `interactions/`
2. initialize in `FlowchartBuilder.js`
3. add event listeners in `EventManager.js`
4. emit relevant events for ui updates

### new rendering feature
1. extend appropriate renderer in `rendering/`
2. add css styles if needed
3. emit events for state synchronization

### new ui component
1. create component in `components/`
2. integrate with StateManager events
3. add to FlowchartBuilder initialization

## debugging

the application provides debug helpers accessible via browser console:

```javascript
// available at window.debugFlowchart
debugFlowchart.logState()    // log current application state
debugFlowchart.getStats()    // get application statistics
debugFlowchart.zoomToFit()   // zoom to fit all nodes
debugFlowchart.resetZoom()   // reset zoom to 100%
debugFlowchart.exportData()  // download flowchart as json
debugFlowchart.saveData()    // manually trigger save
```

## performance considerations

- **lazy loading**: modules loaded only when needed
- **event debouncing**: auto-save and form updates are debounced
- **animation frames**: smooth drag operations use requestAnimationFrame
- **selective updates**: only affected elements are re-rendered
- **memory management**: proper cleanup on component destruction

## testing strategy

the modular architecture enables comprehensive testing:

- **unit tests**: test individual modules in isolation
- **integration tests**: test component interactions
- **e2e tests**: test complete user workflows
- **performance tests**: measure rendering and interaction performance

## migration from monolithic version

the original monolithic `flowchart.js` (963 lines) has been:
- ✅ split into 15 focused modules
- ✅ total lines reduced through better organization
- ✅ functionality preserved and enhanced
- ✅ performance improved through optimizations
- ✅ maintainability dramatically increased

## future enhancements

the modular architecture enables easy addition of:
- **undo/redo system**: add to StateManager
- **plugin system**: dynamic module loading
- **themes**: separate theme modules
- **export formats**: additional export handlers
- **collaboration**: real-time sync modules
- **advanced layouts**: new positioning algorithms