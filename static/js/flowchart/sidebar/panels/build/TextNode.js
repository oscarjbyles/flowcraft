// text node type controller for build mode
(function(){
    class TextNodeController extends BaseController {
        constructor(sidebar) {
            super(sidebar);
            this.sections = {
                header: new HeaderSection(sidebar),
                nodeName: new NodeNameSection(sidebar),
                textContent: new TextContentSection(sidebar),
                deleteButton: new DeleteButtonSection(sidebar)
            };
        }

        render(node) {
            if (!node || !this.sidebar) return;

            this.showSections([
                'node_name',
                'text_node_content_section',
                'delete_node_from_sidebar'
            ]);

            Object.values(this.sections).forEach(section => {
                section.render(node);
            });
        }
    }

    window.TextNodeController = TextNodeController;
})();
