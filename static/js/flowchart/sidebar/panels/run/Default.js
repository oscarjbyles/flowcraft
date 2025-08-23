// default controller for run mode
(function(){
    class DefaultRunController extends BaseController {
        constructor(sidebar) {
            super(sidebar);
            this.sections = {
                header: new HeaderSection(sidebar),
                executionStatus: new ExecutionStatusSection(sidebar)
            };
        }

        render(data) {
            if (!this.sidebar) return;

            this.showSections([
                'execution_status',
                'default_properties'
            ]);

            Object.values(this.sections).forEach(section => {
                section.render(data);
            });
        }
    }

    window.DefaultRunController = DefaultRunController;
})();
