class PythonFileSection extends BaseSection {
    constructor(sidebar) {
        super(sidebar);
        this.element = document.getElementById('python_file');
    }

    render(node) {
        if (this.element && node) {
            const stored = node.pythonFile || '';
            const noPrefix = stored.replace(/^(?:nodes\/)*/i, '');
            this.element.value = '';
            this.element.placeholder = '';
            this.element.dataset.fullPath = noPrefix;

            this.updateStatus(node);
        }
    }

    updateStatus(node) {
        try {
            const iconEl = document.getElementById('python_file_status_icon');
            const textEl = document.getElementById('python_file_status_text');
            const pathEl = document.getElementById('python_file_path_block');
            const path = (node.pythonFile || '').replace(/^(?:nodes\/)*/i, '');
            const hasFile = !!node.pythonFile;

            if (hasFile) {
                if (iconEl) {
                    iconEl.textContent = 'check_circle';
                    iconEl.style.color = '#66bb6a';
                }
                if (textEl) {
                    textEl.textContent = 'python file selected';
                    textEl.style.opacity = '1';
                }
                if (pathEl) {
                    const formatted = this.formatPathForDisplay(path);
                    pathEl.innerHTML = formatted;
                    pathEl.style.display = '';
                }
            } else {
                if (iconEl) {
                    iconEl.textContent = 'close';
                    iconEl.style.color = '#f44336';
                }
                if (textEl) {
                    textEl.textContent = 'select python file';
                    textEl.style.opacity = '0.9';
                }
                if (pathEl) {
                    pathEl.innerHTML = '';
                    pathEl.style.display = 'none';
                }
            }
        } catch (_) {}
    }

    formatPathForDisplay(path) {
        try {
            const normalized = String(path).replace(/\\\\\\\\/g, '/');
            const escaped = normalized
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/\\"/g, '&quot;')
                .replace(/'/g, '&#39;');
            return escaped.replace(/\\//g, '/<br>&nbsp;&nbsp;');
        } catch(_) {
            return String(path);
        }
    }
}
