// input validation utilities
class Validation {
    /**
     * validate node data
     */
    static validateNode(node) {
        const errors = [];

        if (!node.name || typeof node.name !== 'string' || node.name.trim() === '') {
            errors.push('node name is required');
        }

        if (node.name && node.name.length > 100) {
            errors.push('node name must be less than 100 characters');
        }

        if (typeof node.x !== 'number' || isNaN(node.x)) {
            errors.push('node x position must be a number');
        }

        if (typeof node.y !== 'number' || isNaN(node.y)) {
            errors.push('node y position must be a number');
        }

        if (node.pythonFile && typeof node.pythonFile !== 'string') {
            errors.push('python file path must be a string');
        }

        if (node.description && typeof node.description !== 'string') {
            errors.push('description must be a string');
        }

        if (node.type && !['python_file', 'module', 'function', 'class', 'input_node', 'if_node', 'data_save', 'call_ai'].includes(node.type)) {
            errors.push('invalid node type');
        }

        return {
            isValid: errors.length === 0,
            errors
        };
    }

    /**
     * validate link data
     */
    static validateLink(link, nodes) {
        const errors = [];

        if (!link.source) {
            errors.push('link source is required');
        }

        if (!link.target) {
            errors.push('link target is required');
        }

        if (link.source === link.target) {
            errors.push('link cannot connect node to itself');
        }

        // check if source and target nodes exist
        const sourceNode = nodes.find(n => n.id === link.source);
        const targetNode = nodes.find(n => n.id === link.target);
        const sourceExists = !!sourceNode;
        const targetExists = !!targetNode;

        if (!sourceExists) {
            errors.push('source node does not exist');
        }

        if (!targetExists) {
            errors.push('target node does not exist');
        }

        // disallow connections to/from data_save except python_file -> data_save
        const isPythonToDataSave = sourceNode && targetNode && sourceNode.type === 'python_file' && targetNode.type === 'data_save';
        if (!isPythonToDataSave) {
            if (sourceNode && sourceNode.type === 'data_save') {
                errors.push('connections from data_save nodes are not allowed');
            }
            if (targetNode && targetNode.type === 'data_save') {
                errors.push('connections to data_save nodes are not allowed');
            }
        }

        return {
            isValid: errors.length === 0,
            errors
        };
    }

    /**
     * validate group data
     */
    static validateGroup(group, nodes) {
        const errors = [];

        if (!group.name || typeof group.name !== 'string' || group.name.trim() === '') {
            errors.push('group name is required');
        }

        if (group.name && group.name.length > 100) {
            errors.push('group name must be less than 100 characters');
        }

        if (!Array.isArray(group.nodeIds)) {
            errors.push('group nodeIds must be an array');
        }

        if (group.nodeIds && group.nodeIds.length < 2) {
            errors.push('group must contain at least 2 nodes');
        }

        // check if all nodes in group exist
        if (group.nodeIds) {
            group.nodeIds.forEach(nodeId => {
                const nodeExists = nodes.some(n => n.id === nodeId);
                if (!nodeExists) {
                    errors.push(`node ${nodeId} in group does not exist`);
                }
            });
        }

        return {
            isValid: errors.length === 0,
            errors
        };
    }

    /**
     * sanitize string input
     */
    static sanitizeString(str, maxLength = 1000) {
        if (typeof str !== 'string') return '';
        
        return str
            .trim()
            .substring(0, maxLength)
            .replace(/[<>]/g, ''); // basic xss prevention
    }

    /**
     * validate python file path
     */
    static validatePythonFilePath(path) {
        if (!path || typeof path !== 'string') return true; // optional field
        
        const pythonFileRegex = /^[a-zA-Z0-9_/\\.-]+\.py$/;
        return pythonFileRegex.test(path);
    }

    /**
     * validate coordinates
     */
    static validateCoordinates(x, y) {
        return typeof x === 'number' && 
               typeof y === 'number' && 
               !isNaN(x) && 
               !isNaN(y) &&
               isFinite(x) && 
               isFinite(y);
    }
}

window.Validation = Validation;