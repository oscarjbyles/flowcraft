// single node panel controller for build mode
(function(){
    if (!window.Sidebar) return;

    class SidebarSinglePanelController {
        constructor(sidebar) {
            this.sidebar = sidebar;
        }

        render(_nodeId) {
            // intentionally no-op to prevent recursive content engine calls after refactor
        }
    }

    window.SidebarSinglePanelController = SidebarSinglePanelController;
})();


