// centralized modal management for the application

class Modal {
    constructor(id, options = {}) {
        this.id = id;
        this.element = document.getElementById(id);
        this.options = {
            closeOnOverlayClick: true,
            closeOnEscape: true,
            autoFocus: true,
            ...options
        };
        this.isOpen = false;
        this.init();
    }

    init() {
        if (!this.element) return;
        
        // wire close button
        const closeBtn = this.element.querySelector('.modal_close, [data-modal-close]');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => this.close());
        }

        // wire overlay click
        if (this.options.closeOnOverlayClick) {
            this.element.addEventListener('click', (e) => {
                if (e.target === this.element) this.close();
            });
        }

        // wire escape key
        if (this.options.closeOnEscape) {
            document.addEventListener('keydown', (e) => {
                if (e.key === 'Escape' && this.isOpen) {
                    this.close();
                }
            });
        }
    }

    open() {
        if (!this.element) return;
        this.element.classList.add('show');
        this.isOpen = true;
        
        if (this.options.autoFocus) {
            const focusTarget = this.element.querySelector('[autofocus], input, button');
            if (focusTarget) focusTarget.focus();
        }
    }

    close() {
        if (!this.element) return;
        this.element.classList.remove('show');
        this.isOpen = false;
    }

    // static methods for common modals
    static createFlowchart() {
        return new Modal('create_flowchart_modal', {
            autoFocus: true
        });
    }

    static massiveChange() {
        return new Modal('massive_change_modal', {
            closeOnOverlayClick: false,
            closeOnEscape: false
        });
    }

    static selectPython() {
        return new Modal('select_python_modal');
    }
}

// global modal manager
window.ModalManager = {
    modals: new Map(),
    
    get(id) {
        if (!this.modals.has(id)) {
            this.modals.set(id, new Modal(id));
        }
        return this.modals.get(id);
    },
    
    open(id) {
        this.get(id).open();
    },
    
    close(id) {
        this.get(id).close();
    }
};
