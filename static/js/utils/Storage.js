// data persistence utility
class Storage {
    constructor(apiEndpoint = '/api/flowchart') {
        this.apiEndpoint = apiEndpoint;
        // initial value will be determined by url or last accessed
        this.currentFlowchart = null;
    }

    /**
     * set current flowchart name
     */
    setCurrentFlowchart(flowchartName) {
        this.currentFlowchart = flowchartName;
        try {
            localStorage.setItem('last_accessed_flowchart', flowchartName);
        } catch (_) {}
    }

    /**
     * get current flowchart name
     */
    getCurrentFlowchart() {
        if (this.currentFlowchart) return this.currentFlowchart;
        try {
            const last = localStorage.getItem('last_accessed_flowchart');
            if (last) {
                this.currentFlowchart = last;
                return last;
            }
        } catch (_) {}
        return null;
    }

    /**
     * save flowchart data to server
     */
    async save(data, isAutosave = false) {
        try {
            const saveData = {
                ...data,
                flowchart_name: this.currentFlowchart
            };

            // console.log(`[Storage] Saving to flowchart: ${this.currentFlowchart}`, {
            //     isAutosave,
            //     nodeCount: data.nodes?.length || 0,
            //     linkCount: data.links?.length || 0,
            //     groupCount: data.groups?.length || 0
            // });

            const response = await fetch(this.apiEndpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(saveData)
            });

            if (response.ok) {
                // console.log(`[Storage] Successfully saved to ${this.currentFlowchart}`);
                return { success: true, message: isAutosave ? null : 'flowchart saved successfully' };
            } else {
                console.error(`[Storage] Failed to save to ${this.currentFlowchart}:`, response.status);
                return { success: false, message: 'error saving flowchart' };
            }
        } catch (error) {
            console.error('error saving flowchart:', error);
            return { success: false, message: 'error saving flowchart' };
        }
    }

    /**
     * best-effort save used during page exit/navigation
     * tries sendbeacon first, falls back to fetch with keepalive
     */
    saveOnExit(data) {
        try {
            const saveData = {
                ...data,
                flowchart_name: this.currentFlowchart
            };

            const payload = JSON.stringify(saveData);

            // prefer sendbeacon for reliability on tab close/navigation
            if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
                const blob = new Blob([payload], { type: 'application/json' });
                return navigator.sendBeacon(this.apiEndpoint, blob);
            }

            // fallback: use fetch with keepalive
            if (typeof fetch === 'function') {
                fetch(this.apiEndpoint, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: payload,
                    keepalive: true
                }).catch(() => {});
                return true;
            }

            return false;
        } catch (_) {
            return false;
        }
    }

    /**
     * load flowchart data from server
     */
    async load(flowchartName = null) {
        try {
            const name = flowchartName || this.currentFlowchart;
            const url = `${this.apiEndpoint}?name=${encodeURIComponent(name)}`;
            
            const response = await fetch(url);
            if (response.ok) {
                const data = await response.json();
                return { 
                    success: true, 
                    data: {
                        nodes: data.nodes || [],
                        links: data.links || [],
                        groups: data.groups || [],
                        annotations: data.annotations || []
                    },
                    message: 'flowchart loaded successfully'
                };
            } else {
                return { success: false, message: 'error loading flowchart' };
            }
        } catch (error) {
            console.error('error loading flowchart:', error);
            return { success: false, message: 'error loading flowchart' };
        }
    }

    /**
     * get list of available flowcharts
     */
    async listFlowcharts() {
        try {
            const response = await fetch('/api/flowcharts');
            if (response.ok) {
                const data = await response.json();
                return {
                    success: true,
                    flowcharts: data.flowcharts || [],
                    message: 'flowcharts loaded successfully'
                };
            } else {
                return { success: false, message: 'error loading flowcharts' };
            }
        } catch (error) {
            console.error('error loading flowcharts:', error);
            return { success: false, message: 'error loading flowcharts' };
        }
    }

    /**
     * create new flowchart
     */
    async createFlowchart(name) {
        try {
            const response = await fetch('/api/flowcharts', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ name })
            });

            const data = await response.json();
            
            if (response.ok) {
                return {
                    success: true,
                    flowchart: data.flowchart,
                    message: data.message
                };
            } else {
                return {
                    success: false,
                    message: data.message || 'error creating flowchart'
                };
            }
        } catch (error) {
            console.error('error creating flowchart:', error);
            return { success: false, message: 'error creating flowchart' };
        }
    }

    /**
     * delete flowchart
     */
    async deleteFlowchart(filename) {
        try {
            const response = await fetch(`/api/flowcharts/${encodeURIComponent(filename)}`, {
                method: 'DELETE'
            });

            const data = await response.json();
            
            if (response.ok) {
                return {
                    success: true,
                    message: data.message
                };
            } else {
                return {
                    success: false,
                    message: data.message || 'error deleting flowchart'
                };
            }
        } catch (error) {
            console.error('error deleting flowchart:', error);
            return { success: false, message: 'error deleting flowchart' };
        }
    }

    /**
     * export flowchart data as json
     */
    exportAsJson(data) {
        const jsonString = JSON.stringify(data, null, 2);
        const blob = new Blob([jsonString], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = 'flowchart.json';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    /**
     * import flowchart data from json file
     */
    importFromJson(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const data = JSON.parse(e.target.result);
                    resolve(data);
                } catch (error) {
                    reject(new Error('invalid json file'));
                }
            };
            reader.onerror = () => reject(new Error('failed to read file'));
            reader.readAsText(file);
        });
    }
}

window.Storage = Storage;