from flask import Blueprint, jsonify, request, current_app
import os
import re

from ..services.analysis import PythonVariableAnalyzer, extract_returns_from_statement


analysis_bp = Blueprint('analysis', __name__, url_prefix='/api')


@analysis_bp.route('/analyze-connection', methods=['POST'])
def analyze_connection():
    data = request.json or {}
    source_node_id = data.get('source_node_id')
    target_node_id = data.get('target_node_id')
    if not source_node_id or not target_node_id:
        return jsonify({'status': 'error', 'message': 'source_node_id and target_node_id are required'}), 400

    from ..services.storage import load_flowchart, DEFAULT_FLOWCHART
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
    normalized_target = target_file.replace('\\', '/')
    project_root = current_app.config.get('FLOWCRAFT_PROJECT_ROOT') or os.getcwd()
    # resolve both source and target relative to project root, stripping any leading 'nodes/'
    src_rel = re.sub(r'^(?:nodes/)+', '', normalized_source)
    tgt_rel = re.sub(r'^(?:nodes/)+', '', normalized_target)
    source_path = os.path.normpath(os.path.join(project_root, src_rel))
    target_path = os.path.normpath(os.path.join(project_root, tgt_rel))
    if not os.path.exists(source_path) or not os.path.exists(target_path):
        return jsonify({'status': 'error', 'message': 'one or both python files not found'}), 404
    try:
        analyzer = PythonVariableAnalyzer()
        analysis = analyzer.find_variable_dependencies(source_path, target_path)
        return jsonify({'status': 'success', 'analysis': analysis, 'source_node': {'id': source_node_id, 'name': source_node.get('name'), 'file': source_file}, 'target_node': {'id': target_node_id, 'name': target_node.get('name'), 'file': target_file}})
    except Exception as e:
        return jsonify({'status': 'error', 'message': f'analysis failed: {str(e)}'}), 500


@analysis_bp.route('/analyze-python-function', methods=['POST'])
def analyze_python_function():
    import ast
    data = request.json or {}
    python_file = data.get('python_file')
    if not python_file:
        return jsonify({'success': False, 'error': 'python_file is required'}), 400
    normalized_python_file = python_file.replace('\\', '/')
    # collapse any repeated leading 'nodes/' segments for robustness
    normalized_python_file = re.sub(r'^(?:nodes/)+', 'nodes/', normalized_python_file)
    project_root = current_app.config.get('FLOWCRAFT_PROJECT_ROOT') or os.getcwd()
    # resolve relative to project root regardless of prefix
    rel = re.sub(r'^(?:nodes/)+', '', normalized_python_file)
    file_path = os.path.normpath(os.path.join(project_root, rel))
    if not os.path.exists(file_path):
        return jsonify({'success': False, 'error': f'python file not found: {python_file}'}), 404
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            file_content = f.read()
        try:
            total_lines = len(file_content.splitlines())
        except Exception:
            total_lines = 0
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
                # only consider return statements that are direct children of the function body
                # and prefer the variables from the last such return statement
                direct_return_groups = []
                for child in node.body:
                    if isinstance(child, ast.Return):
                        items = []
                        extract_returns_from_statement(child, items)
                        direct_return_groups.append(items)
                returns = direct_return_groups[-1] if direct_return_groups else []
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
        return jsonify({
            'success': True,
            'function_name': target_function['name'],
            'parameters': target_function.get('parameters', []),
            'formal_parameters': target_function.get('formal_parameters', []),
            'input_calls': target_function.get('input_calls', []),
            'input_variable_names': target_function.get('input_variable_names', []),
            'input_variable_details': target_function.get('input_variable_details', []),
            'returns': target_function.get('returns', []),
            'line': target_function['line'],
            'total_lines': total_lines
        })
    except Exception as e:
        return jsonify({'success': False, 'error': f'failed to analyze python file: {str(e)}', 'parameters': []}), 500


