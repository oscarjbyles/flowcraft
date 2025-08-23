// multi select controller for run mode
(function(){
    class MultiSelectRunController extends BaseController {
        constructor(sidebar) {
            super(sidebar);
            this.sections = {
                header: new HeaderSection(sidebar),
                executionStatus: new ExecutionStatusSection(sidebar)
            };
        }

        render(selection) {
            if (!selection || !this.sidebar) return;

            this.showSections([
                'execution_status',
                'multi_select_properties'
            ]);

            Object.values(this.sections).forEach(section => {
                section.render(selection);
            });
        }
    }

    window.MultiSelectRunController = MultiSelectRunController;
})();
