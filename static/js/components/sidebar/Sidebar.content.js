// centralized content engine for properties sidebar
(function(){
    if (!window.Sidebar) return;

    class SidebarContentEngine {
        constructor(sidebar) {
            this.sidebar = sidebar;
            this.registry = this.buildRegistry();
        }

        // registry maps mode/selection/node_type to section visibility and hooks
        buildRegistry() {
            return {
                build: {
                    default: { panel: 'default', sections: {} },
                    annotation: { panel: 'annotation', sections: {} },
                    link: { panel: 'link', sections: {} },
                    group: { panel: 'group', sections: {} },
                    multi: { panel: 'multi', sections: {} },
                    single: {
                        panel: 'single',
                        byType: {
                            input_node: {
                                header: 'INPUT NODE',
                                show: ['input_node_inputs_section'],
                                hide: [
                                    'python_file',
                                    'arguments_section',
                                    'returns_section',
                                    'if_node_variables_section',
                                    'data_save_variable_section',
                                    'data_save_name_section'
                                ],
                                after: (node) => {
                                    this.sidebar.populateInputNodeInputs(node);
                                    this.toggleFormGroupVisibility('node_name', false);
                                    this.toggleFormGroupVisibility('python_quick_actions', false);
                                    this.toggleFormGroupVisibility('delete_node_from_sidebar', false);
                                }
                            },
                            if_node: {
                                header: 'IF CONDITION',
                                show: ['if_node_variables_section'],
                                hide: [
                                    'python_file',
                                    'arguments_section',
                                    'returns_section',
                                    'input_node_inputs_section',
                                    'data_save_variable_section',
                                    'data_save_name_section'
                                ],
                                after: (node) => {
                                    this.sidebar.analyzeIfNodeVariables(node);
                                }
                            },
                            data_save: {
                                header: 'DATA SAVE',
                                show: ['data_save_variable_section'],
                                hide: [
                                    'python_file',
                                    'arguments_section',
                                    'returns_section',
                                    'if_node_variables_section',
                                    'input_node_inputs_section'
                                ],
                                after: (node) => {
                                    this.sidebar.populateDataSaveVariables(node);
                                    this.toggleFormGroupVisibility('python_quick_actions', false);
                                }
                            },
                            python_file: {
                                header: 'PYTHON NODE',
                                show: ['python_file'],
                                hide: [
                                    'input_node_inputs_section',
                                    'if_node_variables_section',
                                    'data_save_variable_section',
                                    'data_save_name_section'
                                ],
                                after: (node) => {
                                    const hasFile = !!node.pythonFile;
                                    this.setSectionVisible('arguments_section', hasFile);
                                    this.setSectionVisible('returns_section', hasFile);
                                    if (hasFile) this.sidebar.analyzeNodeFunction(node);
                                    const hasIf = !!this.sidebar.state.getAssociatedIfForPython(node.id);
                                    const showQuick = !this.sidebar.state.isRunMode && !hasIf;
                                    this.toggleFormGroupVisibility('python_quick_actions', showQuick);
                                }
                            }
                        },
                        fallback: {
                            header: 'NODE',
                            show: ['python_file'],
                            hide: [
                                'input_node_inputs_section',
                                'if_node_variables_section',
                                'data_save_variable_section',
                                'data_save_name_section',
                                'arguments_section',
                                'returns_section'
                            ]
                        }
                    }
                },
                run: {
                    default: { panel: 'execution', sections: {} },
                    single: { panel: 'execution', sections: {} },
                    multi: { panel: 'execution', sections: {} },
                    link: { panel: 'execution', sections: {} },
                    group: { panel: 'execution', sections: {} },
                    annotation: { panel: 'execution', sections: {} }
                },
                settings: {
                    default: { panel: 'default', sections: {} }
                }
            };
        }

        // main entry point used by sidebar
        apply(selection) {
            const mode = this.sidebar.state.isRunMode ? 'run' : (this.sidebar.state.isSettingsMode ? 'settings' : 'build');
            const context = this.getContext(selection);
            const conf = this.getConfig(mode, context);
            if (!conf) return;

            this.activatePanel(conf.panel);

            if (context === 'single') {
                const nodeId = selection.nodes[0];
                const node = this.sidebar.state.getNode(nodeId);
                if (!node) return;
                const typeConf = (conf.byType && conf.byType[node.type]) || conf.fallback;
                if (typeConf) {
                    this.updateHeader(typeConf.header || node.type);
                    this.applyVisibility(typeConf.show, typeConf.hide);
                    // keep basic inputs in sync
                    const nameInput = document.getElementById('node_name');
                    if (nameInput) nameInput.value = node.name || '';
                    const pyInput = document.getElementById('python_file');
                    if (pyInput) {
                        const pythonFile = node.pythonFile || '';
                        const displayPath = pythonFile.startsWith('nodes/') ? pythonFile.substring(6) : pythonFile;
                        pyInput.value = displayPath;
                        pyInput.dataset.fullPath = pythonFile;
                    }
                    if (typeof typeConf.after === 'function') typeConf.after(node);
                }
            } else {
                // non-single contexts rely on existing specialized methods
                this.updateHeader(null);
            }
        }

        getContext(selection) {
            if (selection.annotation) return 'annotation';
            if (selection.link) return 'link';
            if (selection.group) return 'group';
            if (selection.nodes && selection.nodes.length === 1) return 'single';
            if (selection.nodes && selection.nodes.length > 1) return 'multi';
            return 'default';
        }

        getConfig(mode, context) {
            const m = this.registry[mode];
            if (!m) return null;
            return m[context] || null;
        }

        activatePanel(key) {
            this.sidebar.hideAllPanels();
            const map = {
                default: this.sidebar.contentPanels.default,
                single: this.sidebar.contentPanels.single,
                multi: this.sidebar.contentPanels.multi,
                group: this.sidebar.contentPanels.group,
                link: this.sidebar.contentPanels.link,
                annotation: this.sidebar.contentPanels.annotation,
                execution: this.sidebar.contentPanels.execution
            };
            const panel = map[key];
            if (panel) panel.classList.add('active');
        }

        applyVisibility(showIds = [], hideIds = []) {
            hideIds.forEach((id) => this.setSectionVisible(id, false));
            showIds.forEach((id) => this.setSectionVisible(id, true));
        }

        setSectionVisible(id, visible) {
            if (!id) return;
            const el = document.getElementById(id);
            if (!el) return;
            // prefer toggling the parent form_group if present so label+input hide together
            const group = el.closest ? el.closest('.form_group') : null;
            const target = group || el;
            target.style.display = visible ? '' : 'none';
        }

        toggleFormGroupVisibility(inputId, visible) {
            const input = document.getElementById(inputId);
            if (!input) return;
            const group = input.closest('.form_group');
            if (!group) return;
            group.style.display = visible ? '' : 'none';
        }

        updateHeader(text) {
            try {
                const header = document.getElementById('properties_header');
                const headerText = document.getElementById('properties_header_text');
                if (!header || !headerText) return;
                if (text) {
                    headerText.textContent = String(text).toUpperCase();
                    header.style.display = 'block';
                } else {
                    header.style.display = 'none';
                }
            } catch (_) {}
        }
    }

    window.SidebarContentEngine = SidebarContentEngine;
})();


