class FileInfoSection {
    constructor() {
        // no longer needs sidebar reference or DOM element
    }

    render(nodeData) {
        const pythonFile = nodeData?.pythonFile || '';
        const fileName = pythonFile ? pythonFile.replace(/^(?:nodes\/)*/i, '') : 'No file selected';
        
        return `
            <div class="form_group">
                <label class="form_label">python file</label>
                <div class="file_info_display" style="padding: 8px; background: var(--surface-variant); border-radius: 4px; font-family: monospace; font-size: 0.9em;">
                    ${fileName}
                </div>
            </div>
        `;
    }
}

window.FileInfoSection = FileInfoSection;
