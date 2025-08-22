// python node type controller for build mode
(function(){
    if (!window.Sidebar) return;

    class PythonNodeController {
        constructor(sidebar) {
            this.sidebar = sidebar;
        }

        render(node) {
            if (!node || !this.sidebar) return;
            
            // show sections for python nodes
            this.showSections([
                'node_name',
                'python_file',
                'arguments_section',
                'returns_section',
                'python_quick_actions',
                'delete_node_from_sidebar'
            ]);

            // hide sections not relevant for python nodes
            this.hideSections([
                'input_node_inputs_section',
                'if_node_variables_section',
                'data_save_variable_section',
                'data_save_name_section'
            ]);

            // update header
            this.updateHeader('PYTHON NODE');

            // populate form with node data
            this.populateForm(node);

            // analyze function if python file is set
            if (node.pythonFile && typeof this.sidebar.analyzeNodeFunction === 'function') {
                this.sidebar.analyzeNodeFunction(node);
            }

            // update python file status and path display
            this.updatePythonFileStatus(node);

            // handle quick actions visibility
            this.handleQuickActionsVisibility(node);
        }

        showSections(sectionIds) {
            sectionIds.forEach(id => {
                const element = document.getElementById(id);
                if (element) {
                    element.style.display = '';
                    element.classList.remove('hidden');
                }
            });
        }

        hideSections(sectionIds) {
            sectionIds.forEach(id => {
                const element = document.getElementById(id);
                if (element) {
                    element.style.display = 'none';
                    element.classList.add('hidden');
                }
            });
        }

        updateHeader(text) {
            const headerElement = document.getElementById('properties_header_text');
            if (headerElement) {
                headerElement.textContent = text;
            }
        }

        populateForm(node) {
            // populate node name
            const nameInput = document.getElementById('node_name');
            if (nameInput) {
                nameInput.value = node.name || '';
            }

            // populate python file
            const pyInput = document.getElementById('python_file');
            if (pyInput) {
                const stored = node.pythonFile || '';
                const noPrefix = stored.replace(/^(?:nodes\/)*/i, '');
                pyInput.value = '';
                pyInput.placeholder = '';
                pyInput.dataset.fullPath = noPrefix;
            }
        }

        updatePythonFileStatus(node) {
            try {
                const iconEl = document.getElementById('python_file_status_icon');
                const textEl = document.getElementById('python_file_status_text');
                const pathEl = document.getElementById('python_file_path_block');
                const path = (node.pythonFile || '').replace(/^(?:nodes\/)*/i, '');
                const hasFile = !!node.pythonFile;

                if (hasFile) {
                    if (iconEl) { 
                        iconEl.textContent = 'check_circle'; 
                        iconEl.style.color = '#66bb6a'; 
                    }
                    if (textEl) { 
                        textEl.textContent = 'python file selected'; 
                        textEl.style.opacity = '1'; 
                    }
                    if (pathEl) {
                        const formatted = this.sidebar.formatPathForDisplay ? 
                            this.sidebar.formatPathForDisplay(path) : 
                            this.formatPathForDisplay(path);
                        pathEl.innerHTML = formatted;
                        pathEl.style.display = '';
                    }
                } else {
                    if (iconEl) { 
                        iconEl.textContent = 'close'; 
                        iconEl.style.color = '#f44336'; 
                    }
                    if (textEl) { 
                        textEl.textContent = 'select python file'; 
                        textEl.style.opacity = '0.9'; 
                    }
                    if (pathEl) { 
                        pathEl.innerHTML = ''; 
                        pathEl.style.display = 'none'; 
                    }
                }
            } catch (_) {}
        }

        formatPathForDisplay(path) {
            try {
                const normalized = String(path).replace(/\\\\/g, '/');
                const escaped = normalized
                    .replace(/&/g, '&amp;')
                    .replace(/</g, '&lt;')
                    .replace(/>/g, '&gt;')
                    .replace(/\"/g, '&quot;')
                    .replace(/'/g, '&#39;');
                return escaped.replace(/\//g, '/<br>&nbsp;&nbsp;');
            } catch(_) { 
                return String(path); 
            }
        }

        handleQuickActionsVisibility(node) {
            const state = this.sidebar.state;
            let alreadyHasIf = false;
            let hasUpstreamIf = false;
            let hasDownstreamIf = false;
            
            try {
                if (state && state.createNode && typeof state.createNode.getAssociatedIfForPython === 'function') {
                    alreadyHasIf = !!state.createNode.getAssociatedIfForPython(node.id);
                }
                if (state && state.createNode && typeof state.createNode.hasUpstreamIfSplitter === 'function') {
                    hasUpstreamIf = state.createNode.hasUpstreamIfSplitter(node.id);
                }
                if (state && state.createNode && typeof state.createNode.hasDownstreamIfSplitter === 'function') {
                    hasDownstreamIf = state.createNode.hasDownstreamIfSplitter(node.id);
                }
            } catch (_) { 
                alreadyHasIf = false; 
                hasUpstreamIf = false;
                hasDownstreamIf = false;
            }

            const showQuick = !state.isRunMode && !alreadyHasIf && hasUpstreamIf && !hasDownstreamIf;
            this.toggleFormGroupVisibility('python_quick_actions', showQuick);
        }

        toggleFormGroupVisibility(groupId, visible) {
            const element = document.getElementById(groupId);
            if (element) {
                element.style.display = visible ? '' : 'none';
            }
        }
    }

    window.PythonNodeController = PythonNodeController;
})();
