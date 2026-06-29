import json
from graph.state import APProcessState
from utils.gemini_client import call_gemini_structured


SCORING_SYSTEM_PROMPT = """You are an automation feasibility scoring expert and business analyst for Accounts Payable processes.

For each AP process step, you must provide TWO things:
1. Score it on three axes (0-10 each):
   - **Rule-based score**: 0 = entirely judgment/subjective, 10 = entirely rule-based/deterministic
   - **Data structure score**: 0 = unstructured, 10 = fully structured digital data
   - **Volume score**: 0 = rare/one-off, 10 = very high volume/frequency

2. Provide a detailed, non-technical `automation_analysis` so a business user can understand it clearly:
   - `current_manual_process`: Detail the exact manual process. What are the human workers doing? What systems are they interacting with? Exactly how much time is being consumed by this manual effort?
   - `automation_potential`: "Fully Automatable", "Partially Automatable", or "Not Automatable".
   - `proposed_solution`: Detail the Automated Process. Exactly how will an AI/RPA bot do this? What systems will it interact with?
   - `projected_savings`: Explicitly compare the time consumed before automation vs the time consumed after automation. State exactly how much time will be saved (reduced) if this step is automated.
   - `non_automation_reason`: (Required if Not Automatable or Partially Automatable) Explain why it cannot be fully automated. Detail the `plus_points` (what humans do well here) and `minus_points` (why bots fail here). If fully automatable, leave empty strings.

Write in a highly descriptive, professional business tone."""

SCORING_SCHEMA = {
    "type": "object",
    "properties": {
        "scored_steps": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "step_number": {"type": "integer"},
                    "rule_based_score": {"type": "integer"},
                    "data_structure_score": {"type": "integer"},
                    "volume_score": {"type": "integer"},
                    "automation_analysis": {
                        "type": "object",
                        "properties": {
                            "current_manual_process": {"type": "string"},
                            "automation_potential": {"type": "string"},
                            "proposed_solution": {"type": "string"},
                            "projected_savings": {"type": "string"},
                            "non_automation_reason": {
                                "type": "object",
                                "properties": {
                                    "explanation": {"type": "string"},
                                    "plus_points": {"type": "string"},
                                    "minus_points": {"type": "string"}
                                },
                                "required": ["explanation", "plus_points", "minus_points"]
                            }
                        },
                        "required": ["current_manual_process", "automation_potential", "proposed_solution", "projected_savings"]
                    }
                },
                "required": ["step_number", "rule_based_score", "data_structure_score", "volume_score", "automation_analysis"],
            },
        }
    },
    "required": ["scored_steps"],
}


def score_steps_node(state: APProcessState) -> dict:
    """Node 3: Score each step for automation feasibility and compute ACS."""
    process_map = state["process_map"]

    prompt = f"""Score and analyze each of these AP process steps for automation feasibility:

{json.dumps(process_map, indent=2)}

For each step, provide the 3 scores and a rich, detailed automation_analysis explaining the automation path."""

    scores_result = call_gemini_structured(
        prompt=prompt,
        system_prompt=SCORING_SYSTEM_PROMPT,
        response_schema=SCORING_SCHEMA,
    )

    # Build a lookup of scores by step_number
    scores_lookup = {s["step_number"]: s for s in scores_result["scored_steps"]}

    scored_steps = []
    priority_targets = []

    for step in process_map:
        step_num = step["step_number"]
        scores = scores_lookup.get(step_num, {
            "rule_based_score": 5,
            "data_structure_score": 5,
            "volume_score": 5,
            "automation_analysis": {
                "current_manual_process": "Information not available.",
                "automation_potential": "Unknown",
                "proposed_solution": "Requires further analysis.",
                "projected_savings": "TBD"
            }
        })

        rb = scores["rule_based_score"]
        ds = scores["data_structure_score"]
        vol = scores["volume_score"]
        acs = round((rb + ds + vol) / 3, 1)

        scored_step = {
            **step,
            "rule_based_score": rb,
            "data_structure_score": ds,
            "volume_score": vol,
            "acs": acs,
            "is_priority": acs > 7,
            "automation_analysis": scores["automation_analysis"]
        }

        scored_steps.append(scored_step)
        if acs > 7:
            priority_targets.append(scored_step)

    # If no priority targets, take top 3 with ACS > 5
    if not priority_targets:
        candidates = [s for s in scored_steps if s["acs"] > 5]
        candidates.sort(key=lambda x: x["acs"], reverse=True)
        priority_targets = candidates[:3]

    return {
        "scored_steps": scored_steps,
        "priority_targets": priority_targets,
    }
