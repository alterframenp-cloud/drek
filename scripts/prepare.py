"""Local setup; the distributed ZIP already contains the compiled interface."""
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
STATE = ROOT / ".local" / "setup-state.json"


def main():
    os.environ.setdefault("PIP_CACHE_DIR", str(ROOT / ".local" / "pip-cache"))
    os.environ.setdefault("npm_config_cache", str(ROOT / ".local" / "npm-cache"))
    try:
        state = json.loads(STATE.read_text())
    except (OSError, ValueError):
        state = {}
    requirements = hashlib.sha256((ROOT / "backend" / "requirements.txt").read_bytes()).hexdigest() + sys.version
    installed = all(importlib.util.find_spec(name) for name in ["fastapi", "uvicorn", "multipart", "PIL"])
    if state.get("python") != requirements or not installed:
        subprocess.run([sys.executable, "-m", "pip", "install", "-r", str(ROOT / "backend" / "requirements.txt")], check=True)
    frontend = ROOT / "frontend"
    if not (frontend / "dist" / "index.html").is_file():
        npm = shutil.which("npm.cmd" if os.name == "nt" else "npm")
        if not npm:
            raise RuntimeError("Falta la interfaz compilada. Extrae TODO el ZIP. Para compilar desde código, instala Node.js 22.12+.")
        subprocess.run([npm, "ci", "--no-audit", "--no-fund"], cwd=frontend, check=True)
        subprocess.run([npm, "run", "build"], cwd=frontend, check=True)
    STATE.parent.mkdir(exist_ok=True)
    STATE.write_text(json.dumps({"python": requirements}))


if __name__ == "__main__":
    main()
