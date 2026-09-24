"""Provider routing for the backend's chat-completion calls (planner, finance analysis, replay
recovery, receipt vision).

Every provider here speaks the OpenAI chat-completions protocol, so one `openai` SDK client
covers all of them - only base URL, key and model differ:

- openai:      GPT models. Vision + strict json_schema. The default, so behavior is unchanged
               until a task is explicitly pointed elsewhere.
- deepseek:    DeepSeek's open-weight models via api.deepseek.com; `deepseek-flash` is the cheap
               default (`deepseek-v4-pro` costs 2-4x more and has no vision). Text + tool calling
               + images (user messages only; JPEG/PNG/GIF/WebP) + json_object, but no strict
               json_schema. The old deepseek-chat / deepseek-reasoner names are retired.
               Thinking mode is ON by default at DeepSeek and 400s on tool calls unless every
               prior turn's reasoning_content is passed back, which the planner's stateless
               message rebuild doesn't do - so it is switched off unless DEEPSEEK_THINKING=1.
- openweight:  Any other OpenAI-compatible endpoint (Together, Groq, OpenRouter, a local
               Ollama/vLLM...) for trying an arbitrary open-weight model, e.g. a Qwen-VL for
               vision. Configured entirely by OPEN_WEIGHT_* env vars.

Routing is per task, so cheap open-weight models can be A/B tested on the low-risk tasks
without moving the rest of the app off a multimodal model:

    LLM_PROVIDER=openai                # global default
    LLM_PROVIDER_PLANNER=deepseek      # per-task override (PLANNER, ANALYZE, RECOVERY, VISION)
    LLM_MODEL_PLANNER=deepseek-v4-pro  # per-task model, applies to that task's primary provider
    LLM_FALLBACK=0                     # default on; turn off so a failure isn't hidden by a retry
                                       # on another provider while you're comparing models

Capability, not preference, decides eligibility: a vision request is never sent to a provider
that can't take images, even if it's the configured one. Every call logs the provider, model,
latency and token usage that actually served it, so the cost/quality comparison is in the logs.

Not routed through here: transcription (transcribe.py) and GPT-Live-1 voice (live_voice.py) -
those are OpenAI audio/realtime APIs with no chat-completions equivalent.
"""

import json
import logging
import os
import re
import time
from dataclasses import dataclass
from typing import Any, Optional

from openai import OpenAI

logger = logging.getLogger(__name__)

DEFAULT_PROVIDER = "openai"
_FALSY = {"0", "false", "no", "off"}


class LLMError(RuntimeError):
    """Every eligible provider failed (or the request could not be routed)."""


class LLMUnavailableError(LLMError):
    """No provider is configured/capable for this request. Callers treat this as 'no LLM here'."""


@dataclass(frozen=True)
class Provider:
    name: str
    required_env: tuple[str, ...]
    api_key_env: Optional[str]
    base_url: Optional[str]
    base_url_env: Optional[str]
    model_env: str
    default_model: Optional[str]
    json_schema: bool
    vision: bool
    vision_env: Optional[str] = None
    thinking_env: Optional[str] = None  # set => send thinking:disabled unless this env is truthy

    def supports_vision(self) -> bool:
        if self.vision_env:
            return os.getenv(self.vision_env, "").strip().lower() not in ("", *_FALSY)
        return self.vision

    def extra_body(self) -> Optional[dict[str, Any]]:
        if self.thinking_env and os.getenv(self.thinking_env, "").strip().lower() in ("", *_FALSY):
            return {"thinking": {"type": "disabled"}}
        return None

    def missing_config(self) -> Optional[str]:
        missing = [name for name in self.required_env if not os.getenv(name)]
        return f"{', '.join(missing)} not set" if missing else None

    def resolved_base_url(self) -> Optional[str]:
        return (os.getenv(self.base_url_env) if self.base_url_env else None) or self.base_url

    def resolved_model(self) -> Optional[str]:
        return os.getenv(self.model_env) or self.default_model


# Order is the fallback order after the task's primary provider.
PROVIDERS: dict[str, Provider] = {
    "openai": Provider(
        name="openai", required_env=("OPENAI_API_KEY",), api_key_env="OPENAI_API_KEY",
        base_url=None, base_url_env=None, model_env="OPENAI_MODEL", default_model="gpt-4o-mini",
        json_schema=True, vision=True,
    ),
    "deepseek": Provider(
        name="deepseek", required_env=("DEEPSEEK_API_KEY",), api_key_env="DEEPSEEK_API_KEY",
        base_url="https://api.deepseek.com", base_url_env=None,
        model_env="DEEPSEEK_MODEL", default_model="deepseek-flash",
        json_schema=False, vision=True, thinking_env="DEEPSEEK_THINKING",
    ),
    "openweight": Provider(
        name="openweight", required_env=("OPEN_WEIGHT_BASE_URL", "OPEN_WEIGHT_MODEL"),
        api_key_env="OPEN_WEIGHT_API_KEY", base_url=None, base_url_env="OPEN_WEIGHT_BASE_URL",
        model_env="OPEN_WEIGHT_MODEL", default_model=None,
        json_schema=False, vision=False, vision_env="OPEN_WEIGHT_VISION",
    ),
}


@dataclass
class ChatResult:
    message: Any  # the first choice's message; has .content and .tool_calls like the OpenAI SDK's
    provider: str
    model: str

    @property
    def text(self) -> str:
        return self.message.content or ""


_clients: dict[tuple[str, str, Optional[str]], OpenAI] = {}


def _client(provider: Provider) -> OpenAI:
    # Local OpenAI-compatible servers (Ollama, vLLM) ignore the key but the SDK insists on one.
    api_key = (os.getenv(provider.api_key_env) if provider.api_key_env else None) or "not-needed"
    base_url = provider.resolved_base_url()
    cache_key = (provider.name, api_key, base_url)
    if cache_key not in _clients:
        _clients[cache_key] = OpenAI(api_key=api_key, base_url=base_url)
    return _clients[cache_key]


def _task_env(prefix: str, task: str) -> Optional[str]:
    return (os.getenv(f"{prefix}_{task.upper()}") or "").strip() or None


def _primary_provider(task: str) -> str:
    name = (_task_env("LLM_PROVIDER", task) or os.getenv("LLM_PROVIDER") or DEFAULT_PROVIDER).strip().lower()
    if name not in PROVIDERS:
        raise LLMError(f"Unknown LLM provider {name!r} for task {task!r}. Use one of: {', '.join(PROVIDERS)}.")
    return name


def _fallback_enabled() -> bool:
    return os.getenv("LLM_FALLBACK", "1").strip().lower() not in _FALSY


def _candidates(task: str, needs_vision: bool) -> list[Provider]:
    primary = _primary_provider(task)
    ordered = [PROVIDERS[primary]] + [p for name, p in PROVIDERS.items() if name != primary]
    # Capability is a routing rule, not a failure: never send an image to a text-only model.
    capable = [p for p in ordered if not needs_vision or p.supports_vision()]
    if not capable:
        raise LLMUnavailableError(
            f"Task {task!r} needs a vision-capable provider and none is enabled "
            "(set OPENAI_API_KEY or DEEPSEEK_API_KEY, or OPEN_WEIGHT_VISION=1 for a vision-capable open-weight model)."
        )

    if not _fallback_enabled():
        chosen = capable[0]
        problem = chosen.missing_config()
        if problem:
            raise LLMUnavailableError(f"LLM provider {chosen.name!r} for task {task!r} is not configured: {problem}.")
        return [chosen]

    configured = [p for p in capable if not p.missing_config()]
    if not configured:
        raise LLMUnavailableError(
            "No LLM provider configured. Set OPENAI_API_KEY (or DEEPSEEK_API_KEY / OPEN_WEIGHT_*) in backend/.env."
        )
    return configured


def _has_json_word(messages: list[dict[str, Any]]) -> bool:
    for message in messages:
        content = message.get("content")
        parts = content if isinstance(content, list) else [content]
        for part in parts:
            text = part.get("text") if isinstance(part, dict) else part
            if isinstance(text, str) and re.search(r"\bjson\b", text, re.IGNORECASE):
                return True
    return False


def _with_json_hint(messages: list[dict[str, Any]], schema: Optional[dict[str, Any]]) -> list[dict[str, Any]]:
    """`json_object` mode 400s unless the prompt says "json", and gives the model no shape to
    follow. Providers without json_schema get the schema spelled out in the prompt instead."""
    if schema:
        hint = "Respond with a single JSON object matching this JSON schema:\n" + json.dumps(schema)
    elif not _has_json_word(messages):
        hint = "Respond with JSON only."
    else:
        return messages

    copied = [dict(m) for m in messages]
    if copied and copied[0].get("role") == "system" and isinstance(copied[0].get("content"), str):
        copied[0]["content"] = f"{copied[0]['content']}\n\n{hint}"
    else:
        copied.insert(0, {"role": "system", "content": hint})
    return copied


def chat(
    task: str,
    messages: list[dict[str, Any]],
    *,
    tools: Optional[list[dict[str, Any]]] = None,
    max_tokens: Optional[int] = None,
    temperature: Optional[float] = None,
    json_mode: bool = False,
    json_schema: Optional[dict[str, Any]] = None,
    vision: bool = False,
) -> ChatResult:
    """Run one chat completion for `task` on its configured provider.

    `json_schema` is an OpenAI-style {"name", "schema", "strict"} object; providers that can't
    enforce it are downgraded to json_object with the schema described in the prompt, so the
    caller must still validate what comes back (all current callers do).
    `vision` marks the request as containing images, restricting it to vision-capable providers.
    """
    candidates = _candidates(task, vision)
    primary = _primary_provider(task)
    errors: list[str] = []

    for provider in candidates:
        model = (_task_env("LLM_MODEL", task) if provider.name == primary else None) or provider.resolved_model()
        request_messages = messages
        kwargs: dict[str, Any] = {"model": model}
        extra_body = provider.extra_body()
        if extra_body:
            kwargs["extra_body"] = extra_body
        if tools is not None:
            kwargs["tools"] = tools
            kwargs["tool_choice"] = "auto"
        if max_tokens is not None:
            kwargs["max_tokens"] = max_tokens
        if temperature is not None:
            kwargs["temperature"] = temperature
        if json_schema and provider.json_schema:
            kwargs["response_format"] = {"type": "json_schema", "json_schema": json_schema}
        elif json_schema or json_mode:
            kwargs["response_format"] = {"type": "json_object"}
            request_messages = _with_json_hint(messages, (json_schema or {}).get("schema"))
        kwargs["messages"] = request_messages

        started = time.monotonic()
        try:
            completion = _client(provider).chat.completions.create(**kwargs)
            message = completion.choices[0].message
        except Exception as exc:  # noqa: BLE001 - any provider failure should fall through to the next one
            logger.warning("llm_call_failed task=%s provider=%s model=%s error=%s", task, provider.name, model, exc)
            errors.append(f"{provider.name} ({model}): {exc}")
            continue

        usage = getattr(completion, "usage", None)
        logger.info(
            "llm_call task=%s provider=%s model=%s ms=%d prompt_tokens=%s completion_tokens=%s fell_back=%s",
            task, provider.name, model, (time.monotonic() - started) * 1000,
            getattr(usage, "prompt_tokens", None), getattr(usage, "completion_tokens", None),
            provider.name != primary,
        )
        return ChatResult(message=message, provider=provider.name, model=model)

    raise LLMError(" | ".join(errors))
