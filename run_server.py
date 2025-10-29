"""Launch the StevieTheTV FastAPI server."""

from __future__ import annotations

import uvicorn

from movie_companion.server import create_app


def main() -> None:
    app = create_app()
    uvicorn.run(app, host="0.0.0.0", port=8000, reload=False)


if __name__ == "__main__":
    main()
