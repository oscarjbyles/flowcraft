// node creation functions extracted from FlowchartBuilder.js
(function(){
    'use strict';
    if (window.CreateNode) { return; }

class CreateNode {
    constructor(stateManager, statusUpdater) {
        this.state = stateManager;
        this.updateStatusBar = statusUpdater;
    }

    // node management
    addNode(nodeData) {
        const node = {
            id: Date.now() + Math.random(),
            x: nodeData.x || 0,
            y: nodeData.y || 0,
            name: nodeData.name || 'python node',
            type: nodeData.type || 'python_file',
            // normalize any incoming pythonFile to remove leading nodes/ for persistence
            pythonFile: (function(p){
                const s = (p || '').toString().replace(/\\/g, '/');
                if (!s) return '';
                const noPrefix = s.replace(/^(?:nodes\/)*/i, '');
                return noPrefix;
            })(nodeData.pythonFile),
            description: nodeData.description || '',
            groupId: nodeData.groupId || null,
            width: (nodeData.type === 'data_save')
                ? Geometry.getDataSaveNodeWidth(nodeData.name || 'data save')
                : Geometry.getNodeWidth(nodeData.name || 'python node'),
            ...nodeData
        };

        // validate node
        const validation = Validation.validateNode(node);
        if (!validation.isValid) {
            throw new Error(`invalid node: ${validation.errors.join(', ')}`);
        }

        // console.log(`[StateManager] Adding node: ${node.name} at (${node.x}, ${node.y})`);
        this.state.nodes.push(node);
        this.state.emit('nodeAdded', node);
        
        // check if this node needs an input node
        if (node.type === 'python_file' && !nodeData.skipInputCheck) {
            this.checkAndCreateInputNode(node);
        }
        
        this.state.emit('stateChanged');
        this.state.scheduleAutosave();
        
        return node;
    }

    // group management
    createGroup(nodeIds, groupData = {}) {
        if (nodeIds.length < 2) {
            throw new Error('group must contain at least 2 nodes');
        }

        const groupId = Date.now() + Math.random();
        const group = {
            id: groupId,
            name: groupData.name || 'group name',
            description: groupData.description || '',
            nodeIds: [...nodeIds],
            ...groupData
        };

        // validate group
        const validation = Validation.validateGroup(group, this.state.nodes);
        if (!validation.isValid) {
            throw new Error(`invalid group: ${validation.errors.join(', ')}`);
        }

        // assign group id to nodes
        nodeIds.forEach(nodeId => {
            const node = this.state.getNode(nodeId);
            if (node) {
                node.groupId = groupId;
            }
        });

        this.state.groups.push(group);
        
        // clear node selection and select the new group
        this.state.selectedNodes.clear();
        this.state.selectedLink = null;
        this.state.selectedGroup = group;
        
        this.state.emit('groupCreated', group);
        this.state.emit('selectionChanged', {
            nodes: [],
            link: null,
            group: group
        });
        this.state.emit('stateChanged');
        this.state.scheduleAutosave();
        
        return group;
    }

    // annotation management
    addAnnotation(annotationData) {
        const annotation = {
            id: Date.now() + Math.random(),
            x: annotationData.x || 0,
            y: annotationData.y || 0,
            type: annotationData.type || 'text',
            ...annotationData
        };

        // handle different annotation types
        if (annotation.type === 'text') {
            annotation.text = Validation.sanitizeString(annotationData.text || 'text', 200);
            annotation.fontSize = Math.max(8, Math.min(72, parseInt(annotationData.fontSize || 14, 10))) || 14;
        } else if (annotation.type === 'arrow') {
            annotation.startX = annotationData.startX || annotation.x - 50;
            annotation.startY = annotationData.startY || annotation.y;
            annotation.endX = annotationData.endX || annotation.x + 50;
            annotation.endY = annotationData.endY || annotation.y;
            annotation.strokeWidth = Math.max(1, Math.min(10, parseInt(annotationData.strokeWidth || 2, 10))) || 2;
            annotation.strokeColor = annotationData.strokeColor || 'var(--on-surface)';
        }

        this.state.annotations.push(annotation);
        this.state.emit('annotationAdded', annotation);
        this.state.emit('stateChanged');
        this.state.scheduleAutosave();
        return annotation;
    }

    // input node management
    async checkAndCreateInputNode(mainNode) {
        if (!mainNode.pythonFile) return null;
        
        try {
            // enforce at most one input node
            const existingInputs = this.state.nodes.filter(n => n.type === 'input_node' && n.targetNodeId === mainNode.id);
            if (existingInputs.length >= 1) {
                // keep only the first if multiple exist
                for (let i = 1; i < existingInputs.length; i++) {
                    this.state.removeNode(existingInputs[i].id, true);
                }
                return existingInputs[0]; // return the existing input node
            }
            
            // analyze the python file to check for function parameters
            const response = await fetch('/api/analyze-python-function', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    python_file: mainNode.pythonFile
                })
            });
            
            const result = await response.json();
            
            if (result.success && result.parameters && result.parameters.length > 0) {
                // create input node for this main node
                const inputNode = this.createInputNode(mainNode, result.parameters);
                
                // create connection from input node to main node
                this.createInputConnection(inputNode, mainNode);
                
                return inputNode;
            }
            
            return null;
        } catch (error) {
            console.error('error checking node inputs:', error);
            return null;
        }
    }
    
    // create an input node for a main node
    createInputNode(mainNode, parameters) {
        // fixed width for input nodes
        const dynamicWidth = 300;
        
        const inputNode = {
            id: Date.now() + Math.random() + 0.1, // slightly different to avoid conflicts
            x: mainNode.x - 200, // position to the left of main node
            y: mainNode.y,
            name: `Input Node`,
            type: 'input_node',
            pythonFile: mainNode.pythonFile,
            description: 'input parameters',
            groupId: mainNode.groupId,
            width: dynamicWidth,
            parameters: parameters,
            targetNodeId: mainNode.id, // reference to the main node
            inputValues: {}, // store user input values
            skipInputCheck: true // don't check this node for inputs again
        };
        
        // initialize default values for each parameter
        parameters.forEach(param => {
            inputNode.inputValues[param] = '';
        });
        
        // validate and add the input node
        const validation = Validation.validateNode(inputNode);
        if (!validation.isValid) {
            console.error('invalid input node:', validation.errors);
            return null;
        }
        
        this.state.nodes.push(inputNode);
        this.state.emit('nodeAdded', inputNode);
        
        return inputNode;
    }
    
    // create connection from input node to main node
    createInputConnection(inputNode, mainNode) {
        const link = {
            source: inputNode.id,
            target: mainNode.id,
            type: 'input_connection',
            selectable: false, // make input connections non-selectable
            style: 'dashed' // dashed line style
        };
        
        this.state.links.push(link);
        this.state.emit('linkAdded', link);
    }

    // check loaded nodes for input requirements (called after loading from JSON)
    async checkLoadedNodesForInputs() {
        // skip input node creation if we're restoring from execution history
        if (this.state.isRestoringFromHistory) {
            console.log('skipping input node creation during history restoration');
            return;
        }
        
        // find all python_file nodes that don't have existing input nodes
        const pythonFileNodes = this.state.nodes.filter(node => 
            node.type === 'python_file' && 
            !node.skipInputCheck &&
            node.pythonFile
        );
        
        // check each python file node for input requirements
        for (const node of pythonFileNodes) {
            // check if this node already has an input node (more robust check)
            const existingInputNodes = this.state.nodes.filter(n => 
                n.type === 'input_node' && n.targetNodeId === node.id
            );
            
            // if no input nodes exist, create one
            if (existingInputNodes.length === 0) {
                await this.checkAndCreateInputNode(node);
            } else if (existingInputNodes.length > 1) {
                // if multiple input nodes exist, keep only the first and remove duplicates
                console.warn(`multiple input nodes found for python node ${node.id}, removing duplicates`);
                for (let i = 1; i < existingInputNodes.length; i++) {
                    this.state.removeNode(existingInputNodes[i].id, true);
                }
            }
        }
    }

    // canvas operations
    addNodeAtCenter(coordinates = null) {
        let x, y;
        
        if (coordinates) {
            // use provided coordinates (already in world coordinates)
            x = coordinates[0];
            y = coordinates[1];
        } else {
            // fallback to center of canvas
            const centerX = this.state.canvasWidth / 2;
            const centerY = this.state.canvasHeight / 2;
            
            // transform screen coordinates to world coordinates
            const worldCoords = this.state.transform.invert([centerX, centerY]);
            x = worldCoords[0];
            y = worldCoords[1];
        }
        
        try {
            const node = this.addNode({
                x: x,
                y: y
            });
            this.updateStatusBar(`added node: ${node.name}`);
        } catch (error) {
            this.updateStatusBar(`error adding node: ${error.message}`);
        }
    }

    addPythonNode() {
        const centerX = this.state.canvasWidth / 2;
        const centerY = this.state.canvasHeight / 2;
        
        // transform screen coordinates to world coordinates
        const worldCoords = this.state.transform.invert([centerX, centerY]);
        
        try {
            const node = this.addNode({
                x: worldCoords[0],
                y: worldCoords[1],
                name: 'python node',
                type: 'python_file'
            });
            this.updateStatusBar(`added python node: ${node.name}`);
        } catch (error) {
            this.updateStatusBar(`error adding python node: ${error.message}`);
        }
    }

    addIfNode() {
        const centerX = this.state.canvasWidth / 2;
        const centerY = this.state.canvasHeight / 2;
        
        // transform screen coordinates to world coordinates
        const worldCoords = this.state.transform.invert([centerX, centerY]);
        
        try {
            const node = this.addNode({
                x: worldCoords[0],
                y: worldCoords[1],
                name: 'if condition',
                type: 'if_node'
            });
            this.updateStatusBar(`added if node: ${node.name}`);
        } catch (error) {
            this.updateStatusBar(`error adding if node: ${error.message}`);
        }
    }

    addTextAnnotation() {
        // only in build mode
        if (!this.state.isBuildMode) {
            this.updateStatusBar('text annotation only available in build mode');
            return;
        }
        const centerX = this.state.canvasWidth / 2;
        const centerY = this.state.canvasHeight / 2;
        const [wx, wy] = this.state.transform.invert([centerX, centerY]);
        try {
            const ann = this.addAnnotation({ x: wx, y: wy, text: 'text' });
            this.updateStatusBar('added text');
        } catch (e) {
            this.updateStatusBar('error adding text');
        }
    }

    addArrowAnnotation() {
        // only in build mode
        if (!this.state.isBuildMode) {
            this.updateStatusBar('arrow annotation only available in build mode');
            return;
        }
        const centerX = this.state.canvasWidth / 2;
        const centerY = this.state.canvasHeight / 2;
        const [wx, wy] = this.state.transform.invert([centerX, centerY]);
        try {
            const ann = this.addAnnotation({ 
                x: wx, 
                y: wy, 
                type: 'arrow',
                startX: wx - 50,
                startY: wy,
                endX: wx + 50,
                endY: wy,
                strokeWidth: 2,
                strokeColor: 'var(--on-surface)'
            });
            this.updateStatusBar('added arrow');
        } catch (e) {
            this.updateStatusBar('error adding arrow');
        }
    }

    addCallAiNode() {
        try {
            let position = { x: 200, y: 200 };
            try {
                // center-ish default if helper not present
                const canvas = document.getElementById('flowchart_canvas');
                if (canvas && this.state && this.state.transform) {
                    const rect = canvas.getBoundingClientRect();
                    const cx = rect.left + rect.width * 0.5;
                    const cy = rect.top + rect.height * 0.35;
                    const world = this.state.transform.invert([cx, cy]);
                    position = { x: world[0], y: world[1] };
                }
            } catch (_) {}
            const node = this.addNode({
                x: position.x,
                y: position.y,
                name: 'ai node',
                type: 'call_ai'
            });
            this.state.selectNode(node.id, false);
            this.updateStatusBar('added ai');
        } catch (error) {
            this.updateStatusBar('error adding ai');
        }
    }
}

window.CreateNode = CreateNode;
})();
