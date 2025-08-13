from flask import Blueprint, jsonify, request, current_app
import os
import shutil
from datetime import datetime

files_bp = Blueprint('files', __name__, url_prefix='/api')

HIDDEN_DIRS = {'.cursor', '.git', '.venv', '__pycache__'}


@files_bp.route('/project-root', methods=['GET'])
def get_project_root():
    try:
        root_path = os.path.abspath(current_app.config.get('FLOWCRAFT_PROJECT_ROOT') or os.getcwd())
        return jsonify({'status': 'success', 'root': root_path})
    except Exception as e:
        return jsonify({'status': 'error', 'message': f'failed to get project root: {str(e)}'}), 500


@files_bp.route('/python-files', methods=['GET'])
def get_python_files():
    # project root is used as root for scripts view
    project_root = current_app.config.get('FLOWCRAFT_PROJECT_ROOT') or os.getcwd()
    nodes_dir = os.path.join(project_root)
    python_files = []
    try:
        if os.path.exists(nodes_dir):
            for root, dirs, files in os.walk(nodes_dir):
                # hide specific directories while walking
                dirs[:] = [d for d in dirs if d not in HIDDEN_DIRS]
                for filename in files:
                    if filename.endswith('.py'):
                        file_path = os.path.join(root, filename)
                        rel_path = os.path.relpath(file_path, start=nodes_dir).replace('\\', '/')
                        stat_info = os.stat(file_path)
                        python_files.append({
                            'filename': filename,
                            'name': filename[:-3],
                            'path': rel_path,
                            'size': stat_info.st_size,
                            'modified': stat_info.st_mtime
                        })
        python_files.sort(key=lambda x: x['path'].lower())
        return jsonify({'status': 'success', 'files': python_files, 'count': len(python_files)})
    except Exception as e:
        return jsonify({'status': 'error', 'message': f'failed to list python files: {str(e)}'}), 500


@files_bp.route('/nodes/browse', methods=['GET'])
def browse_nodes():
    rel_path = (request.args.get('path') or '').strip().replace('\\', '/')
    root_dir = os.path.abspath(current_app.config.get('FLOWCRAFT_PROJECT_ROOT') or os.getcwd())
    abs_path = os.path.abspath(os.path.join(root_dir, rel_path))
    if not abs_path.startswith(root_dir):
        return jsonify({'status': 'error', 'message': 'invalid path'}), 400
    if not os.path.exists(abs_path):
        return jsonify({'status': 'error', 'message': 'path not found'}), 404
    if not os.path.isdir(abs_path):
        return jsonify({'status': 'error', 'message': 'path is not a directory'}), 400
    try:
        entries = []
        for name in os.listdir(abs_path):
            entry_abs = os.path.join(abs_path, name)
            try:
                stat = os.stat(entry_abs)
                is_dir = os.path.isdir(entry_abs)
                # hide configured directories and non-python files
                if is_dir and name in HIDDEN_DIRS:
                    continue
                if not is_dir:
                    ext = os.path.splitext(name)[1].lower()
                    if ext != '.py':
                        continue
                rel_entry = os.path.relpath(entry_abs, root_dir).replace('\\', '/')
                entries.append({
                    'name': name,
                    'path': rel_entry,
                    'is_dir': is_dir,
                    'size': None if is_dir else stat.st_size,
                    'modified': stat.st_mtime,
                    'modified_date': datetime.fromtimestamp(stat.st_mtime).strftime('%Y-%m-%d %H:%M:%S'),
                    'ext': (os.path.splitext(name)[1].lower() if not is_dir else '')
                })
            except Exception:
                continue
        entries.sort(key=lambda e: e['name'].lower())
        breadcrumb = []
        parts = [p for p in rel_path.split('/') if p] if rel_path else []
        accum = []
        for p in parts:
            accum.append(p)
            breadcrumb.append({'name': p, 'path': '/'.join(accum)})
        return jsonify({'status': 'success', 'cwd': rel_path, 'breadcrumb': breadcrumb, 'entries': entries})
    except Exception as e:
        return jsonify({'status': 'error', 'message': f'failed to browse nodes: {str(e)}'}), 500


@files_bp.route('/nodes/mkdir', methods=['POST'])
def nodes_mkdir():
    data = request.json or {}
    rel_path = (data.get('path') or '').strip().replace('\\', '/')
    name = (data.get('name') or '').strip()
    if not name:
        return jsonify({'status': 'error', 'message': 'folder name is required'}), 400
    root_dir = os.path.abspath(current_app.config.get('FLOWCRAFT_PROJECT_ROOT') or os.getcwd())
    target_dir = os.path.abspath(os.path.join(root_dir, rel_path))
    if not target_dir.startswith(root_dir):
        return jsonify({'status': 'error', 'message': 'invalid path'}), 400
    try:
        os.makedirs(os.path.join(target_dir, name), exist_ok=False)
        return jsonify({'status': 'success', 'message': 'folder created'})
    except FileExistsError:
        return jsonify({'status': 'error', 'message': 'folder already exists'}), 409
    except Exception as e:
        return jsonify({'status': 'error', 'message': f'failed to create folder: {str(e)}'}), 500


@files_bp.route('/nodes/touch', methods=['POST'])
def nodes_touch():
    data = request.json or {}
    rel_path = (data.get('path') or '').strip().replace('\\', '/')
    name = (data.get('name') or '').strip()
    if not name:
        return jsonify({'status': 'error', 'message': 'file name is required'}), 400
    root_dir = os.path.abspath(current_app.config.get('FLOWCRAFT_PROJECT_ROOT') or os.getcwd())
    target_dir = os.path.abspath(os.path.join(root_dir, rel_path))
    if not target_dir.startswith(root_dir):
        return jsonify({'status': 'error', 'message': 'invalid path'}), 400
    file_path = os.path.abspath(os.path.join(target_dir, name))
    if not file_path.startswith(root_dir):
        return jsonify({'status': 'error', 'message': 'invalid file path'}), 400
    if os.path.isdir(file_path):
        return jsonify({'status': 'error', 'message': 'a folder with that name already exists'}), 409
    try:
        os.makedirs(os.path.dirname(file_path), exist_ok=True)
        if os.path.exists(file_path):
            return jsonify({'status': 'error', 'message': 'file already exists'}), 409
        with open(file_path, 'w', encoding='utf-8') as f:
            if name.lower().endswith('.py'):
                try:
                    # prefer installed template next to app static/templates
                    from flask import current_app as _ca
                    tpl_root = _ca.static_folder if _ca else None
                    pkg_root = os.path.abspath(os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), '..'))
                    candidates = [
                        os.path.abspath(os.path.join(os.path.dirname(pkg_root), 'templates', 'template.py')),
                        os.path.abspath(os.path.join(pkg_root, 'templates', 'template.py')),
                        os.path.abspath(os.path.join(os.path.dirname(pkg_root), 'flowcraft', 'templates', 'template.py')),
                    ]
                    template_path = next((p for p in candidates if os.path.exists(p)), None)
                    if os.path.exists(template_path):
                        with open(template_path, 'r', encoding='utf-8') as tf:
                            f.write(tf.read())
                    else:
                        f.write('def my_function(argument1):\n\n    # put your script here \n\n    return argument1\n')
                except Exception:
                    f.write('def my_function(argument1):\n\n    # put your script here \n\n    return argument1\n')
            else:
                f.write('')
        return jsonify({'status': 'success', 'message': 'file created'})
    except Exception as e:
        return jsonify({'status': 'error', 'message': f'failed to create file: {str(e)}'}), 500


@files_bp.route('/nodes/move', methods=['POST'])
def nodes_move():
    data = request.json or {}
    src_rel = (data.get('src') or '').strip().replace('\\', '/')
    dst_dir_rel = (data.get('dst_dir') or '').strip().replace('\\', '/')
    if not src_rel:
        return jsonify({'status': 'error', 'message': 'source path is required'}), 400
    if dst_dir_rel is None:
        dst_dir_rel = ''
    root_dir = os.path.abspath(current_app.config.get('FLOWCRAFT_PROJECT_ROOT') or os.getcwd())
    src_abs = os.path.abspath(os.path.join(root_dir, src_rel))
    dst_dir_abs = os.path.abspath(os.path.join(root_dir, dst_dir_rel))
    if not src_abs.startswith(root_dir) or not dst_dir_abs.startswith(root_dir):
        return jsonify({'status': 'error', 'message': 'invalid path'}), 400
    if not os.path.exists(src_abs):
        return jsonify({'status': 'error', 'message': 'source not found'}), 404
    if not os.path.isdir(dst_dir_abs):
        return jsonify({'status': 'error', 'message': 'destination directory not found'}), 404
    dst_abs = os.path.abspath(os.path.join(dst_dir_abs, os.path.basename(src_abs)))
    if not dst_abs.startswith(root_dir):
        return jsonify({'status': 'error', 'message': 'invalid destination'}), 400
    if os.path.exists(dst_abs):
        return jsonify({'status': 'error', 'message': 'destination already exists'}), 409
    try:
        os.makedirs(os.path.dirname(dst_abs), exist_ok=True)
        shutil.move(src_abs, dst_abs)
        return jsonify({'status': 'success', 'message': 'moved successfully'})
    except Exception as e:
        return jsonify({'status': 'error', 'message': f'failed to move: {str(e)}'}), 500


@files_bp.route('/nodes/delete', methods=['POST'])
def nodes_delete():
    data = request.json or {}
    rel_path = (data.get('path') or '').strip().replace('\\', '/')
    if not rel_path:
        return jsonify({'status': 'error', 'message': 'file path is required'}), 400
    root_dir = os.path.abspath(current_app.config.get('FLOWCRAFT_PROJECT_ROOT') or os.getcwd())
    abs_path = os.path.abspath(os.path.join(root_dir, rel_path))
    if not abs_path.startswith(root_dir):
        return jsonify({'status': 'error', 'message': 'invalid path'}), 400
    if not os.path.exists(abs_path):
        return jsonify({'status': 'error', 'message': 'file not found'}), 404
    try:
        if os.path.isdir(abs_path):
            shutil.rmtree(abs_path)
            return jsonify({'status': 'success', 'message': 'folder deleted'})
        else:
            os.remove(abs_path)
            return jsonify({'status': 'success', 'message': 'file deleted'})
    except Exception as e:
        return jsonify({'status': 'error', 'message': f'failed to delete file: {str(e)}'}), 500


