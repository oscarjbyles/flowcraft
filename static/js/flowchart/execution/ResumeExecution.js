// resume execution module - handle execution resumption from specific nodes
(function(){
    'use strict';
    if (window.ResumeExecution) { return; }

class ResumeExecution {
    constructor(flowchartBuilder) {
        this.builder = flowchartBuilder;
        this.state = flowchartBuilder.state;
    }

    async handleResumeExecution(data) {
        const { nodeId, node } = data;
        
        // check if we're in run mode
        if (this.state.currentMode !== 'run') {
            this.builder.updateStatusBar('resume execution is only available in run mode');
            return;
        }

        // check if we're already executing
        if (this.builder.isExecuting) {
            this.builder.updateStatusBar('cannot resume - execution already in progress');
            return;
        }

        // get execution order starting from the selected node
        const executionOrder = this.builder.calculateNodeOrder();
        const resumeIndex = executionOrder.findIndex(n => n.id === nodeId);
        
        if (resumeIndex === -1) {
            this.builder.updateStatusBar('selected node not found in execution order');
            return;
        }

        // get nodes to execute (from selected node onwards)
        const nodesToExecute = executionOrder.slice(resumeIndex);
        
        if (nodesToExecute.length === 0) {
            this.builder.updateStatusBar('no nodes to execute from this point');
            return;
        }

        // get variables from previous execution (if any) - enhanced to work with both live and restored executions
        const previousVariables = this.builder.getVariablesForResume(nodeId, executionOrder);
        
        this.builder.updateStatusBar(`resuming execution from ${node.name} with ${Object.keys(previousVariables).length} variables`);
        
        // use the new resume endpoint for better variable handling
        await this.startResumeExecution(nodesToExecute, previousVariables, nodeId, true);
    }

    processResumeResults(results, nodesToExecute) {
        // process each result and update the ui
        results.forEach((result, index) => {
            const node = nodesToExecute[index];
            if (!node) return;

            // store execution result
            this.builder.nodeExecutionResults.set(result.node_id, {
                node: node,
                success: result.success,
                output: result.output || '',
                error: result.error || null,
                runtime: result.runtime || 0,
                timestamp: new Date().toLocaleTimeString(),
                return_value: result.return_value,
                function_name: result.function_name,
                function_args: result.function_args || {},
                input_values: result.input_values || {},
                input_used: false
            });

            // update visual state
            if (result.success) {
                this.builder.nodeStateManager.setNodeState(result.node_id, 'completed');
                this.builder.executionStatus.updateNodeDetails(node, 'completed', result.runtime || 0, result.output);
                
                // store variables for next nodes
                if (result.return_value !== null && result.return_value !== undefined) {
                    this.builder.variableManager.setNodeVariable(result.node_id, result.return_value);
                }
                
                // append to execution log
                this.builder.outputManager.appendToExecutionLog(`[${node.name}] executed successfully`);
                if (result.output) {
                    this.builder.outputManager.appendToExecutionLog(result.output);
                }
            } else {
                this.builder.nodeStateManager.setNodeState(result.node_id, 'error');
                this.builder.executionStatus.updateNodeDetails(node, 'error', result.runtime || 0, result.error);
                
                // append error to execution log
                this.builder.outputManager.appendToExecutionLog(`[${node.name}] failed: ${result.error}`);
            }
        });
    }

    async startResumeExecution(nodesToExecute, initialVariables, startNodeId = null, useAPI = false) {
        // create abort controller for this execution session
        this.builder.currentExecutionController = new AbortController();

        // set execution state
        this.builder.executionLogic.setExecuting(true);
        this.builder.executionLogic.setExecutionAborted(false);
        
        // update ui to show stop button and loading wheel
        this.builder.updateExecutionUI(true);

        // clear output for new execution
        this.builder.outputManager.clearOutput();
        
        // update execution status
        this.builder.executionStatus.updateExecutionStatus('running', `resuming execution: ${nodesToExecute.length} nodes`);
        
        try {
            // reset blocked branches at resume start
            this.builder.blockedNodeIds.clear();
            // clear any previous runtime condition indicators on if→python links
            try {
                const links = Array.isArray(this.state.links) ? this.state.links : [];
                links.forEach(l => {
                    const s = this.state.getNode(l.source);
                    const t = this.state.getNode(l.target);
                    if (s && t && s.type === 'if_node' && t.type === 'python_file') {
                        this.state.updateLink(l.source, l.target, { runtime_condition: null, runtime_details: null });
                    }
                });
            } catch (_) {}

            if (useAPI && startNodeId) {
                // use api-first approach for resume execution
                const fullExecutionOrder = this.builder.calculateNodeOrder().map(n => n.id);
                
                const response = await fetch('/api/resume-execution', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        flowchart_name: this.builder.getCurrentFlowchartName(),
                        start_node_id: startNodeId,
                        execution_order: fullExecutionOrder,
                        previous_variables: initialVariables
                    }),
                    signal: this.builder.currentExecutionController.signal
                });

                const result = await response.json();
                
                if (result.status === 'success') {
                    // process results and update ui
                    this.processResumeResults(result.results, nodesToExecute);
                    this.builder.executionStatus.updateExecutionStatus('completed', 'resumed execution completed successfully');
                    await this.builder.executionStatus.saveExecutionHistory('success', nodesToExecute);
                } else if (result.status === 'failed') {
                    // process partial results
                    this.processResumeResults(result.results, nodesToExecute);
                    this.builder.executionStatus.updateExecutionStatus('failed', result.message);
                    await this.builder.executionStatus.saveExecutionHistory('failed', nodesToExecute, result.message);
                } else {
                    throw new Error(result.message || 'resume execution failed');
                }
            } else {
                // execute nodes one by one with live feedback, starting with initial variables
                let currentVariables = { ...initialVariables };
                
                for (let i = 0; i < nodesToExecute.length; i++) {
                    // check if execution was stopped
                    if (this.builder.executionAborted) {
                        this.builder.executionStatus.updateExecutionStatus('stopped', 'execution stopped by user');
                        await this.builder.executionStatus.saveExecutionHistory('stopped', nodesToExecute, 'execution stopped by user');
                        return;
                    }
                    
                    const node = nodesToExecute[i];
                    const success = await this.builder.executeNodeLive(node, i + 1, nodesToExecute.length, currentVariables);
                    
                    // if node succeeded, update variables for next node
                    if (success) {
                        const result = this.builder.nodeExecutionResults.get(node.id);
                        if (result && result.return_value && typeof result.return_value === 'object') {
                            Object.assign(currentVariables, result.return_value);
                        }
                        if (node.type === 'python_file') {
                            try { await this.builder.persistDataSaveForNode(node); } catch (e) { console.warn('data_save persist failed:', e); }
                        }
                    } else {
                        // if node failed or execution was aborted, stop execution immediately
                        if (this.builder.executionAborted) {
                            this.builder.executionStatus.updateExecutionStatus('stopped', 'execution stopped by user');
                            await this.builder.executionStatus.saveExecutionHistory('stopped', nodesToExecute, 'execution stopped by user');
                        } else {
                            this.builder.executionStatus.updateExecutionStatus('failed', `execution stopped at node: ${node.name}`);
                            this.state.emit('selectionChanged', { nodes: [], link: null, group: null });
                            await this.builder.executionStatus.saveExecutionHistory('failed', nodesToExecute, `execution stopped at node: ${node.name}`);
                        }
                        return;
                    }
                }
                
                // all nodes completed successfully
                this.builder.executionStatus.updateExecutionStatus('completed', 'resumed execution completed successfully');
                await this.builder.executionStatus.saveExecutionHistory('success', nodesToExecute);
            }
            
        } catch (error) {
            if (error.name === 'AbortError') {
                this.builder.executionStatus.updateExecutionStatus('stopped', 'execution stopped by user');
                await this.builder.executionStatus.saveExecutionHistory('stopped', nodesToExecute, 'execution stopped by user');
            } else {
                this.builder.executionStatus.updateExecutionStatus('error', `execution failed: ${error.message}`);
                await this.builder.executionStatus.saveExecutionHistory('error', nodesToExecute, error.message);
            }
        } finally {
            // reset execution state
            this.builder.executionLogic.setExecuting(false);
            this.builder.updateExecutionUI(false);
        }
    }
}

window.ResumeExecution = ResumeExecution;
})();
