// selection-driven content panels, footer actions, and node/group operations
(function(){
    if (!window.Sidebar) return;

    Sidebar.prototype.updateContent = function(selection) {
        if (this.state.isRunMode && this.contentPanels.execution.classList.contains('active')) {
            this.updateRunModeNodeDetails(selection);
            this.updateFooterDelete(selection);
            this.updateFooterVisibility(selection);
            return;
        }
        
        this.hideAllPanels();

        if (selection.annotation) {
            this.showAnnotationPanel(selection.annotation);
        } else if (selection.nodes.length === 1) {
            this.showSingleNodePanel(selection.nodes[0]);
        } else if (selection.nodes.length > 1) {
            this.showMultiSelectPanel(selection.nodes);
        } else if (selection.link) {
            this.showLinkPanel(selection.link);
        } else if (selection.group) {
            this.showGroupPanel(selection.group);
        } else {
            this.showDefaultPanel();
        }

        // show/hide properties header based on selection
        try {
            const header = document.getElementById('properties_header');
            if (header) {
                const show = selection.nodes && selection.nodes.length === 1;
                header.style.display = show ? 'block' : 'none';
            }
        } catch (_) {}
        this.updateFooterDelete(selection);
        this.updateFooterVisibility(selection);

        const quickBtn = document.getElementById('add_if_condition_btn');
        if (quickBtn) {
            const one = selection.nodes.length === 1 ? this.state.getNode(selection.nodes[0]) : null;
            let hasIf = false;
            if (one && one.type === 'python_file') {
                hasIf = !!this.state.getAssociatedIfForPython(one.id);
            }
            quickBtn.style.display = (one && one.type === 'python_file' && !this.state.isRunMode && !hasIf) ? 'flex' : 'none';
        }
    };

    Sidebar.prototype.handleAddIfCondition = function() {
        const selected = Array.from(this.state.selectedNodes);
        if (selected.length !== 1) return;
        const py = this.state.getNode(selected[0]);
        if (!py || py.type !== 'python_file') return;

        if (this.state.getAssociatedIfForPython(py.id)) {
            this.state.emit('statusUpdate', 'warning: this python node already has an if condition');
            return;
        }

        const pyHeight = 60;
        const ifHeight = 60;
        const gap = 20;
        const ifNode = this.state.addNode({
            x: py.x,
            y: py.y + pyHeight / 2 + gap + ifHeight / 2,
            name: 'if condition',
            type: 'if_node'
        });

        try { this.state.addLink(py.id, ifNode.id); } catch (_) {}
        this.state.setMagnetPair(ifNode.id, py.id);
        this.state.selectNode(ifNode.id);
        this.state.emit('statusUpdate', '+ if condition added');
    };

    Sidebar.prototype.showAnnotationPanel = function(annotation) {
        this.currentView = 'annotation';
        const panel = this.contentPanels.annotation;
        if (!panel) return;
        panel.classList.add('active');
        const input = document.getElementById('annotation_text_input');
        if (input) {
            input.value = annotation.text || '';
            input.oninput = () => {
                this.state.updateAnnotation(annotation.id, { text: input.value });
            };
        }
        const fontSizeInput = document.getElementById('annotation_font_size_input');
        if (fontSizeInput) {
            const currentSize = parseInt(annotation.fontSize || 14, 10);
            fontSizeInput.value = !Number.isNaN(currentSize) ? currentSize : 14;
            fontSizeInput.oninput = () => {
                const size = parseInt(fontSizeInput.value, 10);
                if (!Number.isNaN(size)) {
                    this.state.updateAnnotation(annotation.id, { fontSize: size });
                }
            };
        }
        if (this.footerDeleteBtn) {
            this.footerDeleteBtn.style.display = 'block';
            this.footerDeleteBtn.innerHTML = '<span class="material-icons delete_button_icon_1">delete</span> <span class="delete_button_text_inner">delete text</span>';
        }
    };

    Sidebar.prototype.showSingleNodePanel = function(nodeId) {
        const node = this.state.getNode(nodeId);
        if (!node) return;
        this.currentView = 'single';
        if (this.propertiesTitle) {
            this.propertiesTitle.textContent = 'node properties';
        }
        this.contentPanels.single.classList.add('active');
        // update properties header text
        try {
            const header = document.getElementById('properties_header');
            const headerText = document.getElementById('properties_header_text');
            if (header && headerText) {
                const typeMap = {
                    'input_node': 'INPUT NODE',
                    'python_file': 'PYTHON NODE',
                    'if_node': 'IF CONIDITION',
                    'data_save': 'DATA SAVE'
                };
                const displayType = typeMap[node.type] || String(node.type || '').replace(/_/g, ' ');
                headerText.textContent = (displayType || '').toUpperCase();
                header.style.display = 'block';
            }
        } catch (_) {}
        this.populateNodeForm(node);
        if (this.state.isRunMode) {
            if (this.footerDeleteBtn) this.footerDeleteBtn.style.display = 'none';
            this.updateFooterVisibility({ nodes: [], link: null, group: null });
        } else {
            this.updateFooterDelete({ nodes: [nodeId], link: null, group: null });
        }
    };

    Sidebar.prototype.showMultiSelectPanel = function(nodeIds) {
        this.currentView = 'multi';
        if (this.propertiesTitle) {
            this.propertiesTitle.textContent = `${nodeIds.length} nodes selected`;
        }
        this.contentPanels.multi.classList.add('active');
        this.updateSelectedNodesList(nodeIds);
        if (this.state.isRunMode) {
            if (this.footerDeleteBtn) this.footerDeleteBtn.style.display = 'none';
            this.updateFooterVisibility({ nodes: [], link: null, group: null });
        } else {
            this.updateFooterDelete({ nodes: nodeIds, link: null, group: null });
        }
    };

    Sidebar.prototype.showLinkPanel = function(link) {
        this.currentView = 'link';
        if (this.propertiesTitle) {
            this.propertiesTitle.textContent = 'connection properties';
        }
        this.contentPanels.link.classList.add('active');
        const sourceNode = this.state.getNode(link.source);
        const targetNode = this.state.getNode(link.target);
        const isIfToPythonConnection = sourceNode && targetNode && 
            sourceNode.type === 'if_node' && 
            targetNode.type === 'python_file';
        if (isIfToPythonConnection) {
            this.showConnectionNodePanel(link);
        } else {
            this.populateLinkForm(link);
        }
        this.updateFooterDelete({ nodes: [], link, group: null });
    };

    Sidebar.prototype.showGroupPanel = function(group) {
        this.currentView = 'group';
        if (this.propertiesTitle) {
            this.propertiesTitle.textContent = 'group properties';
        }
        this.contentPanels.group.classList.add('active');
        this.populateGroupForm(group);
        this.updateFooterDelete({ nodes: [], link: null, group });
    };

    Sidebar.prototype.updateFooterDelete = function(selection) {
        if (!this.footerDeleteBtn) return;
        const numNodes = selection.nodes ? selection.nodes.length : 0;
        if (this.state.isRunMode && numNodes > 0) {
            this.footerDeleteBtn.style.display = 'none';
            return;
        }
        if (selection.link) {
            this.footerDeleteBtn.style.display = 'block';
            this.footerDeleteBtn.innerHTML = '<span class="material-icons delete_button_icon_1">delete</span> <span class="delete_button_text_inner">delete connection</span>';
        } else if (selection.annotation) {
            this.footerDeleteBtn.style.display = 'block';
            this.footerDeleteBtn.innerHTML = '<span class="material-icons delete_button_icon_1">delete</span> <span class="delete_button_text_inner">delete text</span>';
        } else if (selection.group) {
            this.footerDeleteBtn.style.display = 'block';
            this.footerDeleteBtn.innerHTML = '<span class="material-icons delete_button_icon_1">delete</span> <span class="delete_button_text_inner">delete group</span>';
        } else if (numNodes === 1) {
            this.footerDeleteBtn.style.display = 'block';
            this.footerDeleteBtn.innerHTML = '<span class="material-icons delete_button_icon_1">delete</span> <span class="delete_button_text_inner">delete node</span>';
        } else if (numNodes > 1) {
            this.footerDeleteBtn.style.display = 'block';
            this.footerDeleteBtn.innerHTML = `<span class="material-icons delete_button_icon_1">delete</span> <span class="delete_button_text_inner">delete ${numNodes} nodes</span>`;
        } else {
            this.footerDeleteBtn.style.display = 'none';
        }
    };

    Sidebar.prototype.updateFooterVisibility = function(selection) {
        if (!this.footerContainer) return;
        let shouldShow = false;
        if (this.footerDeleteBtn) {
            shouldShow = this.footerDeleteBtn.style.display !== 'none';
        } else {
            const hasAnySelection = (selection.nodes && selection.nodes.length > 0) || selection.link || selection.group;
            shouldShow = !!hasAnySelection;
        }
        this.footerContainer.style.display = shouldShow ? 'flex' : 'none';
    };

    Sidebar.prototype.handleFooterDelete = function() {
        const selectedNodes = Array.from(this.state.selectedNodes);
        if (this.state.isRunMode && selectedNodes.length > 0) {
            this.showError('cannot delete nodes in run mode');
            return;
        }
        if (this.state.selectedLink) {
            this.state.removeLink(this.state.selectedLink.source, this.state.selectedLink.target);
            this.showSuccess('connection deleted');
            return;
        }
        if (this.state.selectedAnnotation) {
            const id = this.state.selectedAnnotation.id;
            this.state.removeAnnotation(id);
            this.showSuccess('deleted text');
            return;
        }
        if (this.state.selectedGroup) {
            const name = this.state.selectedGroup.name;
            this.state.removeGroup(this.state.selectedGroup.id);
            this.showSuccess(`deleted group: ${name}`);
            return;
        }
        if (selectedNodes.length === 1) {
            const node = this.state.getNode(selectedNodes[0]);
            this.state.removeNode(selectedNodes[0]);
            this.showSuccess(`deleted node: ${node.name}`);
            return;
        }
        if (selectedNodes.length > 1) {
            let deletedCount = 0;
            let inputNodeAttempts = 0;
            selectedNodes.forEach(nodeId => {
                const n = this.state.getNode(nodeId);
                if (n && n.type === 'input_node') {
                    inputNodeAttempts++;
                } else {
                    const success = this.state.removeNode(nodeId);
                    if (success) deletedCount++;
                }
            });
            if (inputNodeAttempts > 0 && deletedCount === 0) {
                this.showError('input nodes cannot be deleted directly');
            } else if (inputNodeAttempts > 0 && deletedCount > 0) {
                this.showWarning(`deleted ${deletedCount} node(s) - input nodes cannot be deleted directly`);
            } else if (deletedCount > 0) {
                this.showSuccess(`deleted ${deletedCount} node(s)`);
            }
        }
    };
})();


