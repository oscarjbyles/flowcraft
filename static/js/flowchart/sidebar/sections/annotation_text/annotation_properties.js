class AnnotationPropertiesSection {
    constructor() {
        // no longer needs sidebar reference or DOM element
    }

    render(nodeData) {
        const text = nodeData?.text || '';
        const fontSize = nodeData?.fontSize || 14;
        
        return `
            <div class="sidebar_section">
                <div class="section_header">
                    <span class="section_title">text annotation properties</span>
                </div>
                <div class="section_content">
                    <div class="form_group">
                        <label class="form_label" for="annotation_text">text content</label>
                        <textarea id="annotation_text" class="form_input" placeholder="enter annotation text" rows="3">${text}</textarea>
                    </div>
                    <div class="form_group">
                        <label class="form_label" for="annotation_font_size">font size</label>
                        <input type="number" id="annotation_font_size" class="form_input" min="8" max="72" value="${fontSize}">
                    </div>
                </div>
            </div>
        `;
    }

    init(nodeData) {
        // add event listeners for text content changes
        const textArea = document.getElementById('annotation_text');
        const fontSizeInput = document.getElementById('annotation_font_size');
        
        if (textArea) {
            textArea.addEventListener('input', (e) => {
                if (window.app && window.app.state && nodeData.id) {
                    window.app.state.updateAnnotation(nodeData.id, { text: e.target.value });
                }
            });
        }
        
        if (fontSizeInput) {
            fontSizeInput.addEventListener('input', (e) => {
                if (window.app && window.app.state && nodeData.id) {
                    window.app.state.updateAnnotation(nodeData.id, { fontSize: parseInt(e.target.value) || 14 });
                }
            });
        }
    }
}

export default AnnotationPropertiesSection;
