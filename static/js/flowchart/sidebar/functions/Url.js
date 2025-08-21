// url and history handlers for flowchart switching
(function(){
    if (!window.Sidebar) return;

    Sidebar.prototype.setupURLHandlers = function() {
        this.urlManager.setupPopstateHandler(async (flowchartName, displayName) => {
            console.log(`[Sidebar] URL changed to flowchart: ${flowchartName} (${displayName})`);
            const flowchartExists = this.flowcharts.some(f => f.filename === flowchartName);
            if (flowchartExists) {
                // check if we're in run, build, or settings mode and clear execution output if needed
                const currentMode = this.state.currentMode || 'build';
                if (currentMode === 'run' || currentMode === 'build' || currentMode === 'settings') {
                    try {
                        if (window.flowchartApp && typeof window.flowchartApp.clearRunModeState === 'function') {
                            window.flowchartApp.clearRunModeState();
                        }
                    } catch (clearError) {
                        console.warn('[sidebar-url] failed to clear execution state:', clearError);
                    }
                }
                
                await this.state.save(true);
                this.state.storage.setCurrentFlowchart(flowchartName);
                this.urlManager.setLastAccessedFlowchart(flowchartName);
                const result = await this.state.load();
                if (result.success) {
                    this.setCurrentFlowchart(displayName || flowchartName.replace('.json',''));
                    this.showSuccess(`switched to flowchart: ${displayName}`);
                }
            } else {
                // if url points to a missing flowchart, switch to newest or last accessed
                try {
                    const last = localStorage.getItem('last_accessed_flowchart');
                    if (last && this.flowcharts.some(f => f.filename === last)) {
                        await this.selectFlowchart(last, last.replace('.json',''));
                        return;
                    }
                } catch (_) {}
                if (this.flowcharts.length > 0) {
                    const newest = this.flowcharts[0];
                    await this.selectFlowchart(newest.filename, newest.name);
                }
            }
        });
    };
})();
