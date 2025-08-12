// group panel controller for build mode
(function(){
    if (!window.Sidebar) return;

    class SidebarGroupPanelController {
        constructor(sidebar) {
            this.sidebar = sidebar;
        }

        render(group) {
            if (!group || !this.sidebar) return;
            if (typeof this.sidebar.populateGroupForm === 'function') {
                this.sidebar.populateGroupForm(group);
            }
        }
    }

    window.SidebarGroupPanelController = SidebarGroupPanelController;
})();


