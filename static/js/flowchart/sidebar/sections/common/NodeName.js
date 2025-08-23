class NodeNameSection extends BaseSection {
    constructor(sidebar) {
        super(sidebar);
        this.element = document.getElementById('node_name');
    }

    render(node) {
        if (this.element && node) {
            this.element.value = node.name || '';
        }
    }
}

window.NodeNameSection = NodeNameSection;
