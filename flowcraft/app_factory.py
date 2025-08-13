import os
from flask import Flask
from flask_cors import CORS


def _resolve_dir(default_rel: str, env_key: str, app_root: str) -> str:
     # prefer explicit env var; otherwise default to project-relative
     base = os.environ.get(env_key)
     if base:
         return os.path.abspath(base)
     return os.path.abspath(os.path.join(app_root, default_rel))


def create_app(config: dict | None = None) -> Flask:
     """create and configure a flask app with all flowcraft blueprints.
 
     config keys/env vars:
       - FLOWCRAFT_DATA_DIR (optional root where nodes/ flowcharts/ history/ live)
     """
     # app root is the repo root if running from source; else installed package location
     project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
     templates_dir = os.path.join(project_root, "templates")
     static_dir = os.path.join(project_root, "static")

     app = Flask(__name__, template_folder=templates_dir, static_folder=static_dir)
     CORS(app)

     # compute data dirs, allowing an override via FLOWCRAFT_DATA_DIR
     data_root = os.environ.get("FLOWCRAFT_DATA_DIR")
     if data_root:
         nodes_dir = os.path.join(data_root, "nodes")
         flowcharts_dir = os.path.join(data_root, "flowcharts")
         history_dir = os.path.join(data_root, "history")
     else:
         nodes_dir = _resolve_dir("nodes", "FLOWCRAFT_NODES_DIR", project_root)
         flowcharts_dir = _resolve_dir("flowcharts", "FLOWCRAFT_FLOWCHARTS_DIR", project_root)
         history_dir = _resolve_dir("history", "FLOWCRAFT_HISTORY_DIR", project_root)

     app.config.update(
         FLOWCRAFT_NODES_DIR=nodes_dir,
         FLOWCRAFT_FLOWCHARTS_DIR=flowcharts_dir,
         FLOWCRAFT_HISTORY_DIR=history_dir,
     )

     # register existing blueprints from current codebase
     from backend.routes.ui import ui_bp
     from backend.routes.flowcharts import flowcharts_bp
     from backend.routes.files import files_bp
     from backend.routes.execution import execution_bp
     from backend.routes.analysis import analysis_bp
     from backend.routes.editors import editors_bp

     app.register_blueprint(ui_bp)
     app.register_blueprint(flowcharts_bp)
     app.register_blueprint(files_bp)
     app.register_blueprint(execution_bp)
     app.register_blueprint(analysis_bp)
     app.register_blueprint(editors_bp)

     if config:
         app.config.update(config)

     return app


