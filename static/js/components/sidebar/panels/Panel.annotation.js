// annotation panel controller for build mode
(function(){
    if (!window.Sidebar) return;

    class SidebarAnnotationPanelController {
        constructor(sidebar) {
            this.sidebar = sidebar;
        }

        render(annotation) {
            if (!annotation || !this.sidebar) return;
            if (typeof this.sidebar.showAnnotationPanel === 'function') {
                this.sidebar.showAnnotationPanel(annotation);
            }
        }
    }

    window.SidebarAnnotationPanelController = SidebarAnnotationPanelController;
})();


