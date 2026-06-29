"""Deterministic ROI & effort-estimation math for the AP discovery agent.

This module replaces the old "let the LLM free-guess the numbers" approach.
The LLM is still used for what it is good at -- reading the transcript into
structured facts and classifying WHICH technical components an automation needs
-- but every financial figure produced here is computed deterministically in
Python from those grounded inputs, so identical inputs always yield identical
ROI. This is what makes the projections reproducible and defensible.
"""
from __future__ import annotations

import re
from typing import Optional


# ── Currency ───────────────────────────────────────────────────
CURRENCY_SYMBOLS = {
    "USD": "$", "GBP": "\u00a3", "EUR": "\u20ac", "INR": "\u20b9", "AUD": "A$",
    "CAD": "C$", "JPY": "\u00a5", "CNY": "\u00a5", "SGD": "S$", "CHF": "CHF ",
    "AED": "AED ", "ZAR": "R", "NZD": "NZ$", "HKD": "HK$",
    "BRL": "R$", "KRW": "₩", "MXN": "Mex$", "THB": "฿", "IDR": "Rp",
    "PHP": "₱", "MYR": "RM", "SAR": "SAR ", "NOK": "kr ", "SEK": "kr ",
}

_SYMBOL_TO_CODE = {
    "$": "USD", "£": "GBP", "€": "EUR", "₹": "INR", "¥": "JPY",
    "A$": "AUD", "C$": "CAD", "S$": "SGD", "NZ$": "NZD", "HK$": "HKD", "Mex$": "MXN",
    "R$": "BRL", "₩": "KRW", "฿": "THB", "₱": "PHP", "Rp": "IDR", "RM": "MYR",
}

# Spelled-out / spoken currency names -> ISO code. Substring-matched in order,
# so multi-word names ("australian dollar") win before the generic "dollar".
_NAME_TO_CODE = [
    (("pound", "sterling", "gbp"), "GBP"),
    (("euro", "eur"), "EUR"),
    (("rupee", "inr"), "INR"),
    (("australian dollar", "aussie", "aud"), "AUD"),
    (("canadian dollar", "cad"), "CAD"),
    (("singapore dollar", "sgd"), "SGD"),
    (("new zealand dollar", "kiwi", "nzd"), "NZD"),
    (("hong kong dollar", "hkd"), "HKD"),
    (("yen", "jpy"), "JPY"),
    (("yuan", "renminbi", "rmb", "cny"), "CNY"),
    (("dirham", "aed"), "AED"),
    (("rand", "zar"), "ZAR"),
    (("swiss franc", "franc", "chf"), "CHF"),
    (("won", "krw"), "KRW"),
    (("real", "reais", "brl"), "BRL"),
    (("mexican peso", "mxn"), "MXN"),
    (("philippine peso", "php"), "PHP"),
    (("baht", "thb"), "THB"),
    (("rupiah", "idr"), "IDR"),
    (("ringgit", "myr"), "MYR"),
    (("riyal", "sar"), "SAR"),
    (("krona", "kronor", "sek"), "SEK"),
    (("krone", "kroner", "nok"), "NOK"),
    (("dollar", "usd"), "USD"),
]


def normalize_currency_code(value: Optional[str]) -> str:
    """Best-effort normalize a stated currency (code or symbol) to an ISO code."""
    if not value:
        return "USD"
    v = str(value).strip()
    if v.upper() in CURRENCY_SYMBOLS:
        return v.upper()
    if v in _SYMBOL_TO_CODE:
        return _SYMBOL_TO_CODE[v]
    low = v.lower()
    if low in ("rs", "rs.", "₹"):
        return "INR"
    # Spelled-out names, specific-first so "australian dollar" beats "dollar".
    for names, code in _NAME_TO_CODE:
        if any(n in low for n in names):
            return code
    return v.upper()[:3] if len(v) >= 3 else "USD"


def currency_symbol(code: Optional[str]) -> str:
    if not code:
        return "$"
    c = normalize_currency_code(code)
    return CURRENCY_SYMBOLS.get(c, c + " ")


# Approximate reference FX rates to USD. Static, offline fallbacks for
# directional ROI only -- NOT live market rates. Used so a benefit that was
# stated in a different currency than the project base is CONVERTED rather than
# silently dropped. Every converted figure carries an explicit "approx. FX" note.
FX_TO_USD = {
    "USD": 1.0, "EUR": 1.08, "GBP": 1.27, "INR": 0.012, "AUD": 0.66,
    "CAD": 0.74, "JPY": 0.0064, "CNY": 0.14, "SGD": 0.74, "CHF": 1.12,
    "AED": 0.27, "ZAR": 0.054, "NZD": 0.61, "HKD": 0.128,
    "BRL": 0.18, "KRW": 0.00073, "MXN": 0.058, "THB": 0.029, "IDR": 0.000063,
    "PHP": 0.018, "MYR": 0.22, "SAR": 0.27, "NOK": 0.094, "SEK": 0.096,
}


def convert_amount(amount, from_code, to_code):
    """Convert a money amount between currencies using static reference rates.

    Returns (converted_amount, fx_was_applied). When either currency is unknown
    or the two match, returns the original amount with fx_was_applied=False.
    """
    if amount is None:
        return amount, False
    f = normalize_currency_code(from_code)
    t = normalize_currency_code(to_code)
    if f == t:
        return amount, False
    rf = FX_TO_USD.get(f)
    rt = FX_TO_USD.get(t)
    if not rf or not rt:
        return amount, False
    return amount * (rf / rt), True


# ── Effort / capacity constants ────────────────────────────────────
# Productive (loaded) working minutes per FTE per year. 1 FTE ≈ 220 working
# days × ~7 productive hours × 60 ≈ 92,400 min. Used for FTE reconciliation.
WORK_MINUTES_PER_FTE_YEAR = 92400
WORKING_DAYS_PER_YEAR = 220
DEFAULT_BATCH_SIZE = 40  # invoices per login/session when a step is per-session
DEFAULT_HOURLY_RATE = 35.0  # only used as a clearly-flagged fallback

# One-time build + annual run cost per technical component. Midpoints of
# standard RPA delivery ranges. Benchmarks are USD-equivalent and are presented
# in the project currency with an explicit assumption note (no FX conversion).
# Recalibrated to enterprise mid-market reality (benchmarked against published
# AP-automation build costs, e.g. ~$120k platform for ~3,000 invoices/month).
# These are USD-equivalent midpoints, presented in the project currency without
# FX conversion. Enterprise ERP (SAP/Oracle) UI automation and IDP/OCR are the
# expensive line items, which is why a credible full build lands near six
# figures and payback is months-to-a-year, not weeks.
COMPONENT_COSTS = {
    "ui_automation":      {"one_time": 12000, "annual": 0,     "label": "UI Automation"},
    "api_integration":    {"one_time": 9000,  "annual": 0,     "label": "API / REST Integration"},
    "structured_data":    {"one_time": 4500,  "annual": 0,     "label": "Structured Data Handling"},
    "ocr_idp":            {"one_time": 32000, "annual": 18000, "label": "OCR / IDP"},
    "business_rules":     {"one_time": 9000,  "annual": 0,     "label": "Business Rules / Decision Engine"},
    "exception_handling": {"one_time": 8000,  "annual": 0,     "label": "Exception Handling & Escalation"},
    "orchestration":      {"one_time": 6000,  "annual": 6000,  "label": "Orchestration / Scheduling"},
    "hitl":               {"one_time": 8000,  "annual": 0,     "label": "Human-in-the-Loop Workflow"},
}
BOT_LICENSE_ANNUAL = 13000        # per bot (attended/unattended runtime)
QA_UAT_OVERHEAD = 0.20            # of one-time build
MAINTENANCE_PCT_OF_BUILD = 0.175  # annual maintenance as % of build

# When the AI-estimated per-step times imply more than this fraction over the
# stated team size, calibrate them DOWN to match the real team capacity. This
# is what anchors labour savings to what the team actually costs. Benchmarks:
# manual invoice touch time is ~12-15 min and AP automation drives ~70-85%
# labour reduction -- it can never exceed 100% of the team's payroll.
FTE_CALIBRATION_TOLERANCE = 0.05
# Conservative realization rates for grounded, non-labour benefits (only ever
# applied to figures the client explicitly stated).
PENALTY_RECOVERY_PCT = 0.85   # share of stated late-payment penalties avoided
DISCOUNT_CAPTURE_PCT = 0.50   # share of stated missed early-pay discounts captured
# Year-1 ramp band vs the mature steady-state ceiling. Automation almost never
# reaches its steady-state ceiling in the first year (adoption, exception-model
# tuning, change management), so the headline labour/effort/FTE figures are
# presented as a CEILING and Year 1 is shown as this conservative realization
# range instead of an unqualified "frees N FTE".
YEAR1_REALIZATION_LOW = 0.55
YEAR1_REALIZATION_HIGH = 0.70

# No automation is ever truly 100%: even "fully automatable" steps retain
# residual human effort (monitoring, OCR/output validation, handling the bot's
# own failures). Cap any single step's effort reduction at this ceiling so the
# blended labour reduction stays within the defensible top-quartile band
# (~70-85%) instead of implying a step vanishes entirely.
MAX_STEP_EFFORT_REDUCTION_PCT = 95.0

# Critical facts required for an accurate ROI. Missing ones are surfaced to the
# user via the "required questions" popup and downgrade confidence.
CRITICAL_FACTS = ["currency", "hourly_rate", "annual_volume", "fte_total", "exception_rate_pct"]


def _f(value, default=None):
    try:
        if value is None or value == "":
            return default
        return float(value)
    except (TypeError, ValueError):
        return default


def _norm_step_key(value):
    """Normalize a step_number so opportunities reliably match their step.

    Opportunities come from a separate LLM call and may emit step_number as an
    int (3), a string ("3") or text ("Step 3"); steps always use an int. Both
    sides are coerced to the same key so the link can never silently break and
    zero out every effort reduction (the cause of the "linear" 0%% ROI bug).
    """
    if value is None or isinstance(value, bool):
        return None
    if isinstance(value, int):
        return value
    if isinstance(value, float):
        return int(value) if value.is_integer() else value
    text = str(value).strip()
    if not text:
        return None
    m = re.search(r"\d+", text)
    return int(m.group()) if m else text.lower()


def _norm_name(value):
    """Normalize a step name for fallback matching."""
    if value is None:
        return None
    text = str(value).strip().lower()
    return text or None


def compute_costs(components: list, num_bots: int = 1, currency: str = "USD",
                  unit_costs: Optional[dict] = None, bot_license_annual=None,
                  annual_volume: Optional[int] = None):
    """Deterministically sum implementation + annual cost from detected components.

    The LLM only decides WHICH components are present (and how many); the unit
    costs and arithmetic live here so the total is reproducible.

    The COMPONENT_COSTS / bot-licence benchmarks are expressed in USD. They
    are converted into the project ``currency`` so the cost side is
    denominated in the SAME currency as the labour-savings side (which uses
    the stated rate). Without this a non-USD project (e.g. INR) compares
    rupee savings against dollar-sized costs and reports a wildly
    overstated ROI / payback.
    """
    currency = normalize_currency_code(currency)

    def _to_ccy(usd_amount):
        converted, _ = convert_amount(usd_amount, "USD", currency)
        return converted

    # Currency-native overrides (already in `currency`) are used verbatim,
    # with NO FX conversion. Missing components fall back to the static USD
    # benchmark converted at the reference rate.
    unit_costs = unit_costs or {}

    def _unit_for(key, spec):
        if key in unit_costs:
            u = unit_costs[key] or {}
            return (_f(u.get("one_time"), 0.0) or 0.0,
                    _f(u.get("annual"), 0.0) or 0.0)
        if key == "ocr_idp" and annual_volume:
            # Scale fallback annual run cost dynamically based on volume: $0.10 USD per document
            return _to_ccy(spec["one_time"]), _to_ccy(0.10 * annual_volume)
        return _to_ccy(spec["one_time"]), _to_ccy(spec["annual"])

    breakdown = []
    one_time_total = 0.0
    annual_total = 0.0

    for comp in components or []:
        key = comp.get("component")
        spec = COMPONENT_COSTS.get(key)
        if not spec:
            continue
        count = max(1, int(_f(comp.get("count", 1), 1)))
        unit_ot, unit_an = _unit_for(key, spec)
        ot = round(unit_ot * count, 2)
        an = round(unit_an * count, 2)
        label = spec["label"] + (f" \u00d7{count}" if count > 1 else "")
        rationale = comp.get("rationale", "")
        if ot:
            one_time_total += ot
            breakdown.append({"category": label, "cost": float(ot),
                              "cost_type": "One-Time", "description": rationale})
        if an:
            annual_total += an
            breakdown.append({"category": label + " (run)", "cost": float(an),
                              "cost_type": "Annual", "description": rationale})

    # QA / UAT / deployment overhead on the build
    qa = round(one_time_total * QA_UAT_OVERHEAD, 2)
    if qa:
        one_time_total += qa
        breakdown.append({"category": "QA, UAT & Deployment Overhead", "cost": qa,
                          "cost_type": "One-Time",
                          "description": f"{int(QA_UAT_OVERHEAD * 100)}% of build effort."})

    # Bot licensing (annual)
    bots = max(1, int(_f(num_bots, 1)))
    if bot_license_annual is not None:
        bot_unit = _f(bot_license_annual, 0.0) or 0.0
    else:
        bot_unit = _to_ccy(BOT_LICENSE_ANNUAL)
    bot_cost = round(bot_unit * bots, 2)
    annual_total += bot_cost
    breakdown.append({"category": f"Bot Licensing ({bots} bot{'s' if bots > 1 else ''})",
                      "cost": bot_cost, "cost_type": "Annual",
                      "description": "Attended/unattended RPA runtime licensing."})

    # Maintenance as % of build (annual)
    maint = round(one_time_total * MAINTENANCE_PCT_OF_BUILD, 2)
    annual_total += maint
    breakdown.append({"category": "Annual Maintenance & Support", "cost": maint,
                      "cost_type": "Annual",
                      "description": f"{int(MAINTENANCE_PCT_OF_BUILD * 100)}% of build cost."})

    return round(one_time_total, 2), round(annual_total, 2), breakdown


def _per_txn_minutes(step: dict, throughput_per_day: Optional[float]) -> float:
    """Probability-weighted minutes this step contributes to ONE transaction.

    Fixes the old flaw where every step was summed as if every invoice hit every
    step at full time. Exception/approval steps only apply to their probability,
    and per-session steps (e.g. login) are amortized across a batch.
    """
    t = _f(step.get("estimated_time_minutes"), 0) or 0
    p = _f(step.get("occurrence_probability"), 1.0)
    if p is None:
        p = 1.0
    p = min(max(p, 0.0), 1.0)
    basis = str(step.get("frequency_basis") or "per_transaction").lower()
    eff = t * p
    if basis in ("per_session", "per_batch", "per_day", "per_login"):
        batch = throughput_per_day if (throughput_per_day and throughput_per_day > 0) else DEFAULT_BATCH_SIZE
        eff = eff / batch
    return eff


def effective_minutes(steps: list, reductions: dict, throughput_per_day: Optional[float] = None,
                      reductions_by_name: Optional[dict] = None):
    """Return (before, after) effective minutes per transaction.

    The per-step reduction is matched first by a normalized step_number key
    and then by step name, so an int/string mismatch (or a missing
    step_number) in the opportunity mapping can never silently zero out the
    reductions.
    """
    reductions_by_name = reductions_by_name or {}
    before = 0.0
    after = 0.0
    for s in steps or []:
        eff = _per_txn_minutes(s, throughput_per_day)
        before += eff
        red = reductions.get(_norm_step_key(s.get("step_number")))
        if red is None:
            red = reductions_by_name.get(_norm_name(s.get("name") or s.get("step_name")), 0)
        red = red or 0
        after += eff * (1 - (red / 100.0))
    return round(before, 2), round(after, 2)


def detect_missing_critical_facts(discovery_facts: dict) -> list:
    """Return the list of critical facts that were not found in the transcript."""
    df = discovery_facts or {}
    missing = []
    for key in CRITICAL_FACTS:
        val = df.get(key)
        if val is None or val == "" or val == 0:
            missing.append(key)
    return missing


def compute_roi(scored_steps, opportunities, discovery_facts,
                implementation_cost, annual_maintenance_cost,
                cost_breakdown=None, fallback_hourly_rate=None,
                pricing_source: Optional[str] = None):
    """Compute the full, grounded, deterministic ROI projection."""
    df = discovery_facts or {}
    assumptions = []
    warnings = []

    currency = normalize_currency_code(df.get("currency"))
    sym = currency_symbol(currency)
    if not df.get("currency"):
        assumptions.append("Currency not stated \u2014 assumed USD. Confirm the real currency for accurate figures.")

    # Hourly rate
    hourly_rate = _f(df.get("hourly_rate")) or _f(fallback_hourly_rate)
    if not hourly_rate:
        hourly_rate = DEFAULT_HOURLY_RATE
        assumptions.append(f"No hourly labour rate stated \u2014 assumed {sym}{int(DEFAULT_HOURLY_RATE)}/hr. Provide the real rate for an accurate ROI.")

    throughput = _f(df.get("throughput_per_person_per_day"))
    stated_fte = _f(df.get("fte_total"))

    # Effort reductions per step from the opportunity mapping
    reductions = {}
    reductions_by_name = {}
    capped_any = False
    for o in opportunities or []:
        red = _f(o.get("effort_reduction_pct"), 0) or 0
        if red > MAX_STEP_EFFORT_REDUCTION_PCT:
            red = MAX_STEP_EFFORT_REDUCTION_PCT
            capped_any = True
        key = _norm_step_key(o.get("step_number"))
        if key is not None:
            reductions[key] = red
        name_key = _norm_name(o.get("step_name") or o.get("name"))
        if name_key:
            reductions_by_name[name_key] = red
    if capped_any:
        assumptions.append(
            f"Per-step effort reductions were capped at {int(MAX_STEP_EFFORT_REDUCTION_PCT)}% \u2014 even fully "
            f"automated steps retain residual human effort (monitoring, output validation, bot exceptions)."
        )

    # Annual volume (computed first; needed for calibration below)
    annual_volume = df.get("annual_volume")
    annual_volume = int(annual_volume) if annual_volume else 0
    if not annual_volume:
        if throughput and stated_fte:
            annual_volume = int(round(throughput * stated_fte * WORKING_DAYS_PER_YEAR))
            assumptions.append(
                f"Annual volume derived from {throughput:g}/clerk/day \u00d7 {stated_fte:g} FTE \u00d7 {WORKING_DAYS_PER_YEAR} days \u2248 {annual_volume:,}."
            )
        else:
            annual_volume = 100 * 52
            warnings.append("No processing volume stated \u2014 assumed 100/week. Volume strongly drives ROI; provide the real figure.")
    weekly_volume = int(round(annual_volume / 52))

    before_min, after_min = effective_minutes(scored_steps, reductions, throughput, reductions_by_name)

    # ── Calibration to grounded team capacity (biggest accuracy driver) ──
    # Per-step minutes are AI estimates and tend to be inflated. The grounded
    # facts (stated FTE + annual volume) tell us the labour the team ACTUALLY
    # spends today. When the modelled effort implies materially more FTE than
    # the real team, we trust the grounded facts and scale the handling times
    # DOWN so the model reconciles with reality. This is what stops labour
    # savings from exceeding what the team costs. We never scale UP (a team
    # with slack must not inflate the savings case).
    raw_before_min = before_min
    raw_implied_fte = (
        round((before_min * annual_volume) / WORK_MINUTES_PER_FTE_YEAR, 2)
        if annual_volume else None
    )
    calibration_factor = 1.0
    if stated_fte and stated_fte > 0 and annual_volume and before_min > 0:
        modelled_fte = (before_min * annual_volume) / WORK_MINUTES_PER_FTE_YEAR
        if modelled_fte > stated_fte * (1 + FTE_CALIBRATION_TOLERANCE):
            calibration_factor = (stated_fte * WORK_MINUTES_PER_FTE_YEAR) / (before_min * annual_volume)
            before_min = round(before_min * calibration_factor, 2)
            after_min = round(after_min * calibration_factor, 2)
            assumptions.append(
                f"Per-step time estimates implied ~{raw_implied_fte:g} FTE of effort vs the stated "
                f"{stated_fte:g} FTE, so handling times were calibrated down by "
                f"{round((1 - calibration_factor) * 100)}% to reconcile with the real team. "
                f"Effective handling time used: {before_min:g} min/transaction (was {raw_before_min:g})."
            )

    saved_min = max(0.0, round(before_min - after_min, 2))

    annual_hours_saved = (saved_min / 60.0) * annual_volume
    annual_labor_savings = round(annual_hours_saved * hourly_rate, 2)

    # FTE reconciliation (post-calibration)
    implied_fte = round((before_min * annual_volume) / WORK_MINUTES_PER_FTE_YEAR, 2) if annual_volume else None
    fte_freed = round((annual_hours_saved * 60) / WORK_MINUTES_PER_FTE_YEAR, 2)

    # ── Hard guardrail: labour savings can never exceed the value of the FTE
    # actually freed. Safety net for the path where calibration could not run
    # (e.g. throughput/volume missing) but an FTE count is known.
    loaded_annual_cost_per_fte = (WORK_MINUTES_PER_FTE_YEAR / 60.0) * hourly_rate
    if stated_fte and stated_fte > 0:
        if fte_freed > stated_fte:
            fte_freed = stated_fte
        max_team_savings = round(stated_fte * loaded_annual_cost_per_fte, 2)
        if annual_labor_savings > max_team_savings:
            annual_labor_savings = max_team_savings
            if hourly_rate:
                annual_hours_saved = round(max_team_savings / hourly_rate, 1)
            warnings.append(
                f"Labour savings were capped at the full annual cost of the {stated_fte:g}-FTE team "
                f"({sym}{max_team_savings:,.0f}) \u2014 automation cannot save more than the team currently costs."
            )

    # ── Year-1 ramp vs steady-state ceiling ───────────────────────
    # The labour savings, effort reduction and FTE-freed figures above are the
    # MATURE steady-state ceiling. Automation rarely reaches that in year one,
    # so we also expose a conservative Year-1 expected RANGE so the report never
    # presents the ceiling as an unqualified "frees N FTE" in the first year.
    effort_reduction_pct = round((saved_min / before_min) * 100, 1) if before_min else 0.0
    y1_labor_low = round(annual_labor_savings * YEAR1_REALIZATION_LOW, 2)
    y1_labor_high = round(annual_labor_savings * YEAR1_REALIZATION_HIGH, 2)
    y1_fte_low = round(fte_freed * YEAR1_REALIZATION_LOW, 2)
    y1_fte_high = round(fte_freed * YEAR1_REALIZATION_HIGH, 2)
    y1_effort_low = round(effort_reduction_pct * YEAR1_REALIZATION_LOW, 1)
    y1_effort_high = round(effort_reduction_pct * YEAR1_REALIZATION_HIGH, 1)
    if fte_freed:
        assumptions.append(
            f"Headline figures ({effort_reduction_pct:g}% effort reduction, {fte_freed:g} FTE freed, "
            f"{sym}{annual_labor_savings:,.0f} labour savings) are the STEADY-STATE CEILING. A realistic "
            f"Year-1 ramp realizes ~{int(YEAR1_REALIZATION_LOW * 100)}-{int(YEAR1_REALIZATION_HIGH * 100)}% of that "
            f"({sym}{y1_labor_low:,.0f}-{sym}{y1_labor_high:,.0f} labour savings, ~{y1_fte_low:g}-{y1_fte_high:g} FTE) "
            f"as adoption, exception-model tuning and change management mature."
        )

    # ── Additional grounded benefits (only if explicitly stated) ──────────
    # Late-payment penalties and missed early-payment discounts are standard,
    # defensible AP-automation benefits (Corpay/APQC ROI methodology). Only
    # what the client stated is used, each at a conservative realization rate
    # so the business case is never over-claimed.
    other_benefits = 0.0
    fx_applied = False

    penalty_raw = _f(df.get("annual_late_payment_penalty"))
    if penalty_raw and penalty_raw > 0:
        p_ccy = (normalize_currency_code(df.get("annual_late_payment_penalty_currency"))
                 if df.get("annual_late_payment_penalty_currency") else currency)
        p_base, p_fx = convert_amount(penalty_raw, p_ccy, currency)
        fx_applied = fx_applied or p_fx
        recovered = round(p_base * PENALTY_RECOVERY_PCT, 2)
        other_benefits += recovered
        stated_str = (f"{sym}{p_base:,.0f}/yr" if not p_fx
                      else f"{currency_symbol(p_ccy)}{penalty_raw:,.0f}/yr → ~{sym}{p_base:,.0f} at approx. FX")
        assumptions.append(
            f"Late-payment penalties avoided: {sym}{recovered:,.0f} "
            f"({int(PENALTY_RECOVERY_PCT * 100)}% of the stated {stated_str})."
        )

    discount_raw = _f(df.get("annual_missed_discount"))
    if discount_raw and discount_raw > 0:
        d_ccy = (normalize_currency_code(df.get("annual_missed_discount_currency"))
                 if df.get("annual_missed_discount_currency") else currency)
        d_base, d_fx = convert_amount(discount_raw, d_ccy, currency)
        fx_applied = fx_applied or d_fx
        captured = round(d_base * DISCOUNT_CAPTURE_PCT, 2)
        other_benefits += captured
        stated_str = (f"{sym}{d_base:,.0f}/yr" if not d_fx
                      else f"{currency_symbol(d_ccy)}{discount_raw:,.0f}/yr → ~{sym}{d_base:,.0f} at approx. FX")
        assumptions.append(
            f"Early-payment discounts captured: {sym}{captured:,.0f} "
            f"({int(DISCOUNT_CAPTURE_PCT * 100)}% of the stated {stated_str} missed)."
        )

    other_benefits = round(other_benefits, 2)
    if fx_applied:
        assumptions.append(
            "Some grounded benefits were quoted in a different currency than the project base "
            f"({currency}); they were converted using approximate reference FX rates (not live rates). "
            "Provide these figures in the base currency for exact values."
        )

    # Financials
    implementation_cost = round(_f(implementation_cost, 0) or 0, 2)
    annual_maintenance_cost = round(_f(annual_maintenance_cost, 0) or 0, 2)
    if currency != "USD" and (implementation_cost or annual_maintenance_cost):
        region = df.get("region") or df.get("country")
        if pricing_source in ("live", "cache"):
            assumptions.append(
                f"Implementation & maintenance costs are based on live regional pricing for {currency} "
                f"in the {region or 'local'} region (and cached where applicable)."
            )
        else:
            assumptions.append(
                "Implementation & maintenance benchmarks are USD-based industry "
                f"midpoints, converted to {currency} at approximate reference FX "
                "rates (not live rates). Provide a real local build quote to remove "
                "this assumption."
            )
    total_annual_benefits = round(annual_labor_savings + other_benefits, 2)
    net_annual_savings = round(total_annual_benefits - annual_maintenance_cost, 2)

    # Year-1 net (labour ramp + grounded benefits, less maintenance) and a
    # conservative payback computed from the LOW end of the Year-1 range.
    net_y1_low = round(y1_labor_low + other_benefits - annual_maintenance_cost, 2)
    net_y1_high = round(y1_labor_high + other_benefits - annual_maintenance_cost, 2)
    payback_year1_high_months = (
        round(implementation_cost / (net_y1_low / 12.0), 1)
        if net_y1_low > 0 and implementation_cost > 0 else None
    )

    payback_months = None
    roi_year1_pct = None
    roi_3yr_pct = None
    if net_annual_savings > 0 and implementation_cost > 0:
        payback_months = round(implementation_cost / (net_annual_savings / 12.0), 1)
        roi_year1_pct = round(((net_annual_savings - implementation_cost) / implementation_cost) * 100)
        roi_3yr_pct = round(((net_annual_savings * 3 - implementation_cost) / implementation_cost) * 100)
    elif net_annual_savings <= 0:
        warnings.append("Net annual savings are not positive with the current inputs \u2014 automation may not pay back; review scope/volume/rate.")

    return {
        "currency": currency,
        "currency_symbol": sym,
        "hourly_rate": round(hourly_rate, 2),
        "estimated_weekly_volume": weekly_volume,
        "estimated_annual_volume": annual_volume,
        "effective_minutes_before": before_min,
        "effective_minutes_after": after_min,
        "minutes_saved_per_txn": saved_min,
        "raw_effective_minutes_before": raw_before_min,
        "calibration_factor": round(calibration_factor, 3),
        "annual_hours_saved": round(annual_hours_saved, 1),
        "annual_labor_savings": annual_labor_savings,
        "other_annual_benefits": other_benefits,
        "total_annual_benefits": total_annual_benefits,
        "estimated_implementation_cost": implementation_cost,
        "annual_maintenance_cost": annual_maintenance_cost,
        "net_annual_savings": net_annual_savings,
        "payback_months": payback_months,
        "roi_year1_pct": roi_year1_pct,
        "roi_3yr_pct": roi_3yr_pct,
        "implied_current_fte": implied_fte,
        "stated_fte": stated_fte,
        "fte_freed": fte_freed,
        "effort_reduction_pct": effort_reduction_pct,
        "year1_realization_low": YEAR1_REALIZATION_LOW,
        "year1_realization_high": YEAR1_REALIZATION_HIGH,
        "annual_labor_savings_year1_low": y1_labor_low,
        "annual_labor_savings_year1_high": y1_labor_high,
        "fte_freed_year1_low": y1_fte_low,
        "fte_freed_year1_high": y1_fte_high,
        "effort_reduction_year1_low": y1_effort_low,
        "effort_reduction_year1_high": y1_effort_high,
        "net_annual_savings_year1_low": net_y1_low,
        "net_annual_savings_year1_high": net_y1_high,
        "payback_year1_high_months": payback_year1_high_months,
        "assumptions": assumptions,
        "warnings": warnings,
        "is_grounded": len(detect_missing_critical_facts(df)) == 0,
        "cost_breakdown": cost_breakdown or [],
        "business_context": (
            f"Projection is computed deterministically from {weekly_volume:,} transactions/week, "
            f"a {sym}{hourly_rate:g}/hr loaded rate, and a probability-weighted handling time of "
            f"{before_min:g} min/transaction (vs {after_min:g} min after automation)."
        ),
    }
