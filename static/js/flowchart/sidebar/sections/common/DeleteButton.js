class DeleteButtonSection extends BaseSection {
    constructor(sidebar) {
        super(sidebar);
        this.element = document.getElementById('delete_node_from_sidebar');
    }

    render(node) {
        if (this.element) {
            this.element.style.display = this.sidebar.state.isRunMode ? 'none' : '';
        }
    }
}

window.DeleteButtonSection = DeleteButtonSection;
