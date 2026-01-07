# api/index.py
from movie_companion.server import create_app

app = create_app()

# Vercel will auto-detect FastAPI
