"""Vercel entry point: exposes the FastAPI app as the variable `app`.

Vercel runs this file as one Python function and sends it every /api/...
request (see the rewrite in vercel.json). The backend code lives in backend/,
so we put that folder on the import path first; then "import app" works here
exactly as it does in the tests and in the seed command.
"""

import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent.parent / "backend"
sys.path.insert(0, str(BACKEND_DIR))

# This import must come after the sys.path line above, so it is not at the top.
from app.main import create_app

app = create_app()
