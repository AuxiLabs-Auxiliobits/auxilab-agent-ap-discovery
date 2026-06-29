# -*- coding: utf-8 -*-
"""Currency-native pricing resolution for automation components.

Goal: price the build in the PROJECT's OWN currency so the cost side and the
labour-savings side are denominated the same way. (The earlier inflated-ROI bug
came from USD-only costs being compared against local-currency savings.)

Resolution order:
  1. In-memory cache (per currency+region, TTL-bounded) -- keeps a saved report
     stable and avoids repeat search calls.
  2. Live Google-Search-grounded lookup via Gemini (only when ENABLE_LIVE_PRICING
     is on and a key is configured) -- returns real, LOCAL prices.
  3. Static USD benchmark table (roi_math.COMPONENT_COSTS) converted at the
     reference FX rate -- the deterministic, offline-safe fallback.

Only step 2 needs the network; steps 1 and 3 are fully deterministic and unit
tested. Live results are validated and fall back automatically on any error, so
the pipeline never breaks because of pricing.
"""
from __future__ import annotations

import json
import re
import time
from typing import Optional

from utils import roi_math

try:
    from config import (
        ENABLE_LIVE_PRICING,
        DEFAULT_PRICING_REGION,
        PRICING_CACHE_TTL_HOURS,
    )
except Exception:  # pragma: no cover - config not importable in some contexts
    ENABLE_LIVE_PRICING = False
    DEFAULT_PRICING_REGION = "India"
    PRICING_CACHE_TTL_HOURS = 168


# component_key -> description that helps the search model price the right thing
_COMPONENT_LABELS = {
    "ui_automation": "RPA UI automation development (per automated application)",
    "api_integration": "API / system integration development (per integration)",
    "structured_data": "structured data (Excel/CSV) automation development",
    "ocr_idp": "OCR / Intelligent Document Processing build + annual platform/runtime",
    "business_rules": "business rules / decision engine development",
    "exception_handling": "exception handling & escalation development",
    "orchestration": "bot orchestration / scheduling setup + annual",
    "hitl": "human-in-the-loop review workflow development",
}

_cache: dict = {}


def clear_cache() -> None:
    """Test/ops helper to drop all cached pricing."""
    _cache.clear()


def _cache_key(currency: str, region: str) -> str:
    return f"{currency}|{region}".lower()


def _cache_get(key: str):
    entry = _cache.get(key)
    if not entry:
        return None
    if (time.time() - entry["ts"]) > PRICING_CACHE_TTL_HOURS * 3600:
        _cache.pop(key, None)
        return None
    return entry["value"]


def _cache_put(key: str, value: dict) -> None:
    _cache[key] = {"ts": time.time(), "value": value}


def _strip_json(text: str) -> str:
    """Pull the JSON object out of a possibly fenced / chatty grounded reply."""
    if not text:
        return ""
    fenced = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", text, re.DOTALL)
    if fenced:
        return fenced.group(1)
    brace = re.search(r"\{.*\}", text, re.DOTALL)
    return brace.group(0) if brace else ""


def _validate(unit_costs: dict, component_keys) -> dict:
    """Keep only known components with sane, non-negative numbers."""
    clean = {}
    for key in component_keys:
        u = (unit_costs or {}).get(key)
        if not isinstance(u, dict):
            continue
        ot = roi_math._f(u.get("one_time"), None)
        an = roi_math._f(u.get("annual"), None)
        if ot is None and an is None:
            continue
        ot = max(0.0, ot or 0.0)
        an = max(0.0, an or 0.0)
        # guard against hallucinated absurd values (e.g. 1e12)
        if ot > 1e10 or an > 1e10:
            continue
        clean[key] = {"one_time": ot, "annual": an}
    return clean


def _fetch_live(component_keys, currency, region, bots, annual_volume: Optional[int] = None):
    """Ask Gemini (grounded) for real, local unit prices. Returns dict or None."""
    from utils.gemini_client import call_gemini_grounded  # lazy import

    symbol = roi_math.currency_symbol(currency)
    wanted = {k: _COMPONENT_LABELS.get(k, k) for k in component_keys}
    
    volume_instruction = ""
    if annual_volume:
        volume_instruction = (
            f"The customer's annual transaction volume is {annual_volume:,} documents/invoices per year.\n"
            "CRITICAL: When estimating the 'annual' platform/runtime cost for OCR / IDP ('ocr_idp'), "
            "scale it based on consumption for this volume (e.g. usage-based pricing like per-page extraction fees, "
            "typically around $0.05 to $0.15 USD / ₹4 to ₹12 INR per page) rather than a flat enterprise-wide platform fee.\n"
            f"Similarly, estimate 'bot_license_annual' as the runtime license cost scaled to support this volume of {annual_volume:,} transactions per year.\n\n"
        )

    prompt = (
        "You are an RPA pricing analyst. Using current market information, "
        f"estimate typical costs in {currency} ({symbol}) for delivering each "
        f"automation component for a customer based in {region}.\n\n"
        "Price in the LOCAL currency and local labour rates for that region -- "
        "do NOT quote US prices unless the region is the US.\n\n"
        f"{volume_instruction}"
        f"Components (key: description):\n{json.dumps(wanted, indent=2)}\n\n"
        "Also give bot_license_annual: typical ANNUAL RPA runtime licence cost "
        f"per bot in {currency}.\n\n"
        "Return ONLY JSON of this exact shape (numbers only, no symbols, no commas):\n"
        '{"currency": "<code>", "unit_costs": {"<key>": {"one_time": <num>, '
        '"annual": <num>}}, "bot_license_annual": <num>}'
    )
    raw = call_gemini_grounded(prompt)
    payload = json.loads(_strip_json(raw))
    unit_costs = _validate(payload.get("unit_costs"), component_keys)
    if not unit_costs:
        return None
    bot = roi_math._f(payload.get("bot_license_annual"), None)
    if bot is not None and (bot < 0 or bot > 1e10):
        bot = None
    return {"unit_costs": unit_costs, "bot_license_annual": bot,
            "currency": currency, "region": region}


def resolve_unit_costs(components, currency, region: Optional[str] = None,
                       *, num_bots: int = 1, enable_live: Optional[bool] = None,
                       annual_volume: Optional[int] = None):
    """Resolve currency-native unit costs for the detected components.

    Returns:
      {"unit_costs": {key: {"one_time", "annual"}} | {},
       "bot_license_annual": float | None,
       "source": "cache" | "live" | "fallback",
       "currency": <code>, "region": <str>}

    On ANY problem this returns an empty unit_costs map with source "fallback",
    which tells compute_costs to use the static converted benchmarks -- so the
    pipeline never breaks because of pricing.
    """
    currency = roi_math.normalize_currency_code(currency)
    region = region or DEFAULT_PRICING_REGION
    live_on = ENABLE_LIVE_PRICING if enable_live is None else enable_live

    component_keys = []
    for c in components or []:
        k = c.get("component")
        if k and k in roi_math.COMPONENT_COSTS and k not in component_keys:
            component_keys.append(k)

    empty = {"unit_costs": {}, "bot_license_annual": None,
             "source": "fallback", "currency": currency, "region": region}
    if not component_keys or not live_on:
        return empty

    ck = _cache_key(currency, region)
    cached = _cache_get(ck)
    if cached:
        return {**cached, "source": "cache"}

    try:
        fetched = _fetch_live(component_keys, currency, region, max(1, int(num_bots or 1)), annual_volume=annual_volume)
    except Exception:
        fetched = None

    if not fetched:
        return empty

    value = {"unit_costs": fetched["unit_costs"],
             "bot_license_annual": fetched["bot_license_annual"],
             "currency": currency, "region": region}
    _cache_put(ck, value)
    return {**value, "source": "live"}
