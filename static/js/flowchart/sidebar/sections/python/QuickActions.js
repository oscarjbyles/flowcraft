class QuickActionsSection extends BaseSection {
    constructor(sidebar) {
        super(sidebar);
        this.element = document.getElementById('python_quick_actions');
    }

    render(node) {
        if (this.element) {
            const shouldShow = this.shouldShowQuickActions(node);
            this.element.style.display = shouldShow ? '' : 'none';
        }
    }

    shouldShowQuickActions(node) {
        const state = this.sidebar.state;
        let alreadyHasIf = false;
        let hasUpstreamIf = false;
        let hasDownstreamIf = false;

        try {
            if (state && state.createNode && typeof state.createNode.getAssociatedIfForPython === 'function') {
                alreadyHasIf = !!state.createNode.getAssociatedIfForPython(node.id);
            }
            if (state && state.createNode && typeof state.createNode.hasUpstreamIfSplitter === 'function') {
                hasUpstreamIf = state.createNode.hasUpstreamIfSplitter(node.id);
            }
            if (state && state.createNode && typeof state.createNode.hasDownstreamIfSplitter === 'function') {
                hasDownstreamIf = state.createNode.hasDownstreamIfSplitter(node.id);
            }
        } catch (_) {
            alreadyHasIf = false;
            hasUpstreamIf = false;
            hasDownstreamIf = false;
        }

        return !state.isRunMode && !alreadyHasIf && hasUpstreamIf && !hasDownstreamIf;
    }
}
