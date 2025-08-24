class HeaderSection {
    constructor() {
        // no longer needs sidebar reference or DOM element
    }

    render(nodeData) {
        const nodeName = nodeData?.name || 'Node';
        const nodeType = nodeData?.type || 'unknown';
        
        return `
            <div class="properties_header" id="properties_header">
                <div id="properties_header_text">${nodeType.toUpperCase()}</div>
            </div>
        `;
    }
}

export default HeaderSection;
