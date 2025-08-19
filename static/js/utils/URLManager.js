// url parameter management utility
class URLManager {
    constructor() {
        this.params = new URLSearchParams(window.location.search);
        // ensure a universal mode is always present; default to build
        if (!this.params.get('mode')) {
            this.params.set('mode', 'build');
            const newSearch = this.params.toString();
            const newURL = `${window.location.pathname}${newSearch ? '?' + newSearch : ''}`;
            window.history.replaceState(null, '', newURL);
        }

        // if a flowchart reference exists in one form, normalize localstorage for consistency
        try {
            const flowParam = this.params.get('flowchart');
            const flowFileParam = this.params.get('flowchart_name');
            if (flowFileParam) {
                // prefer filename as-is
                localStorage.setItem('last_accessed_flowchart', flowFileParam);
            } else if (flowParam) {
                localStorage.setItem('last_accessed_flowchart', `${flowParam}.json`);
            }
        } catch (_) {}
    }

    /**
     * get flowchart name from url parameter
     */
    getFlowchartFromURL() {
        const flowchart = this.params.get('flowchart');
        return flowchart ? `${flowchart}.json` : null;
    }

    /**
     * get flowchart display name from url parameter
     */
    getFlowchartDisplayName() {
        return this.params.get('flowchart') || null;
    }

    /**
     * update url with current flowchart
     */
    updateFlowchartInURL(flowchartName) {
        // remove .json extension for cleaner urls
        const displayName = flowchartName.replace('.json', '');
        
        // update url parameter
        const newParams = new URLSearchParams(window.location.search);
        // preserve existing mode; default to build if missing
        const currentMode = newParams.get('mode') || 'build';
        
        // always set the flowchart param based on current selection
        newParams.set('flowchart', displayName);

        // build new url
        newParams.set('mode', currentMode);
        const newSearch = newParams.toString();
        const newURL = `${window.location.pathname}${newSearch ? '?' + newSearch : ''}`;
        
        // update browser url without page reload
        window.history.pushState({ flowchart: displayName }, '', newURL);
        
        // refresh internal params to reflect latest url
        this.params = new URLSearchParams(window.location.search);

        console.log(`[URLManager] Updated URL to flowchart: ${displayName}`);
    }

    /**
     * get current mode (always defined)
     */
    getMode() {
        return this.params.get('mode') || 'build';
    }

    /**
     * get flowchart filename from url using either 'flowchart_name' (filename) or 'flowchart' (display)
     * falls back to localstorage and finally to 'default.json'
     */
    getFlowchartFilenameFromURL() {
        const fromFile = this.params.get('flowchart_name');
        if (fromFile) return fromFile;
        const fromDisplay = this.params.get('flowchart');
        if (fromDisplay) return `${fromDisplay}.json`;
        try {
            const last = localStorage.getItem('last_accessed_flowchart');
            if (last) return last;
        } catch (_) {}
        return 'default.json';
    }

    /**
     * get flowchart display name (without .json). derives from url or localstorage
     */
    getFlowchartDisplayNamePreferred() {
        const fromDisplay = this.params.get('flowchart');
        if (fromDisplay) return fromDisplay;
        const fromFile = this.params.get('flowchart_name');
        if (fromFile) return fromFile.replace(/\.json$/i, '');
        try {
            const last = localStorage.getItem('last_accessed_flowchart');
            if (last) return last.replace(/\.json$/i, '');
        } catch (_) {}
        return 'default';
    }

    /**
     * persist last accessed filename to localstorage
     */
    setLastAccessedFlowchart(filename) {
        try { localStorage.setItem('last_accessed_flowchart', filename); } catch (_) {}
    }

    /**
     * build a url for the given path, preserving flowchart context and mode consistently across pages.
     * - dashboard, index and scripts use ?flowchart=display
     * - data matrix uses ?flowchart_name=filename
     */
    buildUrlPreserveContext(path, overrides = {}) {
        // always work with the freshest params from the current location
        this.params = new URLSearchParams(window.location.search);

        const url = new URL(path, window.location.origin);
        const mode = overrides.mode || this.getMode();
        const display = overrides.display || this.getFlowchartDisplayNamePreferred();
        const filename = overrides.filename || this.getFlowchartFilenameFromURL();

        if (url.pathname === '/data') {
            url.searchParams.set('flowchart_name', filename);
        } else if (url.pathname === '/' || url.pathname === '/scripts' || url.pathname === '/dashboard' || url.pathname === '/settings') {
            if (display && display !== 'default') url.searchParams.set('flowchart', display);
        }
        // always include mode for consistency
        if (!url.searchParams.get('mode')) url.searchParams.set('mode', mode);
        return url.pathname + (url.search ? url.search : '');
    }

    /**
     * get all url parameters
     */
    getAllParams() {
        const params = {};
        for (const [key, value] of this.params.entries()) {
            params[key] = value;
        }
        return params;
    }

    /**
     * set url parameter
     */
    setParam(key, value) {
        this.params.set(key, value);
        // always keep mode present
        if (!this.params.get('mode')) this.params.set('mode', 'build');
        this.updateURL();
    }

    /**
     * remove url parameter
     */
    removeParam(key) {
        this.params.delete(key);
        // never allow mode to be removed; restore default if removed
        if (key === 'mode') this.params.set('mode', 'build');
        this.updateURL();
    }

    /**
     * update browser url with current parameters
     */
    updateURL() {
        if (!this.params.get('mode')) this.params.set('mode', 'build');
        const newSearch = this.params.toString();
        const newURL = `${window.location.pathname}${newSearch ? '?' + newSearch : ''}`;
        window.history.replaceState(null, '', newURL);
    }

    /**
     * handle browser back/forward navigation
     */
    setupPopstateHandler(callback) {
        window.addEventListener('popstate', (event) => {
            console.log('[URLManager] Browser navigation detected');
            
            // update internal params from current url
            this.params = new URLSearchParams(window.location.search);
            
            // get flowchart from new url
            const flowchartName = this.getFlowchartFromURL();
            const displayName = this.getFlowchartDisplayName();
            
            // notify callback
            if (callback) {
                callback(flowchartName, displayName);
            }
        });
    }

    /**
     * validate flowchart name for url safety
     */
    static validateFlowchartName(name) {
        // remove .json extension
        const cleanName = name.replace('.json', '');
        
        // allow only alphanumeric, hyphens, underscores
        return /^[a-zA-Z0-9_-]+$/.test(cleanName);
    }

    /**
     * sanitize flowchart name for url
     */
    static sanitizeFlowchartName(name) {
        return name
            .replace('.json', '')
            .replace(/[^a-zA-Z0-9_-]/g, '_')
            .toLowerCase();
    }
}

window.URLManager = URLManager;