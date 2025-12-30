# StevieTheTV Repository Documentation

Comprehensive documentation for the StevieTheTV project (also called the AI Movie & TV Show Companion). This guide explains what the project does, the technologies that were used to build it, and how the pieces of the repository fit together.

---

## 1. Project Overview

- **Purpose:** StevieTheTV is a spoiler-aware AI copilot that watches along with a viewer by reading subtitle files and answering questions about what just happened in a film or TV episode.
- **High-level workflow:** A viewer uploads a video plus matching `.srt` file via the web UI → FastAPI stores the files and metadata → when the viewer asks a question the backend fetches the subtitle context up to the current timestamp, injects any watch history, and calls an LLM (OpenAI, Ollama, or Groq) to generate a spoiler-safe answer.
- **Key capabilities:**
  - Upload, list, stream, and delete local media inside the browser without extra tooling.
  - Subtitle-aware chat assistant that automatically trims context to the preceding ~5 minutes to keep prompts focused.
  - Watch history tracking so the assistant remembers how far the user progressed and what else they have seen.
  - Works with a local Ollama model by default but can switch to Groq or OpenAI via environment variables.
  - Lightweight FastAPI backend plus single-page HTML/CSS/JS frontend so it is easy to deploy on hobby clouds.

---

## 2. Technology Stack

| Layer | Technologies | Notes |
| --- | --- | --- |
| Backend runtime | **FastAPI**, **Uvicorn**, **Python 3.10+** | `run_server.py` loads `.env` files and boots Uvicorn. API is defined in `movie_companion/server/api.py`. |
| Domain logic | `movie_companion` package | Modules include `assistant.py`, `llm.py`, `library.py`, `history.py`, `subtitles.py`, and `time_utils.py`. |
| AI providers | OpenAI SDK, plain HTTP for Ollama and Groq | Provider selected via `CompanionConfig`/`LLMSettings`. |
| Data parsing | `pysrt` for subtitles, `json` for metadata/history | JSON files stored in `data/`. |
| Frontend | Vanilla HTML (`web/static/index.html`), CSS (`styles.css`), and ES6 (`app.js`) | Served directly by FastAPI using `StaticFiles`. |
| Build/Tooling | No bundler required; all dependencies pinned in `requirements.txt`. | Windows helper script `run_server.bat` is provided. |

`requirements.txt` lists the runtime libraries: `fastapi`, `uvicorn[standard]`, `aiofiles`, `python-multipart`, `python-dotenv`, `pysrt`, `requests`, and `openai`.

---

## 3. Repository Layout

```
AI_Movie_TV_Show_Companion/
├─ run_server.py / run_server.bat  # Launchers
├─ movie_companion/                # Python package (backend + domain logic)
├─ web/static/                     # Frontend assets (HTML/CSS/JS/images)
├─ data/                           # JSON metadata + watch history
├─ media/                          # Uploaded videos and subtitle files
├─ DEPLOYMENT*.md                  # Hosting guides
├─ SYSTEM_PROMPT_EXAMPLE.md        # Custom prompt instructions
├─ README.md                       # Quickstart
└─ docs/StevieTheTV_Repository_Documentation.md  # This document
```

Important data files:

- `data/library.json` – Catalog of uploaded videos (`video_id`, title, paths).
- `data/watched_history.json` – Aggregated timeline per title with last timestamp and optional “previously watched” entries.
- `media/videos/` – Binary uploads stored as `<uuid>.<ext>`.
- `media/subtitles/` – Subtitle uploads stored as `<uuid>.srt`.

---

## 4. Backend Architecture

### 4.1 Entry Points

- `run_server.py` loads `.env.local` and `.env` (if they exist) using `python-dotenv`, builds the FastAPI app via `movie_companion.server.create_app`, and runs `uvicorn` on `PORT` (defaults to 8000).
- `run_server.bat` is a Windows helper that activates the repo directory and runs `python run_server.py`.

### 4.2 FastAPI Application (`movie_companion/server/api.py`)

- Configures directories under the project root (`data`, `media/videos`, `media/subtitles`, `web/static`).
- Adds permissive CORS middleware so local web clients can call the API.
- Mounts `/static` to serve the frontend bundle (index.html, CSS, JS, and images).
- Routes:
  - `GET /health` – quick status check.
  - `GET /videos` – list uploaded items (ID, title, relative paths).
  - `POST /videos` – multipart upload handler for a title, video file, and optional `.srt`. Uses `aiofiles` plus a temporary parse step to validate subtitles before persisting them.
  - `GET /videos/{id}/stream` & `/videos/{id}/subtitles` – stream stored assets via `FileResponse`.
  - `DELETE /videos/{id}` – delete the metadata and on-disk files.
  - `GET /context` – fetch subtitle context up to a timestamp.
  - `POST /ask` – accept a question payload, build a `CompanionConfig`, and offload the call to `MovieCompanion.answer_question` in a thread pool to avoid blocking the FastAPI event loop.
- Error handling:
  - Validates uploads with `load_subtitles` to avoid storing corrupt `.srt` files.
  - Converts timestamp parsing or provider failures into HTTP 4xx/5xx with human-friendly details.
  - Retries Ollama chats up to three times inside `LLMClient`.

### 4.3 Domain Modules (under `movie_companion/`)

- `assistant.py` – `MovieCompanion` orchestrates the workflow: parse timestamps (`time_utils.parse_timestamp`), load subtitles, extract context up to the requested second, look up watch history, dispatch to `LLMClient`, and persist the new viewing record.
- `subtitles.py` – Wraps `pysrt` to parse `.srt` files. Provides `extract_context` which keeps roughly five minutes (configurable) of dialog before the timestamp with a 4,000-character cap, collapsing whitespace for readability.
- `history.py` – Stores per-title progress in `data/watched_history.json`, deduplicates “previously watched” entries, and allows optional notes.
- `library.py` – JSON-backed `LibraryStore` with helpers to list, upsert, and remove `LibraryEntry` records representing uploaded media.
- `llm.py` – Abstraction over AI vendors. Supports:
  - **OpenAI** – uses the official SDK, requires `OPENAI_API_KEY`.
  - **Ollama** – posts to the `/api/chat` endpoint, respects `OLLAMA_BASE_URL`, and retries timeouts.
  - **Groq** – raw REST calls signed with `GROQ_API_KEY`.
  The class builds a consistent prompt (system + user) with the subtitle context, playback timestamp, watched history, and viewer question. System prompts can be overridden via environment variable or config.
- `time_utils.py` – Parsing and formatting helpers for HH:MM:SS strings or raw seconds.

---

## 5. Frontend Application (`web/static`)

- `index.html` – Single-page layout with:
  - Top bar (branding, library dropdown, upload button).
  - Upload drawer for title/video/subtitle selection.
  - Video player with custom assistant + fullscreen controls.
  - Chat sidebar that displays conversation history, subtitle context, and question form.
- `styles.css` – Modern CSS with CSS variables, responsive layout, animated chat bubbles, accessible forms, and overlay styles for uploads/subtitles.
- `app.js` – Pure vanilla JavaScript controller:
  - Handles library dropdown interactions with keyboard navigation and deletion shortcuts.
  - Uses `fetch` to call `/videos`, `/videos/{id}/stream`, `/videos/{id}/subtitles`, and `/ask`.
  - Provides optimistic UI for uploads, displays overlay while validating subtitles, and refreshes the catalog when done.
  - Keeps subtitles synced in-browser by downloading the `.srt`, parsing cues client-side, and showing a floating overlay when playback is active.
  - Automatically scrolls chat, animates incoming answers, debounces metadata refreshes, and retries `/ask` calls up to three times before showing an error in the UI.
  - Forces provider/model defaults to `ollama` + `llama3` so the UI matches a local development stack, but these can be edited in `app.js` or changed in API parameters.

---

## 6. Data & Storage Model

- **Library metadata** (`data/library.json`) – structure: `{"videos": [{"video_id": "...", "title": "...", "video_path": "...", "subtitle_path": "..."}]}`.
- **Watch history** (`data/watched_history.json`) – structure: `{"titles": {"<Title>": {"entries": [...], "last_timestamp": <seconds>}}}`. Automatically created if it does not exist or is corrupted.
- **Media assets** – uploaded binaries live inside `media/videos/` and `media/subtitles/` with UUID-based filenames so they can be safely referenced in JSON.
- **Transient directories** – `data/subtitle_index/` and `data/users/` are placeholders for potential indexing or multi-user storage; they are currently empty but tracked in the repo to signal future scope.

The backend never stores videos inside a database; everything is file-system driven so deployments on hobby tiers remain simple.

---

## 7. Configuration & Environment

- Create `.env.local` (preferred for development) or `.env` in the project root; `run_server.py` loads them automatically.
- Main environment variables (see `README.md` & `SYSTEM_PROMPT_EXAMPLE.md` for detailed descriptions):
  - `OLLAMA_BASE_URL` – URL of the Ollama server (defaults to `http://localhost:11434`).
  - `GROQ_API_KEY` – Required if you pick the Groq provider.
  - `OPENAI_API_KEY` – Required when using OpenAI.
  - `SYSTEM_PROMPT` – Optional override of the base instructions given to the LLM.
  - `PORT` – HTTP port for Uvicorn (default 8000).
- Frontend defaults can be tweaked in `web/static/app.js` (e.g., change provider/model or add extra payload metadata).

---

## 8. Running the Project Locally

1. Install Python 3.10+ and (optionally) Ollama.
2. `python -m venv .venv && source .venv/bin/activate` (or use any environment manager).
3. `pip install -r requirements.txt`.
4. Export one of the supported API keys (`OPENAI_API_KEY`, `GROQ_API_KEY`, or run `ollama serve`).
5. `python run_server.py`.
6. Navigate to `http://localhost:8000`, upload a short MP4 + `.srt`, press play, and start chatting.

Windows users can double-click `run_server.bat` after they prepare their Python environment and `.env.local`.

---

## 9. API Surface Summary

| Method & Path | Description | Notes |
| --- | --- | --- |
| `GET /health` | Simple health probe. | Returns `{ "status": "ok" }`. |
| `GET /videos` | List all uploaded videos. | Used by the frontend dropdown. |
| `POST /videos` | Upload a title + video + optional `.srt`. | Validates subtitles prior to saving. Responds with `{"video_id": "<uuid>"}`. |
| `GET /videos/{id}/stream` | Stream the stored video file. | Backed by plain `FileResponse`. |
| `GET /videos/{id}/subtitles` | Download the `.srt`. | Frontend parses it to display overlay subtitles. |
| `DELETE /videos/{id}` | Remove video + subtitles + metadata. | Cleans files if present. |
| `GET /context?video_id=&timestamp=` | Return subtitle context up to timestamp. | Timestamps can be seconds or HH:MM:SS. |
| `POST /ask` | Send `{video_id, timestamp, question, provider?, model?, temperature?, max_output_tokens?, previously_watched?}`. | Returns `{"answer": "..."}; errors downgraded to 4xx/5xx with friendly messages. |

All responses are JSON (except raw file streams). These same endpoints enable automation or third-party integrations beyond the bundled UI.

---

## 10. LLM Providers and Prompting

- `LLMClient` centralizes prompt building: the system prompt enforces “no spoilers past the timestamp” and instructs the model to cite only the provided context. The user message bundles the title, formatted timestamp, watch history, and question.
- Providers:
  - **OpenAI** – Chat Completions API; uses SDK which handles retries internally.
  - **Ollama** – Local inference via REST; includes manual retry/backoff logic in case of timeouts.
  - **Groq** – Cloud inference via HTTP with manual error decoding.
- Parameters such as `temperature`, `max_output_tokens`, `provider`, and `model` can be overridden per `/ask` request (the frontend passes `ollama` + `llama3` by default).
- Custom prompts can be provided through `SYSTEM_PROMPT`, `.env.local`, or by editing the default string in `llm.py`. Refer to `SYSTEM_PROMPT_EXAMPLE.md` for ready-to-use snippets.

---

## 11. Deployment Notes

- `DEPLOYMENT.md` documents how to smoke test locally, then deploy to Render or Fly.io on their free tiers. It highlights environment variables and data persistence caveats (Render’s ephemeral disks vs. Fly volumes).
- `DEPLOYMENT_CLOUD_WITH_LOCAL_OLLAMA.md` shows how to host the FastAPI app in the cloud while keeping Ollama on your personal machine. It walks through ngrok and Cloudflare Tunnel setups plus how to point `OLLAMA_BASE_URL` at the tunnelled URL.
- Because the backend is a single FastAPI app, any platform that can run `uvicorn movie_companion.server.api:create_app --host 0.0.0.0 --port $PORT` with the Python dependencies installed can host it.

---

## 12. Usage Flow (End-to-End)

1. **Upload media** via the top-right “Upload New” button, filling in the title, MP4, and optional `.srt`.
2. **Select from the library**; the dropdown is keyboard accessible and allows inline deletion if assets are obsolete.
3. **Press play**; the video streams from `/videos/{id}/stream` and subtitles are displayed using the `.srt` file that the browser fetched from `/videos/{id}/subtitles`.
4. **Ask a question**; the sidebar collects the question, the current playback timestamp, and the preferred model details, then POSTs to `/ask`.
5. **LLM pipeline**; the backend builds context with `extract_context`, merges watch history, calls the configured provider, stores the updated timestamp, and returns the answer.
6. **Chat view renders** the answer with timestamps and animations. Errors (timeouts, invalid subtitles, etc.) surface directly to the viewer with actionable tips.

---

## 13. Extensibility Ideas

- Index subtitles in `data/subtitle_index/` to support semantic search or skipping ahead.
- Use `data/users/` to extend the watch history to account for multiple profiles.
- Swap the vanilla frontend for a modern framework or add service-worker caching for offline playback.
- Integrate analytics or logging providers before deploying to production.

StevieTheTV already offers a full-stack loop for spoiler-aware Q&A, and this documentation should serve as the single reference for anyone exploring, running, or extending the repository.

