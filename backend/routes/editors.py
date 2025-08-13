from flask import Blueprint, jsonify, request, current_app
import os
import glob
import sys
import subprocess

editors_bp = Blueprint('editors', __name__, url_prefix='/api')


@editors_bp.route('/open-file', methods=['POST'])
def open_file_in_editor():
    try:
        data = request.json or {}
        python_file = data.get('python_file', '')
        preferred_editor_path = (data.get('preferred_editor_path') or '').strip()
        if not python_file:
            return jsonify({'success': False, 'error': 'python_file is required'}), 400
        normalized = python_file.replace('\\', '/')
        project_root = current_app.config.get('FLOWCRAFT_PROJECT_ROOT') or os.getcwd()
        file_path = os.path.normpath(os.path.join(project_root, python_file))
        file_path = os.path.abspath(file_path)
        if not os.path.exists(file_path):
            return jsonify({'success': False, 'error': f'python file not found: {python_file}'}), 404

        def _try_launch_executable(executable_path_or_cmd, args):
            try:
                subprocess.Popen([executable_path_or_cmd] + args, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, cwd=os.getcwd())
                return True
            except Exception:
                return False

        launched = False
        if preferred_editor_path:
            if sys.platform == 'darwin' and (preferred_editor_path.endswith('.app') or os.path.isdir(preferred_editor_path)):
                try:
                    subprocess.Popen(['open', '-a', preferred_editor_path, file_path], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
                    launched = True
                except Exception:
                    launched = False
            else:
                launched = _try_launch_executable(preferred_editor_path, [file_path])
        if not launched and sys.platform.startswith('win'):
            program_files = os.environ.get('ProgramFiles', r'C:\\Program Files')
            program_files_x86 = os.environ.get('ProgramFiles(x86)', r'C:\\Program Files (x86)')
            local_app_data = os.environ.get('LOCALAPPDATA', os.path.expanduser(r'~\\AppData\\Local'))
            windows_dir = os.environ.get('WINDIR', r'C:\\Windows')

            def first_existing_path(candidates):
                for p in candidates:
                    if p and os.path.exists(p):
                        return p
                return None

            editor_paths_in_order = [
                first_existing_path([os.path.join(local_app_data, 'Programs', 'Cursor', 'Cursor.exe'), os.path.join(program_files, 'Cursor', 'Cursor.exe')]),
                first_existing_path([os.path.join(local_app_data, 'Programs', 'Microsoft VS Code', 'Code.exe'), os.path.join(program_files, 'Microsoft VS Code', 'Code.exe')]),
                first_existing_path([os.path.join(local_app_data, 'Programs', 'Windsurf', 'Windsurf.exe'), os.path.join(program_files, 'Windsurf', 'Windsurf.exe')]),
                first_existing_path([os.path.join(program_files, 'Notepad++', 'notepad++.exe'), os.path.join(program_files_x86, 'Notepad++', 'notepad++.exe')]),
                first_existing_path([os.path.join(program_files, 'Sublime Text', 'sublime_text.exe'), os.path.join(program_files_x86, 'Sublime Text', 'sublime_text.exe')]),
                first_existing_path([os.path.join(windows_dir, 'system32', 'notepad.exe'), os.path.join(windows_dir, 'notepad.exe')])
            ]
            for editor_exe in [p for p in editor_paths_in_order if p]:
                exe_name = os.path.basename(editor_exe).lower()
                if 'code' in exe_name or 'cursor' in exe_name or 'windsurf' in exe_name:
                    launched = _try_launch_executable(editor_exe, ['--reuse-window', file_path])
                else:
                    launched = _try_launch_executable(editor_exe, [file_path])
                if launched:
                    break
        if not launched:
            launched = (
                _try_launch_executable('cursor', ['--reuse-window', file_path]) or
                _try_launch_executable('code', ['--reuse-window', file_path]) or
                _try_launch_executable('windsurf', ['--reuse-window', file_path]) or
                _try_launch_executable('sublime_text', [file_path]) or
                _try_launch_executable('notepad++', [file_path])
            )
        if not launched:
            try:
                if sys.platform.startswith('win'):
                    try:
                        subprocess.Popen(f'start "" "{file_path}"', shell=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
                        launched = True
                    except Exception:
                        os.startfile(file_path)  # type: ignore[attr-defined]
                        launched = True
                elif sys.platform == 'darwin':
                    if preferred_editor_path and (preferred_editor_path.endswith('.app') or os.path.isdir(preferred_editor_path)):
                        subprocess.Popen(['open', '-a', preferred_editor_path, file_path], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
                    else:
                        subprocess.Popen(['open', file_path], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
                    launched = True
                else:
                    subprocess.Popen(['xdg-open', file_path], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
                    launched = True
            except Exception:
                launched = False
        return jsonify({'success': True, 'launched': launched, 'file_path': file_path})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@editors_bp.route('/editors', methods=['GET'])
def list_text_editors():
    try:
        editors = []
        checked_paths = []

        def add_editor(name, path):
            if path and os.path.exists(path):
                editors.append({'name': name, 'path': path})
                checked_paths.append(path)

        def first_existing_path(candidates):
            for p in candidates:
                if p and os.path.exists(p):
                    return p
            return None

        if sys.platform == 'darwin':
            app_dirs = ['/Applications', os.path.expanduser('~/Applications')]
            known_apps = {
                'cursor': ['Cursor.app'],
                'visual studio code': ['Visual Studio Code.app', 'VSCodium.app'],
                'windsurf': ['Windsurf.app'],
                'sublime text': ['Sublime Text.app'],
                'nova': ['Nova.app'],
                'bbedit': ['BBEdit.app']
            }
            for name, app_names in known_apps.items():
                found_path = None
                for base in app_dirs:
                    for app_name in app_names:
                        candidate = os.path.join(base, app_name)
                        if os.path.exists(candidate):
                            found_path = candidate
                            break
                    if found_path:
                        break
                if found_path:
                    editors.append({'name': name, 'path': found_path})
        elif sys.platform.startswith('win'):
            program_files = os.environ.get('ProgramFiles', r'C:\\Program Files')
            program_files_x86 = os.environ.get('ProgramFiles(x86)', r'C:\\Program Files (x86)')
            local_app_data = os.environ.get('LOCALAPPDATA', os.path.expanduser(r'~\\AppData\\Local'))
            windows_dir = os.environ.get('WINDIR', r'C:\\Windows')
            add_editor('cursor', first_existing_path([os.path.join(local_app_data, 'Programs', 'Cursor', 'Cursor.exe'), os.path.join(program_files, 'Cursor', 'Cursor.exe')]))
            add_editor('visual studio code', first_existing_path([os.path.join(local_app_data, 'Programs', 'Microsoft VS Code', 'Code.exe'), os.path.join(program_files, 'Microsoft VS Code', 'Code.exe')]))
            vs_candidates = glob.glob(os.path.join(program_files, 'Microsoft Visual Studio', '*', '*', 'Common7', 'IDE', 'devenv.exe'))
            vs_candidates += glob.glob(os.path.join(program_files_x86, 'Microsoft Visual Studio', '*', '*', 'Common7', 'IDE', 'devenv.exe'))
            add_editor('visual studio', vs_candidates[0] if vs_candidates else None)
            add_editor('windsurf', first_existing_path([os.path.join(local_app_data, 'Programs', 'Windsurf', 'Windsurf.exe'), os.path.join(program_files, 'Windsurf', 'Windsurf.exe')]))
            add_editor('notepad++', first_existing_path([os.path.join(program_files, 'Notepad++', 'notepad++.exe'), os.path.join(program_files_x86, 'Notepad++', 'notepad++.exe')]))
            add_editor('sublime text', first_existing_path([os.path.join(program_files, 'Sublime Text', 'sublime_text.exe'), os.path.join(program_files_x86, 'Sublime Text', 'sublime_text.exe')]))
            add_editor('atom', first_existing_path([os.path.join(program_files, 'Atom', 'atom.exe'), os.path.join(program_files_x86, 'Atom', 'atom.exe')]))
            add_editor('notepad', first_existing_path([os.path.join(windows_dir, 'system32', 'notepad.exe'), os.path.join(windows_dir, 'notepad.exe')]))
        else:
            pass
        unique = []
        seen = set()
        for ed in editors:
            if ed['path'] not in seen:
                unique.append(ed)
                seen.add(ed['path'])
        return jsonify({'status': 'success', 'editors': unique, 'count': len(unique)})
    except Exception as e:
        return jsonify({'status': 'error', 'message': f'failed to enumerate editors: {str(e)}'}), 500


