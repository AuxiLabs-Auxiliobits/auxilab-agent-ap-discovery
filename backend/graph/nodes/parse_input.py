from graph.state import APProcessState
from utils.gemini_client import call_gemini_structured
from utils.roi_math import normalize_currency_code, detect_missing_critical_facts


EXTRACTION_SYSTEM_PROMPT = """You are an expert AP (Accounts Payable) process analyst.
You will receive a raw process description — this could be an interview transcript between a Client and a Consultant, an email thread, or a document.

CRITICAL RULES FOR INTERVIEW TRANSCRIPTS & PROCESS VIDEOS:
- ONLY extract the actual business Accounts Payable process steps discussed or shown.
- DO NOT extract conversational meta-steps or the interview structure.
- Ignore any actions taken by the "Consultant" regarding the interview itself.
- ABSTRACTION LEVEL: Group granular, low-level clicks and keystrokes into cohesive, logical business actions. For example, DO NOT list "Open browser", "Navigate to URL", "Enter username", "Enter password", and "Click login" as 5 separate steps. Instead, abstract them into a single step: "Log into the ERP System". 
- SEPARATION OF LOGINS: Logging into a major system (like an ERP, Maconomy, SAP, etc.) MUST ALWAYS be its own separate, distinct step. Do not merge the login action with the subsequent report generation or data entry step.
- SEPARATION OF TASKS: Group navigation clicks into the actual task being performed (e.g., "Generate and Export Expense Report" instead of clicking through 5 different menus), but keep distinct business actions (like Logging In vs. Exporting a Report) as separate steps.

GROUNDED DISCOVERY FACTS — THIS IS CRITICAL:
You MUST also capture the quantitative "discovery facts" of the process into the `discovery_facts` object, EXACTLY as stated by the client. These figures drive a deterministic ROI calculation downstream.
- Capture: currency, hourly/loaded labour rate, processing volume (and normalize it to an ANNUAL figure), seasonality, total FTE, throughput per person per day, exception rate (%), exception breakdown, matching tolerances, the approval matrix (thresholds + approvers), compliance controls, in/out of scope, improvement targets/KPIs, and any quantified annual costs of the current process such as late-payment penalties/fees and the value of missed early-payment discounts (capture each as a per-YEAR number, AND record the currency it was quoted in — even when that currency differs from the main process currency. NEVER drop or null a stated cost merely because it is expressed in a different currency).
- ABSOLUTE RULE: If a fact is NOT explicitly stated in the transcript, set it to null. NEVER guess, estimate, or invent a discovery fact. A null value is correct and expected when the client did not say it — it will be surfaced to the user as a follow-up question, not fabricated.
- For `annual_volume`: convert whatever cadence is stated (per day/week/month) into a per-YEAR integer. Also keep the original wording in `volume_raw`.
- For `currency`: use the ISO code if you can infer it from a symbol (£ -> GBP, $ -> USD, € -> EUR, ₹ -> INR). If no money/currency is mentioned at all, set it to null.

Be thorough but maintain a high-level business focus. Capture every business step mentioned, even if described informally."""

_DISCOVERY_FACTS_SCHEMA = {
    "type": "OBJECT",
    "description": "Quantitative facts captured verbatim. Use null for anything not explicitly stated. NEVER invent values.",
    "properties": {
        "currency": {"type": "STRING", "nullable": True, "description": "ISO code (GBP/USD/EUR/INR) or symbol. Null if no money mentioned."},
        "hourly_rate": {"type": "NUMBER", "nullable": True, "description": "Fully-loaded hourly labour rate as a number. Null if not stated."},
        "annual_volume": {"type": "INTEGER", "nullable": True, "description": "Transactions per YEAR (normalize from any stated cadence). Null if not stated."},
        "volume_raw": {"type": "STRING", "nullable": True, "description": "Volume exactly as stated."},
        "seasonality": {"type": "STRING", "nullable": True, "description": "Any peak/seasonal spike."},
        "fte_total": {"type": "NUMBER", "nullable": True, "description": "Total FTE on the process."},
        "throughput_per_person_per_day": {"type": "NUMBER", "nullable": True, "description": "Items per person per day."},
        "exception_rate_pct": {"type": "NUMBER", "nullable": True, "description": "Percent of transactions on the exception path (0-100)."},
        "exception_breakdown": {"type": "STRING", "nullable": True, "description": "Breakdown of exception causes."},
        "tolerances": {"type": "STRING", "nullable": True, "description": "Matching tolerances exactly as stated."},
        "approval_matrix": {"type": "STRING", "nullable": True, "description": "Approval thresholds and approvers with amounts."},
        "controls": {"type": "STRING", "nullable": True, "description": "Compliance/controls (SOX, SoD, retention, dup-payment checks)."},
        "in_scope": {"type": "STRING", "nullable": True, "description": "Explicitly in-scope items."},
        "out_of_scope": {"type": "STRING", "nullable": True, "description": "Explicitly out-of-scope items."},
        "targets": {"type": "STRING", "nullable": True, "description": "Stated improvement targets / KPIs."},
        "annual_late_payment_penalty": {"type": "NUMBER", "nullable": True, "description": "Annual late-payment penalty/fee cost as a number (normalize to per-year). Capture it EVEN IF quoted in a different currency than the base process currency — never null it just because the currency differs. Null only if not stated at all."},
        "annual_late_payment_penalty_currency": {"type": "STRING", "nullable": True, "description": "ISO code or symbol of the currency the late-payment penalty was quoted in (e.g. USD, $, EUR). Null if not stated."},
        "annual_missed_discount": {"type": "NUMBER", "nullable": True, "description": "Annual value of missed early-payment discounts as a number (normalize to per-year). Capture it EVEN IF quoted in a different currency than the base process currency — never null it just because the currency differs. Null only if not stated at all."},
        "annual_missed_discount_currency": {"type": "STRING", "nullable": True, "description": "ISO code or symbol of the currency the missed-discount figure was quoted in (e.g. USD, $, EUR). Null if not stated."},
    },
}

EXTRACTION_SCHEMA = {
    "type": "OBJECT",
    "properties": {
        "steps": {
            "type": "ARRAY",
            "items": {
                "type": "OBJECT",
                "properties": {
                    "name": {"type": "STRING"},
                    "description": {"type": "STRING"},
                    "systems": {"type": "ARRAY", "items": {"type": "STRING"}},
                    "roles": {"type": "ARRAY", "items": {"type": "STRING"}},
                    "pain_points": {"type": "ARRAY", "items": {"type": "STRING"}},
                },
                "required": ["name", "description", "systems", "roles", "pain_points"],
            },
        },
        "systems_mentioned": {"type": "ARRAY", "items": {"type": "STRING"}},
        "roles_identified": {"type": "ARRAY", "items": {"type": "STRING"}},
        "pain_points": {"type": "ARRAY", "items": {"type": "STRING"}},
        "hourly_rate": {
            "type": "NUMBER",
            "nullable": True,
            "description": "The average hourly/loaded rate of the AP staff as a number. Null if not mentioned. (Mirror of discovery_facts.hourly_rate.)"
        },
        "discovery_facts": _DISCOVERY_FACTS_SCHEMA,
    },
    "required": ["steps", "systems_mentioned", "roles_identified", "pain_points", "discovery_facts"],
}


def _to_float(value):
    try:
        if value is None or value == "":
            return None
        return float(value)
    except (ValueError, TypeError):
        return None


def parse_input_node(state: APProcessState) -> dict:
    """Node 1: Extract steps, systems, roles, pain points, and GROUNDED discovery facts."""
    raw_text = state["raw_text"]

    prompt = f"""Analyze this AP process description and extract all information:

---
{raw_text}
---

Extract every logical business AP process step mentioned, all systems used, all roles involved, all pain points expressed.
Also fill `discovery_facts` with the quantitative figures (currency, hourly rate, annual volume, FTE, exception rate, tolerances, approval matrix, controls, scope, targets) EXACTLY as stated.
WARNING 1: Ignore any meta-conversation about the interview itself. Group overly granular actions (like individual clicks or keystrokes) into cohesive business steps.
WARNING 2: For any discovery fact NOT explicitly stated in the text, you MUST return null. Do NOT invent or estimate discovery facts."""

    result = call_gemini_structured(
        prompt=prompt,
        system_prompt=EXTRACTION_SYSTEM_PROMPT,
        response_schema=EXTRACTION_SCHEMA,
    )

    discovery_facts = result.get("discovery_facts") or {}

    # Hourly rate: prefer discovery_facts, fall back to legacy top-level field.
    rate = _to_float(discovery_facts.get("hourly_rate"))
    if rate is None:
        rate = _to_float(result.get("hourly_rate"))
    discovery_facts["hourly_rate"] = rate

    # Normalize numeric facts defensively.
    discovery_facts["annual_volume"] = (
        int(discovery_facts["annual_volume"]) if discovery_facts.get("annual_volume") else None
    )
    discovery_facts["fte_total"] = _to_float(discovery_facts.get("fte_total"))
    discovery_facts["throughput_per_person_per_day"] = _to_float(discovery_facts.get("throughput_per_person_per_day"))
    discovery_facts["exception_rate_pct"] = _to_float(discovery_facts.get("exception_rate_pct"))
    discovery_facts["annual_late_payment_penalty"] = _to_float(discovery_facts.get("annual_late_payment_penalty"))
    discovery_facts["annual_missed_discount"] = _to_float(discovery_facts.get("annual_missed_discount"))

    # Currency normalization (null stays null so it is flagged as missing).
    currency = discovery_facts.get("currency")
    currency = normalize_currency_code(currency) if currency else None
    discovery_facts["currency"] = currency

    missing = detect_missing_critical_facts(discovery_facts)

    return {
        "extracted_steps": result["steps"],
        "systems_mentioned": result["systems_mentioned"],
        "roles_identified": result["roles_identified"],
        "pain_points": result["pain_points"],
        "hourly_rate": rate,
        "discovery_facts": discovery_facts,
        "currency": currency,
        "missing_critical_facts": missing,
    }
