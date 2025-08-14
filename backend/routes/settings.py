from flask import Blueprint, jsonify, request, current_app
import os
import json


settings_bp = Blueprint('settings', __name__, url_prefix='/api')


def _settings_path() -> str:
    try:
        project_root = current_app.config.get('FLOWCRAFT_PROJECT_ROOT') or os.getcwd()
    except Exception:
        project_root = os.getcwd()
    return os.path.abspath(os.path.join(project_root, '.flowcraft_settings.json'))


def _load_settings() -> dict:
    path = _settings_path()
    try:
        if os.path.exists(path):
            with open(path, 'r', encoding='utf-8') as f:
                data = json.load(f)
                if isinstance(data, dict):
                    return data
    except Exception:
        pass
    return {}


def _save_settings(payload: dict) -> bool:
    path = _settings_path()
    try:
        os.makedirs(os.path.dirname(path), exist_ok=True)
    except Exception:
        pass
    try:
        with open(path, 'w', encoding='utf-8') as f:
            json.dump(payload, f, indent=2)
        return True
    except Exception:
        return False


@settings_bp.route('/settings', methods=['GET'])
def get_settings():
    try:
        data = _load_settings()
        return jsonify({'status': 'success', 'settings': data})
    except Exception as e:
        return jsonify({'status': 'error', 'message': f'failed to read settings: {str(e)}'}), 500


@settings_bp.route('/settings', methods=['POST'])
def update_settings():
    try:
        incoming = request.json or {}
        if not isinstance(incoming, dict):
            return jsonify({'status': 'error', 'message': 'invalid body'}), 400
        current = _load_settings()

        # validate default_port if present
        if 'default_port' in incoming and incoming['default_port'] not in (None, ''):
            try:
                port_val = int(incoming['default_port'])
                if port_val < 1 or port_val > 65535:
                    return jsonify({'status': 'error', 'message': 'port must be 1-65535'}), 400
                current['default_port'] = port_val
            except Exception:
                return jsonify({'status': 'error', 'message': 'default_port must be an integer'}), 400
        elif 'default_port' in incoming and (incoming['default_port'] in (None, '')):
            # allow clearing the setting
            if 'default_port' in current:
                del current['default_port']

        if not _save_settings(current):
            return jsonify({'status': 'error', 'message': 'failed to save settings'}), 500
        return jsonify({'status': 'success', 'settings': current})
    except Exception as e:
        return jsonify({'status': 'error', 'message': f'failed to update settings: {str(e)}'}), 500


