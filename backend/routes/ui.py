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


