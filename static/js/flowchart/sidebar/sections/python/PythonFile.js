class PythonFileSection {
    constructor() {
        // no longer needs sidebar reference or DOM element
    }

    render(nodeData) {
        const stored = nodeData.pythonFile || '';
        const noPrefix = stored.replace(/^(?:nodes\/)*/i, '');
        const hasFile = !!nodeData.pythonFile;

        const statusIcon = hasFile ? 'check_circle' : 'close';
        const statusColor = hasFile ? '#66bb6a' : '#f44336';
        const statusText = hasFile ? 'python file selected' : 'select python file';
        const pathDisplay = hasFile ? this.formatPathForDisplay(noPrefix) : '';

        return `
            <div class="form_group">
                <label class="form_label" for="python_file">python file</label>
                <div class="dropdown_container" id="python_file_container" style="position: relative;">
                    <input type="text" id="python_file" class="form_input dropdown_input"
                           value="${noPrefix}" placeholder="" readonly>
                    <span class="dropdown_arrow material-icons">folder_open</span>
                    <div class="dropdown_menu" id="python_file_dropdown">
                        <div class="dropdown_loading">loading python files...</div>
                    </div>
                    <div id="python_file_status_block" style="position: absolute; left: 10px; right: 28px; top: 0; bottom: 0; display: flex; align-items: center; gap: 6px; pointer-events: none;">
                        <span id="python_file_status_icon" class="material-icons" style="font-size: 16px; color: ${statusColor};">${statusIcon}</span>
                        <span id="python_file_status_text" style="font-size: 0.85rem; opacity: 0.9;">${statusText}</span>
                    </div>
                </div>
                ${pathDisplay ? `<div id="python_file_path_block" class="data_save_value data_save_value_monospace" style="margin-top: 6px;">${pathDisplay}</div>` : ''}
            </div>
        `;
    }

    formatPathForDisplay(path) {
        try {
            const normalized = String(path).replace(/\\\\\\\\\\\\\\\\/g, '/');
            const escaped = normalized
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/\\\\"/g, '&quot;')
                .replace(/'/g, '&#39;');
            return escaped.replace(/\\\\//g, '/<br>&nbsp;&nbsp;');
        } catch(_) {
            return String(path);
        }
    }
}

window.PythonFileSection = PythonFileSection;
