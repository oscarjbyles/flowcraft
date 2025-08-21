// multi-select controller for build mode
(function(){
    if (!window.Sidebar) return;

    class MultiSelectController {
        constructor(sidebar) {
            this.sidebar = sidebar;
        }

        render(nodeIds) {
            if (!Array.isArray(nodeIds) || nodeIds.length === 0) return;
            
            // show sections for multi-select
            this.showSections([
                'create_group_btn',
                'align_nodes_btn',
                'delete_selected_nodes',
                'selected_nodes_list'
            ]);

            // hide sections not relevant for multi-select
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
            this.updateHeader('MULTI SELECT');

            // update selected nodes list
            if (typeof this.sidebar.updateSelectedNodesList === 'function') {
                this.sidebar.updateSelectedNodesList(nodeIds);
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

    window.MultiSelectController = MultiSelectController;
})();
