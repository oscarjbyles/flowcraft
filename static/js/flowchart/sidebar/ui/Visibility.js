// simple visibility helpers for consistent show/hide behavior
(function(){
    const resolve = (elOrId) => {
        if (!elOrId) return null;
        if (typeof elOrId === 'string') return document.getElementById(elOrId);
        return elOrId;
    };

    window.SidebarVisibility = {
        show(elOrId, display = '') {
            const el = resolve(elOrId);
            if (el) el.style.display = display;
        },
        hide(elOrId) {
            const el = resolve(elOrId);
            if (el) el.style.display = 'none';
        },
        setVisible(elOrId, visible, display = '') {
            const el = resolve(elOrId);
            if (!el) return;
            el.style.display = visible ? display : 'none';
        }
    };
})();


