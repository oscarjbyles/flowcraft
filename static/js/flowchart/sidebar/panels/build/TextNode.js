// text node type controller for build mode
(function(){
    if (!window.Sidebar) return;

    class TextNodeController {
        constructor(sidebar) {
            this.sidebar = sidebar;
        }

        render(node) {
            if (!node || !this.sidebar) return;
            
            // show sections for text nodes
            this.showSections([
                'node_name',
                'delete_node_from_sidebar'
            ]);

            // hide sections not relevant for text nodes
            this.hideSections([
                'python_file',
                'arguments_section',
                'returns_section',
                'if_node_variables_section',
                'data_save_variable_section',
                'data_save_name_section',
                'input_node_inputs_section',
                'python_quick_actions'
            ]);

            // update header
            this.updateHeader('TEXT NODE');

            // populate form with node data
            this.populateForm(node);
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
        }
    }

    window.TextNodeController = TextNodeController;
})();
