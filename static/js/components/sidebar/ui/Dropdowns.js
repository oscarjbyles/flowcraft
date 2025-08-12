// shared dropdown helpers (scoped)
(function(){
    window.SidebarDropdowns = {
        open(menuEl){ if (menuEl) menuEl.classList.add('show'); },
        close(menuEl){ if (menuEl) menuEl.classList.remove('show'); },
        toggle(menuEl){ if (menuEl) menuEl.classList.toggle('show'); },
        isOpen(menuEl){ return !!(menuEl && menuEl.classList.contains('show')); }
    };
})();


