from flask import Flask
from flask_cors import CORS
import os
import platform
import socket
from datetime import datetime
import tempfile
import glob

app = Flask(__name__)
CORS(app)


def cleanup_orphaned_temp_files() -> None:
    """clean up any orphaned temporary files from previous runs"""
    try:
        temp_dir = tempfile.gettempdir()
        pattern = os.path.join(temp_dir, "tmp*.py")
        orphaned_files = glob.glob(pattern)
        cleaned_count = 0
        for temp_file in orphaned_files:
            try:
                file_age = datetime.now().timestamp() - os.path.getmtime(temp_file)
                if file_age > 3600:
                    os.unlink(temp_file)
                    cleaned_count += 1
            except Exception:
                pass
        if cleaned_count > 0:
            print(f"cleaned up {cleaned_count} orphaned temporary files")
    except Exception as e:
        print(f"warning: could not clean up orphaned temp files: {e}")


# clean on startup
cleanup_orphaned_temp_files()

# register blueprints
from backend.routes.ui import ui_bp  # noqa: E402
from backend.routes.flowcharts import flowcharts_bp  # noqa: E402
from backend.routes.files import files_bp  # noqa: E402
from backend.routes.execution import execution_bp  # noqa: E402
from backend.routes.editors import editors_bp  # noqa: E402

app.register_blueprint(ui_bp)
app.register_blueprint(flowcharts_bp)
app.register_blueprint(files_bp)
app.register_blueprint(execution_bp)
app.register_blueprint(editors_bp)


def _is_port_open(port: int) -> bool:
    """check if a port is open (a process is already listening)."""
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.settimeout(0.2)
        return sock.connect_ex(('127.0.0.1', int(port))) == 0


def _find_next_available_port(start_port: int, max_port: int):
    """find the first available port in a range; returns none if not found."""
    for candidate in range(int(start_port), int(max_port) + 1):
        if not _is_port_open(candidate):
            return candidate
    return None


if __name__ == '__main__':
    default_port = int(os.environ.get('PORT', '5000'))
    host = '0.0.0.0'

    chosen_port = default_port
    if platform.system() == 'Darwin' and _is_port_open(default_port):
        alt = _find_next_available_port(default_port + 1, default_port + 50)
        if alt is not None:
            print(f"info: port {default_port} busy on macos, using {alt} instead")
            chosen_port = alt
        else:
            print(f"warning: ports {default_port}-{default_port+50} busy on macos, selecting ephemeral port")
            chosen_port = 0

    try:
        app.run(debug=True, host=host, port=chosen_port)
    except OSError as e:
        addr_in_use = ('address already in use' in str(e).lower())
        if platform.system() == 'Darwin' and addr_in_use:
            alt = _find_next_available_port(default_port + 1, default_port + 50)
            if alt is None:
                alt = 0
            print(f"warning: port {chosen_port} failed to bind, retrying on {alt if alt else 'ephemeral'}")
            app.run(debug=True, host=host, port=alt)
        else:
            raise

