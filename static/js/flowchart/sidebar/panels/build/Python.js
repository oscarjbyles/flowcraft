// python node type controller for build mode
(function(){
    class PythonNodeController extends BaseController {
        constructor(sidebar) {
            super(sidebar);
            this.sections = {
                header: new HeaderSection(sidebar),
                nodeName: new NodeNameSection(sidebar),
                pythonFile: new PythonFileSection(sidebar),
                arguments: new ArgumentsSection(sidebar),
                returns: new ReturnsSection(sidebar),
                quickActions: new QuickActionsSection(sidebar),
                deleteButton: new DeleteButtonSection(sidebar)
            };
        }

        render(node) {
            if (!node || !this.sidebar) return;

            // show sections for python nodes
            this.showSections([
                'node_name',
                'python_file',
                'arguments_section',
                'returns_section',
                'python_quick_actions',
                'delete_node_from_sidebar'
            ]);

            // render each section
            Object.values(this.sections).forEach(section => {
                section.render(node);
            });
        }
    }

    window.PythonNodeController = PythonNodeController;
})();
