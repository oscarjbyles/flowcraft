// geometry utility functions
class Geometry {
    /**
     * calculate text width for responsive sizing
     */
    static getTextWidth(text, fontSize = 14, fontFamily = 'Roboto, sans-serif') {
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        context.font = `${fontSize}px ${fontFamily}`;
        return context.measureText(text).width;
    }

    /**
     * calculate node width based on text content
     */
    static getNodeWidth(text, padding = 40, minWidth = 120) {
        const textWidth = this.getTextWidth(text);
        return Math.max(minWidth, textWidth + padding);
    }

    /**
     * calculate compact width for data_save nodes (smaller padding and min)
     */
    static getDataSaveNodeWidth(text, padding = 18, minWidth = 80) {
        const textWidth = this.getTextWidth(text);
        return Math.max(minWidth, textWidth + padding);
    }

    /**
     * calculate node height based on type and parameters
     */
    static getNodeHeight(node) {
        // if node has a custom height set, use it
        if (node.customHeight) {
            return node.customHeight;
        }
        
        // calculate height based on node type
        if (node.type === 'input_node') {
            // input nodes have dynamic height based on number of parameters
            const parameters = node.parameters || [];
            const rowHeight = 40;
            const padding = 20;
            return Math.max(60, parameters.length * rowHeight + padding);
        } else if (node.type === 'data_save') {
            // more compact height for data_save nodes
            return 44;
        } else {
            // regular nodes have fixed height
            return 60;
        }
    }

    /**
     * calculate distance between two points
     */
    static distance(x1, y1, x2, y2) {
        const dx = x2 - x1;
        const dy = y2 - y1;
        return Math.sqrt(dx * dx + dy * dy);
    }

    /**
     * check if point is within node bounds
     */
    static isPointInNode(x, y, node) {
        const nodeWidth = node.width || 120;
        const nodeHeight = 60;
        
        return x >= node.x - nodeWidth/2 && 
               x <= node.x + nodeWidth/2 && 
               y >= node.y - nodeHeight/2 && 
               y <= node.y + nodeHeight/2;
    }

    /**
     * calculate bounds for a group of nodes
     */
    static calculateGroupBounds(nodes) {
        if (nodes.length === 0) return null;

        const positions = nodes.map(n => ({
            x: n.x,
            y: n.y,
            width: n.width || 120,
            height: 60
        }));

        const minX = Math.min(...positions.map(p => p.x - p.width/2));
        const maxX = Math.max(...positions.map(p => p.x + p.width/2));
        const minY = Math.min(...positions.map(p => p.y - p.height/2));
        const maxY = Math.max(...positions.map(p => p.y + p.height/2));

        return {
            minX,
            minY,
            width: maxX - minX,
            height: maxY - minY,
            centerX: (minX + maxX) / 2,
            centerY: (minY + maxY) / 2
        };
    }

    /**
     * arrange nodes in a grid pattern
     */
    static arrangeNodesInGrid(nodes, spacing = 150) {
        if (nodes.length === 0) return;

        const bounds = this.calculateGroupBounds(nodes);
        const centerX = bounds.centerX;
        const centerY = bounds.centerY;

        const cols = Math.ceil(Math.sqrt(nodes.length));
        
        nodes.forEach((node, index) => {
            const row = Math.floor(index / cols);
            const col = index % cols;
            const offsetX = (col - (cols - 1) / 2) * spacing;
            const offsetY = (row - Math.floor(nodes.length / cols) / 2) * spacing;
            
            node.x = centerX + offsetX;
            node.y = centerY + offsetY;
        });
    }

    /**
     * align nodes horizontally
     */
    static alignNodesHorizontally(nodes) {
        if (nodes.length < 2) return;
        
        const centerY = nodes.reduce((sum, n) => sum + n.y, 0) / nodes.length;
        nodes.forEach(node => {
            node.y = centerY;
        });
    }

    /**
     * align nodes vertically
     */
    static alignNodesVertically(nodes) {
        if (nodes.length < 2) return;
        
        const centerX = nodes.reduce((sum, n) => sum + n.x, 0) / nodes.length;
        nodes.forEach(node => {
            node.x = centerX;
        });
    }
}

window.Geometry = Geometry;