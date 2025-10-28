"""Subtitle loading and context extraction helpers."""

from __future__ import annotations

from collections import deque
from pathlib import Path
from typing import Iterable

import pysrt

from .time_utils import parse_timestamp, TimestampParseError


class SubtitleLoaderError(RuntimeError):
    """Raised when subtitles cannot be loaded or processed."""


DEFAULT_CONTEXT_WINDOW_SECONDS: int | None = 5 * 60  # five minutes
DEFAULT_CONTEXT_MAX_CHARACTERS: int | None = 4000


def load_subtitles(subtitle_path: str | Path) -> pysrt.SubRipFile:
    """Load an SRT subtitle file.

    Args:
        subtitle_path: Path to the SRT file.

    Returns:
        A `pysrt.SubRipFile` representing the subtitles.

    Raises:
        SubtitleLoaderError: If the file does not exist or fails to parse.
    """

    path = Path(subtitle_path)
    if not path.exists():
        raise SubtitleLoaderError(f"Subtitle file not found: {path}")

    try:
        # pysrt expects `error_handling` instead of `errors`.
        return pysrt.open(str(path), encoding="utf-8", error_handling="ignore")
    except Exception as exc:  # pragma: no cover - defensive
        raise SubtitleLoaderError(f"Failed to parse subtitles: {exc}") from exc


def _to_seconds(subtitle_entry: pysrt.SubRipItem) -> int:
    """Convert a subtitle entry's end time to seconds."""
    return subtitle_entry.end.ordinal // 1000


def _normalize_text(text: str) -> str:
    """Ensure subtitle lines collapse to single spaces for readability."""
    return " ".join(text.split())


def context_until_timestamp(
    subtitles: Iterable[pysrt.SubRipItem], timestamp: int
) -> str:
    """Return subtitle text that occurs at or before the timestamp.

    Args:
        subtitles: Iterable of subtitle entries.
        timestamp: Timestamp in seconds.

    Returns:
        Concatenated subtitle text up to the timestamp.
    """

    lines = _collect_window_lines(subtitles, start_seconds=0, end_seconds=timestamp)
    return "\n".join(lines).strip()


def _collect_window_lines(
    subtitles: Iterable[pysrt.SubRipItem],
    *,
    start_seconds: int,
    end_seconds: int,
    max_characters: int | None = None,
) -> list[str]:
    """Collect normalized subtitle lines within a time (and optional char) window."""

    if max_characters is not None and max_characters <= 0:
        max_characters = None

    window: deque[str] = deque()
    text_length = 0

    for entry in subtitles:
        entry_end = _to_seconds(entry)
        if entry_end > end_seconds:
            break
        if entry_end < start_seconds:
            continue

        normalized = _normalize_text(entry.text)
        if not normalized:
            continue

        window.append(normalized)
        text_length += len(normalized)

        if max_characters is None:
            continue

        while window and (text_length + (len(window) - 1)) > max_characters:
            removed = window.popleft()
            text_length -= len(removed)

    return list(window)


def extract_context(
    subtitles: pysrt.SubRipFile,
    timestamp: int | str,
    *,
    window_seconds: int | None = DEFAULT_CONTEXT_WINDOW_SECONDS,
    max_characters: int | None = DEFAULT_CONTEXT_MAX_CHARACTERS,
) -> str:
    """Obtain relevant subtitle context up to a timestamp.

    Args:
        subtitles: Parsed subtitle data.
        timestamp: Target timestamp as seconds or HH:MM:SS.
        window_seconds: Optional number of seconds of context to retain (latest first).
        max_characters: Optional hard cap on the returned context length.

    Returns:
        Combined subtitle strings that happened on or before the timestamp, trimmed
        to the requested window.

    Raises:
        TimestampParseError: If the timestamp cannot be parsed.
    """

    seconds = parse_timestamp(timestamp)

    effective_window = window_seconds if window_seconds and window_seconds > 0 else None
    start_seconds = seconds - effective_window if effective_window else 0
    if start_seconds < 0:
        start_seconds = 0

    lines = _collect_window_lines(
        subtitles,
        start_seconds=start_seconds,
        end_seconds=seconds,
        max_characters=max_characters,
    )
    return "\n".join(lines).strip()
