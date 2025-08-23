// link controller for run mode
(function(){
    class LinkRunController extends BaseController {
        constructor(sidebar) {
            super(sidebar);
            this.sections = {
                header: new HeaderSection(sidebar),
                executionStatus: new ExecutionStatusSection(sidebar)
            };
        }

        render(link) {
            if (!link || !this.sidebar) return;

            this.showSections([
                'execution_status',
                'link_properties'
            ]);

            Object.values(this.sections).forEach(section => {
                section.render(link);
            });
        }
    }

    window.LinkRunController = LinkRunController;
})();
