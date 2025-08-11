from flask import Blueprint, render_template, send_from_directory
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


@ui_bp.route('/data')
def data_matrix_page():
    """data matrix page - displays executions and saved data."""
    return render_template('data_matrix.html')


@ui_bp.route('/assets/css/<path:filename>')
def assets_css(filename: str):
    """serve css files from templates/assets/css.
    this preserves the existing externalized styling without changing functionality.
    """
    base_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), 'templates', 'assets', 'css')
    return send_from_directory(base_dir, filename)


