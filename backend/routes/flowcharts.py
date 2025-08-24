from flask import Blueprint, jsonify, request, current_app
from datetime import datetime
import os
from ..services.storage import (
    DEFAULT_FLOWCHART,
    ensure_flowcharts_dir,
    get_flowchart_path,
    load_flowchart,
    save_flowchart,
    write_backup_snapshot,
    restore_latest_backup,
    list_backups,
    delete_backup_file,
    restore_backup_file,
    rename_flowchart as storage_rename_flowchart,
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
    force = bool(request.json.get('force', False))
    incoming = {k: v for k, v in data.items() if k != 'flowchart_name'}
    
    print(f"[DEBUG] Saving flowchart: {flowchart_name}, force: {force}")
    print(f"[DEBUG] Incoming data keys: {list(incoming.keys())}")
    print(f"[DEBUG] Incoming nodes count: {len(incoming.get('nodes', []))}")
    
    # preserve executions array if client doesn't send it, to avoid wiping dashboard summaries
    try:
        existing = load_flowchart(flowchart_name)
        print(f"[DEBUG] Existing nodes count: {len(existing.get('nodes', []))}")
    except Exception as e:
        print(f"[DEBUG] Failed to load existing flowchart: {e}")
        existing = {}
    
    if 'executions' not in incoming and isinstance(existing, dict) and isinstance(existing.get('executions'), list):
        incoming['executions'] = existing.get('executions')
    
    # detect destructive changes: >90% node drop
    try:
        existing_nodes = len(existing.get('nodes') or [])
        incoming_nodes = len(incoming.get('nodes') or [])
        # only consider it destructive if we have a significant number of existing nodes (>5)
        # and the incoming nodes are <= 10% of existing nodes
        is_destructive = (existing_nodes > 5 and 
                         incoming_nodes <= max(0, int(existing_nodes * 0.1)))
        print(f"[DEBUG] Destructive check: existing={existing_nodes}, incoming={incoming_nodes}, is_destructive={is_destructive}")
    except Exception as e:
        print(f"[DEBUG] Error in destructive check: {e}")
        is_destructive = False

    if is_destructive and not force:
        print(f"[DEBUG] Blocking destructive change")
        # ensure a backup snapshot of current state before blocking
        try:
            write_backup_snapshot(flowchart_name, existing)
        except Exception:
            pass
        return (
            jsonify({
                "status": "blocked",
                "code": "destructive_change",
                "message": "massive change detected; save blocked",
                "existing_nodes": existing_nodes,
                "incoming_nodes": incoming_nodes,
                "threshold": 0.9
            }),
            409,
        )

    print(f"[DEBUG] Saving flowchart successfully")
    save_flowchart(incoming, flowchart_name)
    # optional: also snapshot accepted state to backups for recovery
    try:
        write_backup_snapshot(flowchart_name, incoming)
    except Exception:
        pass
    return jsonify({"status": "success"})


@flowcharts_bp.route('/flowcharts', methods=['GET'])
def list_flowcharts():
    ensure_flowcharts_dir()
    try:
        flowcharts = []
        flowcharts_dir = current_app.config.get('FLOWCRAFT_FLOWCHARTS_DIR', 'flowcharts')
        for filename in os.listdir(flowcharts_dir):
            if filename.endswith('.json'):
                filepath = os.path.join(flowcharts_dir, filename)
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
    print(f"[DEBUG] Creating flowchart with name: '{flowchart_name}'")
    
    if not flowchart_name:
        return jsonify({"status": "error", "message": "flowchart name is required"}), 400
    
    flowchart_name = "".join(c for c in flowchart_name if c.isalnum() or c in (' ', '-', '_')).rstrip()
    flowchart_name = flowchart_name.replace(' ', '_').lower()
    print(f"[DEBUG] Sanitized flowchart name: '{flowchart_name}'")
    
    if not flowchart_name:
        return jsonify({"status": "error", "message": "invalid flowchart name"}), 400
    
    flowchart_path = get_flowchart_path(flowchart_name)
    print(f"[DEBUG] Flowchart path: {flowchart_path}")
    print(f"[DEBUG] Path exists: {os.path.exists(flowchart_path)}")
    
    if os.path.exists(flowchart_path):
        print(f"[DEBUG] Flowchart already exists, returning 409")
        return jsonify({"status": "error", "message": "flowchart already exists"}), 409
    
    try:
        empty_flowchart = {"nodes": [], "links": [], "groups": [], "executions": []}
        save_flowchart(empty_flowchart, flowchart_name + '.json')
        print(f"[DEBUG] Successfully created flowchart")
        return jsonify({"status": "success", "message": f"created flowchart: {flowchart_name}", "flowchart": {"name": flowchart_name, "filename": flowchart_name + '.json'}})
    except Exception as e:
        print(f"[DEBUG] Error creating flowchart: {e}")
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


@flowcharts_bp.route('/flowchart/restore-latest', methods=['POST'])
def restore_latest():
    try:
        data = request.json or {}
        flowchart_name = data.get('flowchart_name') or DEFAULT_FLOWCHART
        restored = restore_latest_backup(flowchart_name)
        if restored:
            return jsonify({"status": "success", "message": "restored latest backup", "data": restored})
        return jsonify({"status": "error", "message": "no backup available"}), 404
    except Exception as e:
        return jsonify({"status": "error", "message": f"failed to restore backup: {str(e)}"}), 500



@flowcharts_bp.route('/flowchart/backups', methods=['GET'])
def get_backups():
    try:
        flowchart_name = request.args.get('name') or DEFAULT_FLOWCHART
        backups = list_backups(flowchart_name)
        return jsonify({"status": "success", "backups": backups, "count": len(backups)})
    except Exception as e:
        return jsonify({"status": "error", "message": f"failed to list backups: {str(e)}"}), 500


@flowcharts_bp.route('/flowchart/backups/<timestamp>', methods=['DELETE'])
def delete_backup(timestamp):
    try:
        flowchart_name = request.args.get('name') or DEFAULT_FLOWCHART
        ok = delete_backup_file(flowchart_name, timestamp)
        if ok:
            return jsonify({"status": "success", "message": "deleted backup"})
        return jsonify({"status": "error", "message": "backup not found"}), 404
    except Exception as e:
        return jsonify({"status": "error", "message": f"failed to delete backup: {str(e)}"}), 500


@flowcharts_bp.route('/flowchart/backups/<timestamp>/restore', methods=['POST'])
def restore_backup(timestamp):
    try:
        data = request.get_json(silent=True) or {}
        # accept both keys for flexibility
        flowchart_name = (
            data.get('flowchart_name') or
            data.get('name') or
            request.args.get('flowchart_name') or
            request.args.get('name') or
            DEFAULT_FLOWCHART
        )
        # ensure .json suffix is handled consistently
        restored = restore_backup_file(flowchart_name, timestamp)
        if restored:
            return jsonify({"status": "success", "message": "restored backup", "data": restored})
        return jsonify({"status": "error", "message": "backup not found"}), 404
    except Exception as e:
        return jsonify({"status": "error", "message": f"failed to restore backup: {str(e)}"}), 500



@flowcharts_bp.route('/flowcharts/rename', methods=['POST'])
def rename_flowchart():
    try:
        data = request.get_json(silent=True) or {}
        old_name = (data.get('old_name') or data.get('current') or data.get('current_name') or '').strip()
        new_name = (data.get('new_name') or data.get('name') or '').strip()
        if not old_name or not new_name:
            return jsonify({"status": "error", "message": "old_name and new_name are required"}), 400
        result = storage_rename_flowchart(old_name, new_name)
        return jsonify({"status": "success", **result})
    except FileNotFoundError:
        return jsonify({"status": "error", "message": "flowchart not found"}), 404
    except FileExistsError:
        return jsonify({"status": "error", "message": "a flowchart with that name already exists"}), 409
    except Exception as e:
        return jsonify({"status": "error", "message": f"failed to rename flowchart: {str(e)}"}), 500
