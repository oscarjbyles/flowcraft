// run execution panel controller (thin wrapper for now)
(function(){
    if (!window.Sidebar) return;

    class SidebarRunViewController {
        constructor(sidebar) {
            this.sidebar = sidebar;
        }

        // render execution panel content for current selection
        render(selection) {
            if (!this.sidebar || !selection) return;
            // delegate to existing method to avoid duplication while consolidating
            if (typeof this.sidebar.updateRunModeNodeDetails === 'function') {
                this.sidebar.updateRunModeNodeDetails(selection);
            }
        }
    }

    window.SidebarRunViewController = SidebarRunViewController;
})();


