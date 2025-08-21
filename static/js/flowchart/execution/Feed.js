// execution feed handler
(function(){
    'use strict';
    if (window.ExecutionFeed) { return; }

class ExecutionFeed {
    constructor(stateManager) {
        this.state = stateManager;
        // live feed for persistence: array of { node_id, node_name, started_at, finished_at, success, lines: [{text, ts}] }
        this.executionFeed = [];
    }

    // clear internal execution feed data
    clear() {
        this.executionFeed = [];
        // clear bottom live feed ui
        const list = document.getElementById('run_feed_list');
        if (list) {
            list.innerHTML = '';
            // add placeholder when list is empty
            const placeholder = document.createElement('div');
            placeholder.id = 'run_feed_placeholder';
            placeholder.className = 'run_feed_placeholder';
            placeholder.textContent = 'waiting for execution';
            list.appendChild(placeholder);
        }
    }

    // create a feed entry for a node when execution starts
    createNodeEntry(node) {
        try {
            const existing = this.executionFeed.find(e => e.node_id === node.id && !e.finished_at);
            if (!existing) {
                this.executionFeed.push({
                    node_id: node.id,
                    node_name: node.name,
                    started_at: new Date().toISOString(),
                    finished_at: null,
                    success: null,
                    lines: []
                });
            }
        } catch (_) {}
    }

    // add a line to the execution feed for a node
    addLine(node, line) {
        try {
            // persist line into execution feed
            let entry = this.executionFeed.find(e => e.node_id === node.id && !e.finished_at);
            if (!entry) {
                entry = {
                    node_id: node.id,
                    node_name: node.name,
                    started_at: new Date().toISOString(),
                    finished_at: null,
                    success: null,
                    lines: []
                };
                this.executionFeed.push(entry);
            }
            // avoid duplicating any identical line text already present in this entry
            const hasTextAlready = entry.lines.some(l => (l && typeof l.text === 'string') ? l.text === line : false);
            if (!hasTextAlready) {
                entry.lines.push({ text: line, ts: new Date().toISOString() });
            }
        } catch (_) {}

        // update ui
        this.updateLiveFeedUI(node, line);
    }

    // update the live feed ui with a new line
    updateLiveFeedUI(node, line) {
        const list = document.getElementById('run_feed_list');
        if (list) {
            // reuse or create a current running item for this node
            const runningId = `run_feed_running_${node.id}`;
            let item = document.getElementById(runningId);
            if (!item) {
                item = document.createElement('div');
                item.id = runningId;
                item.className = 'run_feed_item';
                const title = document.createElement('div');
                title.className = 'run_feed_item_title';
                title.textContent = node.name;
                const outCol = document.createElement('div');
                outCol.className = 'run_feed_output';
                const metaCol = document.createElement('div');
                metaCol.className = 'run_feed_meta';
                metaCol.textContent = 'running...';
                item.appendChild(title);
                item.appendChild(outCol);
                item.appendChild(metaCol);
                list.appendChild(item);
                // remove placeholder if present since we now have content
                const placeholder = document.getElementById('run_feed_placeholder');
                if (placeholder && placeholder.parentElement === list) {
                    placeholder.remove();
                }
            }
            const outCol = item.children[1];
            if (outCol) {
                const lineDiv = document.createElement('div');
                lineDiv.className = 'run_feed_line';
                lineDiv.textContent = line;
                outCol.appendChild(lineDiv);
                list.scrollTop = list.scrollHeight;
            }
        }
    }

    // finalize a node's execution in the feed
    finalizeNode(node, result, startTime) {
        // update the feed entry
        try {
            let entry = this.executionFeed.find(e => e.node_id === node.id && !e.finished_at);
            if (entry) {
                const finishedAt = new Date();
                const elapsedMs = Math.max(0, finishedAt.getTime() - startTime);
                entry.finished_at = finishedAt.toISOString();
                entry.success = !!result.success;
                entry.elapsed_ms = elapsedMs;
            }
        } catch (_) {}

        // update ui
        this.finalizeNodeUI(node, result, startTime);
    }

    // finalize a node's execution in the ui
    finalizeNodeUI(node, result, startTime) {
        const list = document.getElementById('run_feed_list');
        if (list) {
            const runningId = `run_feed_running_${node.id}`;
            // if a running item exists, finalize it; otherwise create a new completed item
            let item = document.getElementById(runningId);
            if (item) {
                item.classList.add(result.success ? 'success' : 'error');
                const metaCol = item.children[2];
                if (metaCol) {
                    const finishedAt = new Date();
                    const elapsedMs = Math.max(0, finishedAt.getTime() - startTime);
                    const elapsedSec = (elapsedMs / 1000).toFixed(3);
                    metaCol.textContent = `${finishedAt.toLocaleTimeString()}  ·  ${elapsedSec}s`;
                }
                item.removeAttribute('id');
            } else {
                item = document.createElement('div');
                item.className = 'run_feed_item ' + (result.success ? 'success' : 'error');
                const title = document.createElement('div');
                title.className = 'run_feed_item_title';
                title.textContent = node.name;
                const outCol = document.createElement('div');
                outCol.className = 'run_feed_output';
                // strip embedded result blocks from non-streamed output
                let errorDisplay = result.error || '';
                if (result.error_line && result.error_line > 0 && !/^\s*line\s+\d+\s*:/i.test(errorDisplay)) {
                    errorDisplay = `Line ${result.error_line}: ${errorDisplay}`;
                }
                const sanitized = ((result.output || '') + (errorDisplay ? `\n${errorDisplay}` : ''))
                    .replace(/__RESULT_START__[\s\S]*?__RESULT_END__/g, '')
                    .trim();
                const lines = sanitized.split(/\r?\n/);
                lines.filter(Boolean).forEach(l => {
                    const lineDiv = document.createElement('div');
                    lineDiv.className = 'run_feed_line';
                    lineDiv.textContent = l;
                    outCol.appendChild(lineDiv);
                });
                const metaCol = document.createElement('div');
                metaCol.className = 'run_feed_meta';
                const finishedAt = new Date();
                const elapsedMs = Math.max(0, finishedAt.getTime() - startTime);
                const elapsedSec = (elapsedMs / 1000).toFixed(3);
                metaCol.textContent = `${finishedAt.toLocaleTimeString()}  ·  ${elapsedSec}s`;
                item.appendChild(title);
                item.appendChild(outCol);
                item.appendChild(metaCol);
                list.appendChild(item);
            }
            const bar = document.getElementById('run_feed_bar');
            if (bar) bar.scrollTop = bar.scrollHeight;
            // if we created a completed item, ensure placeholder is removed
            try {
                const listEl = document.getElementById('run_feed_list');
                const placeholder = document.getElementById('run_feed_placeholder');
                if (listEl && placeholder && placeholder.parentElement === listEl) {
                    placeholder.remove();
                }
            } catch (_) {}
        }
    }

    // scroll the feed to show a specific node
    scrollToNode(nodeId) {
        // find a running or completed feed item for this node and scroll it into view
        const list = document.getElementById('run_feed_list');
        if (!list) return;
        // prefer the running item id if present
        const running = document.getElementById(`run_feed_running_${nodeId}`);
        const match = running || Array.from(list.children).find(el => {
            try {
                const title = el.querySelector('.run_feed_item_title');
                if (!title) return false;
                // compare by name from state to avoid relying on node_name text differences
                const node = this.state.getNode(nodeId);
                return node && title.textContent === node.name;
            } catch (_) { return false; }
        });
        if (match) {
            match.scrollIntoView({ behavior: 'smooth', block: 'start' });
        } else if (list && list.lastElementChild) {
            // fallback: scroll to bottom
            list.lastElementChild.scrollIntoView({ behavior: 'smooth', block: 'end' });
        }
    }

    // sanitize feed to ensure no duplicate entries or line texts per node before saving history
    sanitizeFeed() {
        return Array.isArray(this.executionFeed) ? (() => {
            // first, remove duplicate entries for the same node (keep the latest one)
            const nodeEntries = new Map();
            this.executionFeed.forEach(entry => {
                if (entry && entry.node_id) {
                    const existing = nodeEntries.get(entry.node_id);
                    if (!existing || (entry.finished_at && !existing.finished_at) || 
                        (entry.finished_at && existing.finished_at && entry.finished_at > existing.finished_at)) {
                        nodeEntries.set(entry.node_id, entry);
                    }
                }
            });
            
            // then sanitize lines within each entry
            return Array.from(nodeEntries.values()).map(entry => {
                const seen = new Set();
                const uniqueLines = [];
                (entry.lines || []).forEach(l => {
                    const t = (l && typeof l.text === 'string') ? l.text.trim() : '';
                    if (!t || seen.has(t)) return;
                    seen.add(t);
                    uniqueLines.push({ text: t, ts: l.ts || new Date().toISOString() });
                });
                return { ...entry, lines: uniqueLines };
            });
        })() : [];
    }

    // restore the bottom live feed from saved history when viewing
    displayHistoryExecutionResults(executionData) {
        try {
            const list = document.getElementById('run_feed_list');
            if (list) {
                list.innerHTML = '';
                const feed = Array.isArray(executionData.feed) ? executionData.feed : [];
                // prefer per-node runtimes saved in results; fallback to elapsed_ms from feed
                const resultsArr = Array.isArray(executionData.results) ? executionData.results : [];
                const runtimeById = new Map();
                try {
                    resultsArr.forEach(r => {
                        const ms = parseInt(r && r.runtime != null ? r.runtime : 0, 10);
                        if (!isNaN(ms)) runtimeById.set(r.node_id, ms);
                    });
                } catch (_) {}
                feed.forEach(entry => {
                    const item = document.createElement('div');
                    item.className = 'run_feed_item ' + (entry.success ? 'success' : (entry.success === false ? 'error' : ''));
                    const title = document.createElement('div');
                    title.className = 'run_feed_item_title';
                    title.textContent = entry.node_name;
                    const outCol = document.createElement('div');
                    outCol.className = 'run_feed_output';
                    (entry.lines || []).forEach(line => {
                        const lineDiv = document.createElement('div');
                        lineDiv.className = 'run_feed_line';
                        lineDiv.textContent = line.text;
                        outCol.appendChild(lineDiv);
                    });
                    const metaCol = document.createElement('div');
                    metaCol.className = 'run_feed_meta';
                    // restore both time and duration; prefer saved node runtime, fallback to elapsed from feed
                    try {
                        const tsIso = entry.finished_at || entry.started_at || '';
                        const dt = tsIso ? new Date(tsIso) : null;
                        const timeStr = (dt && !isNaN(dt.getTime())) ? dt.toLocaleTimeString() : ((tsIso || '').replace('T',' ').split('.')[0]);
                        const rtMs = runtimeById.has(entry.node_id) ? runtimeById.get(entry.node_id) : null;
                        let secText = '';
                        if (typeof rtMs === 'number' && !isNaN(rtMs) && rtMs >= 0) {
                            secText = `${(rtMs / 1000).toFixed(3)}s`;
                        } else if (typeof entry.elapsed_ms === 'number') {
                            secText = `${(entry.elapsed_ms / 1000).toFixed(3)}s`;
                        }
                        metaCol.textContent = secText ? `${timeStr}  ·  ${secText}` : timeStr;
                    } catch (_) {
                        metaCol.textContent = (entry.finished_at || entry.started_at || '').replace('T', ' ').split('.')[0];
                    }
                    item.appendChild(title);
                    item.appendChild(outCol);
                    item.appendChild(metaCol);
                    list.appendChild(item);
                });
            }
        } catch (_) {}
    }

    // get the current feed data
    getFeed() {
        return this.executionFeed;
    }

    // set the feed data (for restoration)
    setFeed(feed) {
        this.executionFeed = Array.isArray(feed) ? feed : [];
    }
}

window.ExecutionFeed = ExecutionFeed;
})();
