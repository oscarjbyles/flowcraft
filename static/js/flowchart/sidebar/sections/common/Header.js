class HeaderSection extends BaseSection {
    constructor(sidebar) {
        super(sidebar);
        this.element = document.getElementById('properties_header_text');
    }

    render(node) {
        if (this.element && node) {
            const typeMap = {
                'input_node': 'INPUT NODE',
                'python_file': 'PYTHON NODE',
                'if_node': 'IF SPLITTER',
                'data_save': 'DATA SAVE',
                'text_node': 'TEXT NODE'
            };
            const displayType = typeMap[node.type] || String(node.type || '').replace(/_/g, ' ');
            this.element.textContent = (displayType || '').toUpperCase();
        }
    }
}

window.HeaderSection = HeaderSection;
