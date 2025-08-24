class ExecutionStatusSection {
    constructor() {
        // no longer needs sidebar reference or DOM element
    }

    render(nodeData) {
        const status = nodeData?.runtimeStatus || 'idle';
        const statusColor = this.getStatusColor(status);
        const statusIcon = this.getStatusIcon(status);
        
        return `
            <div class="form_group">
                <label class="form_label">execution status</label>
                <div class="execution_status_display" style="display: flex; align-items: center; gap: 8px; padding: 8px; background: var(--surface-variant); border-radius: 4px;">
                    <span class="material-icons" style="color: ${statusColor};">${statusIcon}</span>
                    <span style="text-transform: capitalize;">${status}</span>
                </div>
            </div>
        `;
    }

    getStatusColor(status) {
        const colorMap = {
            'idle': '#666',
            'running': '#2196f3',
            'success': '#4caf50',
            'error': '#f44336',
            'failed': '#f44336'
        };
        return colorMap[status] || '#666';
    }

    getStatusIcon(status) {
        const iconMap = {
            'idle': 'pause_circle',
            'running': 'play_circle',
            'success': 'check_circle',
            'error': 'error',
            'failed': 'error'
        };
        return iconMap[status] || 'pause_circle';
    }
}

window.ExecutionStatusSection = ExecutionStatusSection;
