"""Utility helpers for working with timestamps."""

from __future__ import annotations

import re
from typing import Union


class TimestampParseError(ValueError):
    """Raised when a timestamp cannot be parsed."""


def parse_timestamp(timestamp: Union[str, int, float]) -> int:
    """Convert a timestamp to seconds.

    Args:
        timestamp: A value representing the timestamp. Accepts:
            - int or float: already in seconds.
            - str: either seconds or formatted as HH:MM:SS.

    Returns:
        The timestamp expressed in whole seconds.

    Raises:
        TimestampParseError: If the input cannot be parsed.
    """

    if isinstance(timestamp, (int, float)):
        if timestamp < 0:
            raise TimestampParseError("Timestamp cannot be negative.")
        return int(timestamp)

    if isinstance(timestamp, str):
        token = timestamp.strip()
        if not token:
            raise TimestampParseError("Timestamp string is empty.")

        if token.isdigit():
            return parse_timestamp(int(token))

        match = re.fullmatch(r"(\d{1,2}):([0-5]\d):([0-5]\d)", token)
        if match:
            hours, minutes, seconds = map(int, match.groups())
            return hours * 3600 + minutes * 60 + seconds

    raise TimestampParseError(f"Unsupported timestamp format: {timestamp!r}")


def format_seconds(seconds: int) -> str:
    """Format seconds into HH:MM:SS."""

    if seconds < 0:
        raise ValueError("Seconds cannot be negative.")
    hours, remainder = divmod(int(seconds), 3600)
    minutes, secs = divmod(remainder, 60)
    return f"{hours:02d}:{minutes:02d}:{secs:02d}"
