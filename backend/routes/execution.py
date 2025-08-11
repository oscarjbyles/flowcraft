from flask import Blueprint, jsonify, request
import os
import subprocess
import sys
from datetime import datetime

from ..services.storage import DEFAULT_FLOWCHART, load_flowchart, save_execution_history, get_execution_history, delete_execution_history
from ..services.analysis import PythonVariableAnalyzer, extract_returns_from_statement
from ..services.processes import (
    execute_python_function_with_tracking,
    stop_all_processes,
    create_temp_execution_script,
    start_unbuffered_process,
)


execution_bp = Blueprint('execution', __name__, url_prefix='/api')

# these globals preserve the existing behavior for process tracking
running_processes = {}
import threading
process_lock = threading.Lock()


@execution_bp.route('/run', methods=['POST'])
def run_flowchart():
    data = request.json
    flowchart_name = data.get('flowchart_name', DEFAULT_FLOWCHART)
    execution_order = data.get('execution_order', [])
    if not execution_order:
        return jsonify({"status": "error", "message": "no nodes provided for execution"}), 400
    flowchart_data = load_flowchart(flowchart_name)
    node_lookup = {node['id']: node for node in flowchart_data['nodes']}
    results = []
    for i, node_id in enumerate(execution_order):
        if node_id not in node_lookup:
            return jsonify({"status": "error", "message": f"node {node_id} not found", "results": results, "failed_at_index": i}), 404
        node = node_lookup[node_id]
        python_file = node.get('pythonFile')
        if not python_file:
            return jsonify({"status": "error", "message": f"node {node.get('name', node_id)} has no python file assigned", "results": results, "failed_at_index": i}), 400
        try:
            normalized_python_file = python_file.replace('\\', '/')
            if normalized_python_file.startswith('nodes/'):
                file_path = os.path.normpath(python_file)
            else:
                file_path = os.path.join('nodes', python_file)
            if not os.path.exists(file_path):
                return jsonify({"status": "error", "message": f"python file not found: {python_file}", "results": results, "failed_at_index": i}), 404
            result = subprocess.run([sys.executable, file_path], capture_output=True, text=True, timeout=30, cwd=os.getcwd())
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
            if result.returncode != 0:
                return jsonify({"status": "failed", "message": f"execution stopped at node {node.get('name', node_id)} (index {i})", "results": results, "failed_at_index": i, "total_nodes": len(execution_order), "completed_nodes": i + 1})
        except subprocess.TimeoutExpired:
            return jsonify({"status": "error", "message": f"node {node.get('name', node_id)} timed out after 30 seconds", "results": results, "failed_at_index": i})
        except Exception as e:
            return jsonify({"status": "error", "message": f"failed to execute node {node.get('name', node_id)}: {str(e)}", "results": results, "failed_at_index": i})
    return jsonify({"status": "success", "message": f"successfully executed all {len(execution_order)} nodes", "results": results, "total_nodes": len(execution_order), "completed_nodes": len(execution_order)})


@execution_bp.route('/execute-node', methods=['POST'])
def execute_node():
    data = request.json
    node_id = data.get('node_id')
    python_file = data.get('python_file')
    function_args = data.get('function_args', {})
    input_values = data.get('input_values', {})
    if not node_id or not python_file:
        return jsonify({'success': False, 'error': 'node_id and python_file are required'}), 400
    normalized_python_file = python_file.replace('\\', '/')
    if normalized_python_file.startswith('nodes/'):
        file_path = os.path.normpath(python_file)
    else:
        file_path = os.path.join('nodes', python_file)
    if not os.path.exists(file_path):
        return jsonify({'success': False, 'error': f'python file not found: {python_file}'}), 404
    try:
        result = execute_python_function_with_tracking(file_path, function_args, input_values, node_id, running_processes, process_lock)
        return result
    except Exception as e:
        return jsonify({'success': False, 'error': f'failed to execute node: {str(e)}'}), 500


@execution_bp.route('/execute-node-stream', methods=['POST'])
def execute_node_stream():
    # live stream stdout as server-sent events while also returning a final result event
    data = request.json
    node_id = data.get('node_id')
    python_file = data.get('python_file')
    function_args = data.get('function_args', {})
    input_values = data.get('input_values', {})
    if not node_id or not python_file:
        return jsonify({'success': False, 'error': 'node_id and python_file are required'}), 400
    normalized_python_file = python_file.replace('\\', '/')
    if normalized_python_file.startswith('nodes/'):
        file_path = os.path.normpath(python_file)
    else:
        file_path = os.path.join('nodes', python_file)
    if not os.path.exists(file_path):
        return jsonify({'success': False, 'error': f'python file not found: {python_file}'}), 404

    meta = create_temp_execution_script(file_path, function_args, input_values)
    if 'error' in meta:
        return jsonify({'success': False, 'error': meta['error']}), 400

    temp_script_path = meta['temp_script_path']
    proc = start_unbuffered_process(temp_script_path)

    # register running process for stop support
    with process_lock:
        running_processes[node_id] = {
            'process': proc,
            'start_time': datetime.now(),
            'file_path': file_path,
            'temp_script_path': temp_script_path
        }

    def event_stream():
        try:
            all_stdout_parts = []
            # stream stdout lines
            if proc.stdout is not None:
                for line in proc.stdout:
                    if not line:
                        break
                    all_stdout_parts.append(line)
                    yield f"event: stdout\ndata: {line.rstrip()}\n\n"
            # wait for process completion to collect remaining output/error and final result
            proc.wait()
            stdout = ''.join(all_stdout_parts)
            stderr = ''
            try:
                if proc.stdout:
                    try:
                        remaining = proc.stdout.read()
                        if remaining:
                            stdout += remaining
                    except Exception:
                        pass
                if proc.stderr:
                    stderr = proc.stderr.read() or ''
            except Exception:
                pass

            # parse embedded result if present
            result_data = None
            if "__RESULT_START__" in stdout and "__RESULT_END__" in stdout:
                result_start = stdout.find("__RESULT_START__") + len("__RESULT_START__")
                result_end = stdout.find("__RESULT_END__")
                result_json = stdout[result_start:result_end].strip()
                try:
                    import json as _json
                    result_data = _json.loads(result_json)
                    console_output = stdout[:stdout.find("__RESULT_START__")].strip()
                    if stdout[result_end + len("__RESULT_END__"):].strip():
                        console_output += stdout[result_end + len("__RESULT_END__"):].strip()
                    result_data['output'] = console_output
                    result_data['error'] = stderr if stderr else result_data.get('error')
                except Exception:
                    pass
            if result_data is None:
                result_data = {
                    'success': proc.returncode == 0,
                    'output': stdout,
                    'error': stderr if stderr else None,
                    'return_value': None,
                }

            # clean up from running processes
            with process_lock:
                running_processes.pop(node_id, None)

            import json as _json
            yield f"event: result\ndata: {_json.dumps(result_data)}\n\n"
        finally:
            # ensure temp file is removed
            try:
                if temp_script_path and os.path.exists(temp_script_path):
                    os.unlink(temp_script_path)
            except Exception:
                pass

    from flask import Response
    headers = {"Cache-Control": "no-cache", "X-Accel-Buffering": "no"}
    return Response(event_stream(), mimetype='text/event-stream', headers=headers)


@execution_bp.route('/stop-execution', methods=['POST'])
def stop_execution():
    terminated = 0
    cleaned = 0
    import threading as _t
    with process_lock:
        outcome = stop_all_processes(running_processes)
        terminated = outcome.get('terminated', 0)
        cleaned = outcome.get('cleaned_files', 0)
    return jsonify({'status': 'success', 'message': f'terminated {terminated} running processes, cleaned up {cleaned} temporary files'})


@execution_bp.route('/save-execution', methods=['POST'])
def save_execution():
    """save execution results to history"""
    data = request.json or {}
    flowchart_name = data.get('flowchart_name', DEFAULT_FLOWCHART)
    execution_data = data.get('execution_data', {})
    try:
        execution_id = save_execution_history(flowchart_name, execution_data)
        return jsonify({'status': 'success', 'execution_id': execution_id, 'message': 'execution saved to history'})
    except Exception as e:
        return jsonify({'status': 'error', 'message': f'failed to save execution: {str(e)}'}), 500


@execution_bp.route('/history', methods=['GET'])
def get_history():
    flowchart_name = request.args.get('flowchart_name', DEFAULT_FLOWCHART)
    try:
        history_entries = get_execution_history(flowchart_name)
        processed_entries = []
        for entry in history_entries:
            try:
                execution_data = entry.get('execution_data', {})
                execution_order = execution_data.get('execution_order', []) or []
                total_nodes = len(execution_order)
                results = execution_data.get('results', []) or []
                # exclude data_save nodes: only consider nodes that are part of the execution order
                order_id_set = set(execution_order)
                results_in_order = [r for r in results if r.get('node_id') in order_id_set]
                successful_nodes = len([r for r in results_in_order if r.get('success', False)])
                success_percentage = (successful_nodes / total_nodes * 100) if total_nodes > 0 else 0
                failed_node = None
                for result in results_in_order:
                    if not result.get('success', False):
                        failed_node = result.get('node_name', 'unknown')
                        break
                elapsed_ms = 0
                for r in results_in_order:
                    try:
                        elapsed_ms += int(r.get('runtime', 0) or 0)
                    except Exception:
                        pass
                def _format_elapsed(ms: int) -> str:
                    try:
                        ms = int(ms)
                    except Exception:
                        return '0ms'
                    if ms < 1000:
                        return f"{ms}ms"
                    seconds = ms / 1000.0
                    if seconds < 60:
                        return f"{seconds:.2f}s"
                    minutes = int(seconds // 60)
                    rem = seconds - minutes * 60
                    return f"{minutes}m {rem:.1f}s"
                try:
                    saved_at_human = datetime.fromisoformat(entry.get('timestamp', '')).strftime('%Y-%m-%d %H:%M:%S')
                except Exception:
                    saved_at_human = entry.get('timestamp', '')
                processed_entries.append({
                    'execution_id': entry.get('execution_id'),
                    'timestamp': entry.get('timestamp'),
                    'flowchart_name': entry.get('flowchart_name'),
                    'total_nodes': total_nodes,
                    'successful_nodes': successful_nodes,
                    'success_percentage': round(success_percentage, 1),
                    'failed_node': failed_node,
                    'status': execution_data.get('status', 'unknown'),
                    'execution_time': _format_elapsed(elapsed_ms),
                    'elapsed_ms': elapsed_ms,
                    'saved_at': saved_at_human
                })
            except Exception:
                pass
        return jsonify({'status': 'success', 'history': processed_entries, 'count': len(processed_entries)})
    except Exception as e:
        return jsonify({'status': 'error', 'message': f'failed to get history: {str(e)}'}), 500


@execution_bp.route('/history/<execution_id>', methods=['GET'])
def get_execution_details(execution_id):
    from ..services.storage import HISTORY_DIR
    flowchart_name = request.args.get('flowchart_name', DEFAULT_FLOWCHART)
    try:
        if flowchart_name.endswith('.json'):
            flowchart_name = flowchart_name[:-5]
        history_path = os.path.join(HISTORY_DIR, flowchart_name)
        filepath = os.path.join(history_path, f"{execution_id}.json")
        if not os.path.exists(filepath):
            return jsonify({'status': 'error', 'message': 'execution not found'}), 404
        import json
        with open(filepath, 'r') as f:
            entry = json.load(f)
        return jsonify({'status': 'success', 'execution': entry})
    except Exception as e:
        return jsonify({'status': 'error', 'message': f'failed to get execution details: {str(e)}'}), 500


@execution_bp.route('/history/<execution_id>', methods=['DELETE'])
def delete_history_entry(execution_id):
    flowchart_name = request.args.get('flowchart_name', DEFAULT_FLOWCHART)
    try:
        success = delete_execution_history(flowchart_name, execution_id)
        if success:
            # also remove the summary from the flowchart json's executions array
            try:
                from ..services.storage import load_flowchart, save_flowchart
                flow = load_flowchart(flowchart_name)
                if isinstance(flow, dict) and isinstance(flow.get('executions'), list):
                    flow['executions'] = [e for e in flow['executions'] if e.get('execution_id') != execution_id]
                    save_flowchart(flow, flowchart_name)
            except Exception:
                pass
            return jsonify({'status': 'success', 'message': 'execution history deleted'})
        else:
            return jsonify({'status': 'error', 'message': 'execution not found'}), 404
    except Exception as e:
        return jsonify({'status': 'error', 'message': f'failed to delete execution: {str(e)}'}), 500


@execution_bp.route('/history/clear', methods=['POST'])
def clear_history_for_flowchart():
    from ..services.storage import HISTORY_DIR
    try:
        data = request.json or {}
        flowchart_name = data.get('flowchart_name') or DEFAULT_FLOWCHART
        if flowchart_name.endswith('.json'):
            flowchart_folder = flowchart_name[:-5]
        else:
            flowchart_folder = flowchart_name
        history_path = os.path.join(HISTORY_DIR, flowchart_folder)
        if not os.path.exists(history_path):
            return jsonify({'status': 'success', 'message': 'no history found to clear'})
        removed = 0
        for entry in os.listdir(history_path):
            full_path = os.path.join(history_path, entry)
            try:
                if os.path.isfile(full_path):
                    os.remove(full_path)
                    removed += 1
                elif os.path.isdir(full_path):
                    import shutil
                    shutil.rmtree(full_path)
                    removed += 1
            except Exception as e:
                # comments: keep going even if a file fails to delete
                print(f"warning: failed to remove {full_path}: {e}")
        # do not modify the embedded `executions` array in the flowchart json here; executions are permanent
        return jsonify({'status': 'success', 'message': f'cleared {removed} items from history for {flowchart_folder}'})
    except Exception as e:
        return jsonify({'status': 'error', 'message': f'failed to clear history: {str(e)}'}), 500


@execution_bp.route('/analyze-connection', methods=['POST'])
def analyze_connection():
    data = request.json
    source_node_id = data.get('source_node_id')
    target_node_id = data.get('target_node_id')
    if not source_node_id or not target_node_id:
        return jsonify({'status': 'error', 'message': 'source_node_id and target_node_id are required'}), 400
    flowchart_name = data.get('flowchart_name', DEFAULT_FLOWCHART)
    flowchart_data = load_flowchart(flowchart_name)
    source_node = next((n for n in flowchart_data['nodes'] if n['id'] == source_node_id), None)
    target_node = next((n for n in flowchart_data['nodes'] if n['id'] == target_node_id), None)
    if not source_node or not target_node:
        return jsonify({'status': 'error', 'message': 'one or both nodes not found'}), 404
    source_file = source_node.get('pythonFile')
    target_file = target_node.get('pythonFile')
    if not source_file or not target_file:
        return jsonify({'status': 'error', 'message': 'both nodes must have python files assigned'}), 400
    normalized_source = source_file.replace('\\', '/')
    if normalized_source.startswith('nodes/'):
        source_path = os.path.normpath(source_file)
    else:
        source_path = os.path.join('nodes', source_file)
    normalized_target = target_file.replace('\\', '/')
    if normalized_target.startswith('nodes/'):
        target_path = os.path.normpath(target_file)
    else:
        target_path = os.path.join('nodes', target_file)
    if not os.path.exists(source_path) or not os.path.exists(target_path):
        return jsonify({'status': 'error', 'message': 'one or both python files not found'}), 404
    try:
        analyzer = PythonVariableAnalyzer()
        analysis = analyzer.find_variable_dependencies(source_path, target_path)
        return jsonify({'status': 'success', 'analysis': analysis, 'source_node': {'id': source_node_id, 'name': source_node.get('name'), 'file': source_file}, 'target_node': {'id': target_node_id, 'name': target_node.get('name'), 'file': target_file}})
    except Exception as e:
        return jsonify({'status': 'error', 'message': f'analysis failed: {str(e)}'}), 500


@execution_bp.route('/analyze-python-function', methods=['POST'])
def analyze_python_function():
    import ast
    data = request.json
    python_file = data.get('python_file')
    if not python_file:
        return jsonify({'success': False, 'error': 'python_file is required'}), 400
    normalized_python_file = python_file.replace('\\', '/')
    if normalized_python_file.startswith('nodes/'):
        file_path = os.path.normpath(python_file)
    else:
        file_path = os.path.join('nodes', python_file)
    if not os.path.exists(file_path):
        return jsonify({'success': False, 'error': f'python file not found: {python_file}'}), 404
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            file_content = f.read()
        tree = ast.parse(file_content)
        functions = []
        top_level_input_vars = []
        top_level_input_calls = []
        def _find_input_call_and_prompt(expr):
            try:
                for n in ast.walk(expr):
                    if isinstance(n, ast.Call):
                        if isinstance(n.func, ast.Name) and n.func.id == 'input':
                            prompt_val = None
                            if len(n.args) > 0 and isinstance(n.args[0], ast.Constant):
                                prompt_val = n.args[0].value
                            return True, prompt_val
                        if isinstance(n.func, ast.Attribute):
                            pass
                return False, None
            except Exception:
                return False, None
        for node in ast.walk(tree):
            if isinstance(node, ast.Assign):
                has_input, prompt = _find_input_call_and_prompt(node.value)
                if has_input:
                    for target in node.targets:
                        if isinstance(target, ast.Name):
                            variable_name = target.id
                            top_level_input_vars.append(variable_name)
                            if prompt is not None:
                                base_param_name = str(prompt).replace("Enter ", "").replace(":", "").replace(" ", "_").lower()
                                if not base_param_name:
                                    base_param_name = "input"
                                top_level_input_calls.append(base_param_name)
                            else:
                                top_level_input_calls.append(variable_name.lower())
        for node in tree.body:
            if isinstance(node, ast.FunctionDef):
                formal_params = [arg.arg for arg in node.args.args]
                input_calls = []
                input_variable_names = []
                input_variable_details = []
                for child in ast.walk(node):
                    if isinstance(child, ast.Assign):
                        has_input, prompt = _find_input_call_and_prompt(child.value)
                        if has_input:
                            for target in child.targets:
                                if isinstance(target, ast.Name):
                                    variable_name = target.id
                                    input_variable_names.append(variable_name)
                                    input_variable_details.append({'name': variable_name, 'line': child.lineno})
                                    if prompt is not None:
                                        base_param_name = str(prompt).replace("Enter ", "").replace(":", "").replace(" ", "_").lower()
                                        if not base_param_name:
                                            base_param_name = "input"
                                        input_calls.append(base_param_name)
                                    else:
                                        input_calls.append(variable_name.lower())
                all_parameters = input_variable_names if input_variable_names else input_calls
                returns = []
                for child in node.body:
                    extract_returns_from_statement(child, returns)
                functions.append({'name': node.name, 'parameters': all_parameters, 'formal_parameters': formal_params, 'input_calls': input_calls, 'input_variable_names': input_variable_names, 'input_variable_details': input_variable_details, 'returns': returns, 'line': node.lineno})
        if not functions and top_level_input_vars:
            top_level_input_details = []
            for node in ast.walk(tree):
                if isinstance(node, ast.Assign):
                    has_input, _prompt = _find_input_call_and_prompt(node.value)
                    if has_input:
                        for target in node.targets:
                            if isinstance(target, ast.Name):
                                top_level_input_details.append({'name': target.id, 'line': node.lineno})
            all_parameters = top_level_input_vars if top_level_input_vars else top_level_input_calls
            functions.append({'name': 'main', 'parameters': all_parameters, 'formal_parameters': [], 'input_calls': top_level_input_calls, 'input_variable_names': top_level_input_vars, 'input_variable_details': top_level_input_details, 'line': 1})
        if not functions:
            return jsonify({'success': False, 'error': 'no function or input assignments found in python file', 'parameters': []})
        target_function = functions[0]
        return jsonify({'success': True, 'function_name': target_function['name'], 'parameters': target_function.get('parameters', []), 'formal_parameters': target_function.get('formal_parameters', []), 'input_calls': target_function.get('input_calls', []), 'input_variable_names': target_function.get('input_variable_names', []), 'input_variable_details': target_function.get('input_variable_details', []), 'returns': target_function.get('returns', []), 'line': target_function['line']})
    except Exception as e:
        return jsonify({'success': False, 'error': f'failed to analyze python file: {str(e)}', 'parameters': []}), 500


