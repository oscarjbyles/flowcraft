// selection-driven content panels, footer actions, and node/group operations
(function(){
    if (!window.Sidebar) return;

    Sidebar.prototype.updateContent = function(selection) {
        // centralized content engine decides which panel/sections to show
            if (this.contentEngine) {
                this.contentEngine.apply(selection);
                // in run mode, also populate dynamic run view details
                if (this.state.isRunMode) {
                    this.updateRunModeNodeDetails(selection);
                    // if selecting an if→python circle, render the runtime explanation inside the run panel
                    try {
                        if (selection && selection.link) {
                            const s = this.state.getNode(selection.link.source);
                            const t = this.state.getNode(selection.link.target);
                            const isIfToPython = s && t && s.type === 'if_node' && t.type === 'python_file';
                            if (isIfToPython && typeof this.renderIfRuntimeExplainRun === 'function') {
                                this.renderIfRuntimeExplainRun(selection.link);
                            } else if (typeof this.clearIfRuntimeExplainRun === 'function') {
                                this.clearIfRuntimeExplainRun();
                            }
                        } else if (typeof this.clearIfRuntimeExplainRun === 'function') {
                            this.clearIfRuntimeExplainRun();
                        }
                    } catch (_) {}
                } else {
                const ctx = (selection.nodes && selection.nodes.length === 1)
                    ? 'single' : (selection.nodes && selection.nodes.length > 1 ? 'multi' : (selection.link ? 'link' : (selection.group ? 'group' : (selection.annotation ? 'annotation' : 'default'))));
                // call existing population helpers for non-single contexts to keep behavior
                if (ctx === 'multi') this.updateSelectedNodesList(selection.nodes);
                if (ctx === 'link') {
                    const sourceNode = selection.link && this.state.getNode(selection.link.source);
                    const targetNode = selection.link && this.state.getNode(selection.link.target);
                    const isIfToPython = sourceNode && targetNode && sourceNode.type === 'if_node' && targetNode.type === 'python_file';
                    // update header for link context
                    try {
                        const C = window.SidebarConstants;
                        const header = document.getElementById(C?.ids?.propertiesHeader || 'properties_header');
                        const headerText = document.getElementById(C?.ids?.propertiesHeaderText || 'properties_header_text');
                        if (header && headerText) {
                            const involvesIf = (sourceNode && sourceNode.type === 'if_node') || (targetNode && targetNode.type === 'if_node');
                            if (involvesIf) {
                                headerText.textContent = 'IF CONDITION';
                                header.style.display = 'block';
                            } else {
                                header.style.display = 'none';
                            }
                        }
                    } catch (_) {}
                    if (isIfToPython) this.showConnectionNodePanel(selection.link); else this.populateLinkForm(selection.link);
                }
                if (ctx === 'group' && selection.group) this.populateGroupForm(selection.group);
                if (ctx === 'annotation' && selection.annotation) this.showAnnotationPanel(selection.annotation);
            }
        }
        this.updateFooterDelete(selection);
        this.updateFooterVisibility(selection);

        // quick actions visibility handled by content engine; no-op here
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
            const C = window.SidebarConstants;
            const header = document.getElementById(C?.ids?.propertiesHeader || 'properties_header');
            const headerText = document.getElementById(C?.ids?.propertiesHeaderText || 'properties_header_text');
            if (header && headerText) {
                const typeMap = {
                    'input_node': 'INPUT NODE',
                    'python_file': 'PYTHON NODE',
                    'if_node': 'IF SPLITTER',
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
        const V = window.SidebarVisibility;
        if (!this.footerDeleteBtn) return;
        const numNodes = selection.nodes ? selection.nodes.length : 0;
        if (this.state.isRunMode && numNodes > 0) {
            if (V) V.hide(this.footerDeleteBtn); else this.footerDeleteBtn.style.display = 'none';
            return;
        }
        // hide delete for single input_node to avoid confusing ux
        if (numNodes === 1) {
            const n = this.state.getNode(selection.nodes[0]);
            if (n && n.type === 'input_node') {
                if (V) V.hide(this.footerDeleteBtn); else this.footerDeleteBtn.style.display = 'none';
                return;
            }
        }
        if (selection.link) {
            if (V) V.show(this.footerDeleteBtn, 'block'); else this.footerDeleteBtn.style.display = 'block';
            this.footerDeleteBtn.innerHTML = '<span class="material-icons delete_button_icon_1">delete</span> <span class="delete_button_text_inner">delete connection</span>';
        } else if (selection.annotation) {
            if (V) V.show(this.footerDeleteBtn, 'block'); else this.footerDeleteBtn.style.display = 'block';
            this.footerDeleteBtn.innerHTML = '<span class="material-icons delete_button_icon_1">delete</span> <span class="delete_button_text_inner">delete text</span>';
        } else if (selection.group) {
            if (V) V.show(this.footerDeleteBtn, 'block'); else this.footerDeleteBtn.style.display = 'block';
            this.footerDeleteBtn.innerHTML = '<span class="material-icons delete_button_icon_1">delete</span> <span class="delete_button_text_inner">delete group</span>';
        } else if (numNodes === 1) {
            if (V) V.show(this.footerDeleteBtn, 'block'); else this.footerDeleteBtn.style.display = 'block';
            this.footerDeleteBtn.innerHTML = '<span class="material-icons delete_button_icon_1">delete</span> <span class="delete_button_text_inner">delete node</span>';
        } else if (numNodes > 1) {
            if (V) V.show(this.footerDeleteBtn, 'block'); else this.footerDeleteBtn.style.display = 'block';
            this.footerDeleteBtn.innerHTML = `<span class="material-icons delete_button_icon_1">delete</span> <span class="delete_button_text_inner">delete ${numNodes} nodes</span>`;
        } else {
            if (V) V.hide(this.footerDeleteBtn); else this.footerDeleteBtn.style.display = 'none';
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
        const V2 = window.SidebarVisibility;
        if (V2) V2.setVisible(this.footerContainer, shouldShow, 'flex'); else this.footerContainer.style.display = shouldShow ? 'flex' : 'none';
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


