import json
import os
from datetime import datetime
from typing import Any, Dict, List

# note: this module centralizes filesystem access for flowcharts and history.

FLOWCHARTS_DIR = 'flowcharts'
HISTORY_DIR = 'history'
DEFAULT_FLOWCHART = 'default.json'


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
    return {"nodes": [], "links": [], "groups": []}


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


