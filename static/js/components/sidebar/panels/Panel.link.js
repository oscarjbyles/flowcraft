// link panel controller for build mode
(function(){
    if (!window.Sidebar) return;

    class SidebarLinkPanelController {
        constructor(sidebar) {
            this.sidebar = sidebar;
        }

        render(selection) {
            if (!selection || !selection.link || !this.sidebar) return;
            const link = selection.link;
            const sourceNode = this.sidebar.state.getNode(link.source);
            const targetNode = this.sidebar.state.getNode(link.target);
            const isIfToPython = sourceNode && targetNode && sourceNode.type === 'if_node' && targetNode.type === 'python_file';
            if (isIfToPython && typeof this.sidebar.showConnectionNodePanel === 'function') {
                this.sidebar.showConnectionNodePanel(link);
            } else if (typeof this.sidebar.populateLinkForm === 'function') {
                this.sidebar.populateLinkForm(link);
            }
        }
    }

    window.SidebarLinkPanelController = SidebarLinkPanelController;
})();


