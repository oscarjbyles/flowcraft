// link controller for build mode
(function(){
    if (!window.Sidebar) return;

    class LinkController {
        constructor(sidebar) {
            this.sidebar = sidebar;
        }

        render(selection) {
            if (!selection || !selection.link || !this.sidebar) return;
            
            const link = selection.link;
            const sourceNode = this.sidebar.state.getNode(link.source);
            const targetNode = this.sidebar.state.getNode(link.target);
            const isIfToPython = sourceNode && targetNode && sourceNode.type === 'if_node' && targetNode.type === 'python_file';
            
            if (isIfToPython) {
                // show sections for if connection
                this.showSections([
                    'if_connection_variables_section'
                ]);

                // hide sections not relevant for if connection
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
                    'delete_node_from_sidebar'
                ]);

                // update header
                this.updateHeader('IF CONDITION');

                // show connection node panel
                if (typeof this.sidebar.showConnectionNodePanel === 'function') {
                    this.sidebar.showConnectionNodePanel(link);
                }
            } else {
                // show sections for regular link
                this.showSections([
                    'link_properties'
                ]);

                // hide sections not relevant for link
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
                    'if_connection_variables_section'
                ]);

                // update header
                this.updateHeader('LINK');

                // populate link form
                if (typeof this.sidebar.populateLinkForm === 'function') {
                    this.sidebar.populateLinkForm(link);
                }
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

    window.LinkController = LinkController;
})();
