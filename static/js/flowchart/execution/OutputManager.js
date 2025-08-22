// output manager for console output and logging
(function(){
    'use strict';
    if (window.OutputManager) { return; }

class OutputManager {
    constructor(app) {
        this.app = app;
        this.globalExecutionLog = ''; // overall execution log
    }

    appendOutput(text) {
        // add to global execution log
        this.globalExecutionLog += text + '\n';
        
        // only update the console display if no specific node is selected
        // or if we're not in run mode with a node selection
        const selectedNodes = this.app.state.selectionHandler ? Array.from(this.app.state.selectionHandler.selectedNodes) : [];
        const isRunMode = this.app.state.currentMode === 'run';
        
        if (!isRunMode || selectedNodes.length !== 1) {
            const consoleLog = document.getElementById('console_output_log');
            if (consoleLog) {
                consoleLog.textContent = this.globalExecutionLog;
                consoleLog.scrollTop = consoleLog.scrollHeight;
            }
        }
    }
    
    showGlobalExecutionLog() {
        // show the complete execution log in console output
        const consoleLog = document.getElementById('console_output_log');
        if (consoleLog) {
            consoleLog.textContent = this.globalExecutionLog || 'no execution output yet';
            consoleLog.scrollTop = consoleLog.scrollHeight;
        }
    }

    appendToExecutionLog(message) {
        // append a line to the global execution log and update the console view
        try {
            const text = (typeof message === 'string') ? message : JSON.stringify(message);
            if (this.globalExecutionLog && this.globalExecutionLog.length > 0) {
                this.globalExecutionLog += `\n${text}`;
            } else {
                this.globalExecutionLog = text;
            }
            this.showGlobalExecutionLog();
        } catch (_) {
            // best-effort fallback without breaking execution
            this.globalExecutionLog += `\n${String(message)}`;
            this.showGlobalExecutionLog();
        }
    }

    clearOutput() {
        // clear the separate output sections
        const nodeInputContent = document.getElementById('node_input_content');
        const nodeOutputContent = document.getElementById('node_output_content');
        const consoleContent = document.getElementById('console_output_log');
        
        if (nodeInputContent) {
            nodeInputContent.textContent = 'output cleared';
        }
        if (nodeOutputContent) {
            nodeOutputContent.textContent = 'output cleared';
        }
        if (consoleContent) {
            consoleContent.textContent = 'output cleared';
        }
        
        // clear global execution log
        this.globalExecutionLog = '';
        
        // clear all node execution results
        if (this.app.nodeExecutionResults) {
            this.app.nodeExecutionResults.clear();
        }
        // also clear execution logic data
        if (this.app.executionLogic) {
            this.app.executionLogic.nodeExecutionResults.clear();
        }
        // clear variable manager data
        if (this.app.variableManager) {
            this.app.variableManager.clearVariables();
        }
        
        // trigger sidebar update to reflect cleared state
        this.app.state.emit('updateSidebar');
    }

    formatNodeOutput(output) {
        if (!output || typeof output !== 'string') {
            return '';
        }
        
        // split output into lines and try to identify variables
        const lines = output.trim().split('\n');
        const formattedParts = [];
        
        for (let line of lines) {
            line = line.trim();
            if (!line) continue;
            
            // check if line looks like a variable assignment output (simple heuristic)
            // this is a basic implementation - could be enhanced with more sophisticated parsing
            if (this.looksLikeVariableOutput(line)) {
                formattedParts.push(this.formatVariableOutput(line));
            } else {
                // treat as regular output
                formattedParts.push(this.formatRegularOutput(line));
            }
        }
        
        return formattedParts.join('');
    }
    
    looksLikeVariableOutput(line) {
        // simple heuristics to detect if this might be variable output
        // look for common patterns like:
        // - simple values (numbers, strings)
        // - array-like structures [1, 2, 3]
        // - object-like structures
        
        // for now, let's assume single values and arrays
        const trimmed = line.trim();
        
        // check for array-like output
        if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
            return true;
        }
        
        // check for simple values (numbers, quoted strings)
        if (/^[\d.-]+$/.test(trimmed) || /^['"].*['"]$/.test(trimmed)) {
            return true;
        }
        
        // check for boolean values
        if (trimmed === 'True' || trimmed === 'False' || trimmed === 'None') {
            return true;
        }
        
        return false;
    }
    
    formatVariableOutput(line) {
        const trimmed = line.trim();
        
        // try to determine a better title based on the content
        let title = 'Output';
        
        // check if it's an array
        if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
            title = this.inferArrayTitle(trimmed);
            return this.formatArrayVariable(title, trimmed);
        } else {
            title = this.inferValueTitle(trimmed);
            return this.formatStringVariable(title, trimmed);
        }
    }
    
    inferArrayTitle(arrayStr) {
        try {
            const content = arrayStr.slice(1, -1).trim();
            if (!content) return 'Empty Array';
            
            const elements = content.split(',').map(item => item.trim());
            const firstElement = elements[0].replace(/^['"]|['"]$/g, '');
            
            // check if all elements are numbers
            if (elements.every(el => /^[\d.-]+$/.test(el.trim()))) {
                return 'Number Array';
            }
            
            // check if all elements are strings (quoted)
            if (elements.every(el => /^['"].*['"]$/.test(el.trim()))) {
                return 'String Array';
            }
            
            return 'Mixed Array';
        } catch (e) {
            return 'Array';
        }
    }
    
    inferValueTitle(value) {
        const trimmed = value.trim();
        
        // check for specific value types
        if (/^[\d.-]+$/.test(trimmed)) {
            return 'Number Value';
        }
        
        if (/^['"].*['"]$/.test(trimmed)) {
            return 'String Value';
        }
        
        if (trimmed === 'True' || trimmed === 'False') {
            return 'Boolean Value';
        }
        
        if (trimmed === 'None') {
            return 'None Value';
        }
        
        return 'Output Value';
    }
    
    formatStringVariable(title, value) {
        return `
            <div style="margin-bottom: 8px;">
                <div style="font-size: 0.9em; font-weight: 500; color: var(--primary); margin-bottom: 4px;">
                    ${title}
                </div>
                <div style="
                    background: var(--surface-variant);
                    border: 1px solid var(--outline);
                    border-radius: 6px;
                    padding: 8px 12px;
                    font-family: 'Courier New', monospace;
                    font-size: 0.85em;
                    color: var(--on-surface);
                    word-break: break-all;
                ">
                    ${this.escapeHtml(value)}
                </div>
            </div>
        `;
    }
    
    formatArrayVariable(title, arrayStr) {
        // parse the array string to get individual elements
        let elements = [];
        try {
            // simple parsing - remove brackets and split by comma
            const content = arrayStr.slice(1, -1).trim();
            if (content) {
                elements = content.split(',').map(item => item.trim().replace(/^['"]|['"]$/g, ''));
            }
        } catch (e) {
            // fallback to showing the raw string
            return this.formatStringVariable(title, arrayStr);
        }
        
        const elementBoxes = elements.map(element => `
            <div style="
                background: var(--surface-variant);
                border: 1px solid var(--outline);
                border-radius: 4px;
                padding: 6px 10px;
                margin: 2px;
                display: inline-block;
                font-family: 'Courier New', monospace;
                font-size: 0.8em;
                color: var(--on-surface);
            ">
                ${this.escapeHtml(element)}
            </div>
        `).join('');
        
        return `
            <div style="margin-bottom: 8px;">
                <div style="font-size: 0.9em; font-weight: 500; color: var(--primary); margin-bottom: 4px;">
                    ${title} (${elements.length} items)
                </div>
                <div style="
                    background: var(--surface);
                    border: 1px solid var(--outline);
                    border-radius: 6px;
                    padding: 8px;
                    display: flex;
                    flex-wrap: wrap;
                    gap: 2px;
                ">
                    ${elementBoxes || '<em style="opacity: 0.7;">empty array</em>'}
                </div>
            </div>
        `;
    }
    
    formatRegularOutput(line) {
        return `
            <div style="margin-bottom: 8px;">
                <div style="font-size: 0.9em; font-weight: 500; color: var(--on-surface); opacity: 0.8; margin-bottom: 4px;">
                    Console Output
                </div>
                <div style="
                    background: var(--surface-variant);
                    border-left: 3px solid var(--secondary);
                    padding: 8px 12px;
                    font-family: 'Courier New', monospace;
                    font-size: 0.85em;
                    color: var(--on-surface);
                    border-radius: 0 6px 6px 0;
                    opacity: 0.9;
                ">
                    ${this.escapeHtml(line)}
                </div>
            </div>
        `;
    }
    
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

window.OutputManager = OutputManager;
})();
