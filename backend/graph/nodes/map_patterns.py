import json
from graph.state import APProcessState
from utils.gemini_client import call_gemini_structured


PATTERN_SYSTEM_PROMPT = """You are an AP automation specialist. Map each automation candidate step to the most relevant AP automation pattern and write an opportunity narrative.

The 8 AP Automation Patterns:
1. Invoice Capture — Automated scanning, OCR, and digital ingestion of invoices
2. Data Extraction — Pulling structured data from documents (line items, amounts, dates)
3. PO Matching — 2-way or 3-way matching of invoices to POs and goods receipts
4. Approval Routing — Automated workflow routing based on rules (amount, department, etc.)
5. Exception Handling — Automated flagging and routing of discrepancies
6. Vendor Communication — Automated status updates, remittance advice, query responses
7. Payment Preparation — Automated payment batch creation and scheduling
8. Audit Reporting — Automated compliance tracking and report generation

For each candidate, choose the BEST matching pattern and explain why.
Estimate the effort reduction percentage (0-100%) based on how much manual work automation would eliminate."""

PATTERN_SCHEMA = {
    "type": "object",
    "properties": {
        "opportunities": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "step_name": {"type": "string"},
                    "step_number": {"type": "integer"},
                    "acs": {"type": "number"},
                    "ap_pattern": {"type": "string"},
                    "narrative": {"type": "string"},
                    "effort_reduction_pct": {"type": "integer"},
                },
                "required": ["step_name", "step_number", "acs", "ap_pattern", "narrative", "effort_reduction_pct"],
            },
        }
    },
    "required": ["opportunities"],
}


def map_patterns_node(state: APProcessState) -> dict:
    """Node 4: Map automation candidates to AP automation patterns."""
    scored_steps = state.get("scored_steps", [])
    
    # Include all steps that have any automation potential, not just the high-ACS priority targets
    targets = [
        s for s in scored_steps 
        if s.get("automation_analysis", {}).get("automation_potential") in ["Fully Automatable", "Partially Automatable"]
    ]

    prompt = f"""Map each of these AP process steps to the most relevant AP automation pattern:

Automation candidates:
{json.dumps(targets, indent=2)}

For each step, select the best AP automation pattern, write a brief narrative, and estimate effort reduction %."""

    result = call_gemini_structured(
        prompt=prompt,
        system_prompt=PATTERN_SYSTEM_PROMPT,
        response_schema=PATTERN_SCHEMA,
    )

    # Merge original step data into the new opportunities array
    opportunities = result["opportunities"]
    step_lookup = {pt["step_number"]: pt for pt in scored_steps}
    
    enriched_opportunities = []
    for opp in opportunities:
        original = step_lookup.get(opp["step_number"], {})
        # Merge dictionaries (opp takes precedence for overlapping keys like narrative)
        enriched = {**original, **opp}
        enriched_opportunities.append(enriched)

    # Rank by the ACTUAL labour value each opportunity removes, not by ACS.
    # Value proxy = probability-weighted minutes the step costs per transaction
    # x its effort-reduction %. This keeps amortized, near-zero-time steps
    # (e.g. "log in once per session") from being surfaced as top opportunities
    # ahead of high-volume keying/extraction work that actually drives ROI.
    def _opportunity_value(opp: dict) -> float:
        t = opp.get("estimated_time_minutes") or 0
        try:
            t = float(t)
        except (TypeError, ValueError):
            t = 0.0
        p = opp.get("occurrence_probability")
        try:
            p = float(p) if p is not None else 1.0
        except (TypeError, ValueError):
            p = 1.0
        p = min(max(p, 0.0), 1.0)
        basis = str(opp.get("frequency_basis") or "per_transaction").lower()
        eff = t * p
        if basis in ("per_session", "per_batch", "per_day", "per_login"):
            eff = eff / 40.0  # amortize per-session steps across a typical batch
        red = opp.get("effort_reduction_pct") or 0
        try:
            red = float(red)
        except (TypeError, ValueError):
            red = 0.0
        return eff * (red / 100.0)

    enriched_opportunities.sort(key=_opportunity_value, reverse=True)

    return {"opportunities": enriched_opportunities}
