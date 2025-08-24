class DeleteButtonSection {


    render(nodeData) {
        return `
            <div class="form_group">
                <button class="btn btn_danger" id="delete_node_btn" style="width: 100%;">
                    <span class="material-icons">delete</span>
                    <span class="btn_label">delete node</span>
                </button>
            </div>
        `;
    }
}

export default DeleteButtonSection;
