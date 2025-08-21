// forms, inputs, realtime updates, and feedback helpers
(function(){
    if (!window.Sidebar) return;

    Sidebar.prototype.setupFormHandlers = function() {
        // single node form handlers
        document.getElementById('delete_node_from_sidebar').addEventListener('click', () => {
            this.deleteNodeFromSidebar();
        });

        // removed create python script modal and mini explorer logic

        // multi-select form handlers
        document.getElementById('create_group_btn').addEventListener('click', () => {
            this.createGroup();
        });
        
        document.getElementById('align_nodes_btn').addEventListener('click', () => {
            this.alignNodes();
        });
        
        document.getElementById('delete_selected_nodes').addEventListener('click', () => {
            this.deleteSelectedNodes();
        });

        // group form handlers
        const saveGroupBtn = document.getElementById('save_group_properties');
        if (saveGroupBtn) {
            saveGroupBtn.addEventListener('click', () => {
                this.saveGroupProperties();
            });
        }
        
        document.getElementById('ungroup_nodes').addEventListener('click', () => {
            this.ungroupNodes();
        });
        
        document.getElementById('delete_group').addEventListener('click', () => {
            this.deleteGroup();
        });

        // real-time form updates
        this.setupRealTimeUpdates();
    };

    Sidebar.prototype.setupRealTimeUpdates = function() {
        // auto-save node properties on input
        const nodeInputs = ['node_name', 'python_file'];
        nodeInputs.forEach(inputId => {
            const input = document.getElementById(inputId);
            if (input) {
                input.addEventListener('input', () => {
                    this.debounceNodeSave();
                });
            }
        });

        // auto-save group properties
        const groupInputs = ['group_name', 'group_description'];
        groupInputs.forEach(inputId => {
            const input = document.getElementById(inputId);
            if (input) {
                input.addEventListener('input', () => {
                    this.debounceGroupSave();
                });
            }
        });
    };

    Sidebar.prototype.debounceNodeSave = function() {
        clearTimeout(this.nodeSaveTimeout);
        this.nodeSaveTimeout = setTimeout(() => {
            this.saveNodeProperties();
        }, 1000);
    };

    Sidebar.prototype.debounceGroupSave = function() {
        clearTimeout(this.groupSaveTimeout);
        this.groupSaveTimeout = setTimeout(() => {
            this.saveGroupProperties();
        }, 1000);
    };

    Sidebar.prototype.showSuccess = function(message) {
        this.state.emit('statusUpdate', message);
        if (typeof this.updateStatus === 'function') this.updateStatus(message, 'success');
    };

    Sidebar.prototype.showError = function(message) {
        this.state.emit('statusUpdate', `error: ${message}`);
        if (typeof this.updateStatus === 'function') this.updateStatus(`error: ${message}`, 'error');
    };

    Sidebar.prototype.showWarning = function(message) {
        this.state.emit('statusUpdate', `warning: ${message}`);
        if (typeof this.updateStatus === 'function') this.updateStatus(`warning: ${message}`, 'warning');
    };

    // flashStatusBar deprecated in favor of updateStatus in Sidebar.status.js
})();
