class QuickActionsSection {
    constructor() {
        // no longer needs sidebar reference or DOM element
    }

    render(nodeData) {
        return `
            <div class="form_group" id="python_quick_actions">
                <button class="btn btn_primary" id="add_if_condition_btn" style="width: 100%;">
                    <span class="material-icons">alt_route</span>
                    <span class="btn_label">+ if condition</span>
                </button>
            </div>
        `;
    }
}

window.QuickActionsSection = QuickActionsSection;
