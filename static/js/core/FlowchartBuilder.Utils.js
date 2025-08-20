// FlowchartBuilder Utils Module
// Contains all utility methods for the FlowchartBuilder class

(function() {
    'use strict';

    // Extend the FlowchartBuilder prototype with utility methods
    const UtilsModule = {

        // Stats and data operations
        getStats() {
            return {
                ...this.state.getStats(),
                canvasSize: { width: this.state.canvasWidth, height: this.state.canvasHeight },
                zoomLevel: this.state.transform.k,
                panPosition: { x: this.state.transform.x, y: this.state.transform.y }
            };
        },

        exportData() {
            const data = this.state.exportData();
            this.state.storage.exportAsJson(data);
            this.updateStatusBar('flowchart exported');
        },

        async importData(file) {
            try {
                const data = await this.state.storage.importFromJson(file);
                this.state.importData(data);
                this.updateStatusBar('flowchart imported successfully');
            } catch (error) {
                this.handleError('failed to import flowchart', error);
            }
        },

        async loadInitialData() {
            try {
                await this.state.load();
            } catch (error) {
                this.handleError('failed to load saved data', error);
            }
        },

        async saveData() {
            try {
                const result = await this.state.save();
                if (result.success) {
                    this.updateStatusBar('flowchart saved successfully');
                } else {
                    this.updateStatusBar('failed to save flowchart');
                }
            } catch (error) {
                this.handleError('save error occurred', error);
            }
        },

        // Execution state management
        clearRunModeState() {
            this.resetNodeStates();
            this.clearOutput();
            this.clearExecutionFeed();
            this.updateExecutionStatus('info', 'cleared');
            this.clearIfRuntimeIndicators();
            this.clearAllNodeColorState();
            // clear selection and ensure default run panel when coming back later
            this.state.clearSelection();
            this.state.emit('updateSidebar');
        },

        // clear all runtime condition flags on if→python links (used when clearing run or leaving run mode)
        clearIfRuntimeIndicators() {
            try {
                const links = Array.isArray(this.state.links) ? this.state.links : [];
                links.forEach(l => {
                    const s = this.state.getNode(l.source);
                    const t = this.state.getNode(l.target);
                    if (s && t && s.type === 'if_node' && t.type === 'python_file') {
                        this.state.updateLink(l.source, l.target, { runtime_condition: null, runtime_details: null });
                    }
                });
                // re-render if-to-python nodes to reflect cleared state
                this.linkRenderer.renderIfToPythonNodes();
            } catch (_) {}
        },

        clearExecutionFeed() {
            // clear internal execution feed data
            this.executionFeed = [];
            // clear bottom live feed ui
            const list = document.getElementById('run_feed_list');
            if (list) {
                list.innerHTML = '';
                // add placeholder when list is empty
                const placeholder = document.createElement('div');
                placeholder.id = 'run_feed_placeholder';
                placeholder.className = 'run_feed_placeholder';
                placeholder.textContent = 'waiting for execution';
                list.appendChild(placeholder);
            }
        },

        // Output and logging
        clearOutput() {
            // clear the separate output sections
            const nodeInputContent = document.getElementById('node_input_content');
            const nodeOutputContent = document.getElementById('node_output_content');
            const consoleContent = document.getElementById('console_output_log');

            if (nodeInputContent) {
                nodeInputContent.textContent = 'output cleared';
            }
            if (nodeOutputContent) {
                nodeOutputContent.textContent = 'output cleared';
            }
            if (consoleContent) {
                consoleContent.textContent = 'output cleared';
            }

            // clear global execution log
            this.globalExecutionLog = '';

            // clear all node execution results
            if (this.nodeExecutionResults) {
                this.nodeExecutionResults.clear();
            }
        },

        appendOutput(text) {
            // add to global execution log
            this.globalExecutionLog += text + '\n';

            // only update the console display if no specific node is selected
            // or if we're not in run mode with a node selection
            const selectedNodes = Array.from(this.state.selectedNodes);
            const isRunMode = this.state.currentMode === 'run';

            if (!isRunMode || selectedNodes.length !== 1) {
                const consoleLog = document.getElementById('console_output_log');
                if (consoleLog) {
                    consoleLog.textContent = this.globalExecutionLog;
                    consoleLog.scrollTop = consoleLog.scrollHeight;
                }
            }
        },

        showGlobalExecutionLog() {
            // show the complete execution log in console output
            const consoleLog = document.getElementById('console_output_log');
            if (consoleLog) {
                consoleLog.textContent = this.globalExecutionLog || 'no execution output yet';
                consoleLog.scrollTop = consoleLog.scrollHeight;
            }
        },

        appendToExecutionLog(message) {
            // append a line to the global execution log and update the console view
            try {
                const text = (typeof message === 'string') ? message : JSON.stringify(message);
                if (this.globalExecutionLog && this.globalExecutionLog.length > 0) {
                    this.globalExecutionLog += `\n${text}`;
                } else {
                    this.globalExecutionLog = text;
                }
                this.showGlobalExecutionLog();
            } catch (_) {
                // best-effort fallback without breaking execution
                this.globalExecutionLog += `\n${String(message)}`;
                this.showGlobalExecutionLog();
            }
        },

        // Node output formatting
        formatNodeOutput(output) {
            if (!output || typeof output !== 'string') {
                return '';
            }

            // split output into lines and try to identify variables
            const lines = output.trim().split('\n');
            const formattedParts = [];

            for (let line of lines) {
                line = line.trim();
                if (!line) continue;

                // check if line looks like a variable assignment output (simple heuristic)
                // this is a basic implementation - could be enhanced with more sophisticated parsing
                if (this.looksLikeVariableOutput(line)) {
                    formattedParts.push(this.formatVariableOutput(line));
                } else {
                    // treat as regular output
                    formattedParts.push(this.formatRegularOutput(line));
                }
            }

            return formattedParts.join('');
        },

        looksLikeVariableOutput(line) {
            // simple heuristics to detect if this might be variable output
            // look for common patterns like:
            // - simple values (numbers, strings)
            // - array-like structures [1, 2, 3]
            // - object-like structures

            // for now, let's assume single values and arrays
            const trimmed = line.trim();

            // check for array-like output
            if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
                return true;
            }

            // check for simple values (numbers, quoted strings)
            if (/^[\d.-]+$/.test(trimmed) || /^['"].*['"]$/.test(trimmed)) {
                return true;
            }

            // check for boolean values
            if (trimmed === 'True' || trimmed === 'False' || trimmed === 'None') {
                return true;
            }

            return false;
        },

        formatVariableOutput(line) {
            const trimmed = line.trim();

            // try to determine a better title based on the content
            let title = 'Output';

            // check if it's an array
            if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
                title = this.inferArrayTitle(trimmed);
                return this.formatArrayVariable(title, trimmed);
            } else {
                title = this.inferValueTitle(trimmed);
                return this.formatStringVariable(title, trimmed);
            }
        },

        inferArrayTitle(arrayStr) {
            try {
                const content = arrayStr.slice(1, -1).trim();
                if (!content) return 'Empty Array';

                const elements = content.split(',').map(item => item.trim());
                const firstElement = elements[0].replace(/^['"]|['"]$/g, '');

                // check if all elements are numbers
                if (elements.every(el => /^[\d.-]+$/.test(el.trim()))) {
                    return 'Number Array';
                }

                // check if all elements are strings (quoted)
                if (elements.every(el => /^['"].*['"]$/.test(el.trim()))) {
                    return 'String Array';
                }

                return 'Mixed Array';
            } catch (e) {
                return 'Array';
            }
        },

        inferValueTitle(value) {
            const trimmed = value.trim();

            // check for specific value types
            if (/^[\d.-]+$/.test(trimmed)) {
                return 'Number Value';
            }

            if (/^['"].*['"]$/.test(trimmed)) {
                return 'String Value';
            }

            if (trimmed === 'True' || trimmed === 'False') {
                return 'Boolean Value';
            }

            if (trimmed === 'None') {
                return 'None Value';
            }

            return 'Output Value';
        },

        formatStringVariable(title, value) {
            return `
                <div style="margin-bottom: 8px;">
                    <div style="font-size: 0.9em; font-weight: 500; color: var(--primary); margin-bottom: 4px;">
                        ${title}
                    </div>
                    <div style="
                        background: var(--surface-variant);
                        border: 1px solid var(--outline);
                        border-radius: 6px;
                        padding: 8px 12px;
                        font-family: 'Courier New', monospace;
                        font-size: 0.85em;
                        color: var(--on-surface);
                        word-break: break-all;
                    ">
                        ${this.escapeHtml(value)}
                    </div>
                </div>
            `;
        },

        formatArrayVariable(title, arrayStr) {
            // parse the array string to get individual elements
            let elements = [];
            try {
                // simple parsing - remove brackets and split by comma
                const content = arrayStr.slice(1, -1).trim();
                if (content) {
                    elements = content.split(',').map(item => item.trim().replace(/^['"]|['"]$/g, ''));
                }
            } catch (e) {
                // fallback to showing the raw string
                return this.formatStringVariable(title, arrayStr);
            }

            const elementBoxes = elements.map(element => `
                <div style="
                    background: var(--surface-variant);
                    border: 1px solid var(--outline);
                    border-radius: 4px;
                    padding: 6px 10px;
                    margin: 2px;
                    display: inline-block;
                    font-family: 'Courier New', monospace;
                    font-size: 0.8em;
                    color: var(--on-surface);
                ">
                    ${this.escapeHtml(element)}
                </div>
            `).join('');

            return `
                <div style="margin-bottom: 8px;">
                    <div style="font-size: 0.9em; font-weight: 500; color: var(--primary); margin-bottom: 4px;">
                        ${title} (${elements.length} items)
                    </div>
                    <div style="
                        background: var(--surface);
                        border: 1px solid var(--outline);
                        border-radius: 6px;
                        padding: 8px;
                        display: flex;
                        flex-wrap: wrap;
                        gap: 2px;
                    ">
                        ${elementBoxes || '<em style="opacity: 0.7;">empty array</em>'}
                    </div>
                </div>
            `;
        },

        formatRegularOutput(line) {
            return `
                <div style="margin-bottom: 8px;">
                    <div style="font-size: 0.9em; font-weight: 500; color: var(--on-surface); opacity: 0.8; margin-bottom: 4px;">
                        Console Output
                    </div>
                    <div style="
                        background: var(--surface-variant);
                        border-left: 3px solid var(--secondary);
                        padding: 8px 12px;
                        font-family: 'Courier New', monospace;
                        font-size: 0.85em;
                        color: var(--on-surface);
                        border-radius: 0 6px 6px 0;
                        opacity: 0.9;
                    ">
                        ${this.escapeHtml(line)}
                    </div>
                </div>
            `;
        },

        escapeHtml(text) {
            const div = document.createElement('div');
            div.textContent = text;
            return div.innerHTML;
        },

        // Python analysis utilities
        async updateConnectedInputNodes(sourceNodeId, returnValue) {
            // find all nodes that this source node connects to
            const outgoingLinks = this.state.links.filter(link => link.source === sourceNodeId);

            for (const link of outgoingLinks) {
                const targetNode = this.state.getNode(link.target);
                if (!targetNode || targetNode.type !== 'python_file') continue;

                // find the input node for this target node
                const inputNode = this.state.nodes.find(n =>
                    n.type === 'input_node' && n.targetNodeId === targetNode.id
                );

                if (inputNode) {
                    // analyze the target function to get expected parameters
                    const targetFunctionInfo = await this.analyzePythonFunction(targetNode.pythonFile);
                    const expectedParams = targetFunctionInfo.formal_parameters || [];  // use formal_parameters for variable passing

                    // match the return value to the expected parameters
                    const variableName = this.matchVariableToParameter(
                        this.state.getNode(sourceNodeId),
                        returnValue,
                        expectedParams,
                        inputNode.inputValues || {}
                    );

                    if (variableName && expectedParams.includes(variableName)) {
                        // update the input node's value
                        if (!inputNode.inputValues) {
                            inputNode.inputValues = {};
                        }

                        // only update if the current value is empty (preserve user-entered values)
                        if (!inputNode.inputValues[variableName] || inputNode.inputValues[variableName] === '') {
                            inputNode.inputValues[variableName] = returnValue;

                            // emit update to refresh the visual representation
                            this.state.emit('nodeUpdated', inputNode);
                            this.state.emit('stateChanged');
                        }
                    }
                }
            }
        },

        async analyzePythonFunction(pythonFile) {
            // analyze a python file to get function information
            try {
                const response = await fetch('/api/analyze-python-function', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        python_file: (pythonFile || '').replace(/\\/g,'/').replace(/^(?:nodes\/)*/i,'')
                    })
                });

                const result = await response.json();
                return result;
            } catch (error) {
                this.handleError('error analyzing python function', error);
                return { parameters: [] };
            }
        },

        matchVariableToParameter(sourceNode, returnValue, expectedParams, existingVariables) {
            // try to match the return value to one of the expected parameters

            // if there's only one expected parameter, use it (highest priority)
            if (expectedParams.length === 1) {
                const paramName = expectedParams[0];
                if (!existingVariables.hasOwnProperty(paramName)) {
                    return paramName;
                }
            }

            // try to match based on common naming patterns
            for (const paramName of expectedParams) {
                if (!existingVariables.hasOwnProperty(paramName)) {
                    // direct match with common variable names
                    if (paramName === 'result' && typeof returnValue === 'number') {
                        return paramName;
                    }
                    if (paramName === 'text' && typeof returnValue === 'string') {
                        return paramName;
                    }
                    if (paramName === 'data' || paramName === 'value') {
                        return paramName;
                    }
                    if (paramName === 'items' && Array.isArray(returnValue)) {
                        return paramName;
                    }
                }
            }

            // fallback: use the first available expected parameter
            for (const paramName of expectedParams) {
                if (!existingVariables.hasOwnProperty(paramName)) {
                    return paramName;
                }
            }

            // last resort: use a generic name based on return value type
            const genericName = this.getVariableNameForNode(sourceNode, returnValue);
            return genericName;
        },

        getVariableNameForNode(sourceNode, returnValue) {
            // try to determine a good variable name based on the source node or return value
            if (sourceNode.name && sourceNode.name.toLowerCase() !== 'untitled') {
                // use node name, sanitized for variable naming
                return sourceNode.name.toLowerCase().replace(/[^a-z0-9_]/g, '_');
            }

            // fallback to generic name based on return value type
            if (typeof returnValue === 'number') {
                return 'result';
            } else if (typeof returnValue === 'string') {
                return 'text';
            } else if (Array.isArray(returnValue)) {
                return 'items';
            } else {
                return 'data';
            }
        },

        // Node order calculation (complex algorithm)
        calculateNodeOrder() {
            const nodes = this.state.nodes;
            const links = this.state.links;
            const groups = this.state.groups;

            // step 1: identify connected nodes only (nodes that are part of execution flow)
            // first filter out input nodes and data_save nodes and their connections
            const nonInputNodes = nodes.filter(node => node.type !== 'input_node' && node.type !== 'data_save');
            const nonInputLinks = links.filter(link => {
                const sourceNode = nodes.find(n => n.id === link.source);
                const targetNode = nodes.find(n => n.id === link.target);
                // exclude links that involve input nodes or data_save nodes or input connections
                return sourceNode?.type !== 'input_node' &&
                       targetNode?.type !== 'input_node' &&
                       sourceNode?.type !== 'data_save' &&
                       targetNode?.type !== 'data_save' &&
                       link.type !== 'input_connection';
            });

            const connectedNodeIds = new Set();
            nonInputLinks.forEach(link => {
                connectedNodeIds.add(link.source);
                connectedNodeIds.add(link.target);
            });

            // filter to only connected nodes (already excluding input nodes)
            const connectedNodes = nonInputNodes.filter(node =>
                connectedNodeIds.has(node.id)
            );

            if (connectedNodes.length === 0) {
                return []; // no connected nodes, no execution order
            }

            // step 2: build dependency graph
            const incomingLinks = new Map(); // node -> list of source nodes
            const outgoingLinks = new Map(); // node -> list of target nodes

            // initialize maps
            connectedNodes.forEach(node => {
                incomingLinks.set(node.id, []);
                outgoingLinks.set(node.id, []);
            });

            // populate dependency relationships using filtered links
            nonInputLinks.forEach(link => {
                if (connectedNodeIds.has(link.source) && connectedNodeIds.has(link.target)) {
                    incomingLinks.get(link.target).push(link.source);
                    outgoingLinks.get(link.source).push(link.target);
                }
            });

            // step 3: group nodes by their group membership
            const nodeToGroup = new Map(); // nodeId -> group
            const groupToNodes = new Map(); // groupId -> Set of nodeIds

            // initialize group mappings
            connectedNodes.forEach(node => {
                if (node.groupId) {
                    nodeToGroup.set(node.id, node.groupId);
                    if (!groupToNodes.has(node.groupId)) {
                        groupToNodes.set(node.groupId, new Set());
                    }
                    groupToNodes.get(node.groupId).add(node.id);
                }
            });

            // step 4: find execution order using group-aware topological sort
            const result = [];
            const processed = new Set();
            const processing = new Set();

            // helper function to check if all dependencies are satisfied
            const canExecute = (nodeId) => {
                const dependencies = incomingLinks.get(nodeId) || [];
                return dependencies.every(depId => processed.has(depId));
            };

            // helper function to get ready nodes (all dependencies satisfied)
            const getReadyNodes = () => {
                return connectedNodes.filter(node =>
                    !processed.has(node.id) &&
                    !processing.has(node.id) &&
                    canExecute(node.id)
                );
            };

            // helper function to check if all nodes in a group are ready
            const isGroupReady = (groupId) => {
                const groupNodeIds = groupToNodes.get(groupId);
                if (!groupNodeIds) return false;

                const groupNodes = connectedNodes.filter(node => groupNodeIds.has(node.id));
                return groupNodes.every(node =>
                    !processed.has(node.id) &&
                    !processing.has(node.id) &&
                    canExecute(node.id)
                );
            };

            // helper function to get all nodes in a group that are ready
            const getReadyNodesInGroup = (groupId) => {
                const groupNodeIds = groupToNodes.get(groupId);
                if (!groupNodeIds) return [];

                return connectedNodes.filter(node =>
                    groupNodeIds.has(node.id) &&
                    !processed.has(node.id) &&
                    !processing.has(node.id) &&
                    canExecute(node.id)
                );
            };

            // step 5: process nodes in group-aware execution order
            while (processed.size < connectedNodes.length) {
                const readyNodes = getReadyNodes();

                if (readyNodes.length === 0) {
                    // this shouldn't happen in a valid dag, but handle it gracefully
                    console.warn('circular dependency detected or disconnected components');
                    break;
                }

                // prioritize nodes that belong to groups that are ready to be processed
                const readyGroups = new Set();
                readyNodes.forEach(node => {
                    if (node.groupId && isGroupReady(node.groupId)) {
                        readyGroups.add(node.groupId);
                    }
                });

                let nodesToProcess = [];

                if (readyGroups.size > 0) {
                    // process entire groups that are ready
                    readyGroups.forEach(groupId => {
                        const groupReadyNodes = getReadyNodesInGroup(groupId);
                        nodesToProcess.push(...groupReadyNodes);
                    });
                } else {
                    // fallback to original logic for ungrouped nodes or when no groups are ready
                    // sort ready nodes by y-position (top to bottom) then x-position (left to right)
                    readyNodes.sort((a, b) => {
                        if (Math.abs(a.y - b.y) < 10) { // if roughly same height
                            return a.x - b.x; // sort left to right
                        }
                        return a.y - b.y; // sort top to bottom
                    });

                    // process the topmost ready node(s)
                    const currentY = readyNodes[0].y;
                    const currentLevelNodes = readyNodes.filter(node =>
                        Math.abs(node.y - currentY) < 10 // nodes at roughly same level
                    );
                    nodesToProcess = currentLevelNodes;
                }

                // add nodes to result in left-to-right order within their group or level
                nodesToProcess.sort((a, b) => a.x - b.x);
                nodesToProcess.forEach(node => {
                    processing.add(node.id);
                    result.push(node);
                    processed.add(node.id);
                    processing.delete(node.id);
                });
            }

            return result;
        },

        // Debug and cleanup methods
        logState() {
            // debug method - removed console.log for cleaner output
        },

        destroy() {
            // cleanup all components
            if (this.nodeRenderer) this.nodeRenderer.destroy();
            if (this.linkRenderer) this.linkRenderer.destroy();
            if (this.groupRenderer) this.groupRenderer.destroy();
            if (this.sidebar) this.sidebar.destroy();
            if (this.events) this.events.destroy();

            // remove event listeners
            window.removeEventListener('resize', this.handleResize);
            document.removeEventListener('dragstart', this.preventDefaultDrag);

            // flowchart builder destroyed
        },

        // Error handling helper
        handleError(message, error) {
            console.error(message, error);
            this.updateStatusBar(message);
        }

    };

    // Apply the utils methods to FlowchartBuilder prototype
    Object.assign(FlowchartBuilder.prototype, UtilsModule);

})();
