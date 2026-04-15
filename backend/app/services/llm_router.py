from __future__ import annotations

import json
import re
from dataclasses import dataclass
from typing import Any

import httpx
from loguru import logger
from openai import AsyncOpenAI

from app.core.config import settings


@dataclass
class LLMResponse:
    text: str
    provider: str
    model: str
    raw: Any | None = None


class LLMRouterError(RuntimeError):
    pass


class LLMRouter:
    def __init__(self) -> None:
        self._openai_client: AsyncOpenAI | None = None

    async def complete(
        self,
        *,
        capability: str,
        messages: list[dict[str, str]],
        default_openai_model: str,
        default_gemini_model: str | None = None,
        temperature: float | None = None,
        max_tokens: int | None = None,
        response_format: dict[str, Any] | None = None,
    ) -> LLMResponse:
        provider, model = settings.resolve_text_llm(
            capability,
            default_openai_model=default_openai_model,
            default_gemini_model=default_gemini_model,
        )
        prompt_chars = sum(len(str(message.get("content") or "")) for message in messages)
        logger.info(
            f"LLM request | capability={capability} | provider={provider} | model={model} | "
            f"response_format={(response_format or {}).get('type', 'text')} | prompt_chars={prompt_chars}"
        )
        try:
            if provider == "gemini":
                result = await self._complete_gemini(
                    model=model,
                    messages=messages,
                    temperature=temperature,
                    max_tokens=max_tokens,
                    response_format=response_format,
                )
            else:
                result = await self._complete_openai(
                    model=model,
                    messages=messages,
                    temperature=temperature,
                    max_tokens=max_tokens,
                    response_format=response_format,
                )
            logger.info(
                f"LLM request succeeded | capability={capability} | provider={result.provider} | "
                f"model={result.model} | output_chars={len(result.text)}"
            )
            return result
        except Exception as exc:
            logger.exception(
                f"LLM request failed | capability={capability} | provider={provider} | model={model} | error={exc}"
            )
            raise

    async def _complete_openai(
        self,
        *,
        model: str,
        messages: list[dict[str, str]],
        temperature: float | None,
        max_tokens: int | None,
        response_format: dict[str, Any] | None,
    ) -> LLMResponse:
        if not settings.OPENAI_API_KEY:
            raise LLMRouterError("OPENAI_API_KEY is required when TEXT_LLM provider resolves to openai")
        if self._openai_client is None:
            self._openai_client = AsyncOpenAI(api_key=settings.OPENAI_API_KEY)

        request_kwargs: dict[str, Any] = {
            "model": model,
            "messages": messages,
        }
        if temperature is not None:
            request_kwargs["temperature"] = temperature
        if max_tokens is not None:
            request_kwargs["max_tokens"] = max_tokens
        if response_format is not None:
            request_kwargs["response_format"] = response_format

        response = await self._openai_client.chat.completions.create(**request_kwargs)
        text = str(response.choices[0].message.content or "").strip()
        if response_format and response_format.get("type") == "json_object":
            text = _normalize_json_text(text)
        return LLMResponse(text=text, provider="openai", model=model, raw=response.model_dump())

    async def _complete_gemini(
        self,
        *,
        model: str,
        messages: list[dict[str, str]],
        temperature: float | None,
        max_tokens: int | None,
        response_format: dict[str, Any] | None,
    ) -> LLMResponse:
        if not settings.GEMINI_API_KEY:
            raise LLMRouterError("GEMINI_API_KEY is required when TEXT_LLM provider resolves to gemini")

        system_parts = [str(message.get("content") or "").strip() for message in messages if message.get("role") == "system"]
        content_messages = [message for message in messages if message.get("role") != "system"]
        contents = []
        for message in content_messages:
            role = "model" if str(message.get("role") or "").strip() == "assistant" else "user"
            contents.append(
                {
                    "role": role,
                    "parts": [{"text": str(message.get("content") or "")}],
                }
            )

        generation_config: dict[str, Any] = {}
        if temperature is not None:
            generation_config["temperature"] = temperature
        if max_tokens is not None:
            generation_config["maxOutputTokens"] = max_tokens
        if response_format and response_format.get("type") == "json_object":
            generation_config["responseMimeType"] = "application/json"
        elif response_format is not None:
            generation_config["responseMimeType"] = "text/plain"

        payload: dict[str, Any] = {
            "contents": contents or [{"role": "user", "parts": [{"text": ""}]}],
        }
        if system_parts:
            payload["system_instruction"] = {"parts": [{"text": "\n\n".join(system_parts)}]}
        if generation_config:
            payload["generationConfig"] = generation_config

        url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
        async with httpx.AsyncClient(timeout=90.0) as client:
            response = await client.post(url, params={"key": settings.GEMINI_API_KEY}, json=payload)
            response.raise_for_status()
            raw = response.json()

        candidates = raw.get("candidates", []) if isinstance(raw, dict) else []
        parts = []
        for candidate in candidates:
            content = candidate.get("content", {})
            for part in content.get("parts", []):
                text = part.get("text")
                if text:
                    parts.append(str(text))
        text = "\n".join(parts).strip()
        if response_format and response_format.get("type") == "json_object":
            text = _normalize_json_text(text)
        return LLMResponse(text=text, provider="gemini", model=model, raw=raw)


def _normalize_json_text(text: str) -> str:
    cleaned = str(text or "").strip()
    if not cleaned:
        return "{}"
    cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned, flags=re.I)
    cleaned = re.sub(r"\s*```$", "", cleaned)
    match = re.search(r"\{[\s\S]*\}|\[[\s\S]*\]", cleaned)
    normalized = match.group(0).strip() if match else cleaned
    json.loads(normalized)
    return normalized


router = LLMRouter()


async def complete_text(
    *,
    capability: str,
    messages: list[dict[str, str]],
    default_openai_model: str,
    default_gemini_model: str | None = None,
    temperature: float | None = None,
    max_tokens: int | None = None,
    response_format: dict[str, Any] | None = None,
) -> LLMResponse:
    return await router.complete(
        capability=capability,
        messages=messages,
        default_openai_model=default_openai_model,
        default_gemini_model=default_gemini_model,
        temperature=temperature,
        max_tokens=max_tokens,
        response_format=response_format,
    )
