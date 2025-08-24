// scripts explorer page logic moved from template (comments kept in lower case)
(function(){
    // simple file explorer
    const tbody = document.getElementById('explorer_tbody');
    const breadcrumbEl = document.getElementById('breadcrumb');
    const btnNewFile = document.getElementById('btn_new_file');
    const btnNewFolder = document.getElementById('btn_new_folder');
    const btnUp = document.getElementById('btn_up');
    const btnDeleteSelected = document.getElementById('btn_delete_selected');
    const btnDeselectAll = document.getElementById('btn_deselect_all');

    let cwd = '';
    let selectedPaths = new Set();

    async function browse(path = ''){
        try {
            const resp = await fetch(`/api/nodes/browse?path=${encodeURIComponent(path)}`);
            const data = await resp.json();
            if (data.status === 'success'){
                cwd = data.cwd || '';
                // hide the up button when at the highest level
                if (btnUp) btnUp.style.display = cwd ? 'inline-flex' : 'none';
                renderBreadcrumb(data.breadcrumb || []);
                renderEntries(data.entries || []);
            } else {
                renderError(data.message || 'failed to browse');
            }
        } catch (_) {
            renderError('error loading directory');
        }
    }

    function renderBreadcrumb(parts){
        breadcrumbEl.innerHTML = '';
        const root = document.createElement('span');
        root.className = 'breadcrumb_item';
        root.textContent = 'nodes';
        root.onclick = () => browse('');
        breadcrumbEl.appendChild(root);
        if (!parts.length) return;
        parts.forEach((p, idx) => {
            const sep = document.createElement('span'); sep.className = 'breadcrumb_sep'; sep.textContent = '/';
            breadcrumbEl.appendChild(sep);
            const item = document.createElement('span'); item.className = 'breadcrumb_item'; item.textContent = p.name; item.onclick = () => browse(p.path);
            breadcrumbEl.appendChild(item);
        });
    }

    function renderEntries(entries){
        // update file and folder count in status bar
        const fileCountEl = document.getElementById('file_count');
        if (fileCountEl) {
            const fileCount = entries.filter(e => !e.is_dir).length;
            const folderCount = entries.filter(e => e.is_dir).length;
            fileCountEl.textContent = `files: ${fileCount}  ·  folders: ${folderCount}`;
        }
        
        if (!entries.length){
            // update file count for empty directory
            const fileCountEl = document.getElementById('file_count');
            if (fileCountEl) {
                fileCountEl.textContent = 'files: 0  ·  folders: 0';
            }
            tbody.innerHTML = `<tr><td class="explorer_td" colspan="5"><div class="empty_state">empty folder</div></td></tr>`;
            return;
        }
        tbody.innerHTML = '';
        // mix folders and files; sort alphabetically
        entries.sort((a,b) => a.name.localeCompare(b.name));
        entries.forEach(e => {
            const tr = document.createElement('tr');
            tr.className = 'explorer_row' + (e.is_dir ? ' is_dir' : '');
            // highlight flowcharts and history directories
            if (e.is_dir && (e.name === 'flowcharts' || e.name === 'history')) {
                tr.style.backgroundColor = '#091516';
            }
            const nameTd = document.createElement('td'); nameTd.className = 'explorer_td';
            const nameWrap = document.createElement('div'); nameWrap.className = 'name_cell';
            const icon = document.createElement('span'); icon.className = 'material-icons ' + (e.is_dir ? 'folder_icon' : 'file_icon'); icon.textContent = e.is_dir ? 'folder' : 'description';
            const nameSpan = document.createElement('span'); nameSpan.textContent = e.name; if (e.is_dir) nameSpan.classList.add('unselectable_text');
            nameWrap.appendChild(icon); nameWrap.appendChild(nameSpan); nameTd.appendChild(nameWrap);
            // selection checkbox
            const selTd = document.createElement('td'); selTd.className = 'explorer_td';
            const checkbox = document.createElement('input'); checkbox.type = 'checkbox'; checkbox.className = 'explorer_select_cb';
            checkbox.checked = selectedPaths.has(e.path);
            checkbox.addEventListener('change', () => {
                if (checkbox.checked) selectedPaths.add(e.path); else selectedPaths.delete(e.path);
                updateSelectionToolbarVisibility();
            });
            selTd.appendChild(checkbox);
            const typeTd = document.createElement('td'); typeTd.className = 'explorer_td'; typeTd.textContent = e.is_dir ? 'folder' : (e.ext || 'file');
            const sizeTd = document.createElement('td'); sizeTd.className = 'explorer_td'; sizeTd.textContent = e.is_dir ? '-' : formatSize(e.size);
            const modTd = document.createElement('td'); modTd.className = 'explorer_td'; modTd.textContent = e.modified_date || '';
            const actionsTd = document.createElement('td'); actionsTd.className = 'explorer_td'; actionsTd.style.textAlign = 'right';
            // edit only for files
            if (!e.is_dir){
                const editBtn = document.createElement('button'); editBtn.className = 'row_btn'; editBtn.innerHTML = '<span class="material-icons" style="font-size:16px; vertical-align:middle;">edit</span> Edit';
                editBtn.onclick = (ev) => { ev.stopPropagation(); openFile(e.path); };
                actionsTd.appendChild(editBtn);
            }
            // delete for both files and folders
            const delBtn = document.createElement('button'); delBtn.className = 'row_btn row_btn_delete'; delBtn.innerHTML = '<span class="material-icons" style="font-size:16px; vertical-align:middle;">delete</span> Delete';
            delBtn.onclick = async (ev) => { ev.stopPropagation(); await deleteFile(e.path); };
            actionsTd.appendChild(delBtn);
            tr.appendChild(nameTd); tr.appendChild(selTd); tr.appendChild(typeTd); tr.appendChild(sizeTd); tr.appendChild(modTd); tr.appendChild(actionsTd);

            tr.ondblclick = () => {
                if (e.is_dir){
                    browse(e.path);
                } else {
                    openFile(e.path);
                }
            };
            // drag and drop support
            tr.draggable = true;
            tr.addEventListener('dragstart', (ev) => {
                ev.dataTransfer.setData('text/plain', JSON.stringify({ path: e.path, is_dir: e.is_dir }));
                ev.dataTransfer.effectAllowed = 'move';
            });
            if (e.is_dir){
                tr.addEventListener('dragover', (ev) => {
                    ev.preventDefault();
                    ev.dataTransfer.dropEffect = 'move';
                });
                tr.addEventListener('drop', async (ev) => {
                    ev.preventDefault();
                    try {
                        const payload = JSON.parse(ev.dataTransfer.getData('text/plain') || '{}');
                        if (!payload.path || payload.path === e.path) return;
                        const resp = await fetch('/api/nodes/move', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ src: payload.path, dst_dir: e.path })
                        });
                        const data = await resp.json();
                        if (data.status === 'success') browse(cwd); else alert(data.message || 'failed to move');
                    } catch(_){ alert('invalid drag data'); }
                });
            }
            tbody.appendChild(tr);
        });
        updateSelectionToolbarVisibility();
    }

    function renderError(msg){
        // reset file count on error
        const fileCountEl = document.getElementById('file_count');
        if (fileCountEl) {
            fileCountEl.textContent = 'files: 0  ·  folders: 0';
        }
        tbody.innerHTML = `<tr><td class=\"explorer_td\" colspan=\"5\"><div class=\"empty_state\">${msg}</div></td></tr>`;
    }

    function parentPath(path){
        if (!path) return '';
        const parts = path.split('/').filter(Boolean);
        parts.pop();
        return parts.join('/');
    }

    function formatSize(bytes){
        if (bytes == null) return '-';
        const units = ['B','KB','MB','GB'];
        let i = 0; let size = bytes;
        while (size >= 1024 && i < units.length-1){ size /= 1024; i++; }
        return `${size.toFixed(1)} ${units[i]}`;
    }

    function openFile(relPath){
        fetch('/api/open-file', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ python_file: relPath }) });
    }

    async function deleteFile(relPath){
        if (!confirm('delete this file?')) return;
        try {
            const resp = await fetch('/api/nodes/delete', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ path: relPath })});
            const data = await resp.json();
            if (data.status === 'success') browse(cwd); else alert(data.message || 'failed to delete file');
        } catch (_){ alert('error deleting file'); }
    }

    btnUp.onclick = () => browse(parentPath(cwd));
    btnDeleteSelected.onclick = async () => {
        if (selectedPaths.size === 0) return;
        if (!confirm(`delete ${selectedPaths.size} item(s)?`)) return;
        // delete sequentially; backend supports both files/folders
        for (const p of Array.from(selectedPaths)){
            try {
                const resp = await fetch('/api/nodes/delete', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ path: p })});
                await resp.json();
            } catch(_){ /* ignore individual errors for batch */ }
        }
        selectedPaths.clear();
        browse(cwd);
    };
    btnDeselectAll.onclick = () => {
        if (selectedPaths.size === 0) return;
        selectedPaths.clear();
        // uncheck all visible checkboxes
        document.querySelectorAll('.explorer_select_cb').forEach(cb => cb.checked = false);
        updateSelectionToolbarVisibility();
    };
    btnNewFolder.onclick = async () => {
        const name = prompt('new folder name');
        if (!name) return;
        const resp = await fetch('/api/nodes/mkdir', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ path: cwd, name })});
        const data = await resp.json();
        if (data.status === 'success') browse(cwd); else alert(data.message || 'failed to create folder');
    };
    btnNewFile.onclick = async () => {
        const name = prompt('new file name (e.g., example.py)');
        if (!name) return;
        const resp = await fetch('/api/nodes/touch', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ path: cwd, name })});
        const data = await resp.json();
        if (data.status === 'success') browse(cwd); else alert(data.message || 'failed to create file');
    };

    // initial load
    browse('');

    function updateSelectionToolbarVisibility(){
        const count = selectedPaths.size;
        btnDeleteSelected.style.display = count > 0 ? 'inline-flex' : 'none';
        btnDeselectAll.style.display = count > 1 ? 'inline-flex' : 'none';
    }
})();


