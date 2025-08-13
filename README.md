# FlowCraft

web app to build, run, and analyze python workflows as visual flowcharts. nodes reference python files under `nodes/`, links define execution order and data flow, and runs are tracked with summaries you can review on a dashboard.

## features

- **visual builder**: create python nodes, arrange them on an svg canvas, and link them.
- **run mode**: execute flows or single nodes with live output and error capture.
- **function awareness**: analyze a python file to infer a primary function, parameters, and returns; mock `input()` via provided values.
- **history & dashboard**: save runs, view success rates, timings, recent failures, and coverage per flowchart.
- **file tools**: browse `nodes/`, create/move/delete folders/files, open in your editor (cursor, vscode, etc.).
- **variable analysis**: inspect shared variables between connected scripts to help author conditions.

## quick start

1) create a virtual environment and activate it

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
```

on mac/linux:

```bash
python -m venv .venv
source .venv/bin/activate
```

2) install dependencies

```bash
pip install -r requirements.txt
```

3) run the app

```bash
python app.py
```

open `http://localhost:5000`. on macos, if port 5000 is in use, the app auto-selects the next available port.

## usage

### build a flow
- open `/` (builder).
- click the toolbar buttons to add nodes (e.g., python node, if condition).
- select a node and choose a python file under `nodes/` (use the picker or create a new script).
- drag to move; shift+drag to connect nodes; right-click for context actions.

### run a flow
- switch to run mode from the builder, or open `/dashboard` to navigate with preserved context.
- start a run; watch live logs and per-node outputs/returns.
- save a run to make it appear in the dashboard and data views.

### scripts and editors
- manage files under `nodes/` from the ui (browse, mkdir, touch, move, delete).
- set a default editor; opening a file uses your editor if detected.

## how python nodes are executed

there are two execution paths used by the backend:

- flow runs (`POST /api/run`): each node's file is executed as a script via `python path/to/file.py` in sequence; stdout/stderr and return codes are captured.
- single-node runs (`POST /api/execute-node` or `/execute-node-stream`): the backend parses the first function defined in the file, mocks `input()`, and invokes it with provided arguments. the result, stdout, and any error are returned/streamed.

recommendation: structure node scripts with a single, top-level function that accepts named parameters and returns values you want to expose.

## data & storage

- flowcharts: `flowcharts/<name>.json` containing nodes, links, groups, and a compact `executions` array (recent summaries for dashboard).
- history: per-run details saved to `history/<name_without_json>/<uuid>.json`.
- nodes: python scripts under `nodes/` (can be nested in folders).

## project structure

```
flowcraft/
├─ app.py
├─ backend/
│  ├─ routes/            # ui, flowcharts, files, execution, analysis, editors
│  └─ services/          # storage, analysis, execution processes
├─ templates/            # jinja templates (builder, dashboard, data matrix, etc.)
├─ static/               # js (core, components), css, assets
├─ flowcharts/           # flowchart json files
├─ history/              # saved executions per flowchart
└─ nodes/                # your python scripts
```

## api

base prefix for most endpoints is `/api`.

### flowcharts
- `GET /api/flowchart?name=<name>`: load a flowchart (defaults to `default.json`).
- `POST /api/flowchart` body: `{ flowchart_name, ...data }`: save flowchart; preserves existing `executions` if omitted.
- `GET /api/flowcharts`: list available flowcharts.
- `POST /api/flowcharts` body: `{ name }`: create a new flowchart.
- `DELETE /api/flowcharts/<name>`: delete a flowchart and its history folder.
- `POST /api/build`: placeholder endpoint.

### files (nodes/)
- `GET /api/python-files`: enumerate python files under `nodes/`.
- `GET /api/nodes/browse?path=<rel>`: list entries for a folder beneath `nodes/`.
- `POST /api/nodes/mkdir` body: `{ path, name }`: create folder.
- `POST /api/nodes/touch` body: `{ path, name }`: create empty file or a python template.
- `POST /api/nodes/move` body: `{ src, dst_dir }`: move a file/folder within `nodes/`.
- `POST /api/nodes/delete` body: `{ path }`: delete file/folder.

### execution
- `POST /api/run` body: `{ flowchart_name, execution_order: [nodeIds] }`: run files in order as scripts.
- `POST /api/execute-node` body: `{ node_id, python_file, function_args, input_values }`: run first function, return result.
- `POST /api/execute-node-stream`: same as above but streams stdout and final result via sse.
- `POST /api/stop-execution`: terminate tracked processes and clean temp files.
- `POST /api/save-execution` body: `{ flowchart_name, execution_data }`: persist a run; also appends a compact summary to the flowchart json (capped).
- `GET /api/history?flowchart_name=<name>`: list saved runs (summarized).
- `GET /api/history/<execution_id>?flowchart_name=<name>`: get full run details.
- `DELETE /api/history/<execution_id>?flowchart_name=<name>`: delete a run and remove its summary from the flowchart json.
- `POST /api/history/clear` body: `{ flowchart_name }`: clear on-disk history for a flowchart.
- `POST /api/history/clear-all` body: `{ flowchart_name }`: clear on-disk history and reset `executions` in the flowchart json.

### analysis
- `POST /api/analyze-python-function` body: `{ python_file }`: infer function name, parameters, returns, and input calls from a file.
- `POST /api/analyze-connection` body: `{ source_node_id, target_node_id, flowchart_name }`: analyze shared variables between linked files.

### editors
- `GET /api/editors`: detect installed editors (platform-aware).
- `POST /api/open-file` body: `{ python_file, preferred_editor_path? }`: open a script in an editor.

## ui pages

- `/` builder (main canvas + properties sidebar)
- `/dashboard` overview and kpis
- `/scripts` scripts explorer
- `/data` data matrix

## troubleshooting

- node has no file: assign a `python_file` to the node in the sidebar.
- script timed out: single-node executions time out after 30s; optimize or split work.
- permission errors on temp files (windows): the app retries cleanup; if a file remains, you can delete it manually.
- editors not detected: set a preferred path in the ui when opening a file.

## requirements

see `requirements.txt` (flask, flask-cors, psutil, requests, numpy). python 3.9+ recommended.
