// annotation controller for build mode
(function(){
    if (!window.Sidebar) return;

    class AnnotationController {
        constructor(sidebar) {
            this.sidebar = sidebar;
        }

        render(annotation) {
            if (!annotation || !this.sidebar) return;
            
            // show sections for annotation
            this.showSections([
                'text_annotation_properties',
                'arrow_annotation_properties'
            ]);

            // hide sections not relevant for annotation
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
            this.updateHeader('ANNOTATION');

            // show annotation panel
            if (typeof this.sidebar.showAnnotationPanel === 'function') {
                this.sidebar.showAnnotationPanel(annotation);
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

    window.AnnotationController = AnnotationController;
})();
