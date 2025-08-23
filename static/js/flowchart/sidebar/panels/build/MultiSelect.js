// multi select controller for build mode
(function(){
    class MultiSelectController extends BaseController {
        constructor(sidebar) {
            super(sidebar);
            this.sections = {
                header: new HeaderSection(sidebar),
                multiSelect: new MultiSelectSection(sidebar),
                deleteButton: new DeleteButtonSection(sidebar)
            };
        }

        render(selection) {
            if (!selection || !this.sidebar) return;

            this.showSections([
                'multi_select_properties',
                'delete_node_from_sidebar'
            ]);

            Object.values(this.sections).forEach(section => {
                section.render(selection);
            });
        }
    }

    window.MultiSelectController = MultiSelectController;
})();
