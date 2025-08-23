// copy content from Sidebar.iflogic.js and Sidebar.nodes.js analysis methods
class AnalysisFunctions {
    constructor(sidebar) {
        this.sidebar = sidebar;
    }

    // normalize a python path for api calls: strip any leading 'nodes/' segments
    normalizePythonPathForApi(path) {
        try { return (path || '').replace(/\\/g, '/').replace(/^(?:nodes\/)*/i, ''); } catch (_) { return path || ''; }
    }

    // analysis of a single node's function (args/returns)
    async analyzeNodeFunction(node) {
        this.showArgumentsLoading();
        this.showReturnsLoading();
        try {
            const response = await fetch('/api/analyze-python-function', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ python_file: this.normalizePythonPathForApi(node.pythonFile) })
            });
            const result = await response.json();
            if (result.success) {
                this.populateArguments(result.formal_parameters || [], result.input_variable_names || []);
                this.populateReturns(result.returns || []);
            } else {
                this.showArgumentsError('failed to analyze function');
                this.showReturnsError('failed to analyze function');
            }
        } catch (error) {
            console.error('error analyzing node function:', error);
            this.showArgumentsError('network error');
            this.showReturnsError('network error');
        }
    }

    async analyzeIfNodeVariables(ifNode) {
        this.showIfNodeVariablesState('loading');
        const incomingLinks = this.sidebar.state.links.filter(link => link.target === ifNode.id);
        const pythonNodes = [];
        for (const link of incomingLinks) {
            const sourceNode = this.sidebar.state.getNode(link.source);
            if (sourceNode && sourceNode.pythonFile) {
                pythonNodes.push(sourceNode);
            }
        }
        if (pythonNodes.length === 0) {
            this.showIfNodeVariablesState('empty');
            return;
        }
        try {
            const allVariables = [];
            for (const pythonNode of pythonNodes) {
                const response = await fetch('/api/analyze-python-function', {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ python_file: pythonNode.pythonFile })
                });
                const data = await response.json();
                if ((data.status === 'success' || data.success === true) && data.returns && data.returns.length > 0) {
                    data.returns.forEach(returnVar => {
                        allVariables.push({
                            ...returnVar,
                            sourceNode: pythonNode.name,
                            sourceFile: pythonNode.pythonFile
                        });
                    });
                }
            }
            this.displayIfNodeVariables(allVariables);
        } catch (error) {
            console.error('error analyzing if node variables:', error);
            this.showIfNodeVariablesError('failed to connect to analysis service');
        }
    }

    // input node: populate inputs list with variable names and their line numbers from associated python script
    async populateInputNodeInputs(node) {
        if (!this._inputNodeInputsReqId) this._inputNodeInputsReqId = 0;
        const reqId = ++this._inputNodeInputsReqId;
        const loading = document.getElementById('input_node_inputs_loading');
        const content = document.getElementById('input_node_inputs_content');
        const empty = document.getElementById('input_node_inputs_empty');
        const errorDiv = document.getElementById('input_node_inputs_error');
        const errorMsg = document.getElementById('input_node_inputs_error_message');

        // reset visibility
        if (loading) loading.style.display = 'block';
        if (content) { content.style.display = 'none'; content.innerHTML = ''; }
        if (empty) empty.style.display = 'none';
        if (errorDiv) errorDiv.style.display = 'none';

        if (!node || !node.pythonFile) {
            if (loading) loading.style.display = 'none';
            if (empty) empty.style.display = 'block';
            return;
        }

        try {
            const response = await fetch('/api/analyze-python-function', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ python_file: this.normalizePythonPathForApi(node.pythonFile) })
            });
            const result = await response.json();
            if (reqId !== this._inputNodeInputsReqId) return;

            if (result.success && result.input_variable_names && result.input_variable_names.length > 0) {
                this.displayInputNodeInputs(result.input_variable_names);
            } else {
                if (loading) loading.style.display = 'none';
                if (empty) empty.style.display = 'block';
            }
        } catch (error) {
            if (reqId !== this._inputNodeInputsReqId) return;
            console.error('error analyzing input node:', error);
            if (loading) loading.style.display = 'none';
            if (errorDiv) {
                if (errorMsg) errorMsg.textContent = 'network error';
                errorDiv.style.display = 'block';
            }
        }
    }

    // data save: populate dropdown with variables from associated python node's returns
    async populateDataSaveVariables(node) {
        if (!this._dataSaveVarReqId) this._dataSaveVarReqId = 0;
        const reqId = ++this._dataSaveVarReqId;
        const dropdown = document.getElementById('data_save_variable_dropdown');
        const errorDiv = document.getElementById('data_save_variable_error');
        if (!dropdown) return;
        // clear
        dropdown.innerHTML = '<option value="">select a variable</option>';
        if (errorDiv) errorDiv.style.display = 'none';
        // compute preferred name from node.dataSource (drag payload)
        const preferredName = (() => {
            try {
                const v = node && node.dataSource && node.dataSource.variable;
                if (!v) return '';
                return v.name || (v.type === 'constant' ? String(v.value) : v.type || 'value');
            } catch (_) { return ''; }
        })();

        try {
            // find associated python node via incoming/outgoing links
            let pythonNode = null;
            const partner = this.sidebar.state.getDependencies ? null : null; // placeholder safeguard
            // search links to find a python_file connected to this data_save node
            for (const link of this.sidebar.state.links) {
                if (link.source === node.id) {
                    const n = this.sidebar.state.getNode(link.target);
                    if (n && n.type === 'python_file') { pythonNode = n; break; }
                } else if (link.target === node.id) {
                    const n = this.sidebar.state.getNode(link.source);
                    if (n && n.type === 'python_file') { pythonNode = n; break; }
                }
            }
            if (!pythonNode || !pythonNode.pythonFile) {
                if (errorDiv) { errorDiv.textContent = 'no associated python node found'; errorDiv.style.display = 'block'; }
                return;
            }
            const resp = await fetch('/api/analyze-python-function', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ python_file: this.normalizePythonPathForApi(pythonNode.pythonFile) })
            });
            const data = await resp.json();
            if (reqId !== this._dataSaveVarReqId) return;
            if (!data || data.success === false) {
                if (errorDiv) { errorDiv.textContent = (data && data.error) || 'failed to analyze python function'; errorDiv.style.display = 'block'; }
                return;
            }
            const returns = Array.isArray(data.returns) ? data.returns : [];
            if (returns.length === 0) {
                if (errorDiv) { errorDiv.textContent = 'python node has no return variables'; errorDiv.style.display = 'block'; }
                return;
            }
            const seen = new Set();
            returns.forEach((ret) => {
                const name = ret.name || (ret.type === 'constant' ? String(ret.value) : ret.type || 'value');
                if (seen.has(name)) return; seen.add(name);
                const opt = document.createElement('option');
                opt.value = name;
                opt.textContent = name;
                dropdown.appendChild(opt);
            });
            // apply prefill from drag-and-drop source
            if (preferredName && seen.has(preferredName)) {
                dropdown.value = preferredName;
            }

            // persist selection to the data_save node so downstream logic saves the correct single variable
            dropdown.onchange = async () => {
                const selectedName = dropdown.value || '';
                try {
                    const current = this.sidebar.state.getNode(node.id);
                    const origin = (current && current.dataSource && current.dataSource.origin) || 'returns';
                    const newDataSource = { origin, variable: selectedName ? { name: selectedName } : null };
                    if (this.sidebar.state.createNode) {
                        await this.sidebar.state.createNode.updateNode(node.id, { dataSource: newDataSource });
                    }
                } catch (e) {
                    console.warn('failed to update data_save selection:', e);
                }
            };
        } catch (e) {
            if (reqId !== this._dataSaveVarReqId) return;
            if (errorDiv) { errorDiv.textContent = 'network error'; errorDiv.style.display = 'block'; }
        }
    }

    // helper methods for displaying states and results
    showArgumentsLoading() {
        const V = window.SidebarVisibility;
        if (V) {
            V.show('arguments_loading', 'block');
            V.hide('arguments_content');
            V.hide('arguments_empty');
        } else {
            document.getElementById('arguments_loading').style.display = 'block';
            document.getElementById('arguments_content').style.display = 'none';
            document.getElementById('arguments_empty').style.display = 'none';
        }
    }

    showReturnsLoading() {
        const V = window.SidebarVisibility;
        if (V) {
            V.show('returns_loading', 'block');
            V.hide('returns_content');
            V.hide('returns_empty');
        } else {
            document.getElementById('returns_loading').style.display = 'block';
            document.getElementById('returns_content').style.display = 'none';
            document.getElementById('returns_empty').style.display = 'none';
        }
    }

    showArgumentsError(message) {
        const V = window.SidebarVisibility;
        if (V) V.hide('arguments_loading'); else document.getElementById('arguments_loading').style.display = 'none';
        document.getElementById('arguments_content').innerHTML = `
            <div style="text-align: center; padding: 20px; color: #f44336;">
                <span class="material-icons" style="font-size: 16px; margin-bottom: 4px;">error</span>
                <p style="font-size: 0.8em;">${message}</p>
            </div>
        `;
        document.getElementById('arguments_content').style.display = 'block';
    }

    showReturnsError(message) {
        const V = window.SidebarVisibility;
        if (V) V.hide('returns_loading'); else document.getElementById('returns_loading').style.display = 'none';
        document.getElementById('returns_content').innerHTML = `
            <div style="text-align: center; padding: 20px; color: #f44336;">
                <span class="material-icons" style="font-size: 16px; margin-bottom: 4px;">error</span>
                <p style="font-size: 0.8em;">${message}</p>
            </div>
        `;
        document.getElementById('returns_content').style.display = 'block';
    }

    populateArguments(formalParams, inputVars) {
        // implementation delegated to ArgumentsSection
        if (this.sidebar.sections && this.sidebar.sections.arguments) {
            this.sidebar.sections.arguments.populateArguments(formalParams, inputVars);
        }
    }

    populateReturns(returns) {
        // implementation delegated to ReturnsSection
        if (this.sidebar.sections && this.sidebar.sections.returns) {
            this.sidebar.sections.returns.populateReturns(returns);
        }
    }

    showIfNodeVariablesState(state) {
        // implementation for if node variables state management
        const loading = document.getElementById('if_node_variables_loading');
        const content = document.getElementById('if_node_variables_content');
        const empty = document.getElementById('if_node_variables_empty');

        if (state === 'loading') {
            if (loading) loading.style.display = 'block';
            if (content) content.style.display = 'none';
            if (empty) empty.style.display = 'none';
        } else if (state === 'empty') {
            if (loading) loading.style.display = 'none';
            if (content) content.style.display = 'none';
            if (empty) empty.style.display = 'block';
        }
    }

    showIfNodeVariablesError(message) {
        const loading = document.getElementById('if_node_variables_loading');
        const content = document.getElementById('if_node_variables_content');
        if (loading) loading.style.display = 'none';
        if (content) {
            content.innerHTML = `
                <div style="text-align: center; padding: 20px; color: #f44336;">
                    <span class="material-icons" style="font-size: 16px; margin-bottom: 4px;">error</span>
                    <p style="font-size: 0.8em;">${message}</p>
                </div>
            `;
            content.style.display = 'block';
        }
    }

    displayIfNodeVariables(variables) {
        // implementation for displaying if node variables
        const content = document.getElementById('if_node_variables_content');
        const loading = document.getElementById('if_node_variables_loading');
        if (loading) loading.style.display = 'none';
        if (content) {
            content.innerHTML = '';
            variables.forEach(variable => {
                const item = document.createElement('div');
                item.style.cssText = `
                    background: var(--surface-color);
                    border: 1px solid var(--border-color);
                    border-radius: 4px;
                    padding: 8px 10px;
                    margin-bottom: 4px;
                    display: flex;
                    align-items: center;
                    gap: 8px;
                `;
                item.innerHTML = `
                    <span class="material-icons" style="font-size: 16px; color: #4caf50;">label</span>
                    <span style="font-family: monospace; font-weight: 500;">${variable.name || 'unknown'}</span>
                    <span style="font-size: 0.75rem; opacity: 0.7; margin-left: auto;">from ${variable.sourceNode}</span>
                `;
                content.appendChild(item);
            });
            content.style.display = 'block';
        }
    }

    displayInputNodeInputs(inputs) {
        const content = document.getElementById('input_node_inputs_content');
        const loading = document.getElementById('input_node_inputs_loading');
        if (loading) loading.style.display = 'none';
        if (content) {
            content.innerHTML = '';
            inputs.forEach(input => {
                const item = document.createElement('div');
                item.style.cssText = `
                    background: var(--surface-color);
                    border: 1px solid var(--border-color);
                    border-radius: 4px;
                    padding: 8px 10px;
                    margin-bottom: 4px;
                    display: flex;
                    align-items: center;
                    gap: 8px;
                `;
                item.innerHTML = `
                    <span class="material-icons" style="font-size: 16px; color: #2196f3;">keyboard</span>
                    <span style="font-family: monospace; font-weight: 500;">${input}</span>
                    <span style="font-size: 0.75rem; opacity: 0.7; margin-left: auto;">input variable</span>
                `;
                content.appendChild(item);
            });
            content.style.display = 'block';
        }
    }
}

window.AnalysisFunctions = AnalysisFunctions;
