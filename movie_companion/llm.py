"""Wrapper around language model backends for answering questions."""

from __future__ import annotations

import json
import os
import time
from dataclasses import dataclass
from typing import Dict, List, Optional

import requests
from openai import OpenAI


class LLMConfigurationError(RuntimeError):
    """Raised when the LLM client cannot be configured correctly."""


@dataclass
class LLMSettings:
    """Configuration for generating answers."""

    provider: str = "openai"
    model: str = "gpt-4o-mini"
    temperature: float = 0.4
    max_output_tokens: int = 350
    ollama_base_url: str = "http://localhost:11434"
    system_prompt: Optional[str] = None  # If None, uses default prompt


class LLMClient:
    """Small wrapper so the rest of the project does not depend on LLM vendors directly."""

    def __init__(self, settings: Optional[LLMSettings] = None, api_key: Optional[str] = None) -> None:
        self.settings = settings or LLMSettings()
        self.provider = self.settings.provider.lower()
        
        # Load system prompt from environment if not set
        if self.settings.system_prompt is None:
            self.settings.system_prompt = os.getenv(
                "SYSTEM_PROMPT",
                "You are a friendly movie or TV companion assistant. "
                "Answer questions using only the provided context, watched history, and logical inference "
                "based solely on events up to the specified timestamp. "
                "Never mention or hint at spoilers, twists, or future events beyond the timestamp. "
                "If the viewer requests major spoilers, gently refuse. "
                "When the context is sparse, acknowledge uncertainty and suggest rechecking or continuing to watch. "
                "Keep responses concise, helpful, and conversational."
            )

        if self.provider == "openai":
            key = api_key or os.getenv("OPENAI_API_KEY")
            if not key:
                raise LLMConfigurationError(
                    "OPENAI_API_KEY is required when using the OpenAI provider. "
                    "Set the environment variable or pass api_key to LLMClient."
                )
            self._client = OpenAI(api_key=key)
        elif self.provider == "ollama":
            self._client = None
            self._ollama_url = self.settings.ollama_base_url.rstrip("/")
        elif self.provider == "groq":
            self._client = None
            self._groq_key = api_key or os.getenv("GROQ_API_KEY")
            if not self._groq_key:
                raise LLMConfigurationError("GROQ_API_KEY is required when using the groq provider.")
        else:
            raise LLMConfigurationError(f"Unsupported provider: {self.settings.provider}")

    def _build_messages(
        self,
        *,
        title: str,
        timestamp: str,
        question: str,
        context: str,
        history: Dict,
        previously_watched: Optional[List[str]],
    ) -> List[Dict[str, str]]:
        watched_entries = previously_watched or history.get("entries") or []
        last_seen = history.get("last_timestamp", 0)

        context_block = context if context else "No subtitle context available before this timestamp."
        watched_text = ", ".join(watched_entries) if watched_entries else "None noted"

        user_content = (
            f"Title: {title}\n"
            f"Current timestamp (HH:MM:SS): {timestamp}\n"
            f"Previously watched episodes/movies: {watched_text}\n"
            f"Last recorded timestamp in history: {last_seen} seconds\n\n"
            f"Context up to this timestamp:\n{context_block}\n\n"
            f"Viewer question: {question}"
        )

        system_content = self.settings.system_prompt

        return [
            {"role": "system", "content": system_content},
            {"role": "user", "content": user_content},
        ]

    def answer(
        self,
        *,
        title: str,
        timestamp: str,
        question: str,
        context: str,
        history: Dict,
        previously_watched: Optional[List[str]] = None,
    ) -> str:
        """Generate a natural language answer from the LLM."""

        messages = self._build_messages(
            title=title,
            timestamp=timestamp,
            question=question,
            context=context,
            history=history,
            previously_watched=previously_watched,
        )

        if self.provider == "openai":
            response = self._client.chat.completions.create(
                model=self.settings.model,
                temperature=self.settings.temperature,
                max_tokens=self.settings.max_output_tokens,
                messages=messages,
            )
            return response.choices[0].message.content.strip()

        if self.provider == "ollama":
            payload: Dict[str, object] = {
                "model": self.settings.model,
                "messages": messages,
                "stream": False,
                "options": {
                    "temperature": self.settings.temperature,
                },
            }
            if self.settings.max_output_tokens:
                payload["options"]["num_predict"] = self.settings.max_output_tokens

            attempt = 0
            last_error: Optional[BaseException] = None
            while attempt < 3:
                try:
                    response = requests.post(
                        f"{self._ollama_url}/api/chat",
                        json=payload,
                        timeout=60,
                    )
                    response.raise_for_status()
                    message = response.json().get("message", {})
                    content = message.get("content")
                    if not content:
                        raise RuntimeError("Ollama returned an empty response.")
                    return str(content).strip()
                except requests.Timeout as exc:
                    last_error = exc
                except requests.RequestException as exc:
                    last_error = exc
                    break
                attempt += 1
                time.sleep(2 ** attempt)

            raise RuntimeError(f"Ollama request failed after retries: {last_error}") from last_error

        if self.provider == "groq":
            headers = {
                "Authorization": f"Bearer {self._groq_key}",
                "Content-Type": "application/json",
            }
            payload: Dict[str, object] = {
                "model": self.settings.model,
                "messages": messages,
                "temperature": self.settings.temperature,
                "stream": False,
            }
            if self.settings.max_output_tokens:
                payload["max_tokens"] = self.settings.max_output_tokens
            response = requests.post(
                "https://api.groq.com/openai/v1/chat/completions",
                headers=headers,
                json=payload,
                timeout=60,
            )
            if response.status_code >= 400:
                detail = response.text
                raise RuntimeError(f"Groq request failed ({response.status_code}): {detail}")
            data = response.json()
            choice = (data.get("choices") or [{}])[0]
            content = choice.get("message", {}).get("content")
            if not content:
                raise RuntimeError("Groq returned an empty response.")
            return str(content).strip()

        raise LLMConfigurationError(f"Unsupported provider at runtime: {self.provider}")
