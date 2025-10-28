"""FastAPI application exposing the Movie Companion as a web platform."""

from __future__ import annotations

import asyncio
import logging
import tempfile
import uuid
from contextlib import suppress
from pathlib import Path
from typing import Optional

import aiofiles
from fastapi import (
    FastAPI,
    File,
    Form,
    HTTPException,
    UploadFile,
    Depends,
    Query,
    Body,
)
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, Response
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from movie_companion.assistant import CompanionConfig, MovieCompanion
from movie_companion.library import LibraryEntry, LibraryStore
from movie_companion.subtitles import (
    SubtitleLoaderError,
    extract_context,
    load_subtitles,
)
from movie_companion.time_utils import parse_timestamp, format_seconds


BASE_DIR = Path(__file__).resolve().parents[2]
DATA_DIR = BASE_DIR / "data"
MEDIA_DIR = BASE_DIR / "media"
VIDEO_DIR = MEDIA_DIR / "videos"
SUBTITLE_DIR = MEDIA_DIR / "subtitles"
STATIC_DIR = BASE_DIR / "web" / "static"


def _ensure_directories() -> None:
    for path in (DATA_DIR, MEDIA_DIR, VIDEO_DIR, SUBTITLE_DIR, STATIC_DIR):
        path.mkdir(parents=True, exist_ok=True)


class AskRequest(BaseModel):
    video_id: str = Field(..., description="Identifier of the uploaded video.")
    timestamp: str | int = Field(..., description="Current playback timestamp (seconds or HH:MM:SS).")
    question: str = Field(..., description="Viewer question about the content.")
    provider: Optional[str] = Field(None, description="LLM provider override (ollama or openai).")
    model: Optional[str] = Field(None, description="Model name for the provider.")
    temperature: Optional[float] = Field(None, description="Generation temperature.")
    max_output_tokens: Optional[int] = Field(None, description="Maximum tokens to generate.")
    previously_watched: Optional[list[str]] = Field(None, description="Optional previously watched titles.")


def create_app() -> FastAPI:
    """Create and configure the FastAPI application."""

    _ensure_directories()
    library = LibraryStore(DATA_DIR / "library.json")

    app = FastAPI(title="Movie Companion Web Platform", version="0.1.0")

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    if STATIC_DIR.exists():
        app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")

    @app.get("/")
    async def index() -> Response:
        index_path = STATIC_DIR / "index.html"
        if not index_path.exists():
            raise HTTPException(status_code=404, detail="Front-end assets missing.")
        return FileResponse(index_path)

    # Dependency to access library within endpoints ------------------
    def get_library() -> LibraryStore:
        return library

    # Routes ---------------------------------------------------------
    @app.get("/health")
    async def health() -> dict[str, str]:
        return {"status": "ok"}

    @app.get("/videos")
    async def list_videos(lib: LibraryStore = Depends(get_library)) -> list[dict]:
        return [
            {
                "video_id": entry.video_id,
                "title": entry.title,
                "video_path": entry.video_path,
                "subtitle_path": entry.subtitle_path,
            }
            for entry in lib.list_videos()
        ]

    async def _validate_subtitle_upload(upload: UploadFile) -> None:
        """Ensure an uploaded subtitle file can be parsed before persisting it."""

        suffix = Path(upload.filename or "subtitles.srt").suffix or ".srt"
        temp_path: Path | None = None
        try:
            with tempfile.NamedTemporaryFile("wb", suffix=suffix, delete=False) as tmp:
                temp_path = Path(tmp.name)
                while True:
                    chunk = await upload.read(1024 * 1024)
                    if not chunk:
                        break
                    tmp.write(chunk)

            if temp_path is None:
                raise HTTPException(status_code=400, detail="Failed to stage subtitle upload.")

            load_subtitles(temp_path)
        except SubtitleLoaderError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        finally:
            await upload.seek(0)
            if temp_path:
                with suppress(FileNotFoundError, PermissionError):
                    temp_path.unlink()

    async def _save_upload(upload: UploadFile, destination: Path) -> str:
        destination.parent.mkdir(parents=True, exist_ok=True)
        async with aiofiles.open(destination, "wb") as out_file:
            while chunk := await upload.read(1024 * 1024):
                await out_file.write(chunk)
        return str(destination)

    @app.post("/videos")
    async def upload_video(
        title: str = Form(..., description="Title to display for the video."),
        video: UploadFile = File(...),
        subtitles: UploadFile | None = File(None),
        lib: LibraryStore = Depends(get_library),
    ) -> dict:
        if not title.strip():
            raise HTTPException(status_code=400, detail="Title cannot be empty.")

        video_id = uuid.uuid4().hex
        video_ext = Path(video.filename or "video.mp4").suffix or ".mp4"
        video_path = VIDEO_DIR / f"{video_id}{video_ext}"
        await _save_upload(video, video_path)

        subtitle_path: Optional[str] = None
        if subtitles:
            subtitle_ext = Path(subtitles.filename or "subtitles.srt").suffix or ".srt"
            destination = SUBTITLE_DIR / f"{video_id}{subtitle_ext}"
            await _validate_subtitle_upload(subtitles)
            await _save_upload(subtitles, destination)
            subtitle_path = str(destination.relative_to(BASE_DIR))

        entry = LibraryEntry(
            video_id=video_id,
            title=title.strip(),
            video_path=str(video_path.relative_to(BASE_DIR)),
            subtitle_path=subtitle_path,
        )
        lib.upsert_video(entry)

        return {"video_id": video_id}

    @app.get("/videos/{video_id}/stream")
    async def stream_video(video_id: str, lib: LibraryStore = Depends(get_library)) -> Response:
        entry = lib.get_video(video_id)
        if not entry:
            raise HTTPException(status_code=404, detail="Video not found.")
        path = BASE_DIR / entry.video_path
        if not path.exists():
            raise HTTPException(status_code=404, detail="Video file missing on disk.")
        return FileResponse(path)

    @app.get("/videos/{video_id}/subtitles")
    async def get_subtitles(video_id: str, lib: LibraryStore = Depends(get_library)) -> Response:
        entry = lib.get_video(video_id)
        if not entry or not entry.subtitle_path:
            raise HTTPException(status_code=404, detail="Subtitles not found.")
        path = BASE_DIR / entry.subtitle_path
        if not path.exists():
            raise HTTPException(status_code=404, detail="Subtitle file missing on disk.")
        return FileResponse(path)

    @app.delete("/videos/{video_id}", status_code=204)
    async def delete_video(video_id: str, lib: LibraryStore = Depends(get_library)) -> Response:
        entry = lib.get_video(video_id)
        if not entry:
            raise HTTPException(status_code=404, detail="Video not found.")

        for relative_path in (entry.video_path, entry.subtitle_path):
            if not relative_path:
                continue
            path = BASE_DIR / relative_path
            with suppress(FileNotFoundError, IsADirectoryError):
                path.unlink()

        lib.remove_video(video_id)
        return Response(status_code=204)

    @app.get("/context")
    async def get_context(
        video_id: str = Query(...),
        timestamp: str | int = Query(...),
        lib: LibraryStore = Depends(get_library),
    ) -> dict:
        entry = lib.get_video(video_id)
        if not entry:
            raise HTTPException(status_code=404, detail="Video not found.")
        if not entry.subtitle_path:
            return {"context": "", "timestamp": format_seconds(parse_timestamp(timestamp))}
        path = BASE_DIR / entry.subtitle_path
        if not path.exists():
            raise HTTPException(status_code=404, detail="Subtitle file missing on disk.")
        subtitles = load_subtitles(path)
        seconds = parse_timestamp(timestamp)
        context = extract_context(subtitles, seconds)
        return {"context": context, "timestamp": format_seconds(seconds)}

    def _build_companion_config(request: AskRequest) -> CompanionConfig:
        config_kwargs = {
            "history_path": DATA_DIR / "watched_history.json",
        }
        if request.provider:
            config_kwargs["provider"] = request.provider
        if request.model:
            config_kwargs["model"] = request.model
        if request.temperature is not None:
            config_kwargs["temperature"] = request.temperature
        if request.max_output_tokens is not None:
            config_kwargs["max_output_tokens"] = request.max_output_tokens
        return CompanionConfig(**config_kwargs)

    @app.post("/ask")
    async def ask_question(
        payload: AskRequest = Body(...),
        lib: LibraryStore = Depends(get_library),
    ) -> dict:
        entry = lib.get_video(payload.video_id)
        if not entry:
            raise HTTPException(status_code=404, detail="Video not found.")

        subtitles_path = entry.subtitle_path
        if not subtitles_path:
            raise HTTPException(status_code=400, detail="Subtitles are required for context.")

        seconds = parse_timestamp(payload.timestamp)
        companion = MovieCompanion(_build_companion_config(payload))
        loop = asyncio.get_event_loop()
        try:
            answer = await loop.run_in_executor(
                None,
                lambda: companion.answer_question(
                    title=entry.title,
                    subtitle_path=BASE_DIR / subtitles_path,
                    timestamp=seconds,
                    question=payload.question,
                    previously_watched=payload.previously_watched,
                ),
            )
        except RuntimeError as exc:
            logging.getLogger(__name__).error("LLM request failed", exc_info=exc)
            generic_detail = "Something went wrong while generating the answer. Please try again in a moment."
            if "timed out" in str(exc).lower():
                raise HTTPException(status_code=504, detail=generic_detail) from exc
            raise HTTPException(status_code=502, detail=generic_detail) from exc

        return {"answer": answer}

    return app
