// group controller for build mode
(function(){
    class GroupController extends BaseController {
        constructor(sidebar) {
            super(sidebar);
            this.sections = {
                header: new HeaderSection(sidebar),
                group: new GroupSection(sidebar),
                deleteButton: new DeleteButtonSection(sidebar)
            };
        }

        render(group) {
            if (!group || !this.sidebar) return;

            this.showSections([
                'group_properties',
                'delete_node_from_sidebar'
            ]);

            Object.values(this.sections).forEach(section => {
                section.render(group);
            });
        }
    }

    window.GroupController = GroupController;
})();
