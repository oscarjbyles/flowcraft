from flask import Blueprint, render_template, send_from_directory, jsonify, request
import os

ui_bp = Blueprint('ui', __name__)


@ui_bp.route('/')
def index():
    """main page"""
    return render_template('index.html')


@ui_bp.route('/scripts')
def scripts_page():
    """scripts page (separate interface with identical sidebar)"""
    return render_template('scripts.html')


@ui_bp.route('/dashboard')
def dashboard_page():
    """dashboard page (overview landing)"""
    return render_template('dashboard.html')


@ui_bp.route('/data')
def data_matrix_page():
    """data matrix page - displays executions and saved data."""
    return render_template('data_matrix.html')


@ui_bp.route('/settings')
def settings_page():
    """settings page - application and flowchart settings."""
    return render_template('settings.html')


# legacy css route removed; all styles now served from /static/css

@ui_bp.route('/api/directory-listing')
def directory_listing():
    """return directory listing for javascript files"""
    folder_path = request.args.get('path', '')
    if not folder_path:
        return jsonify({'status': 'error', 'message': 'path parameter required'}), 400
    
    # ensure path is within static directory for security
    static_dir = os.path.join(os.getcwd(), 'static')
    full_path = os.path.abspath(os.path.join(static_dir, folder_path.lstrip('/')))
    
    if not full_path.startswith(static_dir):
        return jsonify({'status': 'error', 'message': 'path outside static directory'}), 403
    
    if not os.path.exists(full_path) or not os.path.isdir(full_path):
        return jsonify({'status': 'error', 'message': 'directory not found'}), 404
    
    try:
        files = []
        for filename in os.listdir(full_path):
            if filename.endswith('.js'):
                file_path = os.path.join(full_path, filename)
                if os.path.isfile(file_path):
                    files.append(filename)
        
        return jsonify({
            'status': 'success',
            'files': files,
            'path': folder_path
        })
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500


