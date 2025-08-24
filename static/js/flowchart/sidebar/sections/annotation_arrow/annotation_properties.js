class AnnotationPropertiesSection {
    constructor() {
        // no longer needs sidebar reference or DOM element
    }

    render(nodeData) {
        const strokeWidth = nodeData?.strokeWidth || 2;
        const strokeColor = nodeData?.strokeColor || 'var(--on-surface)';
        
        return `
            <div class="sidebar_section">
                <div class="section_header">
                    <span class="section_title">arrow annotation properties</span>
                </div>
                <div class="section_content">
                    <div class="form_group">
                        <label class="form_label" for="annotation_stroke_width">stroke width</label>
                        <input type="number" id="annotation_stroke_width" class="form_input" min="1" max="10" value="${strokeWidth}">
                    </div>
                    <div class="form_group">
                        <label class="form_label" for="annotation_stroke_color">stroke color</label>
                        <input type="color" id="annotation_stroke_color" class="form_input" value="${strokeColor}">
                    </div>
                </div>
            </div>
        `;
    }

    init(nodeData) {
        // add event listeners for stroke width and color changes
        const strokeWidthInput = document.getElementById('annotation_stroke_width');
        const strokeColorInput = document.getElementById('annotation_stroke_color');
        
        if (strokeWidthInput) {
            strokeWidthInput.addEventListener('input', (e) => {
                if (window.app && window.app.state && nodeData.id) {
                    window.app.state.updateAnnotation(nodeData.id, { strokeWidth: parseInt(e.target.value) || 2 });
                }
            });
        }
        
        if (strokeColorInput) {
            strokeColorInput.addEventListener('change', (e) => {
                if (window.app && window.app.state && nodeData.id) {
                    window.app.state.updateAnnotation(nodeData.id, { strokeColor: e.target.value });
                }
            });
        }
    }
}

export default AnnotationPropertiesSection;
