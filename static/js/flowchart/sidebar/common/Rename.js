class RenameSection {
    constructor() {
        this.inputId = 'node_rename_input';
    }

    render(nodeData) {
        const currentName = nodeData?.name || nodeData?.id || 'unnamed';
        
        return `
            <div class="sidebar_section">
                <div class="section_header">
                    <span class="section_title">rename node</span>
                </div>
                <div class="section_content">
                    <div class="input_group">
                        <input 
                            type="text" 
                            id="${this.inputId}"
                            class="form_input"
                            value="${this.escapeHtml(currentName)}"
                            placeholder="enter node name"
                            data-node-id="${nodeData?.id || ''}"
                        />
                    </div>
                </div>
            </div>
        `;
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // called after the component is rendered to set up event listeners
    init(nodeData) {
        const input = document.getElementById(this.inputId);
        if (!input) return;

        // set up input event listener for auto-updating node name
        input.addEventListener('input', (event) => {
            const newName = event.target.value.trim();
            const nodeId = event.target.dataset.nodeId;
            
            if (nodeId && window.flowchartApp?.createNode) {
                // update the node name in the flowchart
                const node = window.flowchartApp.createNode.getNode(nodeId);
                if (node) {
                    node.name = newName;
                    
                    // update the node display if it has a name label
                    if (node.nameLabel) {
                        node.nameLabel.text(newName || 'unnamed');
                    }
                    
                    // trigger any necessary updates
                    if (window.flowchartApp.events) {
                        window.flowchartApp.events.emit('nodeRenamed', { nodeId, newName });
                    }
                }
            }
        });

        // handle enter key to blur the input
        input.addEventListener('keydown', (event) => {
            if (event.key === 'Enter') {
                event.target.blur();
            }
        });
    }
}

export default RenameSection;
