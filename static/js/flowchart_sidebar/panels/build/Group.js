// group controller for build mode
(function(){
    if (!window.Sidebar) return;

    class GroupController {
        constructor(sidebar) {
            this.sidebar = sidebar;
        }

        render(group) {
            if (!group || !this.sidebar) return;
            
            // show sections for group
            this.showSections([
                'group_name',
                'group_description',
                'save_group_properties',
                'ungroup_nodes',
                'delete_group',
                'group_members_list'
            ]);

            // hide sections not relevant for group
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
            this.updateHeader('GROUP');

            // populate group form
            if (typeof this.sidebar.populateGroupForm === 'function') {
                this.sidebar.populateGroupForm(group);
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

    window.GroupController = GroupController;
})();
