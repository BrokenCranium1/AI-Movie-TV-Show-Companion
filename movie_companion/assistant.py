"""High-level orchestration of the companion workflow."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import List, Optional

from .history import WatchedHistory
from .llm import LLMClient, LLMSettings
from .subtitles import extract_context, load_subtitles, SubtitleLoaderError
from .time_utils import parse_timestamp, TimestampParseError, format_seconds


@dataclass
class CompanionConfig:
    """Runtime configuration for the companion."""

    history_path: Path = Path("data/watched_history.json")
    provider: str = "openai"
    model: str = "gpt-4o-mini"
    temperature: float = 0.4
    max_output_tokens: int = 350
    ollama_base_url: str = "http://localhost:11434"
    system_prompt: Optional[str] = None


class MovieCompanion:
    """User-facing orchestration class."""

    def __init__(self, config: Optional[CompanionConfig] = None, *, api_key: Optional[str] = None) -> None:
        self.config = config or CompanionConfig()
        self.history = WatchedHistory(self.config.history_path)
        llm_settings = LLMSettings(
            provider=self.config.provider,
            model=self.config.model,
            temperature=self.config.temperature,
            max_output_tokens=self.config.max_output_tokens,
            ollama_base_url=self.config.ollama_base_url,
            system_prompt=self.config.system_prompt,
        )
        self.llm = LLMClient(llm_settings, api_key=api_key)

    def answer_question(
        self,
        *,
        title: str,
        subtitle_path: str | Path,
        timestamp: str | int,
        question: str,
        previously_watched: Optional[List[str]] = None,
    ) -> str:
        """Primary entry point to answer a viewer question."""

        try:
            seconds = parse_timestamp(timestamp)
        except TimestampParseError as exc:
            raise ValueError(f"Invalid timestamp: {exc}") from exc

        try:
            subtitles = load_subtitles(subtitle_path)
        except SubtitleLoaderError as exc:
            raise FileNotFoundError(str(exc)) from exc

        context = extract_context(subtitles, seconds)
        history_record = self.history.get(title)

        answer = self.llm.answer(
            title=title,
            timestamp=format_seconds(seconds),
            question=question,
            context=context,
            history=history_record,
            previously_watched=previously_watched,
        )

        # Persist progress after generating the answer.
        self.history.record_viewing(
            title=title,
            timestamp_seconds=seconds,
            previously_watched=previously_watched,
        )

        return answer
