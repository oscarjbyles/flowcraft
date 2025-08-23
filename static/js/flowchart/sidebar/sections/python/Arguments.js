class ArgumentsSection extends BaseSection {
    constructor(sidebar) {
        super(sidebar);
        this.element = document.getElementById('arguments_section');
    }

    render(node) {
        if (node && node.pythonFile) {
            this.show();
            this.analyzeArguments(node);
        } else {
            this.hide();
        }
    }

    async analyzeArguments(node) {
        try {
            const response = await fetch('/api/analyze-python-function', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ python_file: node.pythonFile })
            });
            const result = await response.json();
            if (result.success) {
                this.populateArguments(result.formal_parameters || [], result.input_variable_names || []);
            } else {
                this.showError('failed to analyze function');
            }
        } catch (error) {
            this.showError('network error');
        }
    }

    populateArguments(formalParams, inputVars) {
        const content = document.getElementById('arguments_content');
        if (!content) return;

        content.innerHTML = '';
        const allArguments = [...formalParams, ...inputVars];

        if (allArguments.length === 0) {
            this.showEmpty();
            return;
        }

        formalParams.forEach(param => {
            const item = this.createArgumentItem(param, 'from previous nodes', '#4caf50', 'input');
            content.appendChild(item);
        });

        inputVars.forEach(param => {
            const item = this.createArgumentItem(param, 'from input() calls', '#2196f3', 'keyboard');
            content.appendChild(item);
        });

        this.showContent();
    }

    createArgumentItem(param, description, color, icon) {
        const item = document.createElement('div');
        item.style.cssText = `
            background: var(--surface-color);
            border: 1px solid var(--border-color);
            border-radius: 4px;
            padding: 8px 10px;
            margin-bottom: 4px;
            display: flex;
            align-items: center;
            gap: 8px;
        `;
        item.innerHTML = `
            <span class="material-icons" style="font-size: 16px; color: ${color};">${icon}</span>
            <span style="font-family: monospace; font-weight: 500;">${param}</span>
            <span style="font-size: 0.75rem; opacity: 0.7; margin-left: auto;">${description}</span>
        `;
        return item;
    }

    showError(message) {
        const content = document.getElementById('arguments_content');
        if (content) {
            content.innerHTML = `
                <div style="text-align: center; padding: 20px; color: #f44336;">
                    <span class="material-icons" style="font-size: 16px; margin-bottom: 4px;">error</span>
                    <p style="font-size: 0.8em;">${message}</p>
                </div>
            `;
        }
    }

    showEmpty() {
        const empty = document.getElementById('arguments_empty');
        const loading = document.getElementById('arguments_loading');
        const content = document.getElementById('arguments_content');

        if (loading) loading.style.display = 'none';
        if (content) content.style.display = 'none';
        if (empty) empty.style.display = 'block';
    }

    showContent() {
        const empty = document.getElementById('arguments_empty');
        const loading = document.getElementById('arguments_loading');
        const content = document.getElementById('arguments_content');

        if (loading) loading.style.display = 'none';
        if (empty) empty.style.display = 'none';
        if (content) content.style.display = 'block';
    }
}
