# StevieTheTV

StevieTheTV is a spoiler-aware AI companion that watches along by reading subtitles and answers your movie or TV show questions through a local web experience served from FastAPI.

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

- `POST /videos` – upload video and optional subtitles.
- `GET /videos` – list uploaded items.
- `GET /videos/{id}/stream` – stream the video.
- `GET /context?video_id=...&timestamp=...` – subtitle context up to timestamp.
- `POST /ask` – ask StevieTheTV (body: `video_id`, `timestamp`, `question`, etc.).

Files are stored under `media/`, metadata in `data/library.json`, and viewing history in `data/watched_history.json`.

## Model Configuration

- **Ollama (default)**: Install [Ollama](https://ollama.com/download), run `ollama pull llama3`, start `ollama serve`, and keep `provider=ollama`, `model=llama3`. The app talks to `http://localhost:11434` unless you set `OLLAMA_BASE_URL`.
- **Groq (hosted alternative)**: If you need a cloud model, grab a `GROQ_API_KEY` and set `provider=groq` with a Groq-supported model (e.g., `llama3-8b-8192`).
- **OpenAI**: Set `OPENAI_API_KEY`, keep `provider=openai`, and choose an OpenAI chat model.

### Environment Variables

| Name | Used for | Notes |
| --- | --- | --- |
| `OLLAMA_BASE_URL` | Ollama provider | Optional override (defaults to `http://localhost:11434`). |
| `GROQ_API_KEY` | Groq provider | Only needed when `provider=groq`. |
| `OPENAI_API_KEY` | OpenAI provider | Only needed when `provider=openai`. |
| `SYSTEM_PROMPT` | AI behavior | Customize the AI assistant's personality and instructions. See `SYSTEM_PROMPT_EXAMPLE.md` for examples. |

For local development, copy `.env.local.example` to `.env.local`, fill in the keys you care about, and `python run_server.py` will load them automatically.

## Development Notes

- Subtitle parsing uses `pysrt`; make sure `.srt` timestamps align with your media.
- The web UI lives in `web/static/`; tweak appearance in `styles.css` and behavior in `app.js`.
- All persistent data lives in `data/`; remove files there if you want a clean slate.

Enjoy the show with StevieTheTV!
