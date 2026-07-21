from typing import TypedDict, Annotated, Optional
from graph.models import ProcessStep, ScoredStep, Opportunity


class APProcessState(TypedDict, total=False):
    # Inputs
    raw_text: str
    input_format: str                  # "text", "docx", "audio", "video"
    original_filename: str
    file_path: str                     # Path to uploaded file (if any)

    # Node 1 Output — Raw Extraction
    extracted_steps: list[dict]
    systems_mentioned: list[str]
    roles_identified: list[str]
    pain_points: list[str]
    hourly_rate: Optional[float]
    # Grounded quantitative discovery facts (volume, FTE, currency, tolerances,
    # approval matrix, controls, scope, targets, exception rate). Optional fields
    # are None when not stated in the transcript — never invented.
    discovery_facts: dict
    currency: Optional[str]
    # Critical facts (currency, hourly_rate, annual_volume, fte_total,
    # exception_rate_pct) that were missing from the transcript. Drives the
    # "required questions" popup and lowers ROI confidence.
    missing_critical_facts: list[str]

    # Node 2 Output — Structured Process Map
    process_map: list[dict]

    # Node 3 Output — Scored Steps
    scored_steps: list[dict]
    priority_targets: list[dict]

    # Node 4 Output — Opportunity Mapping
    opportunities: list[dict]

    # Node 5 Output — Final Deliverables
    project_timeline: dict
    roi_estimate: dict
    executive_summary: str
    markdown_report: str
