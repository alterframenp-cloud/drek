"""Regression coverage for venvs whose base Python was removed on Windows."""
from pathlib import Path
import subprocess
import sys

import pytest

from scripts import bootstrap


def test_create_and_reuse_environment_in_path_with_spaces(tmp_path):
    root = tmp_path / "Drek con espacios"
    root.mkdir()
    executable = bootstrap.ensure_venv(root)
    assert bootstrap.python_is_usable(executable)
    marker = root / ".venv" / "keep.txt"
    marker.write_text("existing environment")
    assert bootstrap.ensure_venv(root) == executable
    assert marker.read_text() == "existing environment"
    assert not (root / ".local" / "venv-backups").exists()


def test_existing_but_broken_executable_is_preserved_and_replaced(tmp_path):
    executable = bootstrap.venv_python(tmp_path / ".venv")
    executable.parent.mkdir(parents=True)
    executable.write_bytes(b"Unusable Python executable")
    executable.chmod(0o755)
    marker = tmp_path / ".venv" / "preserve.txt"
    marker.write_text("do not delete")
    state = tmp_path / ".local" / "setup-state.json"
    state.parent.mkdir()
    state.write_text('{"python":"previous"}')
    assert not bootstrap.python_is_usable(executable)

    repaired = bootstrap.ensure_venv(tmp_path)
    assert bootstrap.python_is_usable(repaired)
    backups = list((tmp_path / ".local" / "venv-backups").iterdir())
    assert len(backups) == 1
    assert (backups[0] / "preserve.txt").read_text() == "do not delete"
    assert bootstrap.venv_python(backups[0]).read_bytes() == b"Unusable Python executable"
    assert state.read_text() == '{"python":"previous"}'
    assert not (tmp_path / ".venv" / "preserve.txt").exists()


def test_missing_executable_and_global_python_are_not_usable_venvs(tmp_path):
    assert not bootstrap.python_is_usable(tmp_path / "missing-python")
    assert not bootstrap.python_is_usable(Path(sys._base_executable))


def test_ffmpeg_preflight_works_in_a_fresh_environment_without_pydantic(tmp_path):
    root = Path(__file__).resolve().parents[2]
    executable = bootstrap.ensure_venv(tmp_path / "clean Python")
    check = (
        "import sys, importlib.util; "
        "assert importlib.util.find_spec('pydantic') is None; "
        "assert importlib.util.find_spec('fastapi') is None; "
        f"sys.path.insert(0, {str(root)!r}); "
        "from backend.runtime import executable; "
        "assert executable('ffmpeg'); assert executable('ffprobe')"
    )
    subprocess.run([str(executable), "-I", "-c", check], check=True)


@pytest.mark.parametrize("failure", [103, subprocess.TimeoutExpired("python", 15)])
def test_failed_or_hung_python_is_not_treated_as_a_working_environment(monkeypatch, failure):
    def run(*args, **kwargs):
        if isinstance(failure, Exception):
            raise failure
        return subprocess.CompletedProcess(args[0], failure)
    monkeypatch.setattr(bootstrap.subprocess, "run", run)
    assert not bootstrap.python_is_usable(Path("python.exe"))
