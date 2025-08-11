import json
import os
from datetime import datetime
from typing import Any, Dict, List

# note: this module centralizes filesystem access for flowcharts and history.

FLOWCHARTS_DIR = 'flowcharts'
HISTORY_DIR = 'history'
DEFAULT_FLOWCHART = 'default.json'

# keep only a limited number of execution summaries in the flowchart file to avoid bloat
MAX_EXECUTION_SUMMARIES = 200


def ensure_flowcharts_dir() -> None:
    """ensure flowcharts directory exists"""
    if not os.path.exists(FLOWCHARTS_DIR):
        os.makedirs(FLOWCHARTS_DIR)


def get_flowchart_path(flowchart_name: str) -> str:
    """get full path for a flowchart file"""
    ensure_flowcharts_dir()
    if not flowchart_name.endswith('.json'):
        flowchart_name += '.json'
    return os.path.join(FLOWCHARTS_DIR, flowchart_name)


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
    history_path = os.path.join(HISTORY_DIR, flowchart_name)
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
    history_path = os.path.join(HISTORY_DIR, flowchart_name)
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
    history_path = os.path.join(HISTORY_DIR, flowchart_name)
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
        for r in results_in_order:
            if not r.get('success', False):
                failed_node = r.get('node_name', 'unknown')
                break
        elapsed_ms = 0
        for r in results_in_order:
            try:
                elapsed_ms += int(r.get('runtime', 0) or 0)
            except Exception:
                # ignore bad runtimes
                pass
        # human friendly string for table display
        def _format_elapsed(ms: int) -> str:
            try:
                ms = int(ms)
            except Exception:
                return '0ms'
            if ms < 1000:
                return f"{ms}ms"
            seconds = ms / 1000.0
            if seconds < 60:
                return f"{seconds:.2f}s"
            minutes = int(seconds // 60)
            rem = seconds - minutes * 60
            return f"{minutes}m {rem:.1f}s"

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

