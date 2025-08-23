// link controller for build mode
(function(){
    class LinkController extends BaseController {
        constructor(sidebar) {
            super(sidebar);
            this.sections = {
                header: new HeaderSection(sidebar),
                link: new LinkSection(sidebar),
                deleteButton: new DeleteButtonSection(sidebar)
            };
        }

        render(link) {
            if (!link || !this.sidebar) return;

            this.showSections([
                'link_properties',
                'delete_node_from_sidebar'
            ]);

            Object.values(this.sections).forEach(section => {
                section.render(link);
            });
        }
    }

    window.LinkController = LinkController;
})();
