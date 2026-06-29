import json

from graph.state import APProcessState
from graph.models import ComponentDetection
from utils.gemini_client import call_gemini_structured
from utils import roi_math
from utils import pricing


COMPONENT_SYSTEM_PROMPT = """You are an RPA Solution Architect. Your ONLY job is to CLASSIFY which technical
automation components a project needs — not to price them. Pricing is done deterministically in code.

For the given priority/scored steps, decide which of these components are required and how many of each:
- ui_automation: driving web/desktop apps through their UI (count = number of DISTINCT apps automated this way)
- api_integration: REST/SOAP/DB integrations (count = number of distinct integrations)
- structured_data: reading/writing Excel/CSV/structured files
- ocr_idp: OCR / Intelligent Document Processing for invoices, PDFs, scanned docs
- business_rules: a decision/rules engine (matching tolerances, approval thresholds, GL coding)
- exception_handling: exception detection, routing and escalation logic
- orchestration: scheduling/queue orchestration across bots
- hitl: human-in-the-loop review/approval steps

Also estimate num_bots: how many distinct production bots/automations will run.
Only include components that are genuinely justified by the steps. Provide a short rationale referencing the step(s) for each."""


def calculate_roi_node(state: APProcessState) -> dict:
    """Node: Deterministic, grounded ROI projection.

    The LLM only classifies the technical components (its strength). All money,
    time, FTE and payback math is computed in utils.roi_math so the same inputs
    always yield the same ROI — fully reproducible and defensible.
    """
    scored_steps = state.get("scored_steps", [])
    opportunities = state.get("opportunities", [])
    discovery_facts = state.get("discovery_facts", {}) or {}
    fallback_rate = state.get("hourly_rate")

    # ---- Step 1: LLM classifies technical components (no pricing) ------------
    prompt = f"""Classify the technical automation components required for these AP steps.

Priority / scored steps:
{json.dumps(scored_steps, indent=2)}

Return the components list (with counts + rationale) and num_bots. Do NOT estimate any costs — only classify."""

    try:
        detection = call_gemini_structured(
            prompt,
            system_prompt=COMPONENT_SYSTEM_PROMPT,
            response_schema=ComponentDetection,
        )
    except Exception:
        detection = {}

    components = (detection or {}).get("components") or []
    num_bots = (detection or {}).get("num_bots") or 1

    # Safety net: if the model returned nothing usable, infer a minimal footprint
    # from the systems present so cost is never zero.
    if not components:
        systems = set()
        for s in scored_steps:
            for sys_name in s.get("systems_used", []) or []:
                systems.add(sys_name)
        components = [
            {"component": "ui_automation", "count": max(1, len(systems)),
             "rationale": "Inferred from the systems used across the process steps."},
            {"component": "business_rules", "count": 1, "rationale": "Matching/approval logic."},
            {"component": "exception_handling", "count": 1, "rationale": "Exception routing."},
        ]

    # ---- Step 2: deterministic cost model -----------------------------------
    # Prices are resolved in the PROJECT's own currency. With live pricing on,
    # real local prices are fetched (and cached) via Google-Search grounding;
    # otherwise we fall back to the static benchmark converted at reference FX.
    # Either way the cost side ends up in the same currency as the savings side.
    project_currency = roi_math.normalize_currency_code(discovery_facts.get("currency"))
    region = discovery_facts.get("region") or discovery_facts.get("country")
    
    # Resolve annual volume first to size bots and scale pricing:
    throughput = roi_math._f(discovery_facts.get("throughput_per_person_per_day"))
    stated_fte = roi_math._f(discovery_facts.get("fte_total"))
    annual_volume = discovery_facts.get("annual_volume")
    annual_volume = int(annual_volume) if annual_volume else 0
    if not annual_volume:
        if throughput and stated_fte:
            annual_volume = int(round(throughput * stated_fte * roi_math.WORKING_DAYS_PER_YEAR))
        else:
            annual_volume = 100 * 52

    # Cap num_bots at 1 if annual volume <= 50,000 (sized to volume)
    if annual_volume <= 50000:
        num_bots = 1

    pricing_info = pricing.resolve_unit_costs(
        components, project_currency, region, num_bots=num_bots, annual_volume=annual_volume
    )
    implementation_cost, annual_maintenance_cost, cost_breakdown = roi_math.compute_costs(
        components, num_bots, currency=project_currency,
        unit_costs=pricing_info.get("unit_costs"),
        bot_license_annual=pricing_info.get("bot_license_annual"),
        annual_volume=annual_volume,
    )

    # ---- Step 3: deterministic, grounded ROI/FTE ----------------------------
    roi_estimate = roi_math.compute_roi(
        scored_steps=scored_steps,
        opportunities=opportunities,
        discovery_facts=discovery_facts,
        implementation_cost=implementation_cost,
        annual_maintenance_cost=annual_maintenance_cost,
        cost_breakdown=cost_breakdown,
        fallback_hourly_rate=fallback_rate,
        pricing_source=pricing_info.get("source"),
    )
    roi_estimate["rpa_platform_detected"] = (detection or {}).get("rpa_platform_detected")
    roi_estimate["num_bots"] = num_bots
    roi_estimate["detected_components"] = components
    roi_estimate["pricing_source"] = pricing_info.get("source")
    roi_estimate["pricing_region"] = pricing_info.get("region")
    # Safety: in fallback mode a currency with no reference FX rate cannot be
    # converted, so costs would remain USD-sized. Surface that clearly.
    if (pricing_info.get("source") == "fallback"
            and project_currency != "USD"
            and project_currency not in roi_math.FX_TO_USD):
        roi_estimate.setdefault("warnings", []).append(
            f"No reference exchange rate is available for {project_currency}, so costs "
            f"are shown as USD-equivalent benchmarks without conversion. Enable live "
            f"pricing or provide a local build quote for an accurate {project_currency} figure."
        )

    return {"roi_estimate": roi_estimate}
