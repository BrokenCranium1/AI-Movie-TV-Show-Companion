"""
Vercel entrypoint for FastAPI
"""

from movie_companion.server import create_app

app = create_app()
