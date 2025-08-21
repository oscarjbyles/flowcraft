// python node type controller for run mode
(function(){
    if (!window.Sidebar) return;

    class PythonNodeRunController {
        constructor(sidebar) {
            this.sidebar = sidebar;
        }

        render(node) {
            if (!node || !this.sidebar) return;
            
            // show sections for python nodes in run mode
            this.showSections([
                'execution_progress_group',
                'python_returns_group'
            ]);

            // hide sections not relevant for python nodes in run mode
            this.hideSections([
                'node_name',
                'python_file',
                'arguments_section',
                'returns_section',
                'if_node_variables_section',
                'data_save_variable_section',
                'data_save_name_section',
                'input_node_inputs_section',
                'python_quick_actions',
                'delete_node_from_sidebar',
                'data_save_details_group'
            ]);

            // update header
            this.updateHeader('PYTHON NODE');

            // update run mode node details
            if (typeof this.sidebar.updateRunModeNodeDetails === 'function') {
                this.sidebar.updateRunModeNodeDetails({ nodes: [node.id] });
            }
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
    }

    window.PythonNodeRunController = PythonNodeRunController;
})();
