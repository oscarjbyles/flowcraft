class FileInfoSection extends BaseSection {
    constructor(sidebar) {
        super(sidebar);
        this.element = document.getElementById('node_file_info');
    }

    render(node) {
        if (node && node.pythonFile) {
            this.show();
            this.displayFileInfo(node);
        } else {
            this.hide();
        }
    }

    displayFileInfo(node) {
        // copy implementation from Sidebar.runview.js displayNodeFileInfo
        const container = document.getElementById('node_file_content');
        if (!container) return;

        const pythonFile = node.pythonFile || 'not assigned';
        // format path with line breaks and small indentation after each directory separator
        // all comments in lower case
        const formatPathForDisplay = (pathValue) => {
            try {
                const normalized = String(pathValue).replace(/\\/g, '/');
                const escaped = normalized
                    .replace(/&/g, '&amp;')
                    .replace(/</g, '&lt;')
                    .replace(/>/g, '&gt;')
                    .replace(/\"/g, '&quot;')
                    .replace(/'/g, '&#39;');
                return escaped.replace(/\//g, '/<br>&nbsp;&nbsp;');
            } catch (_) {
                return String(pathValue);
            }
        };
        const formattedPath = formatPathForDisplay(pythonFile);
        if (pythonFile === 'not assigned') {
            container.innerHTML = `
                <div class="info_empty">
                    no python file assigned
                </div>
            `;
            return;
        }
        const funcNameId = `function_name_value_${node.id}`;
        const totalLinesId = `total_lines_value_${node.id}`;
        container.innerHTML = `
            <div id="node_file_details_card" class="data_save_details_card">
                <div class="data_save_details_grid">
                    <div class="data_save_field">
                        <div class="data_save_label">file path</div>
                        <div id="node_file_path_${node.id}" class="data_save_value data_save_value_monospace">${formattedPath}</div>
                    </div>
                    <div class="data_save_field">
                        <div class="data_save_label">function</div>
                        <div id="${funcNameId}" class="data_save_value data_save_value_monospace">analyzing...</div>
                    </div>
                    <div class="data_save_field">
                        <div class="data_save_label">total lines</div>
                        <div id="${totalLinesId}" class="data_save_value">-</div>
                    </div>
                </div>
            </div>
        `;
        this.fetchFunctionInfo(pythonFile, node.id);
    }

    async fetchFunctionInfo(pythonFile, nodeId) {
        try {
            const response = await fetch('/api/analyze-python-function', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ python_file: pythonFile })
            });
            const result = await response.json();
            const nameEl = document.getElementById(`function_name_value_${nodeId}`);
            const linesEl = document.getElementById(`total_lines_value_${nodeId}`);
            if (result.success) {
                const totalLines = (typeof result.total_lines === 'number') ? result.total_lines : null;
                const functionName = result.function_name || 'unknown';
                if (nameEl) nameEl.textContent = functionName;
                if (linesEl) linesEl.textContent = (totalLines !== null ? totalLines : '-');
                // legacy fallback container handling if present
                const legacy = document.getElementById(`function_info_${nodeId}`);
                if (legacy && !legacy.children.length) {
                    legacy.innerHTML = `
                        <div class="data_save_field">
                            <div class="data_save_label">function</div>
                            <div class="data_save_value data_save_value_monospace">${functionName}</div>
                        </div>
                        <div class="data_save_field">
                            <div class="data_save_label">total lines</div>
                            <div class="data_save_value">${totalLines !== null ? totalLines : '-'}</div>
                        </div>
                    `;
                }
            } else {
                if (nameEl) nameEl.textContent = 'analysis failed';
                const legacy = document.getElementById(`function_info_${nodeId}`);
                if (legacy) legacy.textContent = 'function analysis failed';
            }
        } catch (error) {
            const nameEl = document.getElementById(`function_name_value_${nodeId}`);
            if (nameEl) nameEl.textContent = 'unable to analyze function';
            const legacy = document.getElementById(`function_info_${nodeId}`);
            if (legacy) legacy.textContent = 'unable to analyze function';
        }
    }
}
