// unified status updates for the sidebar (single source of truth)
(function(){
    if (!window.Sidebar) return;

    // update the top status bar message with optional type: 'success' | 'error' | 'info'
    Sidebar.prototype.updateStatus = function(message, type = 'info') {
        const statusElement = document.getElementById('status_text');
        const statusBar = document.querySelector('.status_bar');
        if (!statusElement || !statusBar) return;

        // capture default text once
        if (!this._defaultStatusTextCaptured) {
            this._defaultStatusText = statusElement.textContent || 'ready';
            this._defaultStatusTextCaptured = true;
        }

        // set message
        statusElement.textContent = message;

        // subtle background by type
        const originalBg = statusBar.style.backgroundColor;
        let bgColor = 'var(--surface-color)';
        const lower = String(type || '').toLowerCase();
        if (lower === 'success') {
            bgColor = '#0e2a16';
        } else if (lower === 'error') {
            bgColor = '#2A0E0E';
        } else if (lower === 'warning' || /warning:/i.test(String(message))) {
            bgColor = '#2A0E0E';
        }
        statusBar.style.backgroundColor = bgColor;

        // auto reset after a short delay
        if (this._statusResetTimeout) clearTimeout(this._statusResetTimeout);
        this._statusResetTimeout = setTimeout(() => {
            statusBar.style.backgroundColor = originalBg || 'var(--surface-color)';
            statusElement.textContent = '';
            this._statusResetTimeout = null;
        }, 3000);
    };
})();


