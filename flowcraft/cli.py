import os
import argparse
from werkzeug.serving import run_simple

from .app_factory import create_app


def main() -> None:
    parser = argparse.ArgumentParser(prog="flowcraft", description="run flowcraft locally")
    parser.add_argument("serve", nargs="?", default="serve", help=argparse.SUPPRESS)
    parser.add_argument("--host", default="0.0.0.0")
    # default port: prefer env var; next read project setting; fallback 5000
    try:
        # try reading project setting from cwd
        import json
        settings_path = os.path.abspath(os.path.join(os.getcwd(), '.flowcraft_settings.json'))
        default_cli_port = int(os.environ.get("PORT")) if os.environ.get("PORT") else None
        if default_cli_port is None and os.path.exists(settings_path):
            with open(settings_path, 'r', encoding='utf-8') as f:
                conf = json.load(f)
                sp = conf.get('default_port')
                if isinstance(sp, int) and 1 <= sp <= 65535:
                    default_cli_port = sp
        if default_cli_port is None:
            default_cli_port = 5000
    except Exception:
        default_cli_port = int(os.environ.get("PORT", "5000"))

    parser.add_argument("--port", type=int, default=default_cli_port)
    parser.add_argument("--debug", action="store_true", default=True)
    parser.add_argument("--data-dir", default=os.environ.get("FLOWCRAFT_DATA_DIR"))
    args = parser.parse_args()

    if args.data_dir:
        os.environ["FLOWCRAFT_DATA_DIR"] = args.data_dir

    app = create_app()
    # use werkzeug dev server to avoid prompting for reloader input
    run_simple(args.host, args.port, app, use_reloader=args.debug, use_debugger=args.debug)


if __name__ == "__main__":
    main()
