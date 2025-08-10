// settings-related sidebar methods
(function(){
    if (!window.Sidebar) return;

    Sidebar.prototype.initializeSettings = function() {
        // cache editor dropdown elements
        this.defaultEditorInput = document.getElementById('default_editor_input');
        this.defaultEditorDropdown = document.getElementById('default_editor_dropdown');

        if (!this.defaultEditorInput || !this.defaultEditorDropdown) return;

        // load saved preference from localstorage
        const saved = localStorage.getItem('flowcraft_default_editor');
        if (saved) {
            try {
                const parsed = JSON.parse(saved);
                this.defaultEditorInput.value = parsed.name || parsed.path || 'custom editor';
                this.defaultEditorInput.dataset.path = parsed.path || '';
            } catch (_) {}
        }

        // fetch installed editors
        this.fetchInstalledEditors();

        // open/close behavior
        this.defaultEditorInput.addEventListener('click', (e) => {
            e.stopPropagation();
            this.toggleEditorDropdown();
        });
        document.addEventListener('click', (e) => {
            const container = this.defaultEditorInput.closest('.dropdown_container');
            if (!container.contains(e.target)) {
                this.closeEditorDropdown();
            }
        });
    };

    Sidebar.prototype.fetchInstalledEditors = async function() {
        try {
            const resp = await fetch('/api/editors');
            const data = await resp.json();
            if (data.status === 'success') {
                this.renderEditorsDropdown(data.editors);
                // if no saved value, prefill first editor
                if (!this.defaultEditorInput.value && data.editors.length > 0) {
                    this.setDefaultEditor(data.editors[0]);
                }
            } else {
                this.defaultEditorDropdown.innerHTML = '<div class="dropdown_no_results">failed to detect editors</div>';
            }
        } catch (err) {
            this.defaultEditorDropdown.innerHTML = '<div class="dropdown_no_results">error detecting editors</div>';
        }
    };

    Sidebar.prototype.renderEditorsDropdown = function(editors) {
        if (!Array.isArray(editors) || editors.length === 0) {
            this.defaultEditorDropdown.innerHTML = '<div class="dropdown_no_results">no editors found</div>';
            return;
        }
        const items = editors.map(ed => `
            <div class="dropdown_item" data-name="${ed.name}" data-path="${ed.path}">
                <div class="dropdown_item_content">
                    <div class="dropdown_item_name">${ed.name}</div>
                    <div class="dropdown_item_meta" style="opacity:.7; font-size:.75rem;">${ed.path}</div>
                </div>
            </div>
        `).join('');
        this.defaultEditorDropdown.innerHTML = items;
        this.defaultEditorDropdown.querySelectorAll('.dropdown_item').forEach(item => {
            item.addEventListener('click', () => {
                this.setDefaultEditor({ name: item.dataset.name, path: item.dataset.path });
                this.closeEditorDropdown();
            });
        });
    };

    Sidebar.prototype.setDefaultEditor = function(editor) {
        this.defaultEditorInput.value = editor.name;
        this.defaultEditorInput.dataset.path = editor.path || '';
        localStorage.setItem('flowcraft_default_editor', JSON.stringify(editor));
        this.showSuccess(`default editor set to ${editor.name}`);
    };

    Sidebar.prototype.toggleEditorDropdown = function() {
        this.defaultEditorDropdown.classList.toggle('show');
    };

    Sidebar.prototype.closeEditorDropdown = function() {
        this.defaultEditorDropdown.classList.remove('show');
    };
})();


