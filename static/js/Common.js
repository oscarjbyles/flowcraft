// common.js - consolidated initialization of core utilities and navigation for all html pages
(function() {
    'use strict';

    // initialize common components that most pages need
    function initializeCommonComponents() {
        try {
            // initialize navigation for all pages except builder
            if (window.Navigation && typeof window.Navigation.init === 'function') {
                window.Navigation.init(null);
            }
            
            // verify core utilities are available
            const coreUtils = ['EventEmitter', 'Geometry', 'Storage', 'Validation', 'URLManager', 'DropdownManager'];
            coreUtils.forEach(util => {
                if (window[util]) {
                    console.log(`✅ ${util} loaded successfully`);
                } else {
                    console.warn(`⚠️ ${util} not found`);
                }
            });
            
        } catch (error) {
            console.error('error initializing common components:', error);
        }
    }

    // auto-initialize when dom is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initializeCommonComponents);
    } else {
        initializeCommonComponents();
    }

    // export for manual initialization if needed
    window.FlowcraftCommon = {
        initializeComponents: initializeCommonComponents
    };

})();
