"""Manage uploaded media metadata for the web platform."""

from __future__ import annotations

import json
from dataclasses import dataclass, asdict
from pathlib import Path
from typing import Dict, List, Optional


@dataclass
class LibraryEntry:
    video_id: str
    title: str
    video_path: str
    subtitle_path: Optional[str] = None


class LibraryStore:
    """JSON-backed repository for uploaded videos."""

    def __init__(self, path: str | Path) -> None:
        self.path = Path(path)
        self._data = self._load()

    # Internal helpers -------------------------------------------------
    def _load(self) -> Dict[str, List[Dict]]:
        if not self.path.exists():
            return {"videos": []}
        try:
            with self.path.open("r", encoding="utf-8") as handle:
                data = json.load(handle)
        except json.JSONDecodeError:
            data = {"videos": []}
        data.setdefault("videos", [])
        return data

    def _save(self) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        with self.path.open("w", encoding="utf-8") as handle:
            json.dump(self._data, handle, indent=2)

    # Public API -------------------------------------------------------
    def list_videos(self) -> List[LibraryEntry]:
        return [LibraryEntry(**entry) for entry in self._data["videos"]]

    def get_video(self, video_id: str) -> Optional[LibraryEntry]:
        for entry in self.list_videos():
            if entry.video_id == video_id:
                return entry
        return None

    def upsert_video(self, entry: LibraryEntry) -> None:
        videos = self._data["videos"]
        for idx, existing in enumerate(videos):
            if existing["video_id"] == entry.video_id:
                videos[idx] = asdict(entry)
                break
        else:
            videos.append(asdict(entry))
        self._save()

    def remove_video(self, video_id: str) -> None:
        videos = [v for v in self._data["videos"] if v["video_id"] != video_id]
        self._data["videos"] = videos
        self._save()
