// input node type controller for build mode
(function(){
    class InputNodeController extends BaseController {
        constructor(sidebar) {
            super(sidebar);
            this.sections = {
                header: new HeaderSection(sidebar),
                nodeName: new NodeNameSection(sidebar),
                inputList: new InputListSection(sidebar),
                deleteButton: new DeleteButtonSection(sidebar)
            };
        }

        render(node) {
            if (!node || !this.sidebar) return;

            this.showSections([
                'node_name',
                'input_node_inputs_section',
                'delete_node_from_sidebar'
            ]);

            Object.values(this.sections).forEach(section => {
                section.render(node);
            });
        }
    }

    window.InputNodeController = InputNodeController;
})();
