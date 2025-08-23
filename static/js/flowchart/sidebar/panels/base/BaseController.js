class BaseController {
    constructor(sidebar) {
        this.sidebar = sidebar;
        this.sections = {};
    }

    render(data) {
        throw new Error('render method must be implemented');
    }

    // automatically show/hide sections based on what's available
    showSections(sectionIds) {
        // hide all sections first
        this.hideAllSections();

        // show only the specified sections
        sectionIds.forEach(id => {
            const element = document.getElementById(id);
            if (element) {
                element.style.display = '';
                element.classList.remove('hidden');
            }
        });
    }

    hideAllSections() {
        // very specific selectors to only hide sidebar content sections
        const sectionElements = document.querySelectorAll(`
            #single_node_properties [id$="_section"],
            #single_node_properties [id*="_group"]:not([id*="properties_"]),
            #single_node_properties [id*="_btn"]:not([id*="properties_"]),
            #annotation_properties [id$="_section"],
            #multi_select_properties [id$="_section"],
            #link_properties [id$="_section"],
            #group_properties [id$="_section"],
            #run_execution_properties [id$="_section"]
        `);
        sectionElements.forEach(element => {
            element.style.display = 'none';
            element.classList.add('hidden');
        });
    }

    updateHeader(text) {
        const headerElement = document.getElementById('properties_header_text');
        if (headerElement) {
            headerElement.textContent = text;
        }
    }
}

window.BaseController = BaseController;
