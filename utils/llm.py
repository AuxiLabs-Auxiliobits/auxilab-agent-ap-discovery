"""Provider-agnostic LLM client.

The discovery pipeline only needs three primitives from an LLM:

    call_llm_structured(prompt, system_prompt, response_schema) -> dict
    call_llm_text(prompt, system_prompt)                        -> str
    call_llm_grounded(prompt, system_prompt)                    -> str  (Gemini only)

Both Google Gemini and Anthropic Claude are supported and are selected purely
via the LLM_PROVIDER env var (see config.py). The rest of the pipeline is
completely unaware of which model is running.

Structured output:
- Gemini: uses native JSON mode (response_mime_type=application/json) and the
  provided response_schema (a dict schema or a pydantic model).
- Anthropic: asks for strict JSON, prefills the assistant turn with "{" to force
  a JSON object, and parses defensively.
"""
from __future__ import annotations

import json
import re
from typing import Any, Optional

from config import (
    LLM_PROVIDER,
    GEMINI_API_KEY,
    GEMINI_MODEL,
    ANTHROPIC_API_KEY,
    ANTHROPIC_MODEL,
)

# Lazily-initialized SDK clients (only the selected provider is ever created).
_gemini_client = None
_anthropic_client = None


# ── helpers ──────────────────────────────────────────────────────
def _is_pydantic_model(schema: Any) -> bool:
    try:
        from pydantic import BaseModel

        return isinstance(schema, type) and issubclass(schema, BaseModel)
    except Exception:
        return False


def _schema_to_hint(schema: Any) -> Optional[str]:
    """Render a response schema into a human/LLM-readable JSON-schema hint."""
    if schema is None:
        return None
    if _is_pydantic_model(schema):
        try:
            return json.dumps(schema.model_json_schema(), indent=2)
        except Exception:
            return None
    if isinstance(schema, dict):
        return json.dumps(schema, indent=2)
    return None


def _extract_json(text: str) -> str:
    """Pull a JSON object out of a possibly fenced / chatty model reply."""
    if not text:
        return "{}"
    t = text.strip()
    fenced = re.search(r"```(?:json)?\s*(\{.*\}|\[.*\])\s*```", t, re.DOTALL)
    if fenced:
        return fenced.group(1)
    start = t.find("{")
    end = t.rfind("}")
    if start != -1 and end != -1 and end > start:
        return t[start : end + 1]
    return t


# ── Gemini ────────────────────────────────────────────────────
def _get_gemini():
    global _gemini_client
    if _gemini_client is None:
        from google import genai

        _gemini_client = genai.Client(api_key=GEMINI_API_KEY)
    return _gemini_client


def _gemini_structured(prompt, system_prompt, response_schema, model):
    from google.genai import types

    config: dict = {"response_mime_type": "application/json", "temperature": 0.0}
    if system_prompt:
        config["system_instruction"] = system_prompt
    if response_schema is not None:
        config["response_schema"] = response_schema
    resp = _get_gemini().models.generate_content(
        model=model or GEMINI_MODEL,
        contents=prompt,
        config=types.GenerateContentConfig(**config),
    )
    return json.loads(resp.text)


def _gemini_text(prompt, system_prompt, model):
    from google.genai import types

    config: dict = {"temperature": 0.0}
    if system_prompt:
        config["system_instruction"] = system_prompt
    resp = _get_gemini().models.generate_content(
        model=model or GEMINI_MODEL,
        contents=prompt,
        config=types.GenerateContentConfig(**config),
    )
    return resp.text


def _gemini_grounded(prompt, system_prompt, model):
    from google.genai import types

    config: dict = {
        "temperature": 0.0,
        "tools": [types.Tool(google_search=types.GoogleSearch())],
    }
    if system_prompt:
        config["system_instruction"] = system_prompt
    resp = _get_gemini().models.generate_content(
        model=model or GEMINI_MODEL,
        contents=prompt,
        config=types.GenerateContentConfig(**config),
    )
    return resp.text


# ── Anthropic ─────────────────────────────────────────────────
def _get_anthropic():
    global _anthropic_client
    if _anthropic_client is None:
        import anthropic

        _anthropic_client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)
    return _anthropic_client


def _anthropic_structured(prompt, system_prompt, response_schema, model):
    hint = _schema_to_hint(response_schema)
    instruction = (
        "\n\nReturn ONLY a single valid JSON object. Do not include markdown, "
        "code fences, or any commentary."
    )
    if hint:
        instruction += f"\nThe JSON must conform to this schema:\n{hint}"
    msg = _get_anthropic().messages.create(
        model=model or ANTHROPIC_MODEL,
        max_tokens=8192,
        temperature=0.0,
        system=system_prompt or "You are a precise data-extraction engine that outputs strict JSON.",
        messages=[
            {"role": "user", "content": prompt + instruction},
            {"role": "assistant", "content": "{"},
        ],
    )
    text = "{" + "".join(b.text for b in msg.content if getattr(b, "type", None) == "text")
    return json.loads(_extract_json(text))


def _anthropic_text(prompt, system_prompt, model):
    msg = _get_anthropic().messages.create(
        model=model or ANTHROPIC_MODEL,
        max_tokens=4096,
        temperature=0.0,
        system=system_prompt or "You are a helpful business analyst.",
        messages=[{"role": "user", "content": prompt}],
    )
    return "".join(b.text for b in msg.content if getattr(b, "type", None) == "text")


# ── public API ────────────────────────────────────────────────
def call_llm_structured(
    prompt: str,
    system_prompt: str = "",
    response_schema: Any = None,
    model: Optional[str] = None,
) -> dict:
    """Call the configured LLM and return parsed JSON (a dict)."""
    if LLM_PROVIDER == "anthropic":
        return _anthropic_structured(prompt, system_prompt, response_schema, model)
    return _gemini_structured(prompt, system_prompt, response_schema, model)


def call_llm_text(prompt: str, system_prompt: str = "", model: Optional[str] = None) -> str:
    """Call the configured LLM and return plain text."""
    if LLM_PROVIDER == "anthropic":
        return _anthropic_text(prompt, system_prompt, model)
    return _gemini_text(prompt, system_prompt, model)


def call_llm_grounded(prompt: str, system_prompt: str = "", model: Optional[str] = None) -> str:
    """Google-Search-grounded text generation.

    Only Gemini supports grounded search here; it is used solely by the optional
    live-pricing path. For Anthropic (or any error) callers fall back to the
    deterministic offline benchmark, so this raising is safe and expected.
    """
    if LLM_PROVIDER == "anthropic":
        raise NotImplementedError("Grounded search is not available for the Anthropic provider.")
    return _gemini_grounded(prompt, system_prompt, model)
