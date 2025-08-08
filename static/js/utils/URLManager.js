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
    }

    /**
     * get flowchart name from url parameter
     */
    getFlowchartFromURL() {
        const flowchart = this.params.get('flowchart');
        return flowchart ? `${flowchart}.json` : 'default.json';
    }

    /**
     * get flowchart display name from url parameter
     */
    getFlowchartDisplayName() {
        return this.params.get('flowchart') || 'default';
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
        
        if (displayName === 'default') {
            // remove parameter for default flowchart to keep url clean
            newParams.delete('flowchart');
        } else {
            newParams.set('flowchart', displayName);
        }

        // build new url
        newParams.set('mode', currentMode);
        const newSearch = newParams.toString();
        const newURL = `${window.location.pathname}${newSearch ? '?' + newSearch : ''}`;
        
        // update browser url without page reload
        window.history.pushState({ flowchart: displayName }, '', newURL);
        
        console.log(`[URLManager] Updated URL to flowchart: ${displayName}`);
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