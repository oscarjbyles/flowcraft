// link panel population and variable analysis (shared and if→python)
(function(){
    if (!window.Sidebar) return;

    Sidebar.prototype.populateLinkForm = function(link) {
        const connectionInfo = document.querySelector('#link_properties .form_group:first-child');
        const sharedVariables = document.querySelector('#link_properties .form_group:nth-child(3)');
        const refreshButton = document.getElementById('refresh_variables_btn');
        const deleteButton = document.getElementById('delete_link_btn');
        const ifVariablesSection = document.getElementById('if_connection_variables_section');
        
        if (connectionInfo) connectionInfo.style.display = 'block';
        if (sharedVariables) sharedVariables.style.display = 'block';
        if (refreshButton) refreshButton.style.display = 'block';
        if (deleteButton) deleteButton.style.display = 'block';
        if (ifVariablesSection) ifVariablesSection.style.display = 'none';
        
        const sourceNode = this.state.getNode(link.source);
        const targetNode = this.state.getNode(link.target);
        
        document.getElementById('link_source_name').textContent = sourceNode ? sourceNode.name : 'unknown node';
        document.getElementById('link_target_name').textContent = targetNode ? targetNode.name : 'unknown node';
        document.getElementById('link_source_file').textContent = sourceNode ? (sourceNode.pythonFile || 'no file') : 'unknown';
        document.getElementById('link_target_file').textContent = targetNode ? (targetNode.pythonFile || 'no file') : 'unknown';
        
        if (sourceNode && targetNode && sourceNode.type === 'python_file' && targetNode.type === 'python_file') {
            this.analyzeArgumentCoverageForLink(link, sourceNode, targetNode);
        } else {
            this.analyzeConnectionVariables(link, sourceNode, targetNode);
        }
    };

    Sidebar.prototype.showConnectionNodePanel = function(link) {
        const connectionInfo = document.querySelector('#link_properties .form_group:first-child');
        const sharedVariables = document.querySelector('#link_properties .form_group:nth-child(3)');
        const refreshButton = document.getElementById('refresh_variables_btn');
        
        if (connectionInfo) connectionInfo.style.display = 'none';
        if (sharedVariables) sharedVariables.style.display = 'none';
        if (refreshButton) refreshButton.style.display = 'none';
        
        const ifVariablesSection = document.getElementById('if_connection_variables_section');
        if (ifVariablesSection) {
            ifVariablesSection.style.display = 'block';
        }
        const deleteButton = document.getElementById('delete_link_btn');
        if (deleteButton) {
            deleteButton.style.display = 'block';
            deleteButton.style.width = '100%';
        }
        this.populateConnectionNodeVariables(link);
        this.initializeIfConditionBuilder(link);
    };

    Sidebar.prototype.setupLinkEventHandlers = function() {
        const refreshBtn = document.getElementById('refresh_variables_btn');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', () => {
                if (this.state.selectedLink) {
                    const sourceNode = this.state.getNode(this.state.selectedLink.source);
                    const targetNode = this.state.getNode(this.state.selectedLink.target);
                    this.analyzeConnectionVariables(this.state.selectedLink, sourceNode, targetNode);
                }
            });
        }
        const deleteLinkBtn = document.getElementById('delete_link_btn');
        if (deleteLinkBtn) {
            deleteLinkBtn.addEventListener('click', () => {
                if (this.state.selectedLink) {
                    this.state.removeLink(this.state.selectedLink.source, this.state.selectedLink.target);
                    this.showSuccess('connection deleted');
                }
            });
        }
    };
})();


