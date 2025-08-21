// controller registry for node type and mode specific controllers
(function(){
    if (!window.Sidebar) return;

    class ControllerRegistry {
        constructor(sidebar) {
            this.sidebar = sidebar;
            this.controllers = this.buildControllerMap();
        }

        buildControllerMap() {
            return {
                build: {
                    // node type controllers
                    python_file: window.PythonNodeController,
                    input_node: window.InputNodeController,
                    if_node: window.IfNodeController,
                    data_save: window.DataSaveNodeController,
                    text_node: window.TextNodeController,
                    
                    // selection type controllers
                    multi: window.MultiSelectController,
                    group: window.GroupController,
                    link: window.LinkController,
                    annotation: window.AnnotationController
                },
                run: {
                    // node type controllers
                    python_file: window.PythonNodeRunController,
                    input_node: window.InputNodeRunController,
                    if_node: window.IfNodeRunController,
                    data_save: window.DataSaveNodeRunController,
                    text_node: window.TextNodeRunController,
                    
                    // selection type controllers
                    multi: window.MultiSelectRunController,
                    group: window.GroupRunController,
                    link: window.LinkRunController,
                    annotation: window.AnnotationRunController
                }
            };
        }

        getController(mode, type) {
            const modeControllers = this.controllers[mode];
            if (!modeControllers) {
                console.warn(`no controllers found for mode: ${mode}`);
                return null;
            }

            const controllerClass = modeControllers[type];
            if (!controllerClass) {
                console.warn(`no controller found for type: ${type} in mode: ${mode}`);
                return null;
            }

            return new controllerClass(this.sidebar);
        }

        render(mode, type, data) {
            const controller = this.getController(mode, type);
            if (controller && typeof controller.render === 'function') {
                controller.render(data);
            } else {
                console.warn(`controller not found or invalid for mode: ${mode}, type: ${type}`);
            }
        }
    }

    window.ControllerRegistry = ControllerRegistry;
})();
