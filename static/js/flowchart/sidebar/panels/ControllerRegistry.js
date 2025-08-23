class ControllerRegistry {
    constructor(sidebar) {
        this.sidebar = sidebar;
        this.cache = new Map();
        this.controllerMap = this.buildControllerMap();
    }

    buildControllerMap() {
        // dynamic controller mapping based on file structure
        const controllerMap = {
            build: {},
            run: {}
        };

        // map node types to their controller classes (keeping original file names)
        const nodeTypeMapping = {
            'python_file': 'PythonNodeController',
            'input_node': 'InputNodeController',
            'if_node': 'IfNodeController',
            'data_save': 'DataSaveNodeController',
            'text_node': 'TextNodeController',
            'multi': 'MultiSelectController',
            'group': 'GroupController',
            'link': 'LinkController',
            'annotation': 'AnnotationController',
            'default': 'DefaultController'
        };

        // build mode controllers
        Object.entries(nodeTypeMapping).forEach(([nodeType, controllerName]) => {
            const controllerClass = window[controllerName];
            if (controllerClass) {
                controllerMap.build[nodeType] = controllerClass;
            } else {
                console.warn(`[controllerRegistry] build controller not found: ${controllerName}`);
            }
        });

        // run mode controllers
        Object.entries(nodeTypeMapping).forEach(([nodeType, controllerName]) => {
            const runControllerName = controllerName.replace('Controller', 'RunController');
            const controllerClass = window[runControllerName];
            if (controllerClass) {
                controllerMap.run[nodeType] = controllerClass;
            } else {
                console.warn(`[controllerRegistry] run controller not found: ${runControllerName}`);
            }
        });

        return controllerMap;
    }

    getController(mode, type) {
        const cacheKey = `${mode}_${type}`;

        if (this.cache.has(cacheKey)) {
            return this.cache.get(cacheKey);
        }

        const modeControllers = this.controllerMap[mode];
        if (!modeControllers) {
            console.warn(`[controllerRegistry] no controllers found for mode: ${mode}`);
            return null;
        }

        const controllerClass = modeControllers[type];
        if (!controllerClass) {
            console.warn(`[controllerRegistry] no controller found for type: ${type} in mode: ${mode}`);
            // fallback to default controller
            const defaultController = modeControllers['default'];
            if (defaultController) {
                            return new defaultController(this.sidebar);
            }
            return null;
        }

        const controller = new controllerClass(this.sidebar);
        this.cache.set(cacheKey, controller);
        return controller;
    }

    render(mode, type, data) {
        const controller = this.getController(mode, type);
        if (controller && typeof controller.render === 'function') {
            controller.render(data);
        } else {
            console.warn(`[controllerRegistry] controller not found or invalid for mode: ${mode}, type: ${type}`);
            // fallback to default rendering
            const defaultController = this.getController(mode, 'default');
            if (defaultController) {
                defaultController.render(data);
            }
        }
    }
}

window.ControllerRegistry = ControllerRegistry;
