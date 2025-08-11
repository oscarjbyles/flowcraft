import os
import subprocess
import sys
import tempfile
import time
from datetime import datetime
from typing import Any, Dict, Optional
import ast
import psutil

# process tracking shared map and lock should be owned by the app context.
# to preserve behavior, these will be injected from the caller.


def execute_python_function_with_tracking(
    file_path: str,
    function_args: Optional[Dict[str, Any]] = None,
    input_values: Optional[Dict[str, Any]] = None,
    node_id: Optional[str] = None,
    running_processes: Optional[Dict[str, Any]] = None,
    process_lock: Optional[Any] = None,
):
    """execute a single function from a python file with process tracking for termination"""
    if function_args is None:
        function_args = {}
    if input_values is None:
        input_values = {}

    temp_script_path = None
    process = None

    try:
        with tempfile.NamedTemporaryFile(mode='w', suffix='.py', delete=False, encoding='utf-8') as temp_script:
            with open(file_path, 'r', encoding='utf-8') as f:
                original_content = f.read()

            tree = ast.parse(original_content)
            functions = []
            for node in ast.walk(tree):
                if isinstance(node, ast.FunctionDef):
                    functions.append({'name': node.name, 'args': [arg.arg for arg in node.args.args]})

            if not functions:
                return {
                    'success': False,
                    'error': 'no function found in python file',
                    'output': '',
                    'return_value': None
                }

            function_name = functions[0]['name']
            formal_function_args = functions[0]['args']

            call_args: Dict[str, Any] = {}
            missing_args = []
            for arg_name in formal_function_args:
                if arg_name in function_args:
                    call_args[arg_name] = function_args[arg_name]
                else:
                    missing_args.append(arg_name)

            if missing_args:
                return {
                    'success': False,
                    'error': f'missing required function arguments: {", ".join(missing_args)}',
                    'output': '',
                    'return_value': None
                }

            temp_script.write(f'''
import json
import sys
import os
sys.path.insert(0, os.path.dirname({repr(file_path)}))

input_values_for_mock = {repr(input_values)}
input_call_count = 0

def mock_input(prompt=""):
    global input_call_count, input_values_for_mock
    input_call_count += 1
    value_list = list(input_values_for_mock.values())
    if input_call_count <= len(value_list):
        _val = value_list[input_call_count - 1]
        print(f"{{prompt}}{{_val}}")
        return str(_val)
    else:
        print(f"{{prompt}}")
        return ""

import builtins
builtins.input = mock_input

{original_content}

try:
    if {len(formal_function_args) > 0}:
        result = {function_name}(**{repr(call_args)})
    else:
        result = {function_name}()
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

        process = subprocess.Popen(
            [sys.executable, temp_script_path],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            cwd=os.getcwd()
        )

        if node_id and running_processes is not None and process_lock is not None:
            with process_lock:
                running_processes[node_id] = {
                    'process': process,
                    'start_time': datetime.now(),
                    'file_path': file_path,
                    'temp_script_path': temp_script_path
                }

        try:
            stdout, stderr = process.communicate(timeout=30)
            process.wait()

            if node_id and running_processes is not None and process_lock is not None:
                with process_lock:
                    running_processes.pop(node_id, None)

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
                    'success': process.returncode == 0,
                    'output': stdout,
                    'error': stderr if stderr else None,
                    'return_value': None,
                }
            return result_data

        except subprocess.TimeoutExpired:
            try:
                process.kill()
                process.wait(timeout=5)
            except Exception:
                pass
            if node_id and running_processes is not None and process_lock is not None:
                with process_lock:
                    running_processes.pop(node_id, None)
            return {'success': False, 'error': 'execution timed out after 30 seconds', 'output': '', 'return_value': None}

    except Exception as e:
        if process:
            try:
                process.kill()
                process.wait(timeout=5)
            except Exception:
                pass
        if node_id and running_processes is not None and process_lock is not None:
            with process_lock:
                running_processes.pop(node_id, None)
        return {'success': False, 'error': f'execution failed: {str(e)}', 'output': '', 'return_value': None}

    finally:
        if temp_script_path and os.path.exists(temp_script_path):
            for attempt in range(5):
                try:
                    os.unlink(temp_script_path)
                    break
                except (OSError, PermissionError) as e:
                    if attempt < 4:
                        time.sleep(0.1 * (attempt + 1))
                    else:
                        print(f"warning: failed to clean up temporary file {temp_script_path}: {e}")


def stop_all_processes(running_processes: Dict[str, Any]) -> Dict[str, Any]:
    """terminate all tracked processes and clean temp files."""
    terminated_count = 0
    cleaned_files = 0
    for node_id, process_info in list(running_processes.items()):
        try:
            process = process_info['process']
            temp_script_path = process_info.get('temp_script_path')
            if process.poll() is None:
                try:
                    parent = psutil.Process(process.pid)
                    children = parent.children(recursive=True)
                    for child in children:
                        try:
                            child.terminate()
                        except psutil.NoSuchProcess:
                            pass
                    parent.terminate()
                    terminated_count += 1
                    try:
                        parent.wait(timeout=2)
                    except psutil.TimeoutExpired:
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
                    pass
            if temp_script_path and os.path.exists(temp_script_path):
                for attempt in range(3):
                    try:
                        os.unlink(temp_script_path)
                        cleaned_files += 1
                        break
                    except (OSError, PermissionError):
                        if attempt < 2:
                            time.sleep(0.1)
                        else:
                            print(f"warning: could not clean up temp file {temp_script_path}")
            del running_processes[node_id]
        except Exception as e:
            print(f"error terminating process for node {node_id}: {e}")
    return {'terminated': terminated_count, 'cleaned_files': cleaned_files}


