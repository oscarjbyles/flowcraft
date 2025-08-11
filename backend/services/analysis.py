import ast
import os
from typing import Any, Dict, List


class PythonVariableAnalyzer:
    """analyze python files to extract variable definitions and usage"""

    def analyze_file(self, file_path: str) -> Dict[str, Any]:
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

    def _extract_imports(self, tree: ast.AST) -> List[Dict[str, Any]]:
        imports: List[Dict[str, Any]] = []
        for node in ast.walk(tree):
            if isinstance(node, ast.Import):
                for alias in node.names:
                    imports.append({'type': 'import', 'name': alias.name, 'asname': alias.asname})
            elif isinstance(node, ast.ImportFrom):
                module = node.module or ''
                for alias in node.names:
                    imports.append({'type': 'from_import', 'module': module, 'name': alias.name, 'asname': alias.asname})
        return imports

    def _extract_functions(self, tree: ast.AST) -> List[Dict[str, Any]]:
        functions: List[Dict[str, Any]] = []
        for node in ast.walk(tree):
            if isinstance(node, ast.FunctionDef):
                func_info: Dict[str, Any] = {'name': node.name, 'parameters': [], 'returns': [], 'line': node.lineno}
                for arg in node.args.args:
                    func_info['parameters'].append(arg.arg)
                for child in node.body:
                    self._extract_returns_from_statement(child, func_info['returns'])
                functions.append(func_info)
        return functions

    def _extract_returns_from_statement(self, stmt: ast.AST, returns_list: List[Dict[str, Any]]) -> None:
        if isinstance(stmt, ast.Return) and stmt.value:
            if isinstance(stmt.value, ast.Name):
                returns_list.append({'type': 'variable', 'name': stmt.value.id, 'line': stmt.lineno})
            elif isinstance(stmt.value, ast.Constant):
                returns_list.append({'type': 'constant', 'value': str(stmt.value.value), 'data_type': type(stmt.value.value).__name__, 'line': stmt.lineno})
            elif isinstance(stmt.value, ast.List):
                returns_list.append({'type': 'list', 'name': 'list', 'line': stmt.lineno})
            elif isinstance(stmt.value, ast.Dict):
                returns_list.append({'type': 'dict', 'name': 'dict', 'line': stmt.lineno})
            elif isinstance(stmt.value, ast.Call) and isinstance(stmt.value.func, ast.Name):
                returns_list.append({'type': 'function_call', 'name': stmt.value.func.id + '()', 'line': stmt.lineno})
            else:
                returns_list.append({'type': 'expression', 'name': 'expression', 'line': stmt.lineno})
        elif isinstance(stmt, ast.If):
            for child in stmt.body:
                self._extract_returns_from_statement(child, returns_list)
            for child in stmt.orelse:
                self._extract_returns_from_statement(child, returns_list)
        elif isinstance(stmt, (ast.For, ast.While)):
            for child in stmt.body:
                self._extract_returns_from_statement(child, returns_list)
            for child in stmt.orelse:
                self._extract_returns_from_statement(child, returns_list)
        elif isinstance(stmt, ast.Try):
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
            for child in stmt.body:
                self._extract_returns_from_statement(child, returns_list)

    def _extract_variables(self, tree: ast.AST) -> Dict[str, Any]:
        variables = []
        variable_usage = []
        for node in ast.walk(tree):
            if isinstance(node, ast.Assign):
                for target in node.targets:
                    if isinstance(target, ast.Name):
                        var_info: Dict[str, Any] = {'name': target.id, 'line': node.lineno, 'type': 'assignment'}
                        if isinstance(node.value, ast.Constant):
                            var_info['value_type'] = type(node.value.value).__name__
                        elif isinstance(node.value, ast.Name):
                            var_info['depends_on'] = node.value.id
                        variables.append(var_info)
            elif isinstance(node, ast.Name) and isinstance(node.ctx, ast.Load):
                variable_usage.append({'name': node.id, 'line': node.lineno, 'type': 'usage'})
        return {'assignments': variables, 'usage': variable_usage}

    def _extract_globals(self, tree: ast.AST):
        globals_list = []
        for node in ast.walk(tree):
            if isinstance(node, ast.Global):
                for name in node.names:
                    globals_list.append({'name': name, 'line': node.lineno})
        return globals_list

    def find_variable_dependencies(self, source_file: str, target_file: str) -> Dict[str, Any]:
        source_analysis = self.analyze_file(source_file)
        target_analysis = self.analyze_file(target_file)
        if 'error' in source_analysis or 'error' in target_analysis:
            return {
                'error': 'failed to analyze one or both files',
                'source_error': source_analysis.get('error'),
                'target_error': target_analysis.get('error'),
                'shared_variables': []
            }
        shared_variables: List[Dict[str, Any]] = []
        source_filename = os.path.basename(source_file).replace('.py', '')
        for imp in target_analysis['imports']:
            if imp['type'] == 'from_import' and source_filename in imp.get('module', ''):
                imported_name = imp['name']
                for func in source_analysis['functions']:
                    if func['name'] == imported_name:
                        shared_variables.append({'name': imported_name, 'type': 'function_import', 'source_line': func['line'], 'parameters': func['parameters'], 'returns': func['returns']})
                for var in source_analysis['variables']['assignments']:
                    if var['name'] == imported_name:
                        shared_variables.append({'name': imported_name, 'type': 'variable_import', 'source_line': var['line'], 'value_type': var.get('value_type', 'unknown')})
        source_assignments = {var['name'] for var in source_analysis['variables']['assignments']}
        target_usage = {var['name'] for var in target_analysis['variables']['usage']}
        source_func_names = {func['name'] for func in source_analysis['functions']}
        target_assignments = {var['name'] for var in target_analysis['variables']['assignments']}
        defined_and_used = source_assignments.intersection(target_usage)
        for var_name in defined_and_used:
            if not any(sv['name'] == var_name for sv in shared_variables):
                source_var = next((v for v in source_analysis['variables']['assignments'] if v['name'] == var_name), None)
                target_var = next((v for v in target_analysis['variables']['usage'] if v['name'] == var_name), None)
                shared_variables.append({'name': var_name, 'type': 'defined_and_used', 'confidence': 'high', 'source_line': source_var['line'] if source_var else None, 'target_line': target_var['line'] if target_var else None, 'value_type': source_var.get('value_type', 'unknown') if source_var else 'unknown'})
        common_assignments = source_assignments.intersection(target_assignments)
        for var_name in common_assignments:
            if not any(sv['name'] == var_name for sv in shared_variables):
                shared_variables.append({'name': var_name, 'type': 'common_assignment', 'confidence': 'medium'})
        for target_func in target_analysis['functions']:
            for param in target_func['parameters']:
                if param in source_assignments or param in source_func_names:
                    if not any(sv['name'] == param for sv in shared_variables):
                        shared_variables.append({'name': param, 'type': 'parameter_match', 'target_function': target_func['name'], 'confidence': 'low'})
        return {
            'source_file': source_file,
            'target_file': target_file,
            'shared_variables': shared_variables,
            'source_analysis': source_analysis,
            'target_analysis': target_analysis
        }


def extract_returns_from_statement(stmt: ast.AST, returns_list):
    analyzer = PythonVariableAnalyzer()
    analyzer._extract_returns_from_statement(stmt, returns_list)


