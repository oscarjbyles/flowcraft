// url and history handlers for flowchart switching
(function(){
    if (!window.Sidebar) return;

    Sidebar.prototype.setupURLHandlers = function() {
        this.urlManager.setupPopstateHandler(async (flowchartName, displayName) => {
            console.log(`[Sidebar] URL changed to flowchart: ${flowchartName} (${displayName})`);
            const flowchartExists = this.flowcharts.some(f => f.filename === flowchartName);
            if (flowchartExists) {
                await this.state.save(true);
                this.state.storage.setCurrentFlowchart(flowchartName);
                const result = await this.state.load();
                if (result.success) {
                    this.setCurrentFlowchart(displayName);
                    this.showSuccess(`switched to flowchart: ${displayName}`);
                }
            } else {
                this.state.storage.setCurrentFlowchart('default.json');
                this.setCurrentFlowchart('default');
                this.urlManager.updateFlowchartInURL('default.json');
            }
        });
    };
})();


