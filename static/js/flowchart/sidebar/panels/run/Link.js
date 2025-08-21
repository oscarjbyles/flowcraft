// link controller for run mode
(function(){
    if (!window.Sidebar) return;

    class LinkRunController {
        constructor(sidebar) {
            this.sidebar = sidebar;
        }

        render(selection) {
            if (!selection || !selection.link || !this.sidebar) return;
            
            const link = selection.link;
            const sourceNode = this.sidebar.state.getNode(link.source);
            const targetNode = this.sidebar.state.getNode(link.target);
            const involvesIfNode = !!(sourceNode && sourceNode.type === 'if_node') || !!(targetNode && targetNode.type === 'if_node');
            
            // show sections for link in run mode
            this.showSections([
                'execution_progress_group'
            ]);

            // hide sections not relevant for link in run mode
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
                'python_returns_group',
                'data_save_details_group',
                'if_active_conditions_section'
            ]);

            // update header based on if node involvement
            if (involvesIfNode) {
                this.updateHeader('IF CONDITION');
            } else {
                this.updateHeader('LINK');
            }

            // update run mode node details
            if (typeof this.sidebar.updateRunModeNodeDetails === 'function') {
                this.sidebar.updateRunModeNodeDetails({ link: link });
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

    window.LinkRunController = LinkRunController;
})();
