# AI Movie & TV Show Companion

A spoiler-aware assistant that watches along by reading subtitles and answers questions through a local web experience served from FastAPI.

## Prerequisites

- Python 3.10+
- (Optional) [Ollama](https://ollama.com) for local language models, or an `OPENAI_API_KEY` if you prefer OpenAI models.

Install dependencies:

```powershell
python -m pip install -r requirements.txt
```

## Run the Web App

1. Start the FastAPI server:

   ```powershell
   python run_server.py
   ```

2. Open `http://localhost:8000` in your browser.
   - Upload a video (MP4 recommended) and optional `.srt` file.
   - Select it from the library dropdown to begin streaming.
   - Use the built-in chat sidebar to ask questions; the assistant pulls context from the subtitles and your viewing history.
   - The front end defaults to an Ollama model named `llama3`; adjust `web/static/app.js` or the request body to switch providers/models.

### API Overview

- `POST /videos` - upload video and optional subtitles.
- `GET /videos` - list uploaded items.
- `GET /videos/{id}/stream` - stream the video.
- `GET /context?video_id=...&timestamp=...` - subtitle context up to timestamp.
- `POST /ask` - ask the companion (body: `video_id`, `timestamp`, `question`, etc.).

Files are stored under `media/`, metadata in `data/library.json`, and viewing history in `data/watched_history.json`.

## Model Configuration

- **Ollama**: Run `ollama serve` and ensure the model (for example `ollama pull llama3`) is available. The UI requests provider `ollama` by default.
- **OpenAI**: Set `OPENAI_API_KEY`, switch provider to `openai`, and choose a model such as `gpt-4o-mini`.

## Development Notes

- Subtitle parsing uses `pysrt`; make sure `.srt` timestamps align with your media.
- The web UI lives in `web/static/`; tweak appearance in `styles.css` and behavior in `app.js`.
- All persistent data lives in `data/`; remove files there if you want a clean slate.

Enjoy watching with your AI companion!
