import os
import argparse
from werkzeug.serving import run_simple

from .app_factory import create_app


def main() -> None:
    parser = argparse.ArgumentParser(prog="flowcraft", description="run flowcraft locally")
    parser.add_argument("serve", nargs="?", default="serve", help=argparse.SUPPRESS)
    parser.add_argument("--host", default="0.0.0.0")
    # default port: prefer env var; fallback 5000
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
