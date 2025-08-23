// default controller for build mode
(function(){
    class DefaultController extends BaseController {
        constructor(sidebar) {
            super(sidebar);
            this.sections = {
                header: new HeaderSection(sidebar)
            };
        }

        render(data) {
            if (!this.sidebar) return;

            this.showSections([
                'default_properties'
            ]);

            Object.values(this.sections).forEach(section => {
                section.render(data);
            });
        }
    }

    window.DefaultController = DefaultController;
})();
