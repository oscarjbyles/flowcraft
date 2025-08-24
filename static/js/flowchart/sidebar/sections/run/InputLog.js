class InputLogSection {
    constructor() {
        // no longer needs sidebar reference or DOM element
    }

    render(nodeData) {
        return `
            <div class="form_group">
                <label class="form_label">input log</label>
                <div class="log_display" style="padding: 8px; background: var(--surface-variant); border-radius: 4px; font-family: monospace; font-size: 0.9em; max-height: 100px; overflow-y: auto;">
                    <div style="color: var(--on-surface); opacity: 0.7;">no input data available</div>
                </div>
            </div>
        `;
    }
}

window.InputLogSection = InputLogSection;
