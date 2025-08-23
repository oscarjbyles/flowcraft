// if node type controller for build mode
(function(){
    class IfNodeController extends BaseController {
        constructor(sidebar) {
            super(sidebar);
            this.sections = {
                header: new HeaderSection(sidebar),
                nodeName: new NodeNameSection(sidebar),
                variables: new VariablesSection(sidebar),
                deleteButton: new DeleteButtonSection(sidebar)
            };
        }

        render(node) {
            if (!node || !this.sidebar) return;

            this.showSections([
                'node_name',
                'if_node_variables_section',
                'delete_node_from_sidebar'
            ]);

            Object.values(this.sections).forEach(section => {
                section.render(node);
            });
        }
    }

    window.IfNodeController = IfNodeController;
})();
