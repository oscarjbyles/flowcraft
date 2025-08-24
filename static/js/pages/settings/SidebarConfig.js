// panels editor functionality for settings page
class PanelsEditor {
    constructor() {
        this.panelsData = null;
        this.originalData = null;
        this.hasChanges = false;
        this.autoSaveTimeout = null;
        this.autoSaveDelay = 1000; // 1 second delay
        
        this.initializeEditor();
    }

    // initialize the panels editor
    async initializeEditor() {
        await this.loadPanelsData();
        this.renderEditor();
        this.attachEventListeners();
    }

    // load panels data from the json file
    async loadPanelsData() {
        try {
            const response = await fetch('/static/js/flowchart/sidebar/Panels.JSON');
            const text = await response.text();
            this.panelsData = JSON.parse(text);
            this.originalData = JSON.parse(JSON.stringify(this.panelsData)); // deep copy
        } catch (error) {
            console.error('failed to load panels data:', error);
        }
    }

    // render the editor interface
    renderEditor() {
        const container = document.getElementById('panels_editor_content');
        if (!container || !this.panelsData) return;

        let html = '';

        // render build mode
        html += this.renderModeSection('build', this.panelsData.build);

        // render run mode
        html += this.renderModeSection('run', this.panelsData.run);

        container.innerHTML = html;
        
        // update button states after rendering
        setTimeout(() => {
            this.updateNodeButtonStates();
        }, 100);
    }

    // render a mode section (build or run)
    renderModeSection(modeName, modeData) {
        let html = `
            <div class="panels_mode_section" data-mode="${modeName}">
                <div class="panels_mode_title" data-action="toggle-accordion">
                    <span>${modeName.charAt(0).toUpperCase() + modeName.slice(1)}</span>
                    <span class="material-icons">expand_more</span>
                </div>
                <div class="panels_mode_content">
        `;

        // render each node type
        for (const [nodeType, nodeConfig] of Object.entries(modeData)) {
            html += this.renderNodeSection(modeName, nodeType, nodeConfig);
        }

        html += `
                </div>
            </div>
        `;
        return html;
    }

    // render a node type section
    renderNodeSection(modeName, nodeType, nodeConfig) {
        // determine if node is selectable (not set to false)
        const isSelectable = nodeConfig !== false;
        
        let html = `
            <div class="panels_node_section" data-mode="${modeName}" data-node="${nodeType}">
                <div class="panels_node_title_row">
                    <div class="panels_node_title">${nodeType}</div>
                    <div class="panels_selectable_toggle">
                        <div class="panels_toggle_switch ${isSelectable ? 'active' : ''}" 
                             data-mode="${modeName}" 
                             data-node="${nodeType}" 
                             data-property="selectable">
                        </div>
                        <span>selectable</span>
                    </div>
                    <div class="panels_node_actions">
                        <button class="panels_node_btn" data-action="move-node-up" data-mode="${modeName}" data-node="${nodeType}" title="move up">
                            <span class="material-icons">keyboard_arrow_up</span>
                        </button>
                        <button class="panels_node_btn" data-action="move-node-down" data-mode="${modeName}" data-node="${nodeType}" title="move down">
                            <span class="material-icons">keyboard_arrow_down</span>
                        </button>
                    </div>
                </div>
        `;

        // render sections array and boolean properties only if node is selectable
        if (isSelectable) {
            if (nodeConfig.section) {
                html += this.renderSectionsArray(modeName, nodeType, nodeConfig.section);
            }

            // render boolean properties side by side
            if (nodeConfig.rename !== undefined || nodeConfig.delete !== undefined) {
                html += this.renderBooleanPropertiesSideBySide(modeName, nodeType, nodeConfig);
            }
        }

        html += '</div>';
        return html;
    }

    // render sections array editor
    renderSectionsArray(modeName, nodeType, sections) {
        let html = `
            <div class="panels_property_group">
                <div class="panels_section_array" data-property="section">
        `;

        sections.forEach((section, index) => {
            html += this.renderSectionItem(modeName, nodeType, section, index);
        });

        html += `
                </div>
                <button class="panels_add_section_btn" data-mode="${modeName}" data-node="${nodeType}" data-action="add-section">
                    <span class="material-icons">add</span>
                    Add Section
                </button>
            </div>
        `;

        return html;
    }

    // render individual section item
    renderSectionItem(modeName, nodeType, section, index) {
        return `
            <div class="panels_section_item" data-index="${index}">
                <input type="text" 
                       class="panels_section_input" 
                       value="${this.escapeHtml(section)}"
                       data-mode="${modeName}" 
                       data-node="${nodeType}" 
                       data-property="section" 
                       data-index="${index}">
                <div class="panels_section_actions">
                    <button class="panels_section_btn" data-action="move-up" data-index="${index}">
                        <span class="material-icons">keyboard_arrow_up</span>
                    </button>
                    <button class="panels_section_btn" data-action="move-down" data-index="${index}">
                        <span class="material-icons">keyboard_arrow_down</span>
                    </button>
                    <button class="panels_section_btn" data-action="remove" data-index="${index}">
                        <span class="material-icons">delete</span>
                    </button>
                </div>
            </div>
        `;
    }

    // render boolean properties side by side
    renderBooleanPropertiesSideBySide(modeName, nodeType, nodeConfig) {
        return `
            <div class="panels_property_group">
                <div class="panels_boolean_properties_row">
                    ${nodeConfig.rename !== undefined ? `
                        <div class="panels_boolean_property">
                            <div class="panels_property_label">rename</div>
                            <div class="panels_boolean_toggle">
                                <div class="panels_toggle_switch ${nodeConfig.rename ? 'active' : ''}" 
                                     data-mode="${modeName}" 
                                     data-node="${nodeType}" 
                                     data-property="rename">
                                </div>
                                <span>${nodeConfig.rename ? 'enabled' : 'disabled'}</span>
                            </div>
                        </div>
                    ` : ''}
                    ${nodeConfig.delete !== undefined ? `
                        <div class="panels_boolean_property">
                            <div class="panels_property_label">delete</div>
                            <div class="panels_boolean_toggle">
                                <div class="panels_toggle_switch ${nodeConfig.delete ? 'active' : ''}" 
                                     data-mode="${modeName}" 
                                     data-node="${nodeType}" 
                                     data-property="delete">
                                </div>
                                <span>${nodeConfig.delete ? 'enabled' : 'disabled'}</span>
                            </div>
                        </div>
                    ` : ''}
                </div>
            </div>
        `;
    }

    // render boolean property toggle
    renderBooleanProperty(modeName, nodeType, propertyName, value) {
        return `
            <div class="panels_property_group">
                <div class="panels_property_label">${propertyName}</div>
                <div class="panels_boolean_toggle">
                    <div class="panels_toggle_switch ${value ? 'active' : ''}" 
                         data-mode="${modeName}" 
                         data-node="${nodeType}" 
                         data-property="${propertyName}">
                    </div>
                    <span>${value ? 'enabled' : 'disabled'}</span>
                </div>
            </div>
        `;
    }

    // attach event listeners
    attachEventListeners() {
        const container = document.getElementById('panels_editor_content');
        if (!container) return;

        // section input changes
        container.addEventListener('input', (e) => {
            if (e.target.classList.contains('panels_section_input')) {
                this.handleSectionInputChange(e.target);
            }
        });

        // section input keydown (for enter key)
        container.addEventListener('keydown', (e) => {
            if (e.target.classList.contains('panels_section_input') && e.key === 'Enter') {
                e.target.blur();
            }
        });

        // toggle switches
        container.addEventListener('click', (e) => {
            if (e.target.classList.contains('panels_toggle_switch')) {
                this.handleToggleChange(e.target);
            }
        });

        // action buttons
        container.addEventListener('click', (e) => {
            const actionElement = e.target.closest('[data-action]');
            const action = actionElement?.dataset.action;
            console.log('click event:', { target: e.target.tagName, action, actionElement });
            
            if (!action) return;

            switch (action) {
                case 'toggle-accordion':
                    this.handleToggleAccordion(e.target);
                    break;
                case 'add-section':
                    this.handleAddSection(e.target);
                    break;
                case 'remove':
                    this.handleRemoveSection(e.target);
                    break;
                case 'move-up':
                    this.handleMoveSection(e.target, 'up');
                    break;
                case 'move-down':
                    this.handleMoveSection(e.target, 'down');
                    break;
                case 'move-node-up':
                    this.handleMoveNode(e.target, 'up');
                    break;
                case 'move-node-down':
                    this.handleMoveNode(e.target, 'down');
                    break;
            }
        });


    }

    // handle accordion toggle
    handleToggleAccordion(titleElement) {
        const modeSection = titleElement.closest('.panels_mode_section');
        const content = modeSection.querySelector('.panels_mode_content');
        const isExpanded = content.classList.contains('expanded');
        
        if (isExpanded) {
            // collapse
            content.classList.remove('expanded');
            titleElement.classList.remove('expanded');
            modeSection.classList.remove('expanded');
        } else {
            // expand
            content.classList.add('expanded');
            titleElement.classList.add('expanded');
            modeSection.classList.add('expanded');
        }
    }

    // handle section input changes
    handleSectionInputChange(input) {
        const mode = input.dataset.mode;
        const node = input.dataset.node;
        const index = parseInt(input.dataset.index);
        const value = input.value.trim();

        if (this.panelsData[mode] && this.panelsData[mode][node] && this.panelsData[mode][node].section) {
            this.panelsData[mode][node].section[index] = value;
            this.scheduleAutoSave();
        }
    }

    // handle toggle changes
    handleToggleChange(toggle) {
        const mode = toggle.dataset.mode;
        const node = toggle.dataset.node;
        const property = toggle.dataset.property;
        const newValue = !toggle.classList.contains('active');

        if (this.panelsData[mode]) {
            if (property === 'selectable') {
                // handle selectable toggle specifically
                if (newValue) {
                    // turning on - restore default configuration
                    this.panelsData[mode][node] = this.getDefaultNodeConfig(mode, node);
                } else {
                    // turning off - set to false
                    this.panelsData[mode][node] = false;
                }
                
                // update toggle visual state
                toggle.classList.toggle('active', newValue);
                
                // re-render just this specific node section
                this.reRenderNodeSection(mode, node);
            } else {
                // handle other properties normally - only if node config exists and is not false
                if (this.panelsData[mode][node] && typeof this.panelsData[mode][node] === 'object') {
                    this.panelsData[mode][node][property] = newValue;
                    toggle.classList.toggle('active', newValue);
                    
                    // update the text label
                    const label = toggle.nextElementSibling;
                    if (label) {
                        label.textContent = newValue ? 'enabled' : 'disabled';
                    }
                }
            }

            this.scheduleAutoSave();
        }
    }

    // handle adding a new section
    handleAddSection(button) {
        const mode = button.dataset.mode;
        const node = button.dataset.node;

        if (this.panelsData[mode] && this.panelsData[mode][node] && this.panelsData[mode][node].section) {
            this.panelsData[mode][node].section.push('new_section');
            
            // find the section array container and add the new item
            const sectionArray = button.closest('.panels_property_group').querySelector('.panels_section_array');
            const newIndex = this.panelsData[mode][node].section.length - 1;
            const newSectionHtml = this.renderSectionItem(mode, node, 'new_section', newIndex);
            
            // insert the new section before the add button
            sectionArray.insertAdjacentHTML('beforeend', newSectionHtml);
            
            this.scheduleAutoSave();
        }
    }

    // handle removing a section
    handleRemoveSection(button) {
        const item = button.closest('.panels_section_item');
        const mode = item.querySelector('.panels_section_input').dataset.mode;
        const node = item.querySelector('.panels_section_input').dataset.node;
        const index = parseInt(item.dataset.index);

        if (this.panelsData[mode] && this.panelsData[mode][node] && this.panelsData[mode][node].section) {
            this.panelsData[mode][node].section.splice(index, 1);
            item.remove();
            this.scheduleAutoSave();
        }
    }

    // handle moving sections up/down
    handleMoveSection(button, direction) {
        const item = button.closest('.panels_section_item');
        const mode = item.querySelector('.panels_section_input').dataset.mode;
        const node = item.querySelector('.panels_section_input').dataset.node;
        const index = parseInt(item.dataset.index);

        if (this.panelsData[mode] && this.panelsData[mode][node] && this.panelsData[mode][node].section) {
            const sections = this.panelsData[mode][node].section;
            const newIndex = direction === 'up' ? index - 1 : index + 1;

            if (newIndex >= 0 && newIndex < sections.length) {
                // swap elements in data
                [sections[index], sections[newIndex]] = [sections[newIndex], sections[index]];
                
                // swap elements in DOM
                const sectionArray = item.parentElement;
                const targetItem = sectionArray.children[newIndex];
                
                if (direction === 'up') {
                    sectionArray.insertBefore(item, targetItem);
                } else {
                    sectionArray.insertBefore(item, targetItem.nextSibling);
                }
                
                this.scheduleAutoSave();
            }
        }
    }

    // handle moving nodes up/down
    handleMoveNode(button, direction) {
        console.log('handleMoveNode called:', direction);
        const nodeSection = button.closest('.panels_node_section');
        const mode = nodeSection.dataset.mode;
        const nodeType = nodeSection.dataset.node;
        const modeContent = nodeSection.closest('.panels_mode_content');
        const nodeSections = Array.from(modeContent.querySelectorAll('.panels_node_section'));
        const currentIndex = nodeSections.indexOf(nodeSection);
        const newIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;

        console.log('move node:', { mode, nodeType, currentIndex, newIndex, totalNodes: nodeSections.length });

        if (newIndex >= 0 && newIndex < nodeSections.length) {
            // get the node types in the current DOM order
            const nodeTypesInOrder = nodeSections.map(section => section.dataset.node);
            const currentNodeTypeIndex = nodeTypesInOrder.indexOf(nodeType);
            const targetNodeTypeIndex = direction === 'up' ? currentNodeTypeIndex - 1 : currentNodeTypeIndex + 1;

            console.log('node types in order:', nodeTypesInOrder);
            console.log('indices:', { currentNodeTypeIndex, targetNodeTypeIndex });

            if (targetNodeTypeIndex >= 0 && targetNodeTypeIndex < nodeTypesInOrder.length) {
                const targetNodeType = nodeTypesInOrder[targetNodeTypeIndex];
                
                console.log('swapping:', { nodeType, targetNodeType });
                
                // create a new object with reordered keys
                const originalData = this.panelsData[mode];
                const newOrderedData = {};
                
                // get all keys in the new order
                const allKeys = Object.keys(originalData);
                const keyIndex1 = allKeys.indexOf(nodeType);
                const keyIndex2 = allKeys.indexOf(targetNodeType);
                
                // reorder the keys
                allKeys.forEach((key, index) => {
                    if (index === keyIndex1) {
                        newOrderedData[targetNodeType] = originalData[targetNodeType];
                    } else if (index === keyIndex2) {
                        newOrderedData[nodeType] = originalData[nodeType];
                    } else {
                        newOrderedData[key] = originalData[key];
                    }
                });
                
                // update the data with the new order
                this.panelsData[mode] = newOrderedData;

                // swap elements in DOM
                const targetNodeSection = nodeSections[newIndex];
                
                if (direction === 'up') {
                    modeContent.insertBefore(nodeSection, targetNodeSection);
                } else {
                    modeContent.insertBefore(nodeSection, targetNodeSection.nextSibling);
                }
                
                // update button states after moving
                this.updateNodeButtonStates();
                console.log('calling scheduleAutoSave');
                this.scheduleAutoSave();
            }
        }
    }

    // update node button states (disable buttons that can't move further)
    updateNodeButtonStates() {
        const modeSections = document.querySelectorAll('.panels_mode_section');
        
        modeSections.forEach(modeSection => {
            const modeContent = modeSection.querySelector('.panels_mode_content');
            if (!modeContent) return;
            
            const nodeSections = Array.from(modeContent.querySelectorAll('.panels_node_section'));
            
            nodeSections.forEach((nodeSection, index) => {
                const upBtn = nodeSection.querySelector('[data-action="move-node-up"]');
                const downBtn = nodeSection.querySelector('[data-action="move-node-down"]');
                
                if (upBtn) {
                    upBtn.disabled = index === 0;
                }
                if (downBtn) {
                    downBtn.disabled = index === nodeSections.length - 1;
                }
            });
        });
    }





    // schedule auto save
    scheduleAutoSave() {
        console.log('scheduleAutoSave called');
        this.hasChanges = true;
        
        if (this.autoSaveTimeout) {
            clearTimeout(this.autoSaveTimeout);
        }

        this.autoSaveTimeout = setTimeout(() => {
            console.log('auto save timeout triggered, calling savePanelsData');
            this.savePanelsData();
        }, this.autoSaveDelay);
    }

    // save panels data
    async savePanelsData() {
        console.log('savePanelsData called, hasChanges:', this.hasChanges);
        if (!this.hasChanges) return;

        try {
            console.log('sending data to /api/settings/panels');
            const response = await fetch('/api/settings/panels', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(this.panelsData)
            });

            console.log('response status:', response.status);
            if (response.ok) {
                this.hasChanges = false;
                console.log('save successful');
                
                // update original data after successful save
                this.originalData = JSON.parse(JSON.stringify(this.panelsData));
            } else {
                const errorText = await response.text();
                console.error('save failed with status:', response.status, 'error:', errorText);
                throw new Error('save failed');
            }
        } catch (error) {
            console.error('failed to save panels data:', error);
        }
    }



    // re-render a specific node section
    reRenderNodeSection(mode, nodeType) {
        const nodeSection = document.querySelector(`[data-mode="${mode}"][data-node="${nodeType}"]`);
        if (nodeSection) {
            const nodeConfig = this.panelsData[mode][nodeType];
            const newHtml = this.renderNodeSection(mode, nodeType, nodeConfig);
            nodeSection.outerHTML = newHtml;
        }
    }

    // get default node configuration
    getDefaultNodeConfig(mode, nodeType) {
        // return a simple default configuration with empty sections array
        return {
            section: [],
            rename: true,
            delete: true
        };
    }

    // utility method to escape html
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

// export for use in settings page
window.PanelsEditor = PanelsEditor;
