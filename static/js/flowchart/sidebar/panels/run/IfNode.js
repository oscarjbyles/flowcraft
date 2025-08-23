// if node type controller for run mode
(function(){
    class IfNodeRunController extends BaseController {
        constructor(sidebar) {
            super(sidebar);
            this.sections = {
                header: new HeaderSection(sidebar),
                executionStatus: new ExecutionStatusSection(sidebar),
                fileInfo: new FileInfoSection(sidebar)
            };
        }

        render(node) {
            if (!node || !this.sidebar) return;

            this.showSections([
                'execution_status',
                'node_file_info',
                'node_input_log',
                'node_output_log'
            ]);

            Object.values(this.sections).forEach(section => {
                section.render(node);
            });
        }
    }

    window.IfNodeRunController = IfNodeRunController;
})();
