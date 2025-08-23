// annotation controller for build mode
(function(){
    class AnnotationController extends BaseController {
        constructor(sidebar) {
            super(sidebar);
            this.sections = {
                header: new HeaderSection(sidebar),
                annotation: new AnnotationSection(sidebar),
                deleteButton: new DeleteButtonSection(sidebar)
            };
        }

        render(annotation) {
            if (!annotation || !this.sidebar) return;

            this.showSections([
                'annotation_properties',
                'delete_node_from_sidebar'
            ]);

            Object.values(this.sections).forEach(section => {
                section.render(annotation);
            });
        }
    }

    window.AnnotationController = AnnotationController;
})();
