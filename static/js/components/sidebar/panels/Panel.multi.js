// multi-select panel controller for build mode
(function(){
    if (!window.Sidebar) return;

    class SidebarMultiPanelController {
        constructor(sidebar) {
            this.sidebar = sidebar;
        }

        render(nodeIds) {
            if (!Array.isArray(nodeIds) || nodeIds.length === 0) return;
            if (typeof this.sidebar.updateSelectedNodesList === 'function') {
                this.sidebar.updateSelectedNodesList(nodeIds);
            }
        }
    }

    window.SidebarMultiPanelController = SidebarMultiPanelController;
})();


