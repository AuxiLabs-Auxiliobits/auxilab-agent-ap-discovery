from pydantic import BaseModel, Field
from enum import Enum
from typing import Optional


class AutomationAnalysis(BaseModel):
    current_manual_process: str = Field(description="Detailed explanation of what manual work is being done and why it takes time.")
    automation_potential: str = Field(description="High, Medium, or Low")
    proposed_solution: str = Field(description="Non-technical explanation of exactly how an AI/RPA agent would automate this step, or why it cannot be fully automated.")
    projected_savings: str = Field(description="Detailed analysis of time, manual effort, and cost reduction if this step is automated.")

class ExtractedStep(BaseModel):
    """Raw extracted step from the input text."""
    name: str = Field(description="Short name of the AP process step")
    description: str = Field(description="Detailed description of what happens in this step")
    systems: list[str] = Field(default_factory=list, description="Systems used: ERP, email, Excel, etc.")
    roles: list[str] = Field(default_factory=list, description="Roles involved: AP clerk, manager, etc.")
    pain_points: list[str] = Field(default_factory=list, description="Pain points or issues mentioned")


class DiscoveryFacts(BaseModel):
    """Quantitative discovery facts captured VERBATIM from the transcript.

    Every field is Optional. ``None`` means the fact was not stated -- the agent
    must never invent these. They are the grounding inputs for deterministic ROI
    and for the PDD/SDD, so a missing value is surfaced to the user rather than
    hallucinated.
    """
    currency: Optional[str] = Field(None, description="Currency the org uses for money (ISO code like GBP/USD/EUR or the symbol). Null if not stated.")
    hourly_rate: Optional[float] = Field(None, description="Fully-loaded hourly labour rate of AP staff as a number in `currency`. Null if not stated.")
    annual_volume: Optional[int] = Field(None, description="Invoices/transactions processed per YEAR. Normalize any stated monthly/weekly/daily volume to annual. Null if not stated.")
    volume_raw: Optional[str] = Field(None, description="The volume exactly as stated, e.g. '4,500 PO invoices per month, ~220/day'. Null if not stated.")
    seasonality: Optional[str] = Field(None, description="Any peak/seasonal spike, e.g. '+40% at quarter-end (Sep-Oct)'. Null if not stated.")
    fte_total: Optional[float] = Field(None, description="Total number of FTE working this process today. Null if not stated.")
    throughput_per_person_per_day: Optional[float] = Field(None, description="Invoices/transactions handled per person per day, if stated. Null otherwise.")
    exception_rate_pct: Optional[float] = Field(None, description="Percent (0-100) of transactions that hit an exception / manual path. Null if not stated.")
    exception_breakdown: Optional[str] = Field(None, description="Breakdown of exception causes, e.g. '45% GR missing, 25% price, 15% qty, 15% duplicates'. Null if not stated.")
    tolerances: Optional[str] = Field(None, description="Matching tolerances exactly as stated, e.g. '5% or GBP 50 whichever lower; zero qty tolerance'. Null if not stated.")
    approval_matrix: Optional[str] = Field(None, description="Approval thresholds and approvers exactly as stated, with amounts and currency. Null if not stated.")
    controls: Optional[str] = Field(None, description="Compliance/controls mentioned: SOX, segregation of duties, retention period, duplicate-payment checks, etc. Null if not stated.")
    in_scope: Optional[str] = Field(None, description="Explicitly in-scope items/process variants. Null if not stated.")
    out_of_scope: Optional[str] = Field(None, description="Explicitly out-of-scope items/process variants. Null if not stated.")
    targets: Optional[str] = Field(None, description="Stated improvement targets/KPIs, e.g. 'straight-through processing 50%->80%, free ~3 FTE, GBP 18k/yr late fees'. Null if not stated.")
    annual_late_payment_penalty: Optional[float] = Field(None, description="Annual late-payment penalty/fee cost as a number in `currency` (normalized to per-year). Null if not stated.")
    annual_missed_discount: Optional[float] = Field(None, description="Annual value of missed early-payment discounts as a number in `currency` (normalized to per-year). Null if not stated.")


class ExtractionResult(BaseModel):
    """Full output of Node 1: Input Parser."""
    steps: list[ExtractedStep]
    systems_mentioned: list[str] = Field(description="All unique systems mentioned across all steps")
    roles_identified: list[str] = Field(description="All unique roles mentioned across all steps")
    pain_points: list[str] = Field(description="All pain points expressed")
    discovery_facts: Optional[DiscoveryFacts] = Field(None, description="Quantitative discovery facts captured verbatim from the transcript.")


class ProcessStep(BaseModel):
    """Structured, sequential AP process step."""
    step_number: int
    name: str
    description: str
    responsible_role: str
    input_document: str = Field(description="Input document or data for this step")
    output_document: str = Field(description="Output document or data from this step")
    systems_used: list[str]
    estimated_time_minutes: int = Field(description="Estimated time in minutes per occurrence of this step")
    occurrence_probability: float = Field(1.0, ge=0.0, le=1.0, description="Fraction (0-1) of transactions that actually pass through this step. Happy-path steps = 1.0; exception/approval steps = their real frequency (e.g. 0.3 for a 30% exception path).")
    frequency_basis: str = Field("per_transaction", description="How often this step runs relative to a transaction: 'per_transaction' (once per invoice), 'per_session'/'per_batch' (once per login/batch, amortized across many invoices).")
    is_manual: bool = Field(description="True if step is currently manual, False if system-assisted")


class ScoredStep(BaseModel):
    """Process step with automation candidate scoring."""
    step_number: int
    name: str
    description: str
    responsible_role: str
    input_document: str
    output_document: str
    systems_used: list[str]
    estimated_time_minutes: int
    occurrence_probability: float = 1.0
    frequency_basis: str = "per_transaction"
    is_manual: bool
    rule_based_score: int = Field(ge=0, le=10, description="0=judgment-heavy, 10=fully rule-based")
    data_structure_score: int = Field(ge=0, le=10, description="0=unstructured, 10=fully structured data")
    volume_score: int = Field(ge=0, le=10, description="0=rare/low volume, 10=high volume/frequency")
    acs: float = Field(description="Automation Candidate Score = avg of 3 scores")
    is_priority: bool = Field(description="True if ACS > 7")
    automation_analysis: AutomationAnalysis = Field(description="Detailed automation breakdown")


class APPattern(str, Enum):
    INVOICE_CAPTURE = "Invoice Capture"
    DATA_EXTRACTION = "Data Extraction"
    PO_MATCHING = "PO Matching"
    APPROVAL_ROUTING = "Approval Routing"
    EXCEPTION_HANDLING = "Exception Handling"
    VENDOR_COMMUNICATION = "Vendor Communication"
    PAYMENT_PREPARATION = "Payment Preparation"
    AUDIT_REPORTING = "Audit Reporting"


class Opportunity(BaseModel):
    """Automation opportunity mapped to an AP pattern."""
    step_name: str
    step_number: int
    acs: float
    ap_pattern: str = Field(description="One of the 8 AP automation patterns")
    narrative: str = Field(description="Brief opportunity narrative including why this is a good candidate")
    effort_reduction_pct: int = Field(ge=0, le=100, description="Estimated effort reduction percentage")
    estimated_development_days: int = Field(description="Estimated total time in days to build the automation for this opportunity. This MUST include the time needed for development, testing phase, and hypercare phase.", default=7)


class TimelinePhase(BaseModel):
    phase_number: int = Field(description="Phase number")
    phase_name: str = Field(description="Name of the phase (e.g., 'Phase 1: Quick Wins')")
    steps_included: list[str] = Field(description="List of step names or descriptions included in this phase")
    development_days: int = Field(description="Estimated development days for this phase")
    testing_days: int = Field(description="Estimated testing days for this phase")
    review_days: int = Field(description="Estimated review days for this phase")
    total_phase_days: int = Field(description="Intelligently estimated total days to complete this phase based on step complexity")
    complexity_rationale: str = Field(description="Explanation of why these steps were grouped here and why the duration was chosen")


class ProjectTimeline(BaseModel):
    total_project_days: int = Field(description="Sum of all estimated days across all phases")
    timeline_summary: str = Field(description="Plain-English summary of the overall delivery arc, key risk phases, and recommended team composition")
    phases: list[TimelinePhase] = Field(description="Breakdown of the project lifecycle")


class CostBreakdownItem(BaseModel):
    category: str = Field(description="The category of cost, e.g. 'UI Automation (SAP)', 'OCR/IDP License', 'QA & UAT Overhead'.")
    cost: float = Field(description="Estimated cost in the project currency.")
    cost_type: str = Field(description="Type of cost: 'One-Time' or 'Annual' or 'Monthly'.")
    description: str = Field(description="Brief explanation of what this covers in the context of the analyzed steps.")


class DetectedComponent(BaseModel):
    """A technical automation component the LLM detects in the process.

    The LLM only classifies which components exist; `utils.roi_math.compute_costs`
    applies fixed unit costs and sums them deterministically.
    """
    component: str = Field(description="One of: ui_automation, api_integration, structured_data, ocr_idp, business_rules, exception_handling, orchestration, hitl")
    count: int = Field(1, description="How many of this component are needed (e.g. number of distinct apps for ui_automation).")
    rationale: str = Field(description="Which step(s)/need drives this component.")


class ComponentDetection(BaseModel):
    """LLM output for deterministic cost modelling."""
    components: list[DetectedComponent] = Field(description="All technical components required to automate the priority steps.")
    num_bots: int = Field(1, description="Number of distinct bots/automations that will run in production.")
    rpa_platform_detected: Optional[str] = Field(None, description="RPA platform if identifiable from context, else null.")


class ROIEstimate(BaseModel):
    """Deterministically computed ROI projection (see utils.roi_math)."""
    currency: str = "USD"
    currency_symbol: str = "$"
    hourly_rate: Optional[float] = None
    estimated_weekly_volume: int = 0
    estimated_annual_volume: int = 0
    effective_minutes_before: float = 0
    effective_minutes_after: float = 0
    minutes_saved_per_txn: float = 0
    annual_hours_saved: float = 0
    annual_labor_savings: float = 0
    estimated_implementation_cost: float = 0
    annual_maintenance_cost: float = 0
    net_annual_savings: float = 0
    payback_months: Optional[float] = None
    roi_year1_pct: Optional[float] = None
    roi_3yr_pct: Optional[float] = None
    implied_current_fte: Optional[float] = None
    stated_fte: Optional[float] = None
    fte_freed: Optional[float] = None
    assumptions: list[str] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)
    is_grounded: bool = True
    business_context: str = ""
    cost_breakdown: list[CostBreakdownItem] = Field(default_factory=list)


class AssessmentOutput(BaseModel):
    """Complete assessment output."""
    process_map: list[ProcessStep]
    scored_steps: list[ScoredStep]
    priority_targets: list[ScoredStep]
    opportunities: list[Opportunity]
    project_timeline: ProjectTimeline
    roi_estimate: ROIEstimate
    executive_summary: str
    markdown_report: str
    hourly_rate: Optional[float] = Field(None, description="The extracted hourly rate of AP staff, if mentioned. Null if not mentioned.")
    currency: Optional[str] = Field(None, description="The project currency code.")
    discovery_facts: Optional[DiscoveryFacts] = None
    missing_critical_facts: list[str] = Field(default_factory=list)
    systems_mentioned: list[str]
    roles_identified: list[str]
    pain_points: list[str]
