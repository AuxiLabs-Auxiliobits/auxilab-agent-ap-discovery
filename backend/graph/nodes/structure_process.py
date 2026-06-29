import json
from graph.state import APProcessState
from utils.gemini_client import call_gemini_structured


STRUCTURE_SYSTEM_PROMPT = """You are an AP process structuring expert.
You receive raw extracted steps from an AP process and must organize them into a clean, sequential workflow.

For each step, you must determine:
- A sequential step number (starting from 1)
- A clear step name
- A detailed description
- The responsible role
- What document/data enters this step (input)
- What document/data leaves this step (output)
- Which systems are used
- Estimated time in minutes PER OCCURRENCE of this step (infer if not stated — use AP industry benchmarks)
- occurrence_probability: the fraction (0.0-1.0) of transactions that ACTUALLY pass through this step.
    * Happy-path steps every invoice goes through = 1.0
    * Exception-only or conditional steps = their real frequency. If the client says ~30%% of invoices hit exceptions, the exception-handling step gets 0.30, not 1.0.
    * Approval steps that only apply above a threshold get the share of invoices above that threshold if known, else a sensible fraction.
- frequency_basis: how often the step runs relative to a single transaction:
    * "per_transaction" — runs once per invoice/item (default)
    * "per_session" or "per_batch" — runs once per login/batch and is amortized across many invoices (e.g. logging into the ERP once at the start of the day)
- Whether it is currently manual or system-assisted

WHY THIS MATTERS: Downstream ROI sums probability-weighted, per-transaction time. If you mark an exception step that only 30%% of invoices hit as occurrence_probability 1.0, the effort (and the ROI/FTE numbers) will be massively overstated. Be realistic and ground these in the stated exception rate and approval thresholds.

Order the steps in the logical AP workflow sequence:
Invoice Receipt -> Data Entry -> Validation/Matching -> Approval -> Payment -> Reporting

ABSTRACTION LEVEL: Ensure the final output consists of high-level, cohesive business steps (e.g., "Review and Approve Invoice"). If the raw steps contain overly granular actions (like "Open browser", "Enter username", "Click login"), combine and abstract them into a single logical step (e.g., "Log into ERP System").
SEPARATION OF LOGINS: Logging into a major system MUST be kept as its own separate step (and is typically frequency_basis = "per_session"). Do not merge a login step into the subsequent action step."""

STRUCTURE_SCHEMA = {
    "type": "object",
    "properties": {
        "process_steps": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "step_number": {"type": "integer"},
                    "name": {"type": "string"},
                    "description": {"type": "string"},
                    "responsible_role": {"type": "string"},
                    "input_document": {"type": "string"},
                    "output_document": {"type": "string"},
                    "systems_used": {"type": "array", "items": {"type": "string"}},
                    "estimated_time_minutes": {"type": "integer"},
                    "occurrence_probability": {"type": "number", "description": "Fraction 0-1 of transactions passing through this step."},
                    "frequency_basis": {"type": "string", "description": "per_transaction | per_session | per_batch"},
                    "is_manual": {"type": "boolean"},
                },
                "required": [
                    "step_number", "name", "description", "responsible_role",
                    "input_document", "output_document", "systems_used",
                    "estimated_time_minutes", "occurrence_probability", "frequency_basis", "is_manual",
                ],
            },
        }
    },
    "required": ["process_steps"],
}


def structure_process_node(state: APProcessState) -> dict:
    """Node 2: Organize extracted steps into a sequential AP workflow with grounded frequency."""
    extracted_steps = state["extracted_steps"]
    discovery_facts = state.get("discovery_facts", {}) or {}

    facts_hint = json.dumps({
        "exception_rate_pct": discovery_facts.get("exception_rate_pct"),
        "exception_breakdown": discovery_facts.get("exception_breakdown"),
        "approval_matrix": discovery_facts.get("approval_matrix"),
        "throughput_per_person_per_day": discovery_facts.get("throughput_per_person_per_day"),
    }, indent=2)

    prompt = f"""Organize these raw AP process steps into a sequential, structured workflow:

Raw extracted steps:
{json.dumps(extracted_steps, indent=2)}

Grounded discovery facts to calibrate occurrence_probability and frequency_basis (null = not stated, use judgement):
{facts_hint}

Create a logical, sequential AP process flow. Estimate per-occurrence times based on AP industry standards if not stated.
Set occurrence_probability realistically: happy-path = 1.0, exception/conditional steps = their real frequency (use the stated exception rate / approval thresholds above). Mark login/batch steps as frequency_basis per_session."""

    result = call_gemini_structured(
        prompt=prompt,
        system_prompt=STRUCTURE_SYSTEM_PROMPT,
        response_schema=STRUCTURE_SCHEMA,
    )

    # Defensive defaults so downstream math never sees missing fields.
    steps = result["process_steps"]
    for s in steps:
        if s.get("occurrence_probability") is None:
            s["occurrence_probability"] = 1.0
        try:
            s["occurrence_probability"] = min(max(float(s["occurrence_probability"]), 0.0), 1.0)
        except (TypeError, ValueError):
            s["occurrence_probability"] = 1.0
        if not s.get("frequency_basis"):
            s["frequency_basis"] = "per_transaction"

    return {"process_map": steps}
