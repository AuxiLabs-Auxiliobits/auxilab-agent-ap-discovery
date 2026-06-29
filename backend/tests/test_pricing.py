# -*- coding: utf-8 -*-
"""Tests for the currency-native pricing layer (utils/pricing.py).

These test the DETERMINISTIC paths only (fallback + cache + validation); the
live Google-Search call is exercised in production with a real API key. Run:

    python -m pytest tests/test_pricing.py -v
    # or, without pytest installed:
    python tests/test_pricing.py
"""
import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
from utils import roi_math as R  # noqa: E402
from utils import pricing as P  # noqa: E402

COMPONENTS = [
    {"component": "ui_automation", "count": 2},
    {"component": "ocr_idp", "count": 1},
    {"component": "business_rules", "count": 1},
]


def test_fallback_when_live_disabled():
    P.clear_cache()
    info = P.resolve_unit_costs(COMPONENTS, "INR", "India", enable_live=False)
    assert info["source"] == "fallback"
    assert info["unit_costs"] == {}
    assert info["currency"] == "INR"


def test_fallback_costs_match_currency_converted_benchmark():
    # With an empty unit_costs map, compute_costs must behave EXACTLY like the
    # static-table-converted path (backward compatible).
    info = P.resolve_unit_costs(COMPONENTS, "INR", enable_live=False)
    a = R.compute_costs(COMPONENTS, 2, currency="INR", unit_costs=info["unit_costs"])
    b = R.compute_costs(COMPONENTS, 2, currency="INR")
    assert a == b


def test_currency_native_unit_costs_used_verbatim():
    # Supplied INR unit costs must be used as-is, with NO FX conversion applied.
    unit_costs = {
        "ui_automation": {"one_time": 500000, "annual": 0},
        "ocr_idp": {"one_time": 1200000, "annual": 400000},
        "business_rules": {"one_time": 300000, "annual": 0},
    }
    ot, an, breakdown = R.compute_costs(
        COMPONENTS, 1, currency="INR",
        unit_costs=unit_costs, bot_license_annual=150000,
    )
    # ui_automation x2 = 1,000,000 ; ocr 1,200,000 ; rules 300,000 = 2,500,000 build
    # + QA 20% = 500,000 -> one_time 3,000,000 (no x83 conversion!)
    assert ot == 3000000.0
    # annual = ocr 400,000 + bot 150,000 + maintenance 17.5% of 3,000,000 (525,000)
    assert an == 1075000.0


def test_cache_round_trip():
    P.clear_cache()
    seeded = {"unit_costs": {"ui_automation": {"one_time": 1.0, "annual": 0.0}},
              "bot_license_annual": 2.0, "currency": "INR", "region": "India"}
    P._cache_put(P._cache_key("INR", "India"), seeded)
    info = P.resolve_unit_costs(COMPONENTS, "INR", "India", enable_live=True)
    assert info["source"] == "cache"
    assert info["unit_costs"]["ui_automation"]["one_time"] == 1.0
    P.clear_cache()


def test_validate_rejects_garbage_and_absurd():
    out = P._validate({
        "ui_automation": {"one_time": 1000, "annual": 200},
        "ocr_idp": {"one_time": 1e12, "annual": 5},      # absurd -> dropped
        "business_rules": "not-a-dict",                    # garbage -> dropped
        "unknown_key": {"one_time": 5},                    # not requested -> ignored
    }, ["ui_automation", "ocr_idp", "business_rules"])
    assert set(out.keys()) == {"ui_automation"}
    assert out["ui_automation"] == {"one_time": 1000.0, "annual": 200.0}


def test_strip_json_handles_fenced_and_chatty():
    assert P._strip_json('```json\n{"a": 1}\n```') == '{"a": 1}'
    assert P._strip_json('Here you go: {"a": 1} thanks!') == '{"a": 1}'
    assert P._strip_json("no json here") == ""


def test_determinism_fallback():
    P.clear_cache()
    r1 = R.compute_costs(COMPONENTS, 2, currency="INR")
    r2 = R.compute_costs(COMPONENTS, 2, currency="INR")
    assert r1 == r2


if __name__ == "__main__":
    fns = [v for k, v in sorted(globals().items()) if k.startswith("test_")]
    for fn in fns:
        fn()
        print(f"PASS  {fn.__name__}")
    print(f"\n{len(fns)}/{len(fns)} tests passed")
