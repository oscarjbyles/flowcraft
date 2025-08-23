// centralized saving functionality for flowchart
(function() {
    'use strict';
    
    // avoid re-defining in case this file is accidentally loaded twice
    if (window.Saving) { return; }

class Saving {
    constructor(stateManager) {
        this.state = stateManager;
        
        // autosave configuration
        this.autosaveTimer = null;
        this.autosaveDelay = 2000;
        
        // debounced save timeouts
        this.nodeSaveTimeout = null;
        this.groupSaveTimeout = null;
        
        // storage instance
        this.storage = new Storage();
        
        // builder reference for execution history
        this.builder = null;
        
        // bind methods to preserve context
        this.scheduleAutosave = this.scheduleAutosave.bind(this);
        this.save = this.save.bind(this);
        this.load = this.load.bind(this);
        this.flushPendingSavesOnExit = this.flushPendingSavesOnExit.bind(this);
        this.debounceNodeSave = this.debounceNodeSave.bind(this);
        this.debounceGroupSave = this.debounceGroupSave.bind(this);
        

    }

    /**
     * initialize the saving module with builder reference
     */
    initialize(builder) {
        this.builder = builder;

    }

    /**
     * return a plain object representing current flowchart state for persistence
     */
    getSerializableData() {
        // strip transient runtime-only fields before persisting (e.g., data_save runtimeStatus)
        const sanitizedNodes = (this.state.nodes || []).map((node) => {
            if (!node || typeof node !== 'object') return node;
            const { runtimeStatus, ...rest } = node;
            return rest;
        });

        return {
            nodes: sanitizedNodes,
            links: this.state.links,
            groups: this.state.groups,
            annotations: this.state.annotations
        };
    }

    /**
     * flush any pending autosave immediately and try to persist using exit-safe transport
     */
    flushPendingSavesOnExit() {
        try {
            if (this.autosaveTimer) {
                clearTimeout(this.autosaveTimer);
                this.autosaveTimer = null;
            }
            const data = this.getSerializableData();
            // best-effort; do not await
            this.storage.saveOnExit(data);
        } catch (_) {}
    }

    /**
     * schedule autosave with debouncing
     */
    scheduleAutosave() {
        if (this.autosaveTimer) {
            clearTimeout(this.autosaveTimer);
        }
        
        this.autosaveTimer = setTimeout(() => {
            this.save(true);
        }, this.autosaveDelay);
    }

    /**
     * centralized method for triggering autosave from other modules
     */
    triggerAutosave() {
        this.scheduleAutosave();
    }

    /**
     * save flowchart data to server
     */
    async save(isAutosave = false, force = false) {
        const data = this.getSerializableData();

        const result = await this.storage.save(data, isAutosave, force);
        
        if (result.success) {
            this.state.emit('dataSaved', { isAutosave, message: result.message });
        } else {
            if (result.code === 'destructive_change') {
                // notify ui to prompt the user
                this.state.emit('destructiveChangeDetected', { 
                    existingNodes: result.payload && result.payload.existing_nodes, 
                    incomingNodes: result.payload && result.payload.incoming_nodes,
                    threshold: result.payload && result.payload.threshold
                });
                return result;
            }
            this.state.emit('saveError', { message: result.message });
        }
        
        return result;
    }

    /**
     * load flowchart data from server
     */
    async load() {
        const result = await this.storage.load();
        
        if (result.success) {
            this.state.nodes = result.data.nodes || [];
            this.state.links = result.data.links || [];
            this.state.groups = result.data.groups || [];
            this.state.annotations = result.data.annotations || [];
            
            // normalize any pythonFile paths to remove leading 'nodes/' on load
            try {
                this.state.nodes.forEach(n => {
                    if (n && typeof n.pythonFile === 'string' && n.pythonFile) {
                        const s = n.pythonFile.replace(/\\/g, '/');
                        const noPrefix = s.replace(/^(?:nodes\/)*/i, '');
                        n.pythonFile = noPrefix;
                    }
                    // normalize node types - ensure all nodes have a valid type
                    if (n && (!n.type || typeof n.type !== 'string')) {
                        console.log('[saving] normalizing node type for node:', n.id, 'from:', n.type, 'to: python_file');
                        n.type = 'python_file'; // default fallback
                    }
                });
            } catch(_) {}
            
            // update counters
            this.state.updateCounters();
            // hydrate magnet pairs after load
            if (this.state.createNode) {
                this.state.createNode.rebuildMagnetPairsFromNodes();
            }
            
            // check and create input nodes for loaded python_file nodes
            if (this.state.createNode) {
                await this.state.createNode.checkLoadedNodesForInputs();
            }
            
            this.state.emit('dataLoaded', { data: result.data, message: result.message });
            this.state.emit('stateChanged');
        } else {
            this.state.emit('loadError', { message: result.message });
        }
        
        return result;
    }

    /**
     * debounced node save for form inputs
     */
    debounceNodeSave() {
        clearTimeout(this.nodeSaveTimeout);
        this.nodeSaveTimeout = setTimeout(() => {
            this.saveNodeProperties();
        }, 1000);
    }

    /**
     * debounced group save for form inputs
     */
    debounceGroupSave() {
        clearTimeout(this.groupSaveTimeout);
        this.groupSaveTimeout = setTimeout(() => {
            this.saveGroupProperties();
        }, 1000);
    }

    /**
     * save node properties from form
     */
    saveNodeProperties() {
        const selectedNodes = this.state.selectionHandler ? this.state.selectionHandler.getSelectedNodes() : [];
        if (selectedNodes.length !== 1) return;

        const node = selectedNodes[0];
        const updates = {};

        // get node name
        const nameInput = document.getElementById('node_name');
        if (nameInput && nameInput.value !== node.name) {
            updates.name = nameInput.value.trim();
        }

        // get python file for python_file nodes
        if (node.type === 'python_file') {
            const fileInput = document.getElementById('python_file');
            if (fileInput && fileInput.value !== node.pythonFile) {
                updates.pythonFile = fileInput.value.trim();
            }
        }

        // apply updates if any
        if (Object.keys(updates).length > 0) {
            if (this.state.createNode) {
                this.state.createNode.updateNode(node.id, updates);
            }
        }
    }

    /**
     * save group properties from form
     */
    saveGroupProperties() {
        const selectedGroup = this.state.selectionHandler ? this.state.selectionHandler.selectedGroup : null;
        if (!selectedGroup) return;

        const updates = {};

        // get group name
        const nameInput = document.getElementById('group_name');
        if (nameInput && nameInput.value !== selectedGroup.name) {
            updates.name = nameInput.value.trim();
        }

        // get group description
        const descInput = document.getElementById('group_description');
        if (descInput && descInput.value !== selectedGroup.description) {
            updates.description = descInput.value.trim();
        }

        // apply updates if any
        if (Object.keys(updates).length > 0) {
            this.state.updateGroup(selectedGroup.id, updates);
        }
    }

    /**
     * export data for download/backup
     */
    exportData() {
        return {
            nodes: this.state.nodes,
            links: this.state.links,
            groups: this.state.groups,
            metadata: {
                nodeCounter: this.state.nodeCounter,
                groupCounter: this.state.groupCounter,
                timestamp: new Date().toISOString()
            }
        };
    }

    /**
     * import data from external source
     */
    importData(data) {
        this.state.nodes = data.nodes || [];
        this.state.links = data.links || [];
        this.state.groups = data.groups || [];
        
        // normalize pythonFile paths on import as well
        try {
            this.state.nodes.forEach(n => {
                if (n && typeof n.pythonFile === 'string' && n.pythonFile) {
                    const s = n.pythonFile.replace(/\\/g, '/');
                    const noPrefix = s.replace(/^(?:nodes\/)*/i, '');
                    n.pythonFile = noPrefix ? `nodes/${noPrefix}` : '';
                }
            });
        } catch(_) {}

        if (data.metadata) {
            this.state.nodeCounter = data.metadata.nodeCounter || 0;
            this.state.groupCounter = data.metadata.groupCounter || 0;
        } else {
            this.state.updateCounters();
        }
        
        // hydrate magnet pairs after import
        if (this.state.createNode) {
            this.state.createNode.rebuildMagnetPairsFromNodes();
        }
        
        // clear selection
        if (this.state.selectionHandler) {
            this.state.selectionHandler.clearSelection();
        }
        
        this.state.emit('dataImported', data);
        this.state.emit('stateChanged');
    }

    /**
     * save execution history
     */
    async saveExecutionHistory(status, executionOrder, errorMessage = null) {
        try {
            // check if builder is available
            if (!this.builder || !this.builder.nodeExecutionResults) {
                console.warn('saving: builder or nodeExecutionResults not available for execution history');
                return;
            }
            
            // prepare execution results
            const results = [];
            
            // convert node execution results to array format
            for (const node of executionOrder) {
                const result = this.builder.nodeExecutionResults.get(node.id);
                if (result) {
                    results.push({
                        node_id: node.id,
                        node_name: node.name,
                        python_file: (node.pythonFile || '').replace(/\\/g,'/').replace(/^(?:nodes\/)*/i,''),
                        success: result.success,
                        output: result.output,
                        error: result.error,
                        runtime: result.runtime,
                        timestamp: result.timestamp,
                        return_value: result.return_value,
                        function_name: result.function_name,
                        input_args: result.input_args
                    });
                }
            }

            // also include synthesized results for data_save nodes (not part of executionOrder)
            const dataSaveNodes = this.state.nodes.filter(n => n.type === 'data_save');
            for (const ds of dataSaveNodes) {
                const dsResult = this.builder.nodeExecutionResults.get(ds.id);
                if (!dsResult) continue;
                results.push({
                    node_id: ds.id,
                    node_name: ds.name,
                    python_file: (dsResult.python_file || '').replace(/\\/g,'/').replace(/^(?:nodes\/)*/i,''),
                    success: dsResult.success,
                    output: dsResult.output,
                    error: dsResult.error,
                    runtime: dsResult.runtime,
                    timestamp: dsResult.timestamp,
                    return_value: dsResult.return_value,
                    function_name: dsResult.function_name || 'data_save',
                    input_args: dsResult.input_args,
                    // carry metadata to help ui show the python variable name
                    data_save: dsResult.data_save || {
                        data_name: (ds && ds.dataSource && ds.dataSource.variable && ds.dataSource.variable.name) || (ds && ds.name) || 'data',
                        variable_name: (ds && ds.dataSource && ds.dataSource.variable && ds.dataSource.variable.name) || null
                    }
                });
            }

            // build a normalized data_saves array for easy consumption in the data matrix
            const dataSaves = [];
            const dataSaveNodesForMatrix = this.state.nodes.filter(n => n.type === 'data_save');
            for (const ds of dataSaveNodesForMatrix) {
                const dsResult = this.builder.nodeExecutionResults.get(ds.id);
                if (!dsResult || !dsResult.return_value || typeof dsResult.return_value !== 'object') continue;
                const keys = Object.keys(dsResult.return_value);
                if (keys.length === 0) continue;
                const varName = (dsResult.data_save && dsResult.data_save.variable_name) || keys[0];
                const value = dsResult.return_value[varName] ?? dsResult.return_value[keys[0]];
                const typeOf = (val) => {
                    if (val === null) return 'null';
                    if (Array.isArray(val)) return 'array';
                    if (typeof val === 'number') return Number.isInteger(val) ? 'integer' : 'float';
                    if (typeof val === 'object') return 'object';
                    if (typeof val === 'string') return 'string';
                    if (typeof val === 'boolean') return 'boolean';
                    return typeof val;
                };
                dataSaves.push({
                    node_name: ds.name || 'data save',
                    variable_name: varName || keys[0],
                    variable_content: [ typeOf(value), value ]
                });
            }
            
            // sanitize feed to ensure no duplicate entries or line texts per node before saving history
            const sanitizedFeed = [];

            // build variable state for resume functionality
            const variableState = {};
            // collect variables from all executed nodes in order
            for (const node of executionOrder) {
                const result = this.builder.nodeExecutionResults.get(node.id);
                if (result && result.success && result.return_value) {
                    if (typeof result.return_value === 'object' && result.return_value !== null) {
                        Object.assign(variableState, result.return_value);
                    } else {
                        // use node name as variable name for simple values
                        const varName = node.name.toLowerCase().replace(/[^a-zA-Z0-9]/g, '_');
                        variableState[varName] = result.return_value;
                    }
                }
            }

            const executionData = {
                status: status,
                execution_order: executionOrder.map(node => node.id),
                results: results,
                data_saves: dataSaves,
                feed: sanitizedFeed,
                // exclude data_save nodes from counts by only considering the computed execution order
                total_nodes: executionOrder.length,
                successful_nodes: results.filter(r => r.success && executionOrder.some(node => node.id === r.node_id)).length,
                error_message: errorMessage,
                variable_state: variableState, // add variable state for resume functionality
                flowchart_state: {
                    nodes: this.state.nodes.map(node => {
                        // base properties for all nodes
                        const baseNode = {
                            id: node.id,
                            name: node.name,
                            x: node.x,
                            y: node.y,
                            pythonFile: node.pythonFile,
                            description: node.description,
                            type: node.type,
                            width: node.width,
                            groupId: node.groupId
                        };
                        
                        // add type-specific properties
                        if (node.type === 'input_node') {
                            // include all input node specific properties
                            return {
                                ...baseNode,
                                parameters: node.parameters,
                                targetNodeId: node.targetNodeId,
                                inputValues: node.inputValues,
                                skipInputCheck: node.skipInputCheck
                            };
                        } else if (node.type === 'data_save') {
                            // include data_save specific fields to support data matrix table
                            return {
                                ...baseNode,
                                dataSource: node.dataSource
                            };
                        } else {
                            // for other node types, include any additional properties they might have
                            return {
                                ...baseNode,
                                // include any other properties that might be needed
                                ...(node.magnet_partner_id && { magnet_partner_id: node.magnet_partner_id })
                            };
                        }
                    }),
                    links: this.state.links,
                    groups: this.state.groups
                }
            };
            
            const response = await fetch('/api/save-execution', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    flowchart_name: this.storage.getCurrentFlowchart(),
                    execution_data: executionData
                })
            });
            
            const result = await response.json();
            
            if (result.status === 'success') {
                // execution history saved successfully
            } else {
                console.error('failed to save execution history:', result.message);
            }
            
        } catch (error) {
            console.error('error saving execution history:', error);
        }
    }

    /**
     * clear all pending save timers
     */
    clearAllTimers() {
        if (this.autosaveTimer) {
            clearTimeout(this.autosaveTimer);
            this.autosaveTimer = null;
        }
        if (this.nodeSaveTimeout) {
            clearTimeout(this.nodeSaveTimeout);
            this.nodeSaveTimeout = null;
        }
        if (this.groupSaveTimeout) {
            clearTimeout(this.groupSaveTimeout);
            this.groupSaveTimeout = null;
        }
    }

    /**
     * get save statistics
     */
    getSaveStats() {
        return {
            autosaveDelay: this.autosaveDelay,
            hasPendingAutosave: !!this.autosaveTimer,
            hasPendingNodeSave: !!this.nodeSaveTimeout,
            hasPendingGroupSave: !!this.groupSaveTimeout
        };
    }
}

window.Saving = Saving;
})();
