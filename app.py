from flask import Flask, render_template, request, jsonify
from flask_cors import CORS
import json
import os
import ast
import re
from datetime import datetime
import uuid
import threading
import signal
import psutil
import subprocess
import tempfile
import glob
import sys

app = Flask(__name__)
CORS(app)

# directory to store flowchart files
FLOWCHARTS_DIR = 'flowcharts'
DEFAULT_FLOWCHART = 'default.json'

# global process tracking for execution control
running_processes = {}
process_lock = threading.Lock()

# directory to store execution history
HISTORY_DIR = 'history'

def cleanup_orphaned_temp_files():
    """clean up any orphaned temporary files from previous runs"""
    try:
        temp_dir = tempfile.gettempdir()
        # look for temporary python files that might be orphaned
        pattern = os.path.join(temp_dir, "tmp*.py")
        orphaned_files = glob.glob(pattern)
        
        cleaned_count = 0
        for temp_file in orphaned_files:
            try:
                # check if file is old (more than 1 hour)
                file_age = datetime.now().timestamp() - os.path.getmtime(temp_file)
                if file_age > 3600:  # 1 hour in seconds
                    os.unlink(temp_file)
                    cleaned_count += 1
            except Exception:
                # ignore errors during cleanup of individual files
                pass
        
        if cleaned_count > 0:
            print(f"cleaned up {cleaned_count} orphaned temporary files")
            
    except Exception as e:
        print(f"warning: could not clean up orphaned temp files: {e}")

# clean up orphaned temp files on startup
cleanup_orphaned_temp_files()

def ensure_flowcharts_dir():
    """ensure flowcharts directory exists"""
    if not os.path.exists(FLOWCHARTS_DIR):
        os.makedirs(FLOWCHARTS_DIR)

def get_flowchart_path(flowchart_name):
    """get full path for a flowchart file"""
    ensure_flowcharts_dir()
    if not flowchart_name.endswith('.json'):
        flowchart_name += '.json'
    return os.path.join(FLOWCHARTS_DIR, flowchart_name)

def load_flowchart(flowchart_name=DEFAULT_FLOWCHART):
    """load flowchart data from json file"""
    flowchart_path = get_flowchart_path(flowchart_name)
    if os.path.exists(flowchart_path):
        with open(flowchart_path, 'r') as f:
            return json.load(f)
    return {"nodes": [], "links": [], "groups": []}

def save_flowchart(data, flowchart_name=DEFAULT_FLOWCHART):
    """save flowchart data to json file"""
    flowchart_path = get_flowchart_path(flowchart_name)
    with open(flowchart_path, 'w') as f:
        json.dump(data, f, indent=2)

def ensure_history_dir(flowchart_name):
    """ensure history directory exists for a flowchart"""
    # remove .json extension if present
    if flowchart_name.endswith('.json'):
        flowchart_name = flowchart_name[:-5]
    
    history_path = os.path.join(HISTORY_DIR, flowchart_name)
    if not os.path.exists(history_path):
        os.makedirs(history_path)
    return history_path

def save_execution_history(flowchart_name, execution_data):
    """save execution history to json file"""
    history_path = ensure_history_dir(flowchart_name)
    
    # generate unique execution id
    execution_id = str(uuid.uuid4())
    timestamp = datetime.now().isoformat()
    
    history_entry = {
        'execution_id': execution_id,
        'timestamp': timestamp,
        'flowchart_name': flowchart_name,
        'execution_data': execution_data
    }
    
    filename = f"{execution_id}.json"
    filepath = os.path.join(history_path, filename)
    
    with open(filepath, 'w') as f:
        json.dump(history_entry, f, indent=2)
    
    return execution_id

def get_execution_history(flowchart_name):
    """get execution history for a flowchart"""
    # remove .json extension if present
    if flowchart_name.endswith('.json'):
        flowchart_name = flowchart_name[:-5]
    
    history_path = os.path.join(HISTORY_DIR, flowchart_name)
    
    if not os.path.exists(history_path):
        return []
    
    history_entries = []
    for filename in os.listdir(history_path):
        if filename.endswith('.json'):
            filepath = os.path.join(history_path, filename)
            try:
                with open(filepath, 'r') as f:
                    entry = json.load(f)
                    history_entries.append(entry)
            except Exception as e:
                print(f"error reading history file {filename}: {e}")
    
    # sort by timestamp (newest first)
    history_entries.sort(key=lambda x: x['timestamp'], reverse=True)
    return history_entries

def delete_execution_history(flowchart_name, execution_id):
    """delete a specific execution history entry"""
    # remove .json extension if present
    if flowchart_name.endswith('.json'):
        flowchart_name = flowchart_name[:-5]
    
    history_path = os.path.join(HISTORY_DIR, flowchart_name)
    filepath = os.path.join(history_path, f"{execution_id}.json")
    
    if os.path.exists(filepath):
        os.remove(filepath)
        return True
    return False

@app.route('/')
def index():
    """main page"""
    return render_template('index.html')

@app.route('/scripts')
def scripts_page():
    """scripts page (separate interface with identical sidebar)"""
    return render_template('scripts.html')

@app.route('/api/open-file', methods=['POST'])
def open_file_in_editor():
    """open a python file in the default editor, preferring an already open editor window if possible (windows-focused)."""
    try:
        data = request.json or {}
        python_file = data.get('python_file', '')
        preferred_editor_path = (data.get('preferred_editor_path') or '').strip()
        if not python_file:
            return jsonify({
                'success': False,
                'error': 'python_file is required'
            }), 400

        # normalize and construct full path inside nodes directory when needed
        normalized = python_file.replace('\\', '/')
        
        if normalized.startswith('nodes/'):
            file_path = os.path.normpath(python_file)
        else:
            file_path = os.path.join('nodes', python_file)

        file_path = os.path.abspath(file_path)

        if not os.path.exists(file_path):
            return jsonify({
                'success': False,
                'error': f'python file not found: {python_file}'
            }), 404

        # if a specific editor executable path is provided (from settings), try it first
        launched = False
        if preferred_editor_path:
            try:
                subprocess.Popen([preferred_editor_path, file_path], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, cwd=os.getcwd())
                launched = True
            except Exception:
                launched = False

        # prefer system default handler next for correctness
        try:
            if sys.platform.startswith('win'):
                # use cmd start to respect current default app association and avoid some shell execute quirks
                try:
                    subprocess.Popen(f'start "" "{file_path}"', shell=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
                    launched = True
                except Exception:
                    os.startfile(file_path)  # type: ignore[attr-defined]
                    launched = True
            elif sys.platform == 'darwin':
                subprocess.Popen(['open', file_path], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
                launched = True
            else:
                subprocess.Popen(['xdg-open', file_path], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
                launched = True
        except Exception:
            launched = False

        # fallback to known editor clis only if default open failed
        if not launched:
            def try_launch(cmd, args):
                try:
                    subprocess.Popen([cmd] + args, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, cwd=os.getcwd())
                    return True
                except Exception:
                    return False

            launched = (
                try_launch('code', ['--reuse-window', file_path]) or
                try_launch('cursor', ['--reuse-window', file_path]) or
                try_launch('windsurf', ['--reuse-window', file_path]) or
                try_launch('sublime_text', [file_path]) or
                try_launch('notepad++', [file_path])
            )

        return jsonify({'success': True, 'launched': launched, 'file_path': file_path})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/flowchart', methods=['GET'])
def get_flowchart():
    """get current flowchart data"""
    flowchart_name = request.args.get('name', DEFAULT_FLOWCHART)
    return jsonify(load_flowchart(flowchart_name))

@app.route('/api/flowchart', methods=['POST'])
def save_flowchart_data():
    """save flowchart data"""
    data = request.json
    flowchart_name = request.json.get('flowchart_name', DEFAULT_FLOWCHART)
    # remove flowchart_name from data before saving
    flowchart_data = {k: v for k, v in data.items() if k != 'flowchart_name'}
    save_flowchart(flowchart_data, flowchart_name)
    return jsonify({"status": "success"})

@app.route('/api/flowcharts', methods=['GET'])
def list_flowcharts():
    """get list of available flowcharts"""
    ensure_flowcharts_dir()
    try:
        flowcharts = []
        for filename in os.listdir(FLOWCHARTS_DIR):
            if filename.endswith('.json'):
                filepath = os.path.join(FLOWCHARTS_DIR, filename)
                stat = os.stat(filepath)
                flowcharts.append({
                    'name': filename[:-5],  # remove .json extension
                    'filename': filename,
                    'path': filepath,
                    'size': stat.st_size,
                    'modified': stat.st_mtime,
                    'modified_date': datetime.fromtimestamp(stat.st_mtime).strftime('%Y-%m-%d %H:%M:%S')
                })
        
        # sort by modified date (newest first)
        flowcharts.sort(key=lambda x: x['modified'], reverse=True)
        
        return jsonify({
            "status": "success",
            "flowcharts": flowcharts,
            "count": len(flowcharts)
        })
    
    except Exception as e:
        return jsonify({
            "status": "error",
            "message": f"failed to list flowcharts: {str(e)}"
        }), 500

@app.route('/api/flowcharts', methods=['POST'])
def create_flowchart():
    """create a new flowchart"""
    data = request.json
    flowchart_name = data.get('name', '').strip()
    
    if not flowchart_name:
        return jsonify({
            "status": "error",
            "message": "flowchart name is required"
        }), 400
    
    # sanitize filename
    flowchart_name = "".join(c for c in flowchart_name if c.isalnum() or c in (' ', '-', '_')).rstrip()
    flowchart_name = flowchart_name.replace(' ', '_').lower()
    
    if not flowchart_name:
        return jsonify({
            "status": "error",
            "message": "invalid flowchart name"
        }), 400
    
    flowchart_path = get_flowchart_path(flowchart_name)
    
    if os.path.exists(flowchart_path):
        return jsonify({
            "status": "error",
            "message": "flowchart already exists"
        }), 409
    
    try:
        # create empty flowchart
        empty_flowchart = {"nodes": [], "links": [], "groups": []}
        save_flowchart(empty_flowchart, flowchart_name + '.json')
        
        return jsonify({
            "status": "success",
            "message": f"created flowchart: {flowchart_name}",
            "flowchart": {
                "name": flowchart_name,
                "filename": flowchart_name + '.json'
            }
        })
    
    except Exception as e:
        return jsonify({
            "status": "error",
            "message": f"failed to create flowchart: {str(e)}"
        }), 500

@app.route('/api/flowcharts/<flowchart_name>', methods=['DELETE'])
def delete_flowchart(flowchart_name):
    """delete a flowchart"""
    try:
        flowchart_path = get_flowchart_path(flowchart_name)
        
        if not os.path.exists(flowchart_path):
            return jsonify({
                "status": "error",
                "message": "flowchart not found"
            }), 404
        
        # prevent deletion of default flowchart
        if flowchart_name == 'default.json':
            return jsonify({
                "status": "error",
                "message": "cannot delete default flowchart"
            }), 400
        
        # delete the flowchart file
        os.remove(flowchart_path)
        
        # also delete history directory if it exists
        history_dir = os.path.join('history', flowchart_name.replace('.json', ''))
        if os.path.exists(history_dir):
            import shutil
            shutil.rmtree(history_dir)
        
        return jsonify({
            "status": "success",
            "message": f"deleted flowchart: {flowchart_name}"
        })
    
    except Exception as e:
        return jsonify({
            "status": "error",
            "message": f"failed to delete flowchart: {str(e)}"
        }), 500

@app.route('/api/build', methods=['POST'])
def build_flowchart():
    """build action - placeholder for future functionality"""
    return jsonify({"status": "build triggered", "message": "build functionality to be implemented"})

@app.route('/api/run', methods=['POST'])
def run_flowchart():
    """run flowchart by executing nodes in order, stopping on failure"""
    data = request.json
    flowchart_name = data.get('flowchart_name', DEFAULT_FLOWCHART)
    execution_order = data.get('execution_order', [])
    
    if not execution_order:
        return jsonify({
            "status": "error",
            "message": "no nodes provided for execution"
        }), 400
    
    # load flowchart to get node information
    flowchart_data = load_flowchart(flowchart_name)
    node_lookup = {node['id']: node for node in flowchart_data['nodes']}
    
    results = []
    
    # execute nodes one by one, stopping on failure
    for i, node_id in enumerate(execution_order):
        if node_id not in node_lookup:
            return jsonify({
                "status": "error", 
                "message": f"node {node_id} not found",
                "results": results,
                "failed_at_index": i
            }), 404
            
        node = node_lookup[node_id]
        python_file = node.get('pythonFile')
        
        if not python_file:
            return jsonify({
                "status": "error",
                "message": f"node {node.get('name', node_id)} has no python file assigned",
                "results": results,
                "failed_at_index": i
            }), 400
        
        # execute the node
        try:
            # construct full file path
            normalized_python_file = python_file.replace('\\', '/')
            if normalized_python_file.startswith('nodes/'):
                file_path = os.path.normpath(python_file)
            else:
                file_path = os.path.join('nodes', python_file)
            
            if not os.path.exists(file_path):
                return jsonify({
                    "status": "error",
                    "message": f"python file not found: {python_file}",
                    "results": results,
                    "failed_at_index": i
                }), 404
            
            import subprocess
            import sys
            
            # execute the python file
            result = subprocess.run(
                [sys.executable, file_path],
                capture_output=True,
                text=True,
                timeout=30,
                cwd=os.getcwd()
            )
            
            node_result = {
                "node_id": node_id,
                "node_name": node.get('name', 'unknown'),
                "python_file": python_file,
                "success": result.returncode == 0,
                "output": result.stdout,
                "error": result.stderr if result.stderr else None,
                "return_code": result.returncode,
                "index": i
            }
            
            results.append(node_result)
            
            # if node failed, stop execution here
            if result.returncode != 0:
                return jsonify({
                    "status": "failed",
                    "message": f"execution stopped at node {node.get('name', node_id)} (index {i})",
                    "results": results,
                    "failed_at_index": i,
                    "total_nodes": len(execution_order),
                    "completed_nodes": i + 1
                })
                
        except subprocess.TimeoutExpired:
            return jsonify({
                "status": "error",
                "message": f"node {node.get('name', node_id)} timed out after 30 seconds",
                "results": results,
                "failed_at_index": i
            })
        except Exception as e:
            return jsonify({
                "status": "error",
                "message": f"failed to execute node {node.get('name', node_id)}: {str(e)}",
                "results": results,
                "failed_at_index": i
            })
    
    # all nodes executed successfully
    return jsonify({
        "status": "success",
        "message": f"successfully executed all {len(execution_order)} nodes",
        "results": results,
        "total_nodes": len(execution_order),
        "completed_nodes": len(execution_order)
    })

@app.route('/api/python-files', methods=['GET'])
def get_python_files():
    """get list of python files in the nodes directory"""
    nodes_dir = 'nodes'
    python_files = []
    
    try:
        if os.path.exists(nodes_dir):
            for filename in os.listdir(nodes_dir):
                if filename.endswith('.py'):
                    file_path = os.path.join(nodes_dir, filename)
                    # get file info
                    stat = os.stat(file_path)
                    python_files.append({
                        'filename': filename,
                        'name': filename[:-3],  # remove .py extension
                        'path': f"nodes/{filename}",
                        'size': stat.st_size,
                        'modified': stat.st_mtime
                    })
        
        # sort by filename
        python_files.sort(key=lambda x: x['filename'])
        
        return jsonify({
            "status": "success",
            "files": python_files,
            "count": len(python_files)
        })
    
    except Exception as e:
        return jsonify({
            "status": "error",
            "message": f"failed to list python files: {str(e)}"
        }), 500

@app.route('/api/editors', methods=['GET'])
def list_text_editors():
    """enumerate common text/code editors installed on the host system (best-effort, windows-focused)"""
    try:
        editors = []
        checked_paths = []

        def add_editor(name, path):
            # record only existing executables
            if path and os.path.exists(path):
                editors.append({
                    'name': name,
                    'path': path
                })
                checked_paths.append(path)

        # helper to try multiple candidate paths
        def first_existing_path(candidates):
            for p in candidates:
                if p and os.path.exists(p):
                    return p
            return None

        # environment folders
        program_files = os.environ.get('ProgramFiles', r'C:\Program Files')
        program_files_x86 = os.environ.get('ProgramFiles(x86)', r'C:\Program Files (x86)')
        local_app_data = os.environ.get('LOCALAPPDATA', os.path.expanduser(r'~\AppData\Local'))
        windows_dir = os.environ.get('WINDIR', r'C:\Windows')

        # cursor
        add_editor('cursor', first_existing_path([
            os.path.join(local_app_data, 'Programs', 'Cursor', 'Cursor.exe'),
            os.path.join(program_files, 'Cursor', 'Cursor.exe')
        ]))

        # visual studio code
        add_editor('visual studio code', first_existing_path([
            os.path.join(local_app_data, 'Programs', 'Microsoft VS Code', 'Code.exe'),
            os.path.join(program_files, 'Microsoft VS Code', 'Code.exe')
        ]))

        # visual studio (community/professional enterprise)
        vs_candidates = glob.glob(os.path.join(program_files, 'Microsoft Visual Studio', '*', '*', 'Common7', 'IDE', 'devenv.exe'))
        vs_candidates += glob.glob(os.path.join(program_files_x86, 'Microsoft Visual Studio', '*', '*', 'Common7', 'IDE', 'devenv.exe'))
        add_editor('visual studio', vs_candidates[0] if vs_candidates else None)

        # windsurf
        add_editor('windsurf', first_existing_path([
            os.path.join(local_app_data, 'Programs', 'Windsurf', 'Windsurf.exe'),
            os.path.join(program_files, 'Windsurf', 'Windsurf.exe')
        ]))

        # notepad++
        add_editor('notepad++', first_existing_path([
            os.path.join(program_files, 'Notepad++', 'notepad++.exe'),
            os.path.join(program_files_x86, 'Notepad++', 'notepad++.exe')
        ]))

        # sublime text
        add_editor('sublime text', first_existing_path([
            os.path.join(program_files, 'Sublime Text', 'sublime_text.exe'),
            os.path.join(program_files_x86, 'Sublime Text', 'sublime_text.exe')
        ]))

        # atom (legacy)
        add_editor('atom', first_existing_path([
            os.path.join(program_files, 'Atom', 'atom.exe'),
            os.path.join(program_files_x86, 'Atom', 'atom.exe')
        ]))

        # notepad (always available on windows)
        add_editor('notepad', first_existing_path([
            os.path.join(windows_dir, 'system32', 'notepad.exe'),
            os.path.join(windows_dir, 'notepad.exe')
        ]))

        # remove duplicates by path while preserving order
        unique = []
        seen = set()
        for ed in editors:
            if ed['path'] not in seen:
                unique.append(ed)
                seen.add(ed['path'])

        return jsonify({
            'status': 'success',
            'editors': unique,
            'count': len(unique)
        })
    except Exception as e:
        return jsonify({
            'status': 'error',
            'message': f'failed to enumerate editors: {str(e)}'
        }), 500

class PythonVariableAnalyzer:
    """analyze python files to extract variable definitions and usage"""
    
    def __init__(self):
        pass
    
    def analyze_file(self, file_path):
        """analyze a python file and extract variable information"""
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                content = f.read()
            
            tree = ast.parse(content)
            
            analysis = {
                'file_path': file_path,
                'imports': self._extract_imports(tree),
                'functions': self._extract_functions(tree),
                'variables': self._extract_variables(tree),
                'globals': self._extract_globals(tree)
            }
            
            return analysis
            
        except Exception as e:
            return {
                'error': f"failed to analyze {file_path}: {str(e)}",
                'file_path': file_path,
                'imports': [],
                'functions': [],
                'variables': [],
                'globals': []
            }
    
    def _extract_imports(self, tree):
        """extract import statements"""
        imports = []
        for node in ast.walk(tree):
            if isinstance(node, ast.Import):
                for alias in node.names:
                    imports.append({
                        'type': 'import',
                        'name': alias.name,
                        'asname': alias.asname
                    })
            elif isinstance(node, ast.ImportFrom):
                module = node.module or ''
                for alias in node.names:
                    imports.append({
                        'type': 'from_import',
                        'module': module,
                        'name': alias.name,
                        'asname': alias.asname
                    })
        return imports
    
    def _extract_functions(self, tree):
        """extract function definitions with parameters and return info"""
        functions = []
        for node in ast.walk(tree):
            if isinstance(node, ast.FunctionDef):
                func_info = {
                    'name': node.name,
                    'parameters': [],
                    'returns': [],
                    'line': node.lineno
                }
                
                # extract parameters
                for arg in node.args.args:
                    func_info['parameters'].append(arg.arg)
                
                # extract return statements with better analysis (only direct returns, not nested functions)
                for child in node.body:
                    self._extract_returns_from_statement(child, func_info['returns'])
                
                functions.append(func_info)
        return functions
    
    def _extract_returns_from_statement(self, stmt, returns_list):
        """recursively extract return statements from a statement, avoiding nested function definitions"""
        if isinstance(stmt, ast.Return) and stmt.value:
            if isinstance(stmt.value, ast.Name):
                returns_list.append({
                    'type': 'variable',
                    'name': stmt.value.id,
                    'line': stmt.lineno
                })
            elif isinstance(stmt.value, ast.Constant):
                returns_list.append({
                    'type': 'constant',
                    'value': str(stmt.value.value),
                    'data_type': type(stmt.value.value).__name__,
                    'line': stmt.lineno
                })
            elif isinstance(stmt.value, ast.List):
                returns_list.append({
                    'type': 'list',
                    'name': 'list',
                    'line': stmt.lineno
                })
            elif isinstance(stmt.value, ast.Dict):
                returns_list.append({
                    'type': 'dict',
                    'name': 'dict',
                    'line': stmt.lineno
                })
            elif isinstance(stmt.value, ast.Call):
                if isinstance(stmt.value.func, ast.Name):
                    returns_list.append({
                        'type': 'function_call',
                        'name': stmt.value.func.id + '()',
                        'line': stmt.lineno
                    })
            else:
                returns_list.append({
                    'type': 'expression',
                    'name': 'expression',
                    'line': stmt.lineno
                })
        elif isinstance(stmt, ast.If):
            # check if/else branches for returns
            for child in stmt.body:
                self._extract_returns_from_statement(child, returns_list)
            for child in stmt.orelse:
                self._extract_returns_from_statement(child, returns_list)
        elif isinstance(stmt, (ast.For, ast.While)):
            # check loop body for returns
            for child in stmt.body:
                self._extract_returns_from_statement(child, returns_list)
            for child in stmt.orelse:
                self._extract_returns_from_statement(child, returns_list)
        elif isinstance(stmt, ast.Try):
            # check try/except/finally blocks for returns
            for child in stmt.body:
                self._extract_returns_from_statement(child, returns_list)
            for handler in stmt.handlers:
                for child in handler.body:
                    self._extract_returns_from_statement(child, returns_list)
            for child in stmt.orelse:
                self._extract_returns_from_statement(child, returns_list)
            for child in stmt.finalbody:
                self._extract_returns_from_statement(child, returns_list)
        elif isinstance(stmt, ast.With):
            # check with block for returns
            for child in stmt.body:
                self._extract_returns_from_statement(child, returns_list)
        # note: we intentionally skip ast.FunctionDef and ast.ClassDef to avoid nested functions
    
    def _extract_variables(self, tree):
        """extract variable assignments and usage"""
        variables = []
        variable_usage = []
        
        for node in ast.walk(tree):
            if isinstance(node, ast.Assign):
                for target in node.targets:
                    if isinstance(target, ast.Name):
                        var_info = {
                            'name': target.id,
                            'line': node.lineno,
                            'type': 'assignment'
                        }
                        # try to determine the value type
                        if isinstance(node.value, ast.Constant):
                            var_info['value_type'] = type(node.value.value).__name__
                        elif isinstance(node.value, ast.Name):
                            var_info['depends_on'] = node.value.id
                        
                        variables.append(var_info)
            
            # also track variable usage (names that are referenced)
            elif isinstance(node, ast.Name) and isinstance(node.ctx, ast.Load):
                variable_usage.append({
                    'name': node.id,
                    'line': node.lineno,
                    'type': 'usage'
                })
        
        return {
            'assignments': variables,
            'usage': variable_usage
        }
    
    def _extract_globals(self, tree):
        """extract global variable declarations"""
        globals_list = []
        for node in ast.walk(tree):
            if isinstance(node, ast.Global):
                for name in node.names:
                    globals_list.append({
                        'name': name,
                        'line': node.lineno
                    })
        return globals_list
    
    def find_variable_dependencies(self, source_file, target_file):
        """find variables that pass from source to target file"""
        source_analysis = self.analyze_file(source_file)
        target_analysis = self.analyze_file(target_file)
        
        if 'error' in source_analysis or 'error' in target_analysis:
            return {
                'error': 'failed to analyze one or both files',
                'source_error': source_analysis.get('error'),
                'target_error': target_analysis.get('error'),
                'shared_variables': []
            }
        
        # find potential variable matches
        shared_variables = []
        
        # check if target imports from source
        source_filename = os.path.basename(source_file).replace('.py', '')
        for imp in target_analysis['imports']:
            if imp['type'] == 'from_import' and source_filename in imp.get('module', ''):
                # direct import relationship
                imported_name = imp['name']
                # find matching function/variable in source
                for func in source_analysis['functions']:
                    if func['name'] == imported_name:
                        shared_variables.append({
                            'name': imported_name,
                            'type': 'function_import',
                            'source_line': func['line'],
                            'parameters': func['parameters'],
                            'returns': func['returns']
                        })
                
                for var in source_analysis['variables']['assignments']:
                    if var['name'] == imported_name:
                        shared_variables.append({
                            'name': imported_name,
                            'type': 'variable_import',
                            'source_line': var['line'],
                            'value_type': var.get('value_type', 'unknown')
                        })
        
        # extract variable names from the new structure
        source_assignments = {var['name'] for var in source_analysis['variables']['assignments']}
        source_usage = {var['name'] for var in source_analysis['variables']['usage']}
        source_func_names = {func['name'] for func in source_analysis['functions']}
        
        target_assignments = {var['name'] for var in target_analysis['variables']['assignments']}
        target_usage = {var['name'] for var in target_analysis['variables']['usage']}
        target_func_names = {func['name'] for func in target_analysis['functions']}
        
        # find variables defined in source and used in target (high confidence)
        defined_and_used = source_assignments.intersection(target_usage)
        for var_name in defined_and_used:
            if not any(sv['name'] == var_name for sv in shared_variables):
                # get source assignment details
                source_var = next((v for v in source_analysis['variables']['assignments'] if v['name'] == var_name), None)
                target_var = next((v for v in target_analysis['variables']['usage'] if v['name'] == var_name), None)
                
                shared_variables.append({
                    'name': var_name,
                    'type': 'defined_and_used',
                    'confidence': 'high',
                    'source_line': source_var['line'] if source_var else None,
                    'target_line': target_var['line'] if target_var else None,
                    'value_type': source_var.get('value_type', 'unknown') if source_var else 'unknown'
                })
        
        # find common variable assignments (medium confidence)
        common_assignments = source_assignments.intersection(target_assignments)
        for var_name in common_assignments:
            if not any(sv['name'] == var_name for sv in shared_variables):
                shared_variables.append({
                    'name': var_name,
                    'type': 'common_assignment',
                    'confidence': 'medium'
                })
        
        # find function parameter matching
        for target_func in target_analysis['functions']:
            for param in target_func['parameters']:
                if param in source_assignments or param in source_func_names:
                    if not any(sv['name'] == param for sv in shared_variables):
                        shared_variables.append({
                            'name': param,
                            'type': 'parameter_match',
                            'target_function': target_func['name'],
                            'confidence': 'low'
                        })
        
        return {
            'source_file': source_file,
            'target_file': target_file,
            'shared_variables': shared_variables,
            'source_analysis': source_analysis,
            'target_analysis': target_analysis
        }

@app.route('/api/analyze-connection', methods=['POST'])
def analyze_connection():
    """analyze variable dependencies between two connected python files"""
    data = request.json
    source_node_id = data.get('source_node_id')
    target_node_id = data.get('target_node_id')
    
    if not source_node_id or not target_node_id:
        return jsonify({
            'status': 'error',
            'message': 'source_node_id and target_node_id are required'
        }), 400
    
    # load current flowchart to get node information
    flowchart_name = data.get('flowchart_name', DEFAULT_FLOWCHART)
    flowchart_data = load_flowchart(flowchart_name)
    
    # find the nodes
    source_node = next((n for n in flowchart_data['nodes'] if n['id'] == source_node_id), None)
    target_node = next((n for n in flowchart_data['nodes'] if n['id'] == target_node_id), None)
    
    if not source_node or not target_node:
        return jsonify({
            'status': 'error',
            'message': 'one or both nodes not found'
        }), 404
    
    # get python file paths
    source_file = source_node.get('pythonFile')
    target_file = target_node.get('pythonFile')
    
    if not source_file or not target_file:
        return jsonify({
            'status': 'error',
            'message': 'both nodes must have python files assigned'
        }), 400
    
    # construct full file paths - normalize and ensure we don't double up on nodes directory
    # normalize source path
    normalized_source = source_file.replace('\\', '/')
    if normalized_source.startswith('nodes/'):
        source_path = os.path.normpath(source_file)
    else:
        source_path = os.path.join('nodes', source_file)
    
    # normalize target path  
    normalized_target = target_file.replace('\\', '/')
    if normalized_target.startswith('nodes/'):
        target_path = os.path.normpath(target_file)
    else:
        target_path = os.path.join('nodes', target_file)
    
    # check if files exist
    if not os.path.exists(source_path) or not os.path.exists(target_path):
        return jsonify({
            'status': 'error',
            'message': 'one or both python files not found'
        }), 404
    
    try:
        analyzer = PythonVariableAnalyzer()
        analysis = analyzer.find_variable_dependencies(source_path, target_path)
        
        return jsonify({
            'status': 'success',
            'analysis': analysis,
            'source_node': {
                'id': source_node_id,
                'name': source_node.get('name'),
                'file': source_file
            },
            'target_node': {
                'id': target_node_id,
                'name': target_node.get('name'),
                'file': target_file
            }
        })
        
    except Exception as e:
        return jsonify({
            'status': 'error',
            'message': f'analysis failed: {str(e)}'
        }), 500

@app.route('/api/execute-node', methods=['POST'])
def execute_node():
    """execute a single function from a python file for a specific node"""
    data = request.json
    node_id = data.get('node_id')
    python_file = data.get('python_file')
    node_name = data.get('node_name', 'unknown')
    function_args = data.get('function_args', {})  # variables from previous nodes (for function parameters)
    input_values = data.get('input_values', {})   # values from input node (for input() calls)
    
    if not node_id or not python_file:
        return jsonify({
            'success': False,
            'error': 'node_id and python_file are required'
        }), 400
    
    # construct full file path
    normalized_python_file = python_file.replace('\\', '/')
    if normalized_python_file.startswith('nodes/'):
        file_path = os.path.normpath(python_file)
    else:
        file_path = os.path.join('nodes', python_file)
    
    # check if file exists
    if not os.path.exists(file_path):
        return jsonify({
            'success': False,
            'error': f'python file not found: {python_file}'
        }), 404
    
    try:
        # execute the function and capture results
        result = execute_python_function_with_tracking(file_path, function_args, input_values, node_id)
        return result
        
    except Exception as e:
        return jsonify({
            'success': False,
            'error': f'failed to execute node: {str(e)}'
        }), 500


def execute_python_function_with_tracking(file_path, function_args=None, input_values=None, node_id=None):
    """execute a single function from a python file with process tracking for termination"""
    if function_args is None:
        function_args = {}
    if input_values is None:
        input_values = {}
    
    temp_script_path = None
    process = None
    
    try:
        import sys
        import tempfile
        import json
        import time
        
        # create a temporary script that will execute the function
        with tempfile.NamedTemporaryFile(mode='w', suffix='.py', delete=False, encoding='utf-8') as temp_script:
            # read the original file
            with open(file_path, 'r', encoding='utf-8') as f:
                original_content = f.read()
            
            # parse to find function name
            tree = ast.parse(original_content)
            functions = []
            for node in ast.walk(tree):
                if isinstance(node, ast.FunctionDef):
                    functions.append({
                        'name': node.name,
                        'args': [arg.arg for arg in node.args.args]
                    })
            
            if not functions:
                return {
                    'success': False,
                    'error': 'no function found in python file',
                    'output': '',
                    'return_value': None
                }
            
            function_name = functions[0]['name']
            formal_function_args = functions[0]['args']
            
            # prepare call arguments for formal function parameters (from previous nodes)
            call_args = {}
            missing_args = []
            
            # handle formal function parameters - these come from previous nodes
            for arg_name in formal_function_args:
                if arg_name in function_args:
                    call_args[arg_name] = function_args[arg_name]
                    print(f"debug: matched function parameter {arg_name} = {function_args[arg_name]}")
                else:
                    missing_args.append(arg_name)
                    print(f"debug: missing function parameter {arg_name}")
            
            print(f"debug: function {function_name} expects formal args: {formal_function_args}")
            print(f"debug: received function_args (from previous nodes): {function_args}")
            print(f"debug: received input_values (for input() calls): {input_values}")
            print(f"debug: prepared call_args for function: {call_args}")
            print(f"debug: missing_args: {missing_args}")
            
            if missing_args:
                return {
                    'success': False,
                    'error': f'missing required function arguments: {", ".join(missing_args)}',
                    'output': '',
                    'return_value': None
                }
            
            # write the wrapper script
            temp_script.write(f'''
import json
import sys
import os
sys.path.insert(0, os.path.dirname({repr(file_path)}))

# mock input function to return provided values
input_values_for_mock = {repr(input_values)}
input_call_count = 0

def mock_input(prompt=""):
    global input_call_count, input_values_for_mock
    
    # increment call count first
    input_call_count += 1
    
    # use input values in order (from input node)
    value_list = list(input_values_for_mock.values())
    if input_call_count <= len(value_list):
        value = value_list[input_call_count - 1]
        print(f"{{prompt}}{{value}}")  # simulate user input display
        return str(value)
    else:
        # no value provided, return empty string
        print(f"{{prompt}}")
        return ""

# replace the built-in input function
import builtins
builtins.input = mock_input

# import the original module
{original_content}

# execute the function
try:
    # call function with appropriate parameters
    if {len(formal_function_args) > 0}:
        # function has formal parameters - pass them as keyword arguments
        result = {function_name}(**{repr(call_args)})
    else:
        # function has no formal parameters (uses input() calls)
        result = {function_name}()
    
    # output result as JSON
    output_data = {{
        'success': True,
        'return_value': result,
        'function_name': '{function_name}',
        'function_args': {repr(call_args)},
        'input_values': {repr(input_values)}
    }}
    print("__RESULT_START__")
    print(json.dumps(output_data, default=str))
    print("__RESULT_END__")
    
except Exception as e:
    output_data = {{
        'success': False,
        'error': str(e),
        'function_name': '{function_name}',
        'function_args': {repr(call_args)},
        'input_values': {repr(input_values)}
    }}
    print("__RESULT_START__")
    print(json.dumps(output_data, default=str))
    print("__RESULT_END__")
''')
            temp_script_path = temp_script.name
        
        # execute the temporary script in subprocess
        process = subprocess.Popen(
            [sys.executable, temp_script_path],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            cwd=os.getcwd()
        )
        
        # track the process if node_id provided
        if node_id:
            with process_lock:
                running_processes[node_id] = {
                    'process': process,
                    'start_time': datetime.now(),
                    'file_path': file_path,
                    'temp_script_path': temp_script_path  # track temp file for cleanup
                }
        
        try:
            # wait for process to complete
            stdout, stderr = process.communicate(timeout=30)
            
            # ensure process is fully terminated before cleanup
            process.wait()
            
            # clean up process tracking
            if node_id:
                with process_lock:
                    running_processes.pop(node_id, None)
            
            # extract result from output first (before cleanup)
            result_data = None
            if "__RESULT_START__" in stdout and "__RESULT_END__" in stdout:
                result_start = stdout.find("__RESULT_START__") + len("__RESULT_START__")
                result_end = stdout.find("__RESULT_END__")
                result_json = stdout[result_start:result_end].strip()
                
                try:
                    result_data = json.loads(result_json)
                    
                    # get console output (everything except the result JSON)
                    console_output = stdout[:stdout.find("__RESULT_START__")].strip()
                    if stdout[result_end + len("__RESULT_END__"):].strip():
                        console_output += stdout[result_end + len("__RESULT_END__"):].strip()
                    
                    result_data['output'] = console_output
                    result_data['error'] = stderr if stderr else result_data.get('error')
                    
                except json.JSONDecodeError:
                    pass
            
            # fallback result if parsing failed
            if result_data is None:
                result_data = {
                    'success': process.returncode == 0,
                    'output': stdout,
                    'error': stderr if stderr else None,
                    'return_value': None,
                    'function_name': function_name,
                    'function_args': call_args,
                    'input_values': input_values
                }
            
            return result_data
            
        except subprocess.TimeoutExpired:
            # kill the process
            try:
                process.kill()
                process.wait(timeout=5)  # wait for process to be killed
            except:
                pass
                
            if node_id:
                with process_lock:
                    running_processes.pop(node_id, None)
                    
            return {
                'success': False,
                'error': 'execution timed out after 30 seconds',
                'output': '',
                'return_value': None
            }
            
    except Exception as e:
        # clean up process if it was created
        if process:
            try:
                process.kill()
                process.wait(timeout=5)
            except:
                pass
                
        if node_id:
            with process_lock:
                running_processes.pop(node_id, None)
                
        return {
            'success': False,
            'error': f'execution failed: {str(e)}',
            'output': '',
            'return_value': None
        }
    
    finally:
        # robust cleanup of temporary file with retry logic for Windows
        if temp_script_path and os.path.exists(temp_script_path):
            max_retries = 5
            for attempt in range(max_retries):
                try:
                    os.unlink(temp_script_path)
                    break  # success
                except (OSError, PermissionError) as e:
                    if attempt < max_retries - 1:
                        # wait a bit and retry - file might still be locked
                        time.sleep(0.1 * (attempt + 1))  # increasing delay
                    else:
                        # log the failure but don't raise - this is cleanup
                        print(f"warning: failed to clean up temporary file {temp_script_path}: {e}")
                except Exception:
                    # any other exception during cleanup should not propagate
                    break

@app.route('/api/history', methods=['GET'])
def get_history():
    """get execution history for a flowchart"""
    flowchart_name = request.args.get('flowchart_name', DEFAULT_FLOWCHART)
    
    try:
        history_entries = get_execution_history(flowchart_name)
        
        # process entries to add summary information
        processed_entries = []
        for entry in history_entries:
            execution_data = entry['execution_data']
            
            # calculate summary stats
            total_nodes = len(execution_data.get('execution_order', []))
            successful_nodes = len([r for r in execution_data.get('results', []) if r.get('success', False)])
            success_percentage = (successful_nodes / total_nodes * 100) if total_nodes > 0 else 0
            
            # find failed node
            failed_node = None
            for result in execution_data.get('results', []):
                if not result.get('success', False):
                    failed_node = result.get('node_name', 'unknown')
                    break
            
            processed_entry = {
                'execution_id': entry['execution_id'],
                'timestamp': entry['timestamp'],
                'flowchart_name': entry['flowchart_name'],
                'total_nodes': total_nodes,
                'successful_nodes': successful_nodes,
                'success_percentage': round(success_percentage, 1),
                'failed_node': failed_node,
                'status': execution_data.get('status', 'unknown'),
                'execution_time': datetime.fromisoformat(entry['timestamp']).strftime('%Y-%m-%d %H:%M:%S')
            }
            processed_entries.append(processed_entry)
        
        return jsonify({
            'status': 'success',
            'history': processed_entries,
            'count': len(processed_entries)
        })
        
    except Exception as e:
        return jsonify({
            'status': 'error',
            'message': f'failed to get history: {str(e)}'
        }), 500

@app.route('/api/history/<execution_id>', methods=['GET'])
def get_execution_details(execution_id):
    """get detailed execution data for viewing"""
    flowchart_name = request.args.get('flowchart_name', DEFAULT_FLOWCHART)
    
    try:
        # remove .json extension if present
        if flowchart_name.endswith('.json'):
            flowchart_name = flowchart_name[:-5]
        
        history_path = os.path.join(HISTORY_DIR, flowchart_name)
        filepath = os.path.join(history_path, f"{execution_id}.json")
        
        if not os.path.exists(filepath):
            return jsonify({
                'status': 'error',
                'message': 'execution not found'
            }), 404
        
        with open(filepath, 'r') as f:
            entry = json.load(f)
        
        return jsonify({
            'status': 'success',
            'execution': entry
        })
        
    except Exception as e:
        return jsonify({
            'status': 'error',
            'message': f'failed to get execution details: {str(e)}'
        }), 500

@app.route('/api/history/<execution_id>', methods=['DELETE'])
def delete_history_entry(execution_id):
    """delete an execution history entry"""
    flowchart_name = request.args.get('flowchart_name', DEFAULT_FLOWCHART)
    
    try:
        success = delete_execution_history(flowchart_name, execution_id)
        
        if success:
            return jsonify({
                'status': 'success',
                'message': 'execution history deleted'
            })
        else:
            return jsonify({
                'status': 'error',
                'message': 'execution not found'
            }), 404
            
    except Exception as e:
        return jsonify({
            'status': 'error',
            'message': f'failed to delete execution: {str(e)}'
        }), 500

def _extract_returns_from_statement(stmt, returns_list):
    """recursively extract return statements from a statement, avoiding nested function definitions"""
    if isinstance(stmt, ast.Return) and stmt.value:
        if isinstance(stmt.value, ast.Name):
            returns_list.append({
                'type': 'variable',
                'name': stmt.value.id,
                'line': stmt.lineno
            })
        elif isinstance(stmt.value, ast.Constant):
            returns_list.append({
                'type': 'constant',
                'value': str(stmt.value.value),
                'data_type': type(stmt.value.value).__name__,
                'line': stmt.lineno
            })
        elif isinstance(stmt.value, ast.List):
            returns_list.append({
                'type': 'list',
                'name': 'list',
                'line': stmt.lineno
            })
        elif isinstance(stmt.value, ast.Dict):
            returns_list.append({
                'type': 'dict',
                'name': 'dict',
                'line': stmt.lineno
            })
        elif isinstance(stmt.value, ast.Call):
            if isinstance(stmt.value.func, ast.Name):
                returns_list.append({
                    'type': 'function_call',
                    'name': stmt.value.func.id + '()',
                    'line': stmt.lineno
                })
        else:
            returns_list.append({
                'type': 'expression',
                'name': 'expression',
                'line': stmt.lineno
            })
    elif isinstance(stmt, ast.If):
        # check if/else branches for returns
        for child in stmt.body:
            _extract_returns_from_statement(child, returns_list)
        for child in stmt.orelse:
            _extract_returns_from_statement(child, returns_list)
    elif isinstance(stmt, (ast.For, ast.While)):
        # check loop body for returns
        for child in stmt.body:
            _extract_returns_from_statement(child, returns_list)
        for child in stmt.orelse:
            _extract_returns_from_statement(child, returns_list)
    elif isinstance(stmt, ast.Try):
        # check try/except/finally blocks for returns
        for child in stmt.body:
            _extract_returns_from_statement(child, returns_list)
        for handler in stmt.handlers:
            for child in handler.body:
                _extract_returns_from_statement(child, returns_list)
        for child in stmt.orelse:
            _extract_returns_from_statement(child, returns_list)
        for child in stmt.finalbody:
            _extract_returns_from_statement(child, returns_list)
    elif isinstance(stmt, ast.With):
        # check with block for returns
        for child in stmt.body:
            _extract_returns_from_statement(child, returns_list)
    # note: we intentionally skip ast.FunctionDef and ast.ClassDef to avoid nested functions

@app.route('/api/analyze-python-function', methods=['POST'])
def analyze_python_function():
    """analyze a python file to get function information"""
    data = request.json
    python_file = data.get('python_file')
    
    if not python_file:
        return jsonify({
            'success': False,
            'error': 'python_file is required'
        }), 400
    
    # construct full file path
    normalized_python_file = python_file.replace('\\', '/')
    if normalized_python_file.startswith('nodes/'):
        file_path = os.path.normpath(python_file)
    else:
        file_path = os.path.join('nodes', python_file)
    
    # check if file exists
    if not os.path.exists(file_path):
        return jsonify({
            'success': False,
            'error': f'python file not found: {python_file}'
        }), 404
    
    try:
        # read and parse the python file
        with open(file_path, 'r', encoding='utf-8') as f:
            file_content = f.read()
        
        tree = ast.parse(file_content)
        
        # find all function definitions and top-level input assignments
        functions = []
        
        # first, check for top-level input assignments (when no functions exist)
        top_level_input_vars = []
        top_level_input_calls = []
        
        for node in ast.walk(tree):
            if isinstance(node, ast.Assign):
                # check if the assignment value is an input() call
                if (isinstance(node.value, ast.Call) and 
                    isinstance(node.value.func, ast.Name) and 
                    node.value.func.id == 'input'):
                    
                    # get the variable name(s) being assigned to
                    for target in node.targets:
                        if isinstance(target, ast.Name):
                            variable_name = target.id
                            top_level_input_vars.append(variable_name)
                            
                            # also extract prompt for backward compatibility
                            if (len(node.value.args) > 0 and 
                                isinstance(node.value.args[0], ast.Constant)):
                                prompt = node.value.args[0].value
                                # create a parameter name from the prompt for fallback
                                base_param_name = prompt.replace("Enter ", "").replace(":", "").replace(" ", "_").lower()
                                if not base_param_name:
                                    base_param_name = "input"
                                top_level_input_calls.append(base_param_name)
                            else:
                                top_level_input_calls.append(variable_name.lower())
        
        # then, check for top-level function definitions only
        for node in tree.body:
            if isinstance(node, ast.FunctionDef):
                # get formal parameters
                formal_params = [arg.arg for arg in node.args.args]
                
                # find input() calls within assignment statements to get variable names
                input_calls = []
                input_variable_names = []
                
                # look for assignment statements where input() is assigned to a variable
                for child in ast.walk(node):
                    if isinstance(child, ast.Assign):
                        # check if the assignment value is an input() call
                        if (isinstance(child.value, ast.Call) and 
                            isinstance(child.value.func, ast.Name) and 
                            child.value.func.id == 'input'):
                            
                            # get the variable name(s) being assigned to
                            for target in child.targets:
                                if isinstance(target, ast.Name):
                                    variable_name = target.id
                                    input_variable_names.append(variable_name)
                                    
                                    # also extract prompt for backward compatibility
                                    if (len(child.value.args) > 0 and 
                                        isinstance(child.value.args[0], ast.Constant)):
                                        prompt = child.value.args[0].value
                                        # create a parameter name from the prompt for fallback
                                        base_param_name = prompt.replace("Enter ", "").replace(":", "").replace(" ", "_").lower()
                                        if not base_param_name:
                                            base_param_name = "input"
                                        input_calls.append(base_param_name)
                                    else:
                                        input_calls.append(variable_name.lower())
                
                # use variable names as the primary parameter names
                all_parameters = input_variable_names if input_variable_names else input_calls
                
                # extract return statements from this function only
                returns = []
                for child in node.body:
                    _extract_returns_from_statement(child, returns)
                
                functions.append({
                    'name': node.name,
                    'parameters': all_parameters,
                    'formal_parameters': formal_params,
                    'input_calls': input_calls,
                    'input_variable_names': input_variable_names,
                    'returns': returns,
                    'line': node.lineno
                })
        
        # if no functions found but there are top-level input assignments, create a virtual function
        if not functions and top_level_input_vars:
            all_parameters = top_level_input_vars if top_level_input_vars else top_level_input_calls
            functions.append({
                'name': 'main',  # virtual function name for top-level code
                'parameters': all_parameters,
                'formal_parameters': [],
                'input_calls': top_level_input_calls,
                'input_variable_names': top_level_input_vars,
                'line': 1
            })
        
        if not functions:
            return jsonify({
                'success': False,
                'error': 'no function or input assignments found in python file',
                'parameters': []
            })
        
        # return info about the first function (assuming single function per file)
        target_function = functions[0]
        
        return jsonify({
            'success': True,
            'function_name': target_function['name'],
            'parameters': target_function.get('parameters', []),  # use parameters which now contains variable names
            'formal_parameters': target_function.get('formal_parameters', []),  # for variable passing
            'input_calls': target_function.get('input_calls', []),
            'input_variable_names': target_function.get('input_variable_names', []),
            'returns': target_function.get('returns', []),  # add return information
            'line': target_function['line']
        })
        
    except Exception as e:
        return jsonify({
            'success': False,
            'error': f'failed to analyze python file: {str(e)}',
            'parameters': []
        }), 500

@app.route('/api/save-execution', methods=['POST'])
def save_execution():
    """save execution results to history"""
    data = request.json
    flowchart_name = data.get('flowchart_name', DEFAULT_FLOWCHART)
    execution_data = data.get('execution_data', {})
    
    try:
        execution_id = save_execution_history(flowchart_name, execution_data)
        
        return jsonify({
            'status': 'success',
            'execution_id': execution_id,
            'message': 'execution saved to history'
        })
        
    except Exception as e:
        return jsonify({
            'status': 'error',
            'message': f'failed to save execution: {str(e)}'
        }), 500

@app.route('/api/stop-execution', methods=['POST'])
def stop_execution():
    """stop all currently running Python processes"""
    terminated_count = 0
    cleaned_files = 0
    
    with process_lock:
        # terminate all tracked processes
        for node_id, process_info in list(running_processes.items()):
            try:
                process = process_info['process']
                temp_script_path = process_info.get('temp_script_path')
                
                if process.poll() is None:  # process is still running
                    # terminate the process and its children
                    try:
                        parent = psutil.Process(process.pid)
                        children = parent.children(recursive=True)
                        
                        # terminate children first
                        for child in children:
                            try:
                                child.terminate()
                            except psutil.NoSuchProcess:
                                pass
                        
                        # terminate parent
                        parent.terminate()
                        terminated_count += 1
                        
                        # wait a bit for graceful termination
                        try:
                            parent.wait(timeout=2)
                        except psutil.TimeoutExpired:
                            # force kill if still running
                            try:
                                parent.kill()
                                for child in children:
                                    try:
                                        child.kill()
                                    except psutil.NoSuchProcess:
                                        pass
                            except psutil.NoSuchProcess:
                                pass
                                
                    except psutil.NoSuchProcess:
                        # process already terminated
                        pass
                
                # clean up temporary file if it exists
                if temp_script_path and os.path.exists(temp_script_path):
                    max_retries = 3
                    for attempt in range(max_retries):
                        try:
                            os.unlink(temp_script_path)
                            cleaned_files += 1
                            break
                        except (OSError, PermissionError):
                            if attempt < max_retries - 1:
                                import time
                                time.sleep(0.1)  # wait and retry
                            else:
                                print(f"warning: could not clean up temp file {temp_script_path}")
                        except Exception:
                            break
                        
                # remove from tracking
                del running_processes[node_id]
                
            except Exception as e:
                print(f"error terminating process for node {node_id}: {e}")
    
    return jsonify({
        'status': 'success',
        'message': f'terminated {terminated_count} running processes, cleaned up {cleaned_files} temporary files'
    })

if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5000)