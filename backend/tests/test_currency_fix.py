# -*- coding: utf-8 -*-
"""Regression tests for the ROI currency-conversion fix and the step-number
matching robustness. Run from the backend/ directory:

    python -m pytest tests/test_currency_fix.py -v
    # or, without pytest installed:
    python tests/test_currency_fix.py
"""
import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
from utils import roi_math as R  # noqa: E402

SCORED_STEPS = [
    {"step_number": 1, "name": "Receive and Log Invoice", "estimated_time_minutes": 2,
     "occurrence_probability": 1.0, "frequency_basis": "per_transaction", "systems_used": ["Email"]},
    {"step_number": 2, "name": "Validate Invoice against Bank Statement", "estimated_time_minutes": 10,
     "occurrence_probability": 1.0, "frequency_basis": "per_transaction", "systems_used": ["Email"]},
    {"step_number": 3, "name": "Resolve Validation Discrepancies", "estimated_time_minutes": 15,
     "occurrence_probability": 0.05, "frequency_basis": "per_transaction", "systems_used": ["Email"]},
    {"step_number": 4, "name": "Approve or Reject Invoice", "estimated_time_minutes": 3,
     "occurrence_probability": 1.0, "frequency_basis": "per_transaction", "systems_used": ["Email"]},
]


def _opps(as_string=False):
    cast = (lambda x: str(x)) if as_string else (lambda x: x)
    return [
        {"step_number": cast(1), "step_name": "Receive and Log Invoice", "effort_reduction_pct": 100},
        {"step_number": cast(2), "step_name": "Validate Invoice against Bank Statement", "effort_reduction_pct": 95},
        {"step_number": cast(4), "step_name": "Approve or Reject Invoice", "effort_reduction_pct": 83},
        {"step_number": cast(3), "step_name": "Resolve Validation Discrepancies", "effort_reduction_pct": 67},
    ]


DISCOVERY_INR = {"currency": "INR", "hourly_rate": 1000, "annual_volume": 21000,
                 "fte_total": 5, "exception_rate_pct": 5}
COMPONENTS = [
    {"component": "ui_automation", "count": 2},
    {"component": "ocr_idp", "count": 1},
    {"component": "business_rules", "count": 1},
    {"component": "exception_handling", "count": 1},
    {"component": "hitl", "count": 1},
]


def test_costs_are_converted_to_project_currency():
    usd_ot, _, _ = R.compute_costs(COMPONENTS, 2, currency="USD")
    inr_ot, _, _ = R.compute_costs(COMPONENTS, 2, currency="INR")
    expected_ratio = 1 / R.FX_TO_USD["INR"]
    assert abs((inr_ot / usd_ot) - expected_ratio) < 0.5


def test_usd_default_is_unchanged():
    # Back-compat: omitting currency must behave exactly like before (USD).
    assert R.compute_costs(COMPONENTS, 2)[0] == R.compute_costs(COMPONENTS, 2, currency="USD")[0]


def test_inr_payback_is_not_absurd_after_conversion():
    inr_ot, inr_an, _ = R.compute_costs(COMPONENTS, 2, currency="INR")
    roi = R.compute_roi(SCORED_STEPS, _opps(), DISCOVERY_INR, inr_ot, inr_an)
    # With costs in the right currency, this small operation should NOT show a
    # sub-month payback. (Either no payback, or clearly more than a month.)
    assert roi["payback_months"] is None or roi["payback_months"] > 1


def test_string_step_number_still_links_reductions():
    inr_ot, inr_an, _ = R.compute_costs(COMPONENTS, 2, currency="INR")
    r_int = R.compute_roi(SCORED_STEPS, _opps(False), DISCOVERY_INR, inr_ot, inr_an)
    r_str = R.compute_roi(SCORED_STEPS, _opps(True), DISCOVERY_INR, inr_ot, inr_an)
    assert r_int["effective_minutes_after"] == r_str["effective_minutes_after"]
    assert r_int["effort_reduction_pct"] > 80


def test_currency_aliases_normalize_to_inr():
    # Regression: bare "Rs" / "Rs." / rupee symbol used to be misread as USD.
    for v in ("Rs", "Rs.", "rs", "₹", "rupees", "INR", "inr"):
        assert R.normalize_currency_code(v) == "INR", v
    # Other currencies still resolve correctly.
    assert R.normalize_currency_code("dollars") == "USD"
    assert R.normalize_currency_code("euros") == "EUR"
    assert R.normalize_currency_code(None) == "USD"


def test_extended_currency_coverage():
    cases = {
        "yen": "JPY", "yuan": "CNY", "renminbi": "CNY", "dirham": "AED",
        "won": "KRW", "real": "BRL", "baht": "THB", "rupiah": "IDR",
        "ringgit": "MYR", "riyal": "SAR", "rand": "ZAR",
        "australian dollar": "AUD", "canadian dollars": "CAD",
        "BRL": "BRL", "KRW": "KRW", "MXN": "MXN", "us dollars": "USD",
    }
    for text, code in cases.items():
        assert R.normalize_currency_code(text) == code, (text, code)
    # New currencies now actually CONVERT (fx_applied=True) in fallback mode.
    for code in ("BRL", "KRW", "MXN", "THB", "IDR", "PHP", "MYR", "SAR", "NOK", "SEK"):
        amt, applied = R.convert_amount(1000, "USD", code)
        assert applied is True and amt != 1000, code


def test_fx_assumption_note_present_for_non_usd():
    inr_ot, inr_an, _ = R.compute_costs(COMPONENTS, 2, currency="INR")
    roi = R.compute_roi(SCORED_STEPS, _opps(), DISCOVERY_INR, inr_ot, inr_an)
    assert any("approximate reference FX" in a for a in roi["assumptions"])


def test_ocr_idp_scales_with_volume():
    # Fallback ocr_idp annual cost in USD is 18000.
    # Scaled with 21,000 volume: 21,000 * 0.10 = 2100.0
    _, annual_cost_scaled, _ = R.compute_costs([{"component": "ocr_idp"}], 1, currency="USD", annual_volume=21000)
    # The breakdown contains OCR/IDP (annual: 2100) + Bot (13000) + Maintenance (17.5% of build: 6720).
    # Total annual = 2100 + 13000 + 6720 = 21820.0.
    assert annual_cost_scaled == 21820.0

    # Unscaled (no volume):
    # Total annual = 18000 + 13000 + 6720 = 37720.0.
    _, annual_cost_unscaled, _ = R.compute_costs([{"component": "ocr_idp"}], 1, currency="USD")
    assert annual_cost_unscaled == 37720.0


def test_fx_assumption_note_conditional_on_pricing_source():
    inr_ot, inr_an, _ = R.compute_costs(COMPONENTS, 2, currency="INR")
    
    # 1. Fallback / default
    roi_fallback = R.compute_roi(SCORED_STEPS, _opps(), DISCOVERY_INR, inr_ot, inr_an, pricing_source="fallback")
    assert any("approximate reference FX" in a for a in roi_fallback["assumptions"])
    assert not any("live regional pricing" in a for a in roi_fallback["assumptions"])

    # 2. Live
    roi_live = R.compute_roi(SCORED_STEPS, _opps(), DISCOVERY_INR, inr_ot, inr_an, pricing_source="live")
    assert not any("approximate reference FX" in a for a in roi_live["assumptions"])
    assert any("live regional pricing" in a for a in roi_live["assumptions"])


def test_bot_licensing_sized_to_volume():
    from graph.nodes.calculate_roi import calculate_roi_node
    # Test state with high bot count but low volume
    state = {
        "scored_steps": SCORED_STEPS,
        "opportunities": _opps(),
        "discovery_facts": {**DISCOVERY_INR, "annual_volume": 20000},
        "hourly_rate": 1000,
    }
    # Mock call_gemini_structured to return a component detection with 3 bots
    import utils.gemini_client
    orig_call = utils.gemini_client.call_gemini_structured
    try:
        utils.gemini_client.call_gemini_structured = lambda *args, **kwargs: {
            "components": COMPONENTS,
            "num_bots": 3
        }
        res = calculate_roi_node(state)
        # Even though LLM wanted 3 bots, because annual_volume is 20000 (<= 50000), it should be capped to 1
        assert res["roi_estimate"]["num_bots"] == 1
    finally:
        utils.gemini_client.call_gemini_structured = orig_call


if __name__ == "__main__":
    fns = [v for k, v in sorted(globals().items()) if k.startswith("test_")]
    passed = 0
    for fn in fns:
        fn()
        print(f"PASS  {fn.__name__}")
        passed += 1
    print(f"\n{passed}/{len(fns)} tests passed")
