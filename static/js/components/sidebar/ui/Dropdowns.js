// shared dropdown helpers (scoped) - now using centralized DropdownManager
(function(){
    window.SidebarDropdowns = {
        // legacy methods for backward compatibility
        open(menuEl){ 
            if (menuEl) menuEl.classList.add('show'); 
        },
        close(menuEl){ 
            if (menuEl) menuEl.classList.remove('show'); 
        },
        toggle(menuEl){ 
            if (menuEl) menuEl.classList.toggle('show'); 
        },
        isOpen(menuEl){ 
            return !!(menuEl && menuEl.classList.contains('show')); 
        },

        // new centralized methods
        create(config) {
            if (!window.DropdownManager) {
                console.warn('DropdownManager not available, falling back to legacy methods');
                return null;
            }
            return window.DropdownManager.create(config);
        },

        get(containerId) {
            return window.DropdownManager ? window.DropdownManager.get(containerId) : null;
        },

        closeAll(targetElement) {
            if (window.DropdownManager) {
                window.DropdownManager.closeAllDropdowns(targetElement);
            }
        },

        destroy(containerId) {
            if (window.DropdownManager) {
                window.DropdownManager.destroy(containerId);
            }
        }
    };
})();


