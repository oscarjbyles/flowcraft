// centralized content engine for properties sidebar
(function(){
    if (!window.Sidebar) return;

    class SidebarContentEngine {
        constructor(sidebar) {
            this.sidebar = sidebar;
            this.registry = this.buildRegistry();
            try {
                this.runController = new (window.SidebarRunViewController || function(){}) (sidebar);
            } catch (_) { this.runController = null; }
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
                            text_node: {
                                header: 'TEXT NODE',
                                show: ['node_name'],
                                hide: [
                                    'python_file',
                                    'arguments_section',
                                    'returns_section',
                                    'if_node_variables_section',
                                    'data_save_variable_section',
                                    'data_save_name_section',
                                    'input_node_inputs_section'
                                ],
                                after: (node) => {
                                    this.toggleFormGroupVisibility('python_quick_actions', false);
                                }
                            },
                            if_node: {
                                header: 'IF SPLITTER',
                                show: ['if_node_variables_section'],
                                hide: [
                                    'python_file',
                                    'arguments_section',
                                    'returns_section',
                                    'input_node_inputs_section',
                                    'data_save_variable_section',
                                    'data_save_name_section',
                                    'python_quick_actions'
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

								 // update python file status indicator and formatted path
								 try {
								 	const iconEl = document.getElementById('python_file_status_icon');
								 	const textEl = document.getElementById('python_file_status_text');
								 	const pathEl = document.getElementById('python_file_path_block');
								 	const path = (node.pythonFile || '').replace(/^(?:nodes\/)*/i, '');
								 	if (hasFile) {
								 		if (iconEl) { iconEl.textContent = 'check_circle'; iconEl.style.color = '#66bb6a'; }
								 		if (textEl) { textEl.textContent = 'python file selected'; textEl.style.opacity = '1'; }
								 		if (pathEl) {
								 			const formatted = this.sidebar.formatPathForDisplay ? this.sidebar.formatPathForDisplay(path) : (function(v){
								 				try {
								 					const normalized = String(v).replace(/\\\\/g, '/');
								 					const escaped = normalized
								 						.replace(/&/g, '&amp;')
								 						.replace(/</g, '&lt;')
								 						.replace(/>/g, '&gt;')
								 						.replace(/\"/g, '&quot;')
								 						.replace(/'/g, '&#39;');
								 					return escaped.replace(/\//g, '/<br>&nbsp;&nbsp;');
								 				} catch(_) { return String(v); }
								 			})(path);
								 			pathEl.innerHTML = formatted;
								 			pathEl.style.display = '';
								 		}
								 	} else {
								 		if (iconEl) { iconEl.textContent = 'close'; iconEl.style.color = '#f44336'; }
								 		if (textEl) { textEl.textContent = 'select python file'; textEl.style.opacity = '0.9'; }
								 		if (pathEl) { pathEl.innerHTML = ''; pathEl.style.display = 'none'; }
								 	}
								 } catch (_) {}

                                         // visibility rule for "+ if condition" button:
                                         // show whenever the selected python node does not already have an associated if splitter
                                         const state = this.sidebar.state;
                                         let alreadyHasIf = false;
                                         try {
                                             if (state && typeof state.getAssociatedIfForPython === 'function') {
                                                 alreadyHasIf = !!state.getAssociatedIfForPython(node.id);
                                             }
                                         } catch (_) { alreadyHasIf = false; }

                                         const showQuick = !state.isRunMode && !alreadyHasIf;
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
                    // ensure header updates for all node types while in run mode
                    single: {
                        panel: 'execution',
                        byType: {
                            input_node: {
                                header: 'INPUT NODE'
                            },
                            if_node: {
                                header: 'IF SPLITTER'
                            },
                            data_save: {
                                header: 'DATA SAVE'
                            },
                            python_file: {
                                header: 'PYTHON NODE'
                            }
                        },
                        fallback: {
                            header: 'NODE'
                        }
                    },
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
                        const stored = node.pythonFile || '';
                        const noPrefix = stored.replace(/^(?:nodes\/)*/i, '');
                        // keep input visually empty; store path in dataset for saving
                        pyInput.value = '';
                        pyInput.placeholder = '';
                        pyInput.dataset.fullPath = noPrefix;
                    }
                    if (typeof typeConf.after === 'function') typeConf.after(node);
                }
                // removed recursive single panel controller render to avoid re-entering content engine
            } else {
                // non-single contexts rely on existing specialized methods
                if (context === 'link' && selection && selection.link) {
                    const sourceNode = this.sidebar.state.getNode(selection.link.source);
                    const targetNode = this.sidebar.state.getNode(selection.link.target);
                    const involvesIfNode = !!(sourceNode && sourceNode.type === 'if_node') || !!(targetNode && targetNode.type === 'if_node');
                    if (involvesIfNode) {
                        this.updateHeader('IF CONDITION');
                    } else {
                        this.updateHeader(null);
                    }
                    // let link panel controller render in build mode
                    if (!this.sidebar.state.isRunMode && window.SidebarLinkPanelController) {
                        try {
                            if (!this._linkCtrl) this._linkCtrl = new window.SidebarLinkPanelController(this.sidebar);
                            this._linkCtrl.render(selection);
                        } catch(_) {}
                    }
                } else {
                    this.updateHeader(null);
                    // multi/group/annotation controllers (build mode)
                    if (!this.sidebar.state.isRunMode) {
                        try {
                            if (context === 'multi' && window.SidebarMultiPanelController) {
                                if (!this._multiCtrl) this._multiCtrl = new window.SidebarMultiPanelController(this.sidebar);
                                this._multiCtrl.render(selection.nodes || []);
                            }
                            if (context === 'group' && selection.group && window.SidebarGroupPanelController) {
                                if (!this._groupCtrl) this._groupCtrl = new window.SidebarGroupPanelController(this.sidebar);
                                this._groupCtrl.render(selection.group);
                            }
                            if (context === 'annotation' && selection.annotation && window.SidebarAnnotationPanelController) {
                                if (!this._annCtrl) this._annCtrl = new window.SidebarAnnotationPanelController(this.sidebar);
                                this._annCtrl.render(selection.annotation);
                            }
                        } catch(_) {}
                    }
                }
            }

            // if we are in run mode, let the controller populate dynamic sections for selection
            if (this.sidebar.state && this.sidebar.state.isRunMode && this.runController && typeof this.runController.render === 'function') {
                try { this.runController.render(selection); } catch(_) {}
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
            const C = window.SidebarConstants;
            const idMap = {
                default: C?.ids?.defaultPanel || 'default_properties',
                single: C?.ids?.singlePanel || 'single_node_properties',
                multi: C?.ids?.multiPanel || 'multi_select_properties',
                group: C?.ids?.groupPanel || 'group_properties',
                link: C?.ids?.linkPanel || 'link_properties',
                annotation: C?.ids?.annotationPanel || 'annotation_properties',
                execution: C?.ids?.executionPanel || 'run_execution_properties'
            };
            const panelId = idMap[key];
            const panel = panelId ? document.getElementById(panelId) : null;
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
                const C = window.SidebarConstants;
                const header = document.getElementById(C?.ids?.propertiesHeader || 'properties_header');
                const headerText = document.getElementById(C?.ids?.propertiesHeaderText || 'properties_header_text');
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


