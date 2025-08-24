class GroupNameSection {
    constructor() {
        // no longer needs sidebar reference or DOM element
    }

    render(nodeData) {
        const groupName = nodeData?.name || '';
        
        return `
            <div class="form_group">
                <label class="form_label" for="group_name">group name</label>
                <input type="text" id="group_name" class="form_input" placeholder="enter group name" value="${groupName}">
            </div>
        `;
    }
}

export default GroupNameSection;
