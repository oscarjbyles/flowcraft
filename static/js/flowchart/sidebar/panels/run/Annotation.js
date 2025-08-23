// annotation controller for run mode
(function(){
    class AnnotationRunController extends BaseController {
        constructor(sidebar) {
            super(sidebar);
            this.sections = {
                header: new HeaderSection(sidebar),
                executionStatus: new ExecutionStatusSection(sidebar)
            };
        }

        render(annotation) {
            if (!annotation || !this.sidebar) return;

            this.showSections([
                'execution_status',
                'annotation_properties'
            ]);

            Object.values(this.sections).forEach(section => {
                section.render(annotation);
            });
        }
    }

    window.AnnotationRunController = AnnotationRunController;
})();
