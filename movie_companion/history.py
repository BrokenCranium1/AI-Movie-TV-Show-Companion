"""Simple JSON-backed watched history store."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Dict, List, Optional


class WatchedHistory:
    """Persist viewer history so we can keep context between questions."""

    def __init__(self, path: str | Path) -> None:
        self.path = Path(path)
        self._data = self._load()

    # Internal helpers -------------------------------------------------
    def _load(self) -> Dict:
        if not self.path.exists():
            return {"titles": {}}
        try:
            with self.path.open("r", encoding="utf-8") as handle:
                return json.load(handle)
        except json.JSONDecodeError:
            # Start clean when file is corrupted. Caller may choose to warn later.
            return {"titles": {}}

    def _save(self) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        with self.path.open("w", encoding="utf-8") as handle:
            json.dump(self._data, handle, indent=2)

    # Public API -------------------------------------------------------
    def get(self, title: str) -> Dict:
        """Return stored metadata for the requested title."""
        titles = self._data.setdefault("titles", {})
        return titles.setdefault(title, {"entries": [], "last_timestamp": 0})

    def record_viewing(
        self,
        title: str,
        timestamp_seconds: int,
        previously_watched: Optional[List[str]] = None,
    ) -> None:
        """Update history for a title with the latest progress and optional entries."""
        record = self.get(title)
        record["last_timestamp"] = max(record.get("last_timestamp", 0), timestamp_seconds)
        if previously_watched:
            existing = set(record.setdefault("entries", []))
            for entry in previously_watched:
                if entry not in existing:
                    record["entries"].append(entry)
                    existing.add(entry)
        self._save()

    def set_custom_note(self, title: str, note: str) -> None:
        """Allow future extension with manual notes or summaries."""
        record = self.get(title)
        record["note"] = note
        self._save()
