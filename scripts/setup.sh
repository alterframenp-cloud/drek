#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
export PIP_CACHE_DIR="${PIP_CACHE_DIR:-$PWD/.local/pip-cache}"
export npm_config_cache="${npm_config_cache:-$PWD/.local/npm-cache}"
python3 -m venv .venv
.venv/bin/python -m pip install -r backend/requirements-dev.txt
.venv/bin/python -c 'from backend.media import executable; executable("ffmpeg"); executable("ffprobe")'
cd frontend
npm ci --no-audit --no-fund
npm run build
