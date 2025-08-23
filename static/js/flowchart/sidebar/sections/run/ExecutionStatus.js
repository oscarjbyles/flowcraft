class ExecutionStatusSection extends BaseSection {
    constructor(sidebar) {
        super(sidebar);
        this.element = document.getElementById('execution_status');
    }

    render(node) {
        if (!node) return;

        const executionResult = window.flowchartApp?.nodeExecutionResults?.get(node.id);
        const statusText = document.getElementById('execution_status_text');
        const statusIcon = document.querySelector('#execution_status .material-icons');

        if (executionResult) {
            if (executionResult.success) {
                statusText.textContent = 'node executed successfully';
                statusIcon.textContent = 'check_circle';
                statusIcon.style.color = '#66bb6a';
            } else {
                statusText.textContent = 'node returned an error';
                statusIcon.textContent = 'error';
                statusIcon.style.color = '#f44336';
            }
        } else {
            statusText.textContent = 'waiting for execution';
            statusIcon.textContent = 'hourglass_empty';
            statusIcon.style.color = '#ff9800';
        }
    }
}
