// data save node type controller for build mode
(function(){
    class DataSaveNodeController extends BaseController {
        constructor(sidebar) {
            super(sidebar);
            this.sections = {
                header: new HeaderSection(sidebar),
                nodeName: new NodeNameSection(sidebar),
                variable: new VariableSection(sidebar),
                name: new NameSection(sidebar),
                deleteButton: new DeleteButtonSection(sidebar)
            };
        }

        render(node) {
            if (!node || !this.sidebar) return;

            this.showSections([
                'node_name',
                'data_save_variable_section',
                'data_save_name_section',
                'delete_node_from_sidebar'
            ]);

            Object.values(this.sections).forEach(section => {
                section.render(node);
            });
        }
    }

    window.DataSaveNodeController = DataSaveNodeController;
})();
