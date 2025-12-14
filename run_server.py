"""Launch the StevieTheTV FastAPI server."""

from __future__ import annotations

import os
from pathlib import Path

import uvicorn
from dotenv import load_dotenv

from movie_companion.server import create_app


def _load_env_files() -> None:
    """Load environment variables from .env files if present."""

    for filename in (".env.local", ".env"):
        env_path = Path(filename)
        if env_path.exists():
            load_dotenv(env_path, override=False)


def main() -> None:
    _load_env_files()
    port = int(os.getenv("PORT", "8000"))
    app = create_app()
    uvicorn.run(app, host="0.0.0.0", port=port, reload=False)


if __name__ == "__main__":
    main()
