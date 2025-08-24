// unified sidebar class that handles both sidebar logic and content management
class Sidebar {

    constructor(stateManager, createNode) {

        this.state = stateManager;
        this.createNode = createNode;
        this.currentContent = null;
        this.contentContainer = document.getElementById('properties_sidebar');

        // setup event listeners
        this.setupEventListeners();

    }

    setupEventListeners() {

        // single event listener for selection changes
        this.state.on('selectionChanged', (selection) => {
            this.handleSelectionChange(selection);
        });

    }

    handleSelectionChange(selection) {

        // determine mode and node type
        const mode = this.state.isRunMode ? 'run' : 'build';
        const nodeType = this.getNodeType(selection);

        // get node data if single node selected
        let nodeData = null;
        if (selection.nodes && selection.nodes.length === 1) {
            const nodeId = selection.nodes[0];
            nodeData = this.createNode.getNode(nodeId);
        }

        // render content
        this.renderContent(mode, nodeType, nodeData);

    }

    getNodeType(selection) {

        // simplified type determination
        if (selection.annotation) return 'annotation';
        if (selection.link) return 'link';
        if (selection.group || (selection.nodes && selection.nodes.length > 1)) return 'group';
        if (selection.nodes && selection.nodes.length === 1) {
            const nodeId = selection.nodes[0];
            const node = this.createNode.getNode(nodeId);
            return node ? node.type : 'default';
        }
        return 'default';

    }

    // main entry point - called by sidebar when selection changes
    async renderContent(mode, nodeType, nodeData) {

        console.log(`[sidebar] rendering ${mode} mode for ${nodeType} node`);

        // clear existing content
        try {
            this.clearContent();
            console.log('success: clearing sidebar');
        } catch (error) {
            console.log('error: clearing sidebar -', error.message);
        }

        console.log('GETRENDERER');
        console.log('mode:', mode);
        console.log('node type:', nodeType);

        const response = await fetch('/static/js/flowchart/sidebar/Panels.JSON');
        const panelsData = await response.json();
        console.log('panels data loaded:', panelsData);

        const sectionsConfig = panelsData[mode][nodeType];
        console.log('sections config loaded:', sectionsConfig);

        let sidebarContent = '';

        // 1. compile header
        try {
            const headerModule = await import('./common/Header.js');
            const HeaderSection = headerModule.default;
            const headerSection = new HeaderSection();
            // ensure nodeData has the type property
            const headerData = { ...nodeData, type: nodeType };
            sidebarContent += headerSection.render(headerData);
            console.log('sidebarContent length (after header loaded):', sidebarContent.length);
        } catch (error) {
            console.error('failed to load header section:', error);
            sidebarContent += `<div class="section_error">failed to load header section</div>`;
        }

        // build sidebar content
        sidebarContent += '<div class="sidebar_content">';

        // 2. add the rename node button first if configured to show rename
        if (nodeData && sectionsConfig.rename) {
            try {
                const renameModule = await import('./common/Rename.js');
                const RenameSection = renameModule.default;
                const renameSection = new RenameSection();
                sidebarContent += renameSection.render(nodeData);
                console.log('sidebarContent length (after rename section loaded):', sidebarContent.length);
                
                // initialize the rename section after content is injected
                setTimeout(() => {
                    renameSection.init(nodeData);
                }, 0);
            } catch (error) {
                console.error('failed to load rename section:', error);
                sidebarContent += `<div class="section_error">failed to load rename section</div>`;
            }
        }
        
        // 3. call all functions defined in the section array from the JSON file
        for (const sectionName of sectionsConfig.section) {
            try {
                // dynamically import the section script based on node type and section name
                const scriptPath = `./sections/${nodeType}/${sectionName}.js`;
                const module = await import(scriptPath);
                
                // get the default export (the section class)
                const SectionClass = module.default;
                
                // create instance and render
                const sectionInstance = new SectionClass();
                sidebarContent += sectionInstance.render(nodeData);
                
            } catch (error) {
                console.error(`failed to load section ${sectionName} for node type ${nodeType}:`, error);
                // fallback: add error message to sidebar
                sidebarContent += `<div class="section_error">failed to load section: ${sectionName}</div>`;
            }
        }

        console.log('sidebarContent length (after sections loaded):', sidebarContent.length);
        
        // 4. add the delete node button if configured to show delete
        if (nodeData && sectionsConfig.delete) {
            try {
                const deleteButtonModule = await import('./common/DeleteButton.js');
                const DeleteButtonSection = deleteButtonModule.default;
                const deleteButtonSection = new DeleteButtonSection();
                sidebarContent += deleteButtonSection.render(nodeData);
                console.log('sidebarContent length (after delete button loaded):', sidebarContent.length);
            } catch (error) {
                console.error('failed to load delete button section:', error);
                sidebarContent += `<div class="section_error">failed to load delete button section</div>`;
            }
        }

        sidebarContent += '</div>';
        
        // 4. inject into the sidebar
        console.log('final sidebar content length:', sidebarContent.length);
        console.log('contentContainer exists:', !!this.contentContainer);
        if (this.contentContainer) {
            this.contentContainer.innerHTML = sidebarContent;
            console.log('content injected successfully');
        } else {
            console.error('contentContainer not found - cannot inject content');
        }
        
    }

    clearContent() {
        if (this.contentContainer) {
            this.contentContainer.innerHTML = '<div class="sidebar_content"></div>';
        }
    }

    showDefaultContent() {
        if (this.contentContainer) {
            this.contentContainer.innerHTML = `
                <div class="sidebar_content">
                    <div style="text-align: center; padding: 40px 20px; color: var(--on-surface); opacity: 0.7;">
                        <span class="material-icons" style="font-size: 48px; margin-bottom: 16px;">info</span>
                        <p>select nodes to view properties</p>
                    </div>
                </div>
            `;
        }
    }

    setCollapsed(isCollapsed) {
        const propertiesSidebar = document.getElementById('properties_sidebar');
        const mainContent = document.querySelector('.main_content');
        const runFeedBar = document.getElementById('run_feed_bar');
        const startButtonContainer = document.getElementById('start_button_container');
        const sidebarToggleContainer = document.getElementById('sidebar_toggle_container');
        const toggleSidebarBtn = document.getElementById('toggle_sidebar_btn');

        if (!propertiesSidebar) return;

        if (isCollapsed) {
            propertiesSidebar.classList.add('collapsed');
            propertiesSidebar.style.display = 'none';
            if (mainContent) mainContent.classList.add('sidebar_collapsed');
            if (runFeedBar) {
                runFeedBar.classList.add('sidebar_collapsed');
                if (runFeedBar.getAttribute('data-run-mode') === 'true') {
                    if (window.flowchartApp?.toolbars?.setRunFeedBarDisplay) {
                        window.flowchartApp.toolbars.setRunFeedBarDisplay('flex');
                    } else {
                        runFeedBar.style.display = 'flex';
                    }
                }
            }
            if (startButtonContainer) startButtonContainer.classList.add('sidebar_collapsed');
            if (sidebarToggleContainer) sidebarToggleContainer.classList.add('sidebar_collapsed');
            if (toggleSidebarBtn) {
                toggleSidebarBtn.title = 'show properties';
                toggleSidebarBtn.innerHTML = '<span class="material-icons">chevron_left</span>';
            }
        } else {
            propertiesSidebar.classList.remove('collapsed');
            propertiesSidebar.style.display = 'flex';
            if (mainContent) mainContent.classList.remove('sidebar_collapsed');
            if (runFeedBar) {
                runFeedBar.classList.remove('sidebar_collapsed');
                if (runFeedBar.getAttribute('data-run-mode') === 'true') {
                    if (window.flowchartApp?.toolbars?.setRunFeedBarDisplay) {
                        window.flowchartApp.toolbars.setRunFeedBarDisplay('flex');
                    } else {
                        runFeedBar.style.display = 'flex';
                    }
                }
            }
            if (startButtonContainer) startButtonContainer.classList.remove('sidebar_collapsed');
            if (sidebarToggleContainer) sidebarToggleContainer.classList.remove('sidebar_collapsed');
            if (toggleSidebarBtn) {
                toggleSidebarBtn.title = 'hide properties';
                toggleSidebarBtn.innerHTML = '<span class="material-icons">chevron_right</span>';
            }
        }
    }
}

window.Sidebar = Sidebar;
