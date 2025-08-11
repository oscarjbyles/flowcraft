from flask import Blueprint, jsonify, request
from datetime import datetime
import os
from ..services.storage import (
    DEFAULT_FLOWCHART,
    ensure_flowcharts_dir,
    get_flowchart_path,
    load_flowchart,
    save_flowchart,
)

flowcharts_bp = Blueprint('flowcharts', __name__, url_prefix='/api')


@flowcharts_bp.route('/flowchart', methods=['GET'])
def get_flowchart():
    flowchart_name = request.args.get('name') or DEFAULT_FLOWCHART
    return jsonify(load_flowchart(flowchart_name))


@flowcharts_bp.route('/flowchart', methods=['POST'])
def save_flowchart_data():
    data = request.json
    flowchart_name = request.json.get('flowchart_name', DEFAULT_FLOWCHART)
    incoming = {k: v for k, v in data.items() if k != 'flowchart_name'}
    # preserve executions array if client doesn't send it, to avoid wiping dashboard summaries
    try:
        existing = load_flowchart(flowchart_name)
    except Exception:
        existing = {}
    if 'executions' not in incoming and isinstance(existing, dict) and isinstance(existing.get('executions'), list):
        incoming['executions'] = existing.get('executions')
    save_flowchart(incoming, flowchart_name)
    return jsonify({"status": "success"})


@flowcharts_bp.route('/flowcharts', methods=['GET'])
def list_flowcharts():
    ensure_flowcharts_dir()
    try:
        flowcharts = []
        for filename in os.listdir('flowcharts'):
            if filename.endswith('.json'):
                filepath = os.path.join('flowcharts', filename)
                stat = os.stat(filepath)
                flowcharts.append({
                    'name': filename[:-5],
                    'filename': filename,
                    'path': filepath,
                    'size': stat.st_size,
                    'modified': stat.st_mtime,
                    'modified_date': datetime.fromtimestamp(stat.st_mtime).strftime('%Y-%m-%d %H:%M:%S')
                })
        flowcharts.sort(key=lambda x: x['modified'], reverse=True)
        return jsonify({"status": "success", "flowcharts": flowcharts, "count": len(flowcharts)})
    except Exception as e:
        return jsonify({"status": "error", "message": f"failed to list flowcharts: {str(e)}"}), 500


@flowcharts_bp.route('/flowcharts', methods=['POST'])
def create_flowchart():
    data = request.json
    flowchart_name = data.get('name', '').strip()
    if not flowchart_name:
        return jsonify({"status": "error", "message": "flowchart name is required"}), 400
    flowchart_name = "".join(c for c in flowchart_name if c.isalnum() or c in (' ', '-', '_')).rstrip()
    flowchart_name = flowchart_name.replace(' ', '_').lower()
    if not flowchart_name:
        return jsonify({"status": "error", "message": "invalid flowchart name"}), 400
    flowchart_path = get_flowchart_path(flowchart_name)
    if os.path.exists(flowchart_path):
        return jsonify({"status": "error", "message": "flowchart already exists"}), 409
    try:
        empty_flowchart = {"nodes": [], "links": [], "groups": [], "executions": []}
        save_flowchart(empty_flowchart, flowchart_name + '.json')
        return jsonify({"status": "success", "message": f"created flowchart: {flowchart_name}", "flowchart": {"name": flowchart_name, "filename": flowchart_name + '.json'}})
    except Exception as e:
        return jsonify({"status": "error", "message": f"failed to create flowchart: {str(e)}"}), 500


@flowcharts_bp.route('/flowcharts/<flowchart_name>', methods=['DELETE'])
def delete_flowchart(flowchart_name):
    try:
        flowchart_path = get_flowchart_path(flowchart_name)
        if not os.path.exists(flowchart_path):
            return jsonify({"status": "error", "message": "flowchart not found"}), 404
        os.remove(flowchart_path)
        history_dir = os.path.join('history', flowchart_name.replace('.json', ''))
        if os.path.exists(history_dir):
            import shutil
            shutil.rmtree(history_dir)
        return jsonify({"status": "success", "message": f"deleted flowchart: {flowchart_name}"})
    except Exception as e:
        return jsonify({"status": "error", "message": f"failed to delete flowchart: {str(e)}"}), 500


@flowcharts_bp.route('/build', methods=['POST'])
def build_flowchart():
    return jsonify({"status": "build triggered", "message": "build functionality to be implemented"})


