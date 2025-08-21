// input node type controller for build mode
(function(){
    if (!window.Sidebar) return;

    class InputNodeController {
        constructor(sidebar) {
            this.sidebar = sidebar;
        }

        render(node) {
            if (!node || !this.sidebar) return;
            
            // show sections for input nodes
            this.showSections([
                'input_node_inputs_section'
            ]);

            // hide sections not relevant for input nodes
            this.hideSections([
                'node_name',
                'python_file',
                'arguments_section',
                'returns_section',
                'if_node_variables_section',
                'data_save_variable_section',
                'data_save_name_section',
                'python_quick_actions',
                'delete_node_from_sidebar'
            ]);

            // update header
            this.updateHeader('INPUT NODE');

            // populate input node inputs
            if (typeof this.sidebar.populateInputNodeInputs === 'function') {
                this.sidebar.populateInputNodeInputs(node);
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

    window.InputNodeController = InputNodeController;
})();
