"""Pipeline / discovery-node tests — the agent's core job.

The discovery nodes (parse_input, structure_process, score_steps, map_patterns,
and the component-classification half of calculate_roi) all call Gemini, which is
non-deterministic and needs an API key + network. We therefore MOCK the Gemini
boundary so we can test the real node logic (parsing, normalization, scoring,
merging, ranking, report assembly) deterministically and offline.

What these tests prove:
  * each node transforms state correctly given a known LLM response, and
  * the full pipeline turns a manual-process input into a complete report
    (steps -> scored steps -> opportunities -> ROI -> executive summary +
    markdown report).

Run with:  pytest tests/ -v
"""
from unittest.mock import patch

import pytest

from graph.nodes import (
    preprocess_media,
    parse_input,
    structure_process,
    score_steps,
    map_patterns,
    calculate_roi,
    generate_summary,
)


# ───────────────── Fake LLM responses (one per node) ─────────────────

def fake_extraction(**kwargs):
    return {
        "steps": [
            {"name": "Invoice data entry", "description": "Key invoices into SAP",
             "systems": ["SAP"], "roles": ["AP clerk"], "pain_points": ["manual"]},
        ],
        "systems_mentioned": ["SAP", "Email"],
        "roles_identified": ["AP clerk"],
        "pain_points": ["manual entry"],
        "discovery_facts": {
            "currency": "$", "hourly_rate": 35, "annual_volume": 12000,
            "fte_total": 2, "exception_rate_pct": 30,
            "throughput_per_person_per_day": 40,
        },
    }


def fake_structure(**kwargs):
    return {"process_steps": [
        {"step_number": 1, "name": "Invoice data entry", "description": "Key into SAP",
         "responsible_role": "AP clerk", "input_document": "PDF invoice",
         "output_document": "SAP record", "systems_used": ["SAP"],
         "estimated_time_minutes": 8, "occurrence_probability": 1.0,
         "frequency_basis": "per_transaction", "is_manual": True},
        {"step_number": 2, "name": "3-way match", "description": "Match PO/GR",
         "responsible_role": "AP clerk", "input_document": "PO",
         "output_document": "Matched set", "systems_used": ["SAP"],
         "estimated_time_minutes": 5, "occurrence_probability": 0.3,
         "frequency_basis": "per_transaction", "is_manual": True},
    ]}


def fake_scores(**kwargs):
    aa = {"current_manual_process": "manual keying",
          "automation_potential": "Fully Automatable",
          "proposed_solution": "OCR + RPA bot", "projected_savings": "~90%"}
    return {"scored_steps": [
        {"step_number": 1, "rule_based_score": 9, "data_structure_score": 8,
         "volume_score": 9, "automation_analysis": aa},
        {"step_number": 2, "rule_based_score": 8, "data_structure_score": 7,
         "volume_score": 6, "automation_analysis": aa},
    ]}


def fake_patterns(**kwargs):
    return {"opportunities": [
        {"step_name": "Invoice data entry", "step_number": 1, "acs": 8.7,
         "ap_pattern": "Data Extraction", "narrative": "OCR+RPA", "effort_reduction_pct": 90},
        {"step_name": "3-way match", "step_number": 2, "acs": 7.0,
         "ap_pattern": "PO Matching", "narrative": "rules engine", "effort_reduction_pct": 80},
    ]}


def fake_components(*args, **kwargs):
    return {
        "components": [
            {"component": "ui_automation", "count": 1, "rationale": "SAP UI"},
            {"component": "ocr_idp", "count": 1, "rationale": "PDF invoices"},
        ],
        "num_bots": 1, "rpa_platform_detected": None,
    }


def fake_timeline(*args, **kwargs):
    return {
        "total_project_days": 15, "timeline_summary": "delivery arc",
        "phases": [{"phase_name": "Discovery", "development_days": 10,
                    "testing_days": 3, "review_days": 2, "total_phase_days": 15,
                    "steps_included": ["Invoice data entry"],
                    "complexity_rationale": "moderate"}],
    }


def fake_exec_summary(*args, **kwargs):
    return "Executive summary paragraph for the CFO briefing."


# ───────────────────── Node 0: preprocess_media (pure) ───────────────

def test_preprocess_media_text_passthrough():
    out = preprocess_media.preprocess_media_node(
        {"input_format": "text", "raw_text": "some AP process"}
    )
    assert out == {"raw_text": "some AP process"}


def test_preprocess_media_unknown_format_raises():
    with pytest.raises(ValueError):
        preprocess_media.preprocess_media_node({"input_format": "hologram"})


# ────────────────────────── Node 1: parse_input ───────────────────────

def test_parse_input_normalizes_facts_and_currency():
    with patch.object(parse_input, "call_gemini_structured", side_effect=fake_extraction):
        out = parse_input.parse_input_node({"raw_text": "AP process text"})
    # "$" symbol must be normalized to the ISO code.
    assert out["currency"] == "USD"
    assert out["discovery_facts"]["currency"] == "USD"
    assert out["hourly_rate"] == 35.0
    assert out["discovery_facts"]["annual_volume"] == 12000
    # All critical facts present -> nothing missing.
    assert out["missing_critical_facts"] == []
    assert len(out["extracted_steps"]) == 1


# ───────────────────── Node 2: structure_process ───────────────────

def test_structure_process_applies_defaults():
    fake = {"process_steps": [
        {"step_number": 1, "name": "x", "description": "d", "responsible_role": "r",
         "input_document": "i", "output_document": "o", "systems_used": [],
         "estimated_time_minutes": 5, "occurrence_probability": None,
         "frequency_basis": "", "is_manual": True},
    ]}
    with patch.object(structure_process, "call_gemini_structured", return_value=fake):
        out = structure_process.structure_process_node({"extracted_steps": [], "discovery_facts": {}})
    step = out["process_map"][0]
    # Missing probability defaults to 1.0; blank basis defaults to per_transaction.
    assert step["occurrence_probability"] == 1.0
    assert step["frequency_basis"] == "per_transaction"


# ─────────────────────── Node 3: score_steps ───────────────────────

def test_score_steps_computes_acs_and_priority():
    process_map = fake_structure()["process_steps"]
    with patch.object(score_steps, "call_gemini_structured", side_effect=fake_scores):
        out = score_steps.score_steps_node({"process_map": process_map})
    s1 = out["scored_steps"][0]
    # ACS = mean(9,8,9) = 8.7 -> priority (>7)
    assert s1["acs"] == 8.7
    assert s1["is_priority"] is True
    assert len(out["priority_targets"]) >= 1


# ────────────────────── Node 4: map_patterns ──────────────────────

def test_map_patterns_enriches_and_ranks_by_value():
    # Scored steps so the node can merge original data + rank by labour value.
    scored = []
    for s in fake_structure()["process_steps"]:
        s = dict(s)
        s["automation_analysis"] = {"automation_potential": "Fully Automatable"}
        scored.append(s)
    with patch.object(map_patterns, "call_gemini_structured", side_effect=fake_patterns):
        out = map_patterns.map_patterns_node({"scored_steps": scored})
    opps = out["opportunities"]
    assert len(opps) == 2
    # Step 1 (8 min, prob 1.0, 90% reduction) removes far more labour than
    # step 2 (5 min, prob 0.3, 80%), so it must rank first.
    assert opps[0]["step_number"] == 1
    # Enrichment merged original step fields into the opportunity.
    assert opps[0]["estimated_time_minutes"] == 8


# ────────────────────── Node 5: calculate_roi ─────────────────────

def _roi_state():
    scored = []
    for s in fake_structure()["process_steps"]:
        scored.append(dict(s))
    return {
        "scored_steps": scored,
        "opportunities": fake_patterns()["opportunities"],
        "discovery_facts": {"currency": "USD", "hourly_rate": 35, "annual_volume": 12000,
                            "fte_total": 2, "exception_rate_pct": 30,
                            "throughput_per_person_per_day": 40},
        "hourly_rate": 35,
    }


def test_calculate_roi_node_produces_grounded_estimate():
    with patch.object(calculate_roi, "call_gemini_structured", side_effect=fake_components):
        out = calculate_roi.calculate_roi_node(_roi_state())
    roi = out["roi_estimate"]
    assert roi["currency"] == "USD"
    assert roi["estimated_implementation_cost"] > 0
    assert roi["net_annual_savings"] is not None
    assert roi["num_bots"] == 1
    assert roi["detected_components"]


def test_calculate_roi_safety_net_when_llm_returns_nothing():
    # If the classifier returns nothing usable, cost must still be non-zero
    # (the node infers a minimal component footprint).
    with patch.object(calculate_roi, "call_gemini_structured", return_value={}):
        out = calculate_roi.calculate_roi_node(_roi_state())
    assert out["roi_estimate"]["estimated_implementation_cost"] > 0


# ──────────────── Full pipeline: input -> complete report ────────────

def test_full_pipeline_produces_complete_report():
    """End-to-end: a manual-process description in, a full report out.

    Every Gemini call across all nodes is mocked, so this runs offline and
    deterministically while still exercising the REAL graph wiring and all the
    real transformation/assembly logic.
    """
    langgraph = pytest.importorskip("langgraph")  # needs project deps installed
    from graph.pipeline import pipeline

    with patch.object(parse_input, "call_gemini_structured", side_effect=fake_extraction), \
         patch.object(structure_process, "call_gemini_structured", side_effect=fake_structure), \
         patch.object(score_steps, "call_gemini_structured", side_effect=fake_scores), \
         patch.object(map_patterns, "call_gemini_structured", side_effect=fake_patterns), \
         patch.object(calculate_roi, "call_gemini_structured", side_effect=fake_components), \
         patch.object(generate_summary, "call_gemini_text", side_effect=fake_exec_summary), \
         patch.object(generate_summary, "call_gemini_structured", side_effect=fake_timeline):
        result = pipeline.invoke({
            "raw_text": "Invoices arrive by email; we key them into SAP and 3-way match.",
            "input_format": "text",
            "original_filename": "demo.txt",
            "file_path": "",
        })

    # The full report must contain every major deliverable.
    assert result["scored_steps"], "no scored steps"
    assert len(result["opportunities"]) == 2, "opportunities missing"
    assert result["roi_estimate"]["net_annual_savings"] is not None, "no ROI"
    assert result["executive_summary"], "no executive summary"
    assert result["markdown_report"], "no markdown report"
    assert result["project_timeline"]["total_project_days"] > 0, "no timeline"
