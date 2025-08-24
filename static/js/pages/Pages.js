class DynamicScriptLoader {
    constructor(folderPath) {
        this.folderPath = folderPath;
        this.loadedScripts = new Set();
    }

    async loadAllScripts() {
        const files = await this.getJsFiles();
        const loadPromises = files.map(file => this.loadScript(file));
        await Promise.all(loadPromises);
        return files;
    }

    async getJsFiles() {
        const path = this.folderPath.replace('/static/', '');
        const response = await fetch(`/api/directory-listing?path=${encodeURIComponent(path)}`);
        const data = await response.json();
        
        if (data.status === 'success') {
            return data.files.map(file => `${this.folderPath}${file}`);
        }
        
        return [];
    }

    async loadScript(scriptPath) {
        if (this.loadedScripts.has(scriptPath)) return;
        
        return new Promise((resolve) => {
            const script = document.createElement('script');
            script.src = scriptPath;
            script.onload = () => {
                this.loadedScripts.add(scriptPath);
                resolve();
            };
            script.onerror = resolve;
            document.head.appendChild(script);
        });
    }
}

if (typeof window !== 'undefined') {
    window.DynamicScriptLoader = DynamicScriptLoader;
}
