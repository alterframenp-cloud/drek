"""Create or repair the local venv using a working, external Python interpreter.

A Windows venv can keep python.exe after its base Python has been uninstalled.
Test the interpreter itself rather than relying on the file's existence. Preserve
unusable environments so setup never deletes files it did not create.
"""
from datetime import datetime, timezone
from pathlib import Path
import os
import subprocess
import sys
import uuid

ROOT = Path(__file__).resolve().parents[1]


def venv_python(directory: Path) -> Path:
    return directory / ("Scripts/python.exe" if os.name == "nt" else "bin/python")


def python_is_usable(executable: Path) -> bool:
    try:
        result = subprocess.run(
            [str(executable), "-I", "-c",
             "import sys, pip; assert sys.version_info >= (3, 11); "
             "assert sys.prefix != sys.base_prefix"],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            timeout=15,
        )
    except (OSError, subprocess.TimeoutExpired):
        return False
    return result.returncode == 0


def ensure_venv(root: Path = ROOT) -> Path:
    directory = root / ".venv"
    executable = venv_python(directory)
    if python_is_usable(executable):
        return executable

    if directory.exists() or directory.is_symlink():
        backups = root / ".local" / "venv-backups"
        backups.mkdir(parents=True, exist_ok=True)
        name = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S") + "-" + uuid.uuid4().hex[:8]
        backup = backups / name
        directory.rename(backup)
        print(f"El entorno Python anterior no funciona. Se conservó en: {backup}", flush=True)

    print("Creando el entorno local con el Python instalado...", flush=True)
    subprocess.run([sys.executable, "-m", "venv", str(directory)], check=True)
    if not python_is_usable(executable):
        raise RuntimeError(
            "El nuevo entorno Python no puede ejecutarse o no incluye pip. "
            "Repara la instalación de Python y vuelve a abrir start.bat."
        )
    return executable


def main():
    if sys.version_info < (3, 11):
        raise RuntimeError("Drek necesita Python 3.11 o superior.")
    ensure_venv()


if __name__ == "__main__":
    try:
        main()
    except (OSError, subprocess.SubprocessError, RuntimeError) as exc:
        print(f"No se pudo preparar el entorno Python: {exc}", file=sys.stderr)
        raise SystemExit(1)
