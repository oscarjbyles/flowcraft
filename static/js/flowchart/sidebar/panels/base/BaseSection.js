class BaseSection {
    constructor(sidebar) {
        this.sidebar = sidebar;
    }

    render(data) {
        throw new Error('render method must be implemented');
    }

    show() {
        if (this.element) {
            this.element.style.display = '';
        }
    }

    hide() {
        if (this.element) {
            this.element.style.display = 'none';
        }
    }

    update(data) {
        this.render(data);
    }
}

window.BaseSection = BaseSection;
