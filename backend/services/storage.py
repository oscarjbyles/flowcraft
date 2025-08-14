import json
import os
from flask import current_app
from datetime import datetime
from typing import Any, Dict, List

# note: this module centralizes filesystem access for flowcharts and history.

def _flowcharts_dir() -> str:
    try:
        return current_app.config.get('FLOWCRAFT_FLOWCHARTS_DIR', 'flowcharts')
    except Exception:
        return 'flowcharts'


def _history_dir() -> str:
    try:
        return current_app.config.get('FLOWCRAFT_HISTORY_DIR', 'history')
    except Exception:
        return 'history'
DEFAULT_FLOWCHART = 'default.json'

# keep only a limited number of execution summaries in the flowchart file to avoid bloat
MAX_EXECUTION_SUMMARIES = 200
def _backups_root_dir() -> str:
    try:
        # keep backups under root/flowcharts/backups/
        base = current_app.config.get('FLOWCRAFT_FLOWCHARTS_DIR', 'flowcharts')
    except Exception:
        base = 'flowcharts'
    backups = os.path.join(base, 'backups')
    if not os.path.exists(backups):
        os.makedirs(backups)
    return backups


def _backup_dir_for(flowchart_name: str) -> str:
    if flowchart_name.endswith('.json'):
        flowchart_name = flowchart_name[:-5]
    root = _backups_root_dir()
    path = os.path.join(root, flowchart_name)
    if not os.path.exists(path):
        os.makedirs(path)
    return path


def write_backup_snapshot(flowchart_name: str, data: Dict[str, Any]) -> str:
    """write a timestamped backup snapshot for the given flowchart and return path"""
    backup_dir = _backup_dir_for(flowchart_name)
    ts = datetime.now().strftime('%Y%m%dT%H%M%S')
    filename = f"{ts}.json"
    path = os.path.join(backup_dir, filename)
    try:
        with open(path, 'w') as f:
            json.dump(data, f, indent=2)
        # prune old backups; keep only the most recent 50 per flowchart
        try:
            prune_backups(flowchart_name, keep=50)
        except Exception:
            pass
        return path
    except Exception:
        return ''


def get_latest_backup_path(flowchart_name: str) -> str:
    """return the latest backup file path for a flowchart, or empty string if none"""
    backup_dir = _backup_dir_for(flowchart_name)
    try:
        entries = [fn for fn in os.listdir(backup_dir) if fn.endswith('.json')]
        if not entries:
            return ''
        # filenames are timestamped sortable
        entries.sort(reverse=True)
        return os.path.join(backup_dir, entries[0])
    except Exception:
        return ''


def restore_latest_backup(flowchart_name: str) -> Dict[str, Any]:
    """restore the latest backup into the active flowchart file; return restored data or {}"""
    latest = get_latest_backup_path(flowchart_name)
    if not latest or not os.path.exists(latest):
        return {}
    try:
        # copy bytes to ensure exact restore
        import shutil
        target_path = get_flowchart_path(flowchart_name)
        shutil.copyfile(latest, target_path)
        # load and return restored json
        with open(target_path, 'r') as f:
            return json.load(f)
    except Exception:
        return {}


def prune_backups(flowchart_name: str, keep: int = 50) -> int:
    """delete older backup files, keeping only the newest `keep` entries; returns the number deleted"""
    backup_dir = _backup_dir_for(flowchart_name)
    try:
        files = [fn for fn in os.listdir(backup_dir) if fn.endswith('.json')]
        if len(files) <= keep:
            return 0
        files.sort(reverse=True)  # newest first (timestamped filenames)
        to_delete = files[keep:]
        deleted = 0
        for fn in to_delete:
            try:
                os.remove(os.path.join(backup_dir, fn))
                deleted += 1
            except Exception:
                # continue on errors to avoid interrupting the main flow
                pass
        return deleted
    except Exception:
        return 0
    try:
        with open(latest, 'r') as f:
            data = json.load(f)
        # write to active flowchart
        save_flowchart(data, flowchart_name)
        return data
    except Exception:
        return {}


def ensure_flowcharts_dir() -> None:
    """ensure flowcharts directory exists"""
    path = _flowcharts_dir()
    if not os.path.exists(path):
        os.makedirs(path)


def get_flowchart_path(flowchart_name: str) -> str:
    """get full path for a flowchart file"""
    ensure_flowcharts_dir()
    if not flowchart_name.endswith('.json'):
        flowchart_name += '.json'
    return os.path.join(_flowcharts_dir(), flowchart_name)


def load_flowchart(flowchart_name: str = DEFAULT_FLOWCHART) -> Dict[str, Any]:
    """load flowchart data from json file"""
    flowchart_path = get_flowchart_path(flowchart_name)
    if os.path.exists(flowchart_path):
        with open(flowchart_path, 'r') as f:
            return json.load(f)
    # default skeleton when no file exists yet
    return {"nodes": [], "links": [], "groups": [], "executions": []}


def save_flowchart(data: Dict[str, Any], flowchart_name: str = DEFAULT_FLOWCHART) -> None:
    """save flowchart data to json file"""
    flowchart_path = get_flowchart_path(flowchart_name)
    with open(flowchart_path, 'w') as f:
        json.dump(data, f, indent=2)


def ensure_history_dir(flowchart_name: str) -> str:
    """ensure history directory exists for a flowchart"""
    if flowchart_name.endswith('.json'):
        flowchart_name = flowchart_name[:-5]
    history_path = os.path.join(_history_dir(), flowchart_name)
    if not os.path.exists(history_path):
        os.makedirs(history_path)
    return history_path


def save_execution_history(flowchart_name: str, execution_data: Dict[str, Any]) -> str:
    """save execution history to json file"""
    import uuid

    history_path = ensure_history_dir(flowchart_name)
    execution_id = str(uuid.uuid4())
    timestamp = datetime.now().isoformat()
    history_entry: Dict[str, Any] = {
        'execution_id': execution_id,
        'timestamp': timestamp,
        'flowchart_name': flowchart_name,
        'execution_data': execution_data
    }
    filename = f"{execution_id}.json"
    filepath = os.path.join(history_path, filename)
    with open(filepath, 'w') as f:
        json.dump(history_entry, f, indent=2)
    # also append a lightweight summary into the flowchart json for dashboard kpis
    try:
        _append_execution_summary_to_flowchart(flowchart_name, execution_id, timestamp, execution_data)
    except Exception:
        # keep silent to ensure primary history write never fails due to summary issues
        pass
    return execution_id


def get_execution_history(flowchart_name: str) -> List[Dict[str, Any]]:
    """get execution history for a flowchart"""
    if flowchart_name.endswith('.json'):
        flowchart_name = flowchart_name[:-5]
    history_path = os.path.join(_history_dir(), flowchart_name)
    if not os.path.exists(history_path):
        return []
    history_entries: List[Dict[str, Any]] = []
    for filename in os.listdir(history_path):
        if filename.endswith('.json'):
            filepath = os.path.join(history_path, filename)
            try:
                with open(filepath, 'r') as f:
                    entry = json.load(f)
                    history_entries.append(entry)
            except Exception:
                pass
    try:
        history_entries.sort(key=lambda x: x.get('timestamp', ''), reverse=True)
    except Exception:
        pass
    return history_entries


def delete_execution_history(flowchart_name: str, execution_id: str) -> bool:
    """delete a specific execution history entry"""
    if flowchart_name.endswith('.json'):
        flowchart_name = flowchart_name[:-5]
    history_path = os.path.join(_history_dir(), flowchart_name)
    filepath = os.path.join(history_path, f"{execution_id}.json")
    if os.path.exists(filepath):
        os.remove(filepath)
        return True
    return False


def _append_execution_summary_to_flowchart(flowchart_name: str, execution_id: str, timestamp: str, execution_data: Dict[str, Any]) -> None:
    """append a compact execution summary to the flowchart json under `executions`.
    this is used by the dashboard for fast metrics without scanning the history folder.
    comments: keep this robust and additive; never raise if something goes wrong.
    """
    # compute summary fields
    try:
        execution_order = execution_data.get('execution_order', []) or []
        total_nodes = len(execution_order)
        order_id_set = set(execution_order)
        results = execution_data.get('results', []) or []
        # only consider nodes that were part of the execution order
        results_in_order = [r for r in results if r.get('node_id') in order_id_set]
        successful_nodes = len([r for r in results_in_order if r.get('success', False)])
        completed_nodes = len(results_in_order)
        success_percentage = (successful_nodes / total_nodes * 100.0) if total_nodes > 0 else 0.0
        completed_percentage = (completed_nodes / total_nodes * 100.0) if total_nodes > 0 else 0.0
        failed_node = None
        error_snippet = None
        for r in results_in_order:
            if not r.get('success', False):
                failed_node = r.get('node_name', 'unknown')
                try:
                    err_text = r.get('error')
                    if isinstance(err_text, str) and err_text:
                        # include first 50 characters of the error message
                        error_snippet = err_text[:50]
                except Exception:
                    pass
                break
        elapsed_ms = 0
        for r in results_in_order:
            try:
                elapsed_ms += int(r.get('runtime', 0) or 0)
            except Exception:
                # ignore bad runtimes
                pass
        # human friendly string for table display: always seconds with 3 decimals
        def _format_elapsed(ms: int) -> str:
            try:
                ms = int(ms)
            except Exception:
                return '0.000s'
            seconds = ms / 1000.0
            return f"{seconds:.3f}s"

        summary: Dict[str, Any] = {
            'execution_id': execution_id,
            'timestamp': timestamp,
            'flowchart_name': flowchart_name,
            'status': execution_data.get('status', 'unknown'),
            'total_nodes': total_nodes,
            'successful_nodes': successful_nodes,
            'completed_nodes': completed_nodes,
            'success_percentage': round(success_percentage, 1),
            'completed_percentage': round(completed_percentage, 1),
            'failed_node': failed_node,
            'elapsed_ms': int(elapsed_ms),
            'execution_time': _format_elapsed(elapsed_ms),
        }

        # add error preview if failed
        try:
            status_val = str(execution_data.get('status', ''))
            if (status_val.lower() == 'failed' or failed_node is not None) and error_snippet:
                summary['error_snippet'] = error_snippet
        except Exception:
            pass

        # load, mutate, and save the flowchart json
        flow = load_flowchart(flowchart_name)
        if not isinstance(flow, dict):
            flow = {}
        executions_list = flow.get('executions')
        if not isinstance(executions_list, list):
            executions_list = []
        executions_list.insert(0, summary)
        # cap size to keep file small
        if len(executions_list) > MAX_EXECUTION_SUMMARIES:
            executions_list = executions_list[:MAX_EXECUTION_SUMMARIES]
        flow['executions'] = executions_list
        save_flowchart(flow, flowchart_name)
    except Exception:
        # never raise
        return


def list_backups(flowchart_name: str) -> List[Dict[str, Any]]:
    """list backups for a flowchart sorted newest first, including node/link counts"""
    backup_dir = _backup_dir_for(flowchart_name)
    results: List[Dict[str, Any]] = []
    try:
        files = [fn for fn in os.listdir(backup_dir) if fn.endswith('.json')]
        files.sort(reverse=True)
        for fn in files:
            path = os.path.join(backup_dir, fn)
            timestamp = fn[:-5]
            # parse readable datetime from filename
            readable = timestamp
            try:
                readable = datetime.strptime(timestamp, '%Y%m%dT%H%M%S').strftime('%Y-%m-%d %H:%M:%S')
            except Exception:
                pass
            nodes = 0
            links = 0
            try:
                with open(path, 'r') as f:
                    data = json.load(f)
                nodes = len((data or {}).get('nodes') or [])
                links = len((data or {}).get('links') or [])
            except Exception:
                pass
            results.append({
                'filename': fn,
                'timestamp': timestamp,
                'date_readable': readable,
                'nodes': nodes,
                'links': links,
            })
        return results
    except Exception:
        return []


def delete_backup_file(flowchart_name: str, timestamp: str) -> bool:
    """delete a specific backup by timestamp (filename without .json)"""
    backup_dir = _backup_dir_for(flowchart_name)
    filename = f"{timestamp}.json"
    path = os.path.join(backup_dir, filename)
    try:
        if os.path.exists(path):
            os.remove(path)
            return True
        return False
    except Exception:
        return False


def restore_backup_file(flowchart_name: str, timestamp: str) -> Dict[str, Any]:
    """restore a specific backup file (by timestamp) into the active flowchart"""
    backup_dir = _backup_dir_for(flowchart_name)
    filename = f"{timestamp}.json"
    path = os.path.join(backup_dir, filename)
    try:
        if not os.path.exists(path):
            return {}
        # exact file copy
        import shutil
        target_path = get_flowchart_path(flowchart_name)
        shutil.copyfile(path, target_path)
        # load and return restored json
        with open(target_path, 'r') as f:
            return json.load(f)
    except Exception:
        return {}


# helpers for renaming flowcharts (file + related directories)
def _sanitize_flowchart_basename(name: str) -> str:
    """sanitize a flowchart base name (without .json) to safe characters.
    comments: allow only alphanumeric, hyphen and underscore; convert spaces to underscores; lowercase.
    """
    try:
        base = str(name or '').strip()
        if base.endswith('.json'):
            base = base[:-5]
        # replace spaces then keep only allowed chars
        base = base.replace(' ', '_').lower()
        allowed = []
        for ch in base:
            if ch.isalnum() or ch in ('-', '_'):
                allowed.append(ch)
            else:
                allowed.append('_')
        # collapse multiple underscores
        sanitized = ''.join(allowed)
        while '__' in sanitized:
            sanitized = sanitized.replace('__', '_')
        return sanitized.strip('_') or 'untitled'
    except Exception:
        return 'untitled'


def rename_flowchart(old_name: str, new_name: str) -> Dict[str, str]:
    """rename a flowchart json file and its related history/backups folders.
    returns a dict with old and new filenames.
    """
    # normalize filenames
    if not old_name.endswith('.json'):
        old_name = f"{old_name}.json"
    new_base = _sanitize_flowchart_basename(new_name)
    new_filename = f"{new_base}.json"

    old_path = get_flowchart_path(old_name)
    new_path = get_flowchart_path(new_filename)

    if not os.path.exists(old_path):
        raise FileNotFoundError('flowchart not found')
    if os.path.exists(new_path):
        raise FileExistsError('a flowchart with that name already exists')

    # perform file rename
    os.rename(old_path, new_path)

    # rename history directory if present
    try:
        old_base = old_name[:-5]
        history_root = _history_dir()
        old_hist = os.path.join(history_root, old_base)
        new_hist = os.path.join(history_root, new_base)
        if os.path.exists(old_hist):
            os.rename(old_hist, new_hist)
    except Exception:
        # ignore non-critical failures for folders
        pass

    # rename backups directory if present
    try:
        backups_root = _backups_root_dir()
        old_bak = os.path.join(backups_root, old_base)
        new_bak = os.path.join(backups_root, new_base)
        if os.path.exists(old_bak):
            os.rename(old_bak, new_bak)
    except Exception:
        # ignore non-critical failures for folders
        pass

    return { 'old_filename': old_name, 'new_filename': new_filename }