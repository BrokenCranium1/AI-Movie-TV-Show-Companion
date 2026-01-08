"""FastAPI application exposing StevieTheTV (Vercel demo mode)."""

from __future__ import annotations

import asyncio
import logging
import os
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, HTTPException, Body
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

from movie_companion.assistant import CompanionConfig, MovieCompanion
from movie_companion.subtitles import extract_context_from_text
from movie_companion.time_utils import parse_timestamp, format_seconds


# ------------------------------------------------------------
# App
# ------------------------------------------------------------

def create_app() -> FastAPI:
    app = FastAPI(title="StevieTheTV", version="0.1.0")
    
    # Serve static files for local development only
    # On Vercel, static files are served automatically from public/ directory
    public_dir = Path(__file__).parent.parent.parent / "public"
    if public_dir.exists() and os.getenv("VERCEL") is None:
        # Mount static files
        app.mount("/static", StaticFiles(directory=str(public_dir)), name="static")
        
        # Serve index.html at root for local development
        @app.get("/")
        async def read_root():
            index_path = public_dir / "index.html"
            if index_path.exists():
                return FileResponse(str(index_path))
            return {"message": "StevieTheTV API - Frontend not found"}
    # On Vercel, don't add a root route - let Vercel serve public/index.html automatically

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # ------------------------------------------------------------
    # Models
    # ------------------------------------------------------------

    class AskRequest(BaseModel):
        title: str = Field(..., description="Movie or episode title")
        timestamp: str | int = Field(..., description="Current playback timestamp")
        subtitles_text: str = Field(..., description="Full subtitle file content as text")
        question: str = Field(..., description="Viewer question")
        provider: Optional[str] = None
        model: Optional[str] = None
        temperature: Optional[float] = None
        max_output_tokens: Optional[int] = None
        previously_watched: Optional[list[str]] = None

    # ------------------------------------------------------------
    # Routes
    # ------------------------------------------------------------

    @app.get("/health")
    async def health() -> dict[str, str]:
        return {"status": "ok", "mode": "vercel-demo"}

    @app.post("/context")
    async def get_context(payload: AskRequest = Body(...)) -> dict:
        seconds = parse_timestamp(payload.timestamp)
        context = extract_context_from_text(
            subtitles_text=payload.subtitles_text,
            current_time=seconds,
        )
        return {
            "context": context,
            "timestamp": format_seconds(seconds),
        }

    def _build_companion_config(request: AskRequest) -> CompanionConfig:
        config_kwargs = {}
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
    async def ask_question(payload: AskRequest = Body(...)) -> dict:
        seconds = parse_timestamp(payload.timestamp)
        context = extract_context_from_text(
            subtitles_text=payload.subtitles_text,
            current_time=seconds,
        )

        companion = MovieCompanion(_build_companion_config(payload))
        loop = asyncio.get_event_loop()

        try:
            answer = await loop.run_in_executor(
                None,
                lambda: companion.answer_from_context(
                    title=payload.title,
                    context=context,
                    timestamp=seconds,
                    question=payload.question,
                    previously_watched=payload.previously_watched,
                ),
            )
        except RuntimeError as exc:
            logging.getLogger(__name__).error("LLM request failed", exc_info=exc)
            raise HTTPException(
                status_code=502,
                detail="Failed to generate answer. Try again.",
            ) from exc

        return {"answer": answer}

    return app
