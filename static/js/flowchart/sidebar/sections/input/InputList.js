class InputListSection extends BaseSection {
    constructor(sidebar) {
        super(sidebar);
        this.element = document.getElementById('input_node_inputs_section');
    }

    render(node) {
        if (node && node.pythonFile) {
            this.show();
            this.populateInputs(node);
        } else {
            this.hide();
        }
    }

    async populateInputs(node) {
        // copy implementation from Sidebar.nodes.js populateInputNodeInputs
        if (!this._inputNodeInputsReqId) this._inputNodeInputsReqId = 0;
        const reqId = ++this._inputNodeInputsReqId;
        const loading = document.getElementById('input_node_inputs_loading');
        const content = document.getElementById('input_node_inputs_content');
        const empty = document.getElementById('input_node_inputs_empty');
        const errorDiv = document.getElementById('input_node_inputs_error');
        const errorMsg = document.getElementById('input_node_inputs_error_message');

        // reset visibility
        if (loading) loading.style.display = 'block';
        if (content) { content.style.display = 'none'; content.innerHTML = ''; }
        if (empty) empty.style.display = 'none';
        if (errorDiv) errorDiv.style.display = 'none';

        if (!node || !node.pythonFile) {
            if (loading) loading.style.display = 'none';
            if (empty) empty.style.display = 'block';
            return;
        }

        try {
            const response = await fetch('/api/analyze-python-function', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ python_file: this.normalizePythonPathForApi(node.pythonFile) })
            });
            const result = await response.json();
            if (reqId !== this._inputNodeInputsReqId) return;
            const details = result && (result.input_variable_details || []);

            if (!result || result.success === false) {
                if (loading) loading.style.display = 'none';
                if (errorDiv) errorDiv.style.display = 'block';
                if (errorMsg) errorMsg.textContent = (result && (result.error || 'failed to analyze inputs')) || 'failed to analyze inputs';
                return;
            }

            const unique = [];
            const seen = new Set();
            (Array.isArray(details) ? details : []).forEach((d) => {
                const key = `${d.name}::${d.line}`;
                if (!seen.has(key)) { seen.add(key); unique.push(d); }
            });
            if (unique.length === 0) {
                if (loading) loading.style.display = 'none';
                if (empty) empty.style.display = 'block';
                return;
            }

            // render items
            unique.forEach((item) => {
                const row = document.createElement('div');
                row.style.cssText = `
                    background: var(--surface-color);
                    border: 1px solid var(--border-color);
                    border-radius: 4px;
                    padding: 8px 10px;
                    margin-bottom: 4px;
                    display: flex;
                    align-items: center;
                    gap: 8px;
                `;
                row.innerHTML = `
                    <span class="material-icons" style="font-size: 16px; color: #2196f3;">keyboard</span>
                    <span style="font-family: monospace; font-weight: 500;">${item.name}</span>
                    <span style="font-size: 0.75rem; opacity: 0.7; margin-left: auto;">line ${item.line}</span>
                `;
                content.appendChild(row);
            });

            if (loading) loading.style.display = 'none';
            if (content) content.style.display = 'block';
        } catch (err) {
            if (reqId !== this._inputNodeInputsReqId) return;
            if (loading) loading.style.display = 'none';
            if (errorDiv) errorDiv.style.display = 'block';
            if (errorMsg) errorMsg.textContent = 'network error';
        }
    }

    // helper method to normalize python path
    normalizePythonPathForApi(path) {
        try { return (path || '').replace(/\\/g, '/').replace(/^(?:nodes\/)*/i, ''); } catch (_) { return path || ''; }
    }
}
