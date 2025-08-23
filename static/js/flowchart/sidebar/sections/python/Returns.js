class ReturnsSection extends BaseSection {
    constructor(sidebar) {
        super(sidebar);
        this.element = document.getElementById('returns_section');
    }

    render(node) {
        if (node && node.pythonFile) {
            this.show();
            this.analyzeReturns(node);
        } else {
            this.hide();
        }
    }

    async analyzeReturns(node) {
        try {
            const response = await fetch('/api/analyze-python-function', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ python_file: node.pythonFile })
            });
            const result = await response.json();
            if (result.success) {
                this.populateReturns(result.returns || []);
            } else {
                this.showError('failed to analyze function');
            }
        } catch (error) {
            this.showError('network error');
        }
    }

    populateReturns(returns) {
        const content = document.getElementById('returns_content');
        if (!content) return;

        content.innerHTML = '';

        if (returns.length === 0) {
            this.showEmpty();
            return;
        }

        returns.forEach((returnItem) => {
            const item = this.createReturnItem(returnItem);
            content.appendChild(item);
        });

        this.showContent();
    }

    createReturnItem(returnItem) {
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
            user-select: none;
            cursor: grab;
        `;

        let icon = 'output';
        let iconColor = '#ff9800';
        let displayText = returnItem.name || 'unknown';
        let typeText = returnItem.type || 'unknown';

        switch (returnItem.type) {
            case 'variable':
                icon = 'label'; iconColor = '#4caf50'; break;
            case 'constant':
                icon = 'looks_one'; iconColor = '#2196f3'; displayText = returnItem.value; typeText = returnItem.data_type; break;
            case 'list':
                icon = 'list'; iconColor = '#9c27b0'; break;
            case 'dict':
                icon = 'data_object'; iconColor = '#ff5722'; break;
            case 'function_call':
                icon = 'functions'; iconColor = '#607d8b'; break;
            case 'expression':
                icon = 'calculate'; iconColor = '#795548'; break;
        }

        item.innerHTML = `
            <span class="material-icons" style="font-size: 16px; color: ${iconColor};">${icon}</span>
            <span style="font-family: monospace; font-weight: 500;">${displayText}</span>
            <span style="font-size: 0.75rem; opacity: 0.7; margin-left: auto;">${typeText}</span>
        `;

        // add drag functionality
        item.addEventListener('mousedown', (e) => {
            if (e.button !== 0) return;
            e.preventDefault();
            this.startReturnVariableDrag(e, { displayText, raw: returnItem });
        });

        return item;
    }

    startReturnVariableDrag(event, payload) {
        // implementation from Sidebar.nodes.js startReturnVariableDrag method
        // ... (copy the drag implementation)
    }

    showError(message) {
        const content = document.getElementById('returns_content');
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
        const empty = document.getElementById('returns_empty');
        const loading = document.getElementById('returns_loading');
        const content = document.getElementById('returns_content');

        if (loading) loading.style.display = 'none';
        if (content) content.style.display = 'none';
        if (empty) empty.style.display = 'block';
    }

    showContent() {
        const empty = document.getElementById('returns_empty');
        const loading = document.getElementById('returns_loading');
        const content = document.getElementById('returns_content');

        if (loading) loading.style.display = 'none';
        if (empty) empty.style.display = 'none';
        if (content) content.style.display = 'block';
    }
}
