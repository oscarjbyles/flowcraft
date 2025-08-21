// if node type controller for build mode
(function(){
    if (!window.Sidebar) return;

    class IfNodeController {
        constructor(sidebar) {
            this.sidebar = sidebar;
        }

        render(node) {
            if (!node || !this.sidebar) return;
            
            // show sections for if nodes
            this.showSections([
                'if_node_variables_section'
            ]);

            // hide sections not relevant for if nodes
            this.hideSections([
                'node_name',
                'python_file',
                'arguments_section',
                'returns_section',
                'input_node_inputs_section',
                'data_save_variable_section',
                'data_save_name_section',
                'python_quick_actions',
                'delete_node_from_sidebar'
            ]);

            // update header
            this.updateHeader('IF SPLITTER');

            // analyze if node variables
            if (typeof this.sidebar.analyzeIfNodeVariables === 'function') {
                this.sidebar.analyzeIfNodeVariables(node);
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

    window.IfNodeController = IfNodeController;
})();
