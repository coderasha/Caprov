#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
VENV="$ROOT/apps/intelligence-engine/.venv"
if [[ ! -x "$VENV/bin/python" ]]; then
  python3 -m venv "$VENV"
  "$VENV/bin/python" -m pip install -q --upgrade pip
  "$VENV/bin/python" -m pip install -q 'fastapi==0.115.12' 'uvicorn==0.34.2' 'pydantic==2.11.4' 'pytest==8.3.5' 'httpx==0.28.1' 'python-dotenv==1.1.0'
fi
cd "$ROOT/apps/intelligence-engine"
exec "$VENV/bin/python" -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
