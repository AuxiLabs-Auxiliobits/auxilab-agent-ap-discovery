"""Real unit tests for the deterministic ROI / effort math.

These cover the core promise of the agent: identical grounded inputs always
produce identical, defensible financial figures — no LLM guessing involved.
Run with:  pytest tests/ -v
"""
from utils import roi_math


def test_normalize_currency_code_handles_symbols_words_and_codes():
    assert roi_math.normalize_currency_code("$") == "USD"
    assert roi_math.normalize_currency_code("pounds") == "GBP"
    assert roi_math.normalize_currency_code("EUR") == "EUR"
    assert roi_math.normalize_currency_code("rupees") == "INR"
    # Empty / unknown falls back to USD
    assert roi_math.normalize_currency_code(None) == "USD"
    assert roi_math.normalize_currency_code("") == "USD"


def test_convert_amount_same_currency_is_noop():
    amount, fx_applied = roi_math.convert_amount(1000, "USD", "USD")
    assert amount == 1000
    assert fx_applied is False


def test_convert_amount_applies_reference_fx():
    # GBP -> USD should scale up using the static reference rate and flag FX.
    amount, fx_applied = roi_math.convert_amount(100, "GBP", "USD")
    assert fx_applied is True
    assert amount == 100 * (roi_math.FX_TO_USD["GBP"] / roi_math.FX_TO_USD["USD"])


def test_compute_costs_sums_components_with_overheads():
    components = [
        {"component": "ui_automation", "count": 1, "rationale": "SAP data entry"},
        {"component": "ocr_idp", "count": 1, "rationale": "PDF invoices"},
    ]
    one_time, annual, breakdown = roi_math.compute_costs(components, num_bots=1)
    # One-time must exceed the bare component sum because QA/UAT overhead is added.
    bare = roi_math.COMPONENT_COSTS["ui_automation"]["one_time"] + roi_math.COMPONENT_COSTS["ocr_idp"]["one_time"]
    assert one_time > bare
    # Annual must include OCR run cost + bot licensing + maintenance.
    assert annual >= roi_math.COMPONENT_COSTS["ocr_idp"]["annual"] + roi_math.BOT_LICENSE_ANNUAL
    assert any("Bot Licensing" in row["category"] for row in breakdown)


def test_detect_missing_critical_facts():
    facts = {"currency": "USD", "hourly_rate": 35, "annual_volume": 10000}
    missing = roi_math.detect_missing_critical_facts(facts)
    # fte_total and exception_rate_pct are absent -> reported missing.
    assert "fte_total" in missing
    assert "exception_rate_pct" in missing
    assert "currency" not in missing


def test_compute_roi_is_deterministic_and_grounded():
    scored_steps = [
        {"step_number": 1, "estimated_time_minutes": 8, "occurrence_probability": 1.0,
         "frequency_basis": "per_transaction"},
        {"step_number": 2, "estimated_time_minutes": 5, "occurrence_probability": 0.3,
         "frequency_basis": "per_transaction"},
    ]
    opportunities = [
        {"step_number": 1, "effort_reduction_pct": 90},
        {"step_number": 2, "effort_reduction_pct": 70},
    ]
    facts = {
        "currency": "USD", "hourly_rate": 35, "annual_volume": 12000,
        "fte_total": 2, "exception_rate_pct": 30,
        "throughput_per_person_per_day": 40,
    }
    first = roi_math.compute_roi(scored_steps, opportunities, facts,
                                implementation_cost=50000, annual_maintenance_cost=8000)
    second = roi_math.compute_roi(scored_steps, opportunities, facts,
                                 implementation_cost=50000, annual_maintenance_cost=8000)
    # Identical inputs -> identical outputs (reproducible).
    assert first == second
    assert first["currency"] == "USD"
    assert first["annual_labor_savings"] >= 0
    # All critical facts present -> grounded.
    assert first["is_grounded"] is True


def test_step_effort_reduction_is_capped():
    # Even a 100% requested reduction must be capped so a step never "vanishes".
    scored_steps = [{"step_number": 1, "estimated_time_minutes": 10,
                     "occurrence_probability": 1.0, "frequency_basis": "per_transaction"}]
    opportunities = [{"step_number": 1, "effort_reduction_pct": 100}]
    facts = {"currency": "USD", "hourly_rate": 35, "annual_volume": 5000,
             "fte_total": 1, "exception_rate_pct": 10}
    result = roi_math.compute_roi(scored_steps, opportunities, facts,
                                 implementation_cost=20000, annual_maintenance_cost=3000)
    assert result["effort_reduction_pct"] <= roi_math.MAX_STEP_EFFORT_REDUCTION_PCT
