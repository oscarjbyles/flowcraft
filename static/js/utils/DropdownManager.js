// centralized dropdown manager
class DropdownManager {
    constructor() {
        this.activeDropdowns = new Map();
        this.globalClickHandler = null;
        this.init();
    }

    init() {
        // setup global click handler to close dropdowns when clicking outside
        if (!this.globalClickHandler) {
            this.globalClickHandler = (e) => {
                this.closeAllDropdowns(e.target);
            };
            document.addEventListener('click', this.globalClickHandler);
        }
    }

    // create a new dropdown instance
    create(config) {

        const {
            containerId,
            inputId,
            menuId,
            arrowId = null,
            options = {}
        } = config;

        const container = document.getElementById(containerId);
        const input = document.getElementById(inputId);
        const menu = document.getElementById(menuId);
        const arrow = arrowId ? document.getElementById(arrowId) : null;

        if (!container || !input || !menu) {
            return null;
        }

        const dropdown = new DropdownInstance({
            container,
            input,
            menu,
            arrow,
            options
        });

        this.activeDropdowns.set(containerId, dropdown);
        return dropdown;
    }

    // get existing dropdown instance
    get(containerId) {
        return this.activeDropdowns.get(containerId);
    }

    // close all dropdowns except the one containing the target element
    closeAllDropdowns(targetElement) {
        this.activeDropdowns.forEach((dropdown, containerId) => {
            if (!dropdown.container.contains(targetElement)) {
                dropdown.close();
            }
        });
    }

    // close specific dropdown
    close(containerId) {
        const dropdown = this.activeDropdowns.get(containerId);
        if (dropdown) {
            dropdown.close();
        }
    }

    // destroy dropdown instance
    destroy(containerId) {
        const dropdown = this.activeDropdowns.get(containerId);
        if (dropdown) {
            dropdown.destroy();
            this.activeDropdowns.delete(containerId);
        }
    }

    // destroy all dropdowns
    destroyAll() {
        this.activeDropdowns.forEach((dropdown) => {
            dropdown.destroy();
        });
        this.activeDropdowns.clear();
    }
}

// individual dropdown instance
class DropdownInstance {
    constructor({ container, input, menu, arrow, options }) {
        this.container = container;
        this.input = input;
        this.menu = menu;
        this.arrow = arrow;
        this.options = {
            searchable: false,
            readonly: true,
            placeholder: '',
            onSelect: null,
            onOpen: null,
            onClose: null,
            renderItem: null,
            filterItems: null,
            ...options
        };

        this.items = [];
        this.filteredItems = [];
        this.selectedItem = null;
        this.isOpen = false;

        this.setupEventListeners();
        this.setupInput();
    }

    setupEventListeners() {
        // input click handler
        this.input.addEventListener('click', (e) => {
            e.stopPropagation();
            this.toggle();
        });

        // arrow click handler
        if (this.arrow) {
            this.arrow.addEventListener('click', (e) => {
                e.stopPropagation();
                this.toggle();
            });
        }

        // menu item click handler
        this.menu.addEventListener('click', (e) => {
            const item = e.target.closest('.dropdown_item');
            if (item) {
                this.selectItem(item);
            }
        });

        // keyboard navigation
        this.input.addEventListener('keydown', (e) => {
            this.handleKeyboardNavigation(e);
        });

        // search functionality
        if (this.options.searchable) {
            this.input.addEventListener('input', (e) => {
                this.filterItems(e.target.value);
            });
        }
    }

    setupInput() {
        if (this.options.readonly) {
            this.input.setAttribute('readonly', 'true');
        }
        if (this.options.placeholder) {
            this.input.placeholder = this.options.placeholder;
        }
    }

    // open dropdown
    open() {
        if (this.isOpen) return;
        
        this.menu.classList.add('show');
        this.isOpen = true;
        
        if (this.options.onOpen) {
            this.options.onOpen(this);
        }
        
        if (this.options.searchable) {
            this.input.removeAttribute('readonly');
            this.input.focus();
        }
    }

    // close dropdown
    close() {
        if (!this.isOpen) return;
        
        this.menu.classList.remove('show');
        this.isOpen = false;
        
        if (this.options.onClose) {
            this.options.onClose(this);
        }
        
        if (this.options.readonly) {
            this.input.setAttribute('readonly', 'true');
        }
    }

    // toggle dropdown
    toggle() {
        if (this.isOpen) {
            this.close();
        } else {
            this.open();
        }
    }

    // set items and render menu
    setItems(items) {
        this.items = items || [];
        this.filteredItems = [...this.items];
        this.renderMenu();
    }

    // filter items based on search term
    filterItems(searchTerm) {
        if (!this.options.filterItems) {
            // default filter
            const term = searchTerm.toLowerCase();
            this.filteredItems = this.items.filter(item => {
                const label = item.label || item.name || item.value || '';
                return label.toLowerCase().includes(term);
            });
        } else {
            this.filteredItems = this.options.filterItems(this.items, searchTerm);
        }
        this.renderMenu();
    }

    // render menu items
    renderMenu() {
        if (this.filteredItems.length === 0) {
            this.menu.innerHTML = '<div class="dropdown_no_results">no items found</div>';
            return;
        }

        const itemsHtml = this.filteredItems.map(item => {
            if (this.options.renderItem) {
                return this.options.renderItem(item);
            }
            
            // default rendering
            return `
                <div class="dropdown_item" data-value="${item.value || ''}" data-label="${item.label || item.name || ''}">
                    <div class="dropdown_item_content">
                        <div class="dropdown_item_name">${item.label || item.name || item.value}</div>
                        ${item.path ? `<div class="dropdown_item_path">${item.path}</div>` : ''}
                    </div>
                </div>
            `;
        }).join('');

        this.menu.innerHTML = itemsHtml;
    }

    // select an item
    selectItem(itemElement) {
        const value = itemElement.dataset.value;
        const label = itemElement.dataset.label;
        
        this.selectedItem = {
            value,
            label,
            element: itemElement
        };

        this.input.value = label;
        this.input.dataset.value = value;
        
        this.close();
        
        if (this.options.onSelect) {
            this.options.onSelect(this.selectedItem, this);
        }
    }

    // handle keyboard navigation
    handleKeyboardNavigation(e) {
        const items = this.menu.querySelectorAll('.dropdown_item');
        const currentIndex = Array.from(items).findIndex(item => item.classList.contains('selected'));
        
        switch (e.key) {
            case 'ArrowDown':
                e.preventDefault();
                if (!this.isOpen) {
                    this.open();
                } else {
                    const nextIndex = currentIndex < items.length - 1 ? currentIndex + 1 : 0;
                    this.highlightItem(items, nextIndex);
                }
                break;
                
            case 'ArrowUp':
                e.preventDefault();
                if (this.isOpen) {
                    const prevIndex = currentIndex > 0 ? currentIndex - 1 : items.length - 1;
                    this.highlightItem(items, prevIndex);
                }
                break;
                
            case 'Enter':
                e.preventDefault();
                if (this.isOpen) {
                    const selectedItem = this.menu.querySelector('.dropdown_item.selected');
                    if (selectedItem) {
                        this.selectItem(selectedItem);
                    }
                } else {
                    this.open();
                }
                break;
                
            case 'Escape':
                e.preventDefault();
                this.close();
                break;
        }
    }

    // highlight item for keyboard navigation
    highlightItem(items, index) {
        items.forEach(item => item.classList.remove('selected'));
        if (items[index]) {
            items[index].classList.add('selected');
            items[index].scrollIntoView({ block: 'nearest' });
        }
    }

    // get selected value
    getValue() {
        return this.input.dataset.value || '';
    }

    // get selected label
    getLabel() {
        return this.input.value || '';
    }

    // set value programmatically
    setValue(value, label) {
        this.input.value = label || '';
        this.input.dataset.value = value || '';
        this.selectedItem = { value, label };
    }

    // clear selection
    clear() {
        this.input.value = '';
        this.input.dataset.value = '';
        this.selectedItem = null;
    }

    // show loading state
    showLoading(message = 'loading...') {
        this.menu.innerHTML = `<div class="dropdown_loading">${message}</div>`;
    }

    // show error state
    showError(message = 'error loading items') {
        this.menu.innerHTML = `<div class="dropdown_no_results">${message}</div>`;
    }

    // destroy instance
    destroy() {
        this.close();
        // remove event listeners if needed
        this.input.removeEventListener('click', this.toggle);
        if (this.arrow) {
            this.arrow.removeEventListener('click', this.toggle);
        }
    }
}

// global instance
window.DropdownManager = new DropdownManager();
