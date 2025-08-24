class ReturnsSection {
    constructor() {
        // no longer needs sidebar reference or DOM element
    }

    render(nodeData) {
        return `
            <div class="form_group" id="returns_section" style="display: block; flex: 1;">
                <label class="form_label">returns (data out)</label>
                <div id="returns_list" style="flex: 1; display: flex; flex-direction: column; background: var(--surface-variant); border-radius: 4px; padding: 8px;">
                    <div id="returns_loading" style="text-align: center; padding: 20px; color: var(--on-surface); opacity: 0.7;">
                        <span class="material-icons" style="font-size: 16px; margin-bottom: 4px;">hourglass_empty</span>
                        <p style="font-size: 0.8em;">analyzing function...</p>
                    </div>
                    <div id="returns_content" style="display: none; flex: 1;">
                        <!-- returns will be populated here -->
                    </div>
                    <div id="returns_empty" style="display: none; text-align: center; padding: 20px; color: var(--on-surface); opacity: 0.7;">
                        <span class="material-icons" style="font-size: 16px; margin-bottom: 4px;">info</span>
                        <p style="font-size: 0.8em;">no returns found</p>
                    </div>
                </div>
            </div>
        `;
    }
}

window.ReturnsSection = ReturnsSection;
