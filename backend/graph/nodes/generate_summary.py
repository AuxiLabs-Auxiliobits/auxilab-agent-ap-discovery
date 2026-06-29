import json
from graph.state import APProcessState
from graph.models import ProjectTimeline
from utils.gemini_client import call_gemini_text, call_gemini_structured
from utils.roi_math import currency_symbol


_FACT_LABELS = {
    "currency": "Currency",
    "hourly_rate": "Loaded hourly labour rate",
    "annual_volume": "Annual transaction volume",
    "fte_total": "Total FTE on process",
    "exception_rate_pct": "Exception rate (%)",
}


def _money(symbol: str, value) -> str:
    try:
        return f"{symbol}{float(value):,.0f}"
    except (TypeError, ValueError):
        return "N/A"


def generate_executive_summary(scored_steps: list, opportunities: list, roi_estimate: dict | None = None) -> str:
    """Generate a CFO-ready executive summary paragraph, grounded in the deterministic ROI."""
    roi_estimate = roi_estimate or {}
    sym = roi_estimate.get("currency_symbol") or currency_symbol(roi_estimate.get("currency"))
    financial_facts = ""
    if roi_estimate:
        financial_facts = f"""
- Currency: {roi_estimate.get('currency', 'USD')}
- Gross annual labour savings at STEADY-STATE ceiling (computed): {_money(sym, roi_estimate.get('annual_labor_savings'))}
- Realistic YEAR-1 labour savings range (computed): {_money(sym, roi_estimate.get('annual_labor_savings_year1_low'))} to {_money(sym, roi_estimate.get('annual_labor_savings_year1_high'))}
- Other grounded annual benefits (computed): {_money(sym, roi_estimate.get('other_annual_benefits'))}
- NET annual savings AFTER costs, steady-state (computed): {_money(sym, roi_estimate.get('net_annual_savings'))}
- One-time implementation cost (computed): {_money(sym, roi_estimate.get('estimated_implementation_cost'))}
- Payback period at steady state (computed): {roi_estimate.get('payback_months')} months
- FTE capacity freed at STEADY-STATE ceiling (computed, already capped to the real team): {roi_estimate.get('fte_freed')}
- Realistic YEAR-1 FTE freed range (computed): {roi_estimate.get('fte_freed_year1_low')} to {roi_estimate.get('fte_freed_year1_high')}
- Steady-state effort reduction (computed): {roi_estimate.get('effort_reduction_pct')}%"""

    prompt = f"""Write a ONE-PARAGRAPH executive summary (max 110 words) for a CFO briefing about this AP process assessment.

Key facts:
- Total process steps analyzed: {len(scored_steps)}
- Steps flagged as priority automation targets: {len([s for s in scored_steps if s.get("is_priority")])}
- Top automation opportunities: {json.dumps([o["ap_pattern"] + " (" + str(o["effort_reduction_pct"]) + "% effort reduction)" for o in opportunities[:3]])}
- Average ACS across all steps: {round(sum(s["acs"] for s in scored_steps) / max(len(scored_steps), 1), 1)}{financial_facts}

Use the computed financial figures EXACTLY as given (do not invent different numbers, and use the stated currency symbol). When you say "net annual savings", you MUST use the NET figure above (after costs) — never label the gross labour savings as "net". CRITICAL FRAMING: the labour-savings, effort-reduction and FTE-freed figures above are the STEADY-STATE CEILING (mature operation), NOT a Year-1 outcome. You MUST describe them as a mature-state target AND give the realistic Year-1 ramp RANGE (labour savings and FTE freed) alongside, so the headline is never an unqualified "frees N FTE in year one". Do NOT claim more FTE are freed than the computed steady-state "FTE capacity freed" value above, and make clear Year-1 realizes the lower ramp range. Write in professional, concise business language, one flowing paragraph only — no bullet points."""

    return call_gemini_text(prompt)


def generate_dynamic_timeline(scored_steps: list) -> ProjectTimeline:
    """Intelligently estimate the RPA project timeline based on process complexity."""
    prompt = f"""You are a Senior RPA Delivery Architect with extensive experience planning and executing enterprise automation projects across UiPath, Automation Anywhere, and Power Automate platforms.

You will be given a list of scored process steps from an automation assessment. Your task is to produce a realistic, phased project delivery timeline. Every estimate must be derived from the actual complexity signals present in the input — no generic placeholders.

---

ANALYSIS FRAMEWORK

**Step 1 — Classify Each Step's Delivery Complexity**
Before grouping into phases, internally score each step using this rubric:

| Complexity Tier | Signals Present                                              | Dev Days (per step) |
|-----------------|--------------------------------------------------------------|---------------------|
| Simple          | Rule-based logic, single structured data source, no exceptions| 1-3 days            |
| Moderate        | UI automation, 2-system handoff, basic conditionals          | 3-7 days            |
| Complex         | API integration, exception handling, dynamic data            | 7-14 days           |
| Advanced        | OCR/IDP, MFA, multi-system orchestration, HITL workflows     | 14-25 days          |

**Step 2 — Group Steps into Logical Delivery Phases**
Organize steps into phases using these principles:
- Phase 1 (Quick Wins): Fully rule-based, single-system, high-confidence automation candidates. Low risk, fast value delivery.
- Phase 2 (Core Automation): Multi-system integrations, moderate exception handling, structured data transformations.
- Phase 3 (Intelligent Processing): OCR/IDP, ML-assisted validation, MFA, human-in-the-loop steps.
- Phase 4 (UAT, Hardening & Deploy): Cross-phase integration testing, UAT cycles, hypercare, and production rollout.

Not all phases are required. If the process has no OCR or HITL steps, omit Phase 3. If all steps are simple, collapse into 2 phases. Let the input drive the structure.

**Step 3 — Estimate Duration Per Phase**
Apply these standard RPA delivery overhead multipliers on top of raw development days:

| Activity                    | Time Allocation                          |
|-----------------------------|------------------------------------------|
| Development                 | Sum of per-step dev days for that phase  |
| Unit Testing & Bug Fixes    | 30% of development days                  |
| Integration Testing         | 20% of development days                  |
| Business Review / Sign-off  | 3-5 days per phase (flat)                |
| UAT (Phase 4 only)          | 10-15 days depending on process breadth  |
| Hypercare / Deploy Buffer   | 5-7 days (Phase 4 only)                  |

Round phase totals to the nearest whole day. Do not pad phases artificially.

---

OUTPUT INSTRUCTIONS

Return ONLY a valid JSON object. No markdown, no preamble, no explanation outside the JSON.

Rules:
- total_project_days must equal the exact arithmetic sum of all total_phase_days values.
- For each phase, total_phase_days must equal development_days + testing_days + review_days (plus any UAT/hypercare you fold into those buckets for Phase 4).
- steps_included must reference actual steps from the input, not invented labels.
- complexity_rationale must be specific to the input — no generic boilerplate.
- If a phase is not applicable given the input, omit it entirely rather than including it with zero days.

---

INPUT DATA:
{json.dumps(scored_steps, indent=2)}
"""
    return call_gemini_structured(prompt, response_schema=ProjectTimeline)


def _reconcile_timeline(timeline: dict) -> dict:
    """Deterministically force total_project_days to equal the sum of phase days,
    and each phase total to equal the sum of its buckets. Removes the old
    'total != sum of phases' inconsistency."""
    if not timeline:
        return timeline
    phases = timeline.get("phases", []) or []
    phase_total_sum = 0
    for phase in phases:
        dev = int(phase.get("development_days", 0) or 0)
        test = int(phase.get("testing_days", 0) or 0)
        review = int(phase.get("review_days", 0) or 0)
        bucket_sum = dev + test + review
        stated = int(phase.get("total_phase_days", 0) or 0)
        # Trust the larger of (stated, bucket sum) so Phase-4 UAT/hypercare that
        # the model folded only into the total is not lost, but never allow total
        # to be less than the parts.
        phase["total_phase_days"] = max(stated, bucket_sum)
        phase_total_sum += phase["total_phase_days"]
    if phases:
        timeline["total_project_days"] = phase_total_sum
    return timeline


def generate_markdown_report(state: dict) -> str:
    """Programmatically build a Markdown assessment report."""
    lines = []
    lines.append("# AP Process Assessment Report\n")

    roi = state.get("roi_estimate", {}) or {}
    sym = roi.get("currency_symbol") or currency_symbol(roi.get("currency"))
    discovery_facts = state.get("discovery_facts", {}) or {}
    missing = state.get("missing_critical_facts", []) or []

    # Executive Summary
    lines.append("## Executive Summary\n")
    lines.append(state["executive_summary"])
    lines.append("")

    scored_steps = state.get("scored_steps", [])

    # ── Data Confidence banner ──────────────────────────────────────────
    if missing:
        lines.append("## \u26a0\ufe0f Data Confidence\n")
        lines.append("The following **critical facts were not stated** in the source material. "
                     "The figures below use clearly-labelled assumptions for these — provide them for an accurate, grounded ROI:\n")
        for key in missing:
            lines.append(f"- **{_FACT_LABELS.get(key, key)}** — not provided")
        lines.append("")

    # ── Systems & Roles ─────────────────────────────────────────────────
    systems = state.get("systems_mentioned") or []
    if not systems:
        seen = set()
        for step in scored_steps:
            for sys in step.get("systems_used", []):
                if sys and sys.lower() not in seen:
                    seen.add(sys.lower())
                    systems.append(sys)

    roles = state.get("roles_identified") or []
    if not roles:
        seen = set()
        for step in scored_steps:
            role = step.get("responsible_role", "").strip()
            if role and role.lower() not in seen:
                seen.add(role.lower())
                roles.append(role)

    pain_points = state.get("pain_points") or []
    if not pain_points:
        seen = set()
        for step in scored_steps:
            for pp in step.get("pain_points", []):
                if pp and pp.lower() not in seen:
                    seen.add(pp.lower())
                    pain_points.append(pp)

    lines.append("## Systems Identified\n")
    if systems:
        for s in systems:
            lines.append(f"- {s}")
    else:
        lines.append("- No specific systems identified in the provided transcript.")
    lines.append("")

    lines.append("## Roles Identified\n")
    if roles:
        for r in roles:
            lines.append(f"- {r}")
    else:
        lines.append("- No specific roles identified in the provided transcript.")
    lines.append("")

    # ── Grounded Discovery Facts ───────────────────────────────────────
    fact_rows = [
        ("Currency", discovery_facts.get("currency")),
        ("Loaded hourly rate", f"{sym}{discovery_facts['hourly_rate']:g}" if discovery_facts.get("hourly_rate") else None),
        ("Volume (as stated)", discovery_facts.get("volume_raw")),
        ("Annual volume", f"{discovery_facts['annual_volume']:,}" if discovery_facts.get("annual_volume") else None),
        ("Seasonality", discovery_facts.get("seasonality")),
        ("Total FTE", discovery_facts.get("fte_total")),
        ("Throughput / person / day", discovery_facts.get("throughput_per_person_per_day")),
        ("Exception rate", f"{discovery_facts['exception_rate_pct']:g}%" if discovery_facts.get("exception_rate_pct") else None),
        ("Exception breakdown", discovery_facts.get("exception_breakdown")),
        ("Matching tolerances", discovery_facts.get("tolerances")),
        ("Approval matrix", discovery_facts.get("approval_matrix")),
        ("Controls / compliance", discovery_facts.get("controls")),
        ("In scope", discovery_facts.get("in_scope")),
        ("Out of scope", discovery_facts.get("out_of_scope")),
        ("Targets / KPIs", discovery_facts.get("targets")),
        ("Late-payment penalty (stated)", f"{currency_symbol(discovery_facts.get('annual_late_payment_penalty_currency') or discovery_facts.get('currency'))}{discovery_facts['annual_late_payment_penalty']:,.0f}/yr" if discovery_facts.get("annual_late_payment_penalty") else None),
        ("Missed early-pay discounts (stated)", f"{currency_symbol(discovery_facts.get('annual_missed_discount_currency') or discovery_facts.get('currency'))}{discovery_facts['annual_missed_discount']:,.0f}/yr" if discovery_facts.get("annual_missed_discount") else None),
    ]
    if any(v for _, v in fact_rows):
        lines.append("## Grounded Discovery Facts\n")
        lines.append("| Fact | Value (as captured from source) |")
        lines.append("|------|----------------------------------|")
        for label, value in fact_rows:
            if value is not None and value != "":
                clean = str(value).replace("\n", " ").replace("|", "/")
                lines.append(f"| {label} | {clean} |")
        lines.append("")

    # Process Map Table
    lines.append("## Process Map\n")
    lines.append("| # | Step | Description & Status | Role | Systems | Time (min) | Freq. | Manual? |")
    lines.append("|---|------|----------------------|------|---------|------------|-------|---------|")
    for step in state["scored_steps"]:
        systems_str = ", ".join(step.get("systems_used", []))
        manual = "Manual" if step.get("is_manual") else "Assisted"
        status = ""
        if "automation_analysis" in step and "automation_potential" in step["automation_analysis"]:
            status = f"**[{step['automation_analysis']['automation_potential']}]** "
        desc = step.get("description", "").replace("\n", " ")
        prob = step.get("occurrence_probability", 1.0)
        try:
            freq = f"{int(round(float(prob) * 100))}%"
        except (TypeError, ValueError):
            freq = "100%"
        lines.append(
            f"| {step['step_number']} | {step['name']} | {status}{desc} | {step['responsible_role']} "
            f"| {systems_str} | {step['estimated_time_minutes']} | {freq} | {manual} |"
        )
    lines.append("")

    # ACS Scores
    lines.append("## Automation Candidate Scores\n")
    lines.append("| # | Step | Rule-Based | Data Structure | Volume | **ACS** | Priority? |")
    lines.append("|---|------|------------|----------------|--------|---------|-----------|")
    for step in state["scored_steps"]:
        priority = "YES" if step.get("is_priority") else "-"
        lines.append(
            f"| {step['step_number']} | {step['name']} | {step['rule_based_score']}/10 "
            f"| {step['data_structure_score']}/10 | {step['volume_score']}/10 "
            f"| **{step['acs']}** | {priority} |"
        )
    lines.append("")

    # Timeline
    timeline = state.get("project_timeline")
    if timeline:
        total_dev_days = timeline.get("total_project_days", 0)
        lines.append("## Delivery Timeline Projection\n")
        lines.append("> \u26a0\ufe0f **Estimate only.** This timeline is generated by an AI model from the process complexity signals, then mathematically reconciled. It is a directional planning estimate \u2014 not a delivery commitment \u2014 and will vary with your team's velocity, environment readiness and the real complexity of exceptions.\n")
        lines.append(f"**Estimated Full E2E Timeline:** **{total_dev_days} days**\n")
        lines.append(f"*{timeline.get('timeline_summary', '')}*\n")
        for phase in timeline.get("phases", []):
            lines.append(f"### {phase.get('phase_name', '')} ({phase.get('total_phase_days', 0)} days)")
            lines.append(f"- **Steps:** {', '.join(phase.get('steps_included', []))}")
            lines.append(f"- **Rationale:** {phase.get('complexity_rationale', '')}")
            lines.append(f"- **Breakdown:** {phase.get('development_days', 0)} Dev | {phase.get('testing_days', 0)} Test | {phase.get('review_days', 0)} Review\n")
    else:
        lines.append("## Delivery Timeline Projection\n")
        lines.append("> \u26a0\ufe0f **Estimate only.** Directional AI/heuristic planning estimate \u2014 not a delivery commitment; validate against your team's velocity.\n")
        lines.append("**Estimated Full E2E Timeline:** **35 days**\n")

    # ── Grounded Financial ROI (deterministic) ─────────────────────────────
    if roi:
        lines.append("## Financial ROI Projection (computed)\n")
        lines.append(
            "These figures are computed deterministically from the grounded discovery facts "
            "(volume, labour rate, currency) and a probability-weighted handling time — not estimated by the model.\n"
        )
        lines.append(
            "> \u26a0\ufe0f **Directional projection, not a guarantee.** The maths is exact, but several inputs "
            "(per-step time savings, implementation cost and maintenance %) are AI/heuristic estimates. Treat ROI and "
            "payback as a decision-grade range and refine them with your real volume, hourly rate and quoted build cost.\n"
        )
        lines.append("| Metric | Value |")
        lines.append("|--------|-------|")
        lines.append(f"| Currency | {roi.get('currency', 'USD')} |")
        lines.append(f"| Annual transaction volume | {roi.get('estimated_annual_volume', 0):,} |")
        lines.append(f"| Loaded hourly rate | {_money(sym, roi.get('hourly_rate'))} |")
        lines.append(f"| Handling time / transaction (before → after) | {roi.get('effective_minutes_before', 0)} → {roi.get('effective_minutes_after', 0)} min |")
        lines.append(f"| Annual labour savings (gross, steady-state ceiling) | {_money(sym, roi.get('annual_labor_savings'))} |")
        if roi.get('annual_labor_savings_year1_low') is not None:
            lines.append(
                f"| ↳ Realistic Year-1 labour savings (ramp) | "
                f"{_money(sym, roi.get('annual_labor_savings_year1_low'))} – {_money(sym, roi.get('annual_labor_savings_year1_high'))} |"
            )
        if roi.get('other_annual_benefits'):
            lines.append(f"| Other grounded benefits (penalties avoided, discounts captured) | {_money(sym, roi.get('other_annual_benefits'))} |")
            lines.append(f"| Total annual benefits | {_money(sym, roi.get('total_annual_benefits'))} |")
        lines.append(f"| One-time implementation cost | {_money(sym, roi.get('estimated_implementation_cost'))} |")
        lines.append(f"| Annual maintenance & licensing | {_money(sym, roi.get('annual_maintenance_cost'))} |")
        lines.append(f"| **Net annual savings (Yr 1, after costs)** | {_money(sym, roi.get('net_annual_savings'))} |")
        lines.append(f"| Payback period | {roi.get('payback_months')} months |")
        lines.append(f"| ROI (Year 1) | {roi.get('roi_year1_pct')}% |")
        lines.append(f"| ROI (3-year) | {roi.get('roi_3yr_pct')}% |")
        implied = roi.get("implied_current_fte")
        stated = roi.get("stated_fte")
        if implied is not None:
            reconcile = f"{implied} implied" + (f" vs {stated:g} stated" if stated else "")
            lines.append(f"| Current effort (FTE) | {reconcile} |")
        lines.append(f"| FTE capacity freed (steady-state ceiling) | {roi.get('fte_freed')} |")
        if roi.get('fte_freed_year1_low') is not None:
            lines.append(
                f"| ↳ Realistic Year-1 FTE freed (ramp) | "
                f"{roi.get('fte_freed_year1_low')} – {roi.get('fte_freed_year1_high')} |"
            )
        if roi.get('effort_reduction_pct') is not None:
            lines.append(
                f"| Effort reduction (steady-state / Year-1) | "
                f"{roi.get('effort_reduction_pct')}% / {roi.get('effort_reduction_year1_low')}–{roi.get('effort_reduction_year1_high')}% |"
            )
        lines.append("")

        assumptions = roi.get("assumptions", []) or []
        warnings = roi.get("warnings", []) or []
        if assumptions:
            lines.append("**Assumptions used (provide real values to remove these):**\n")
            for a in assumptions:
                lines.append(f"- {a}")
            lines.append("")
        if warnings:
            lines.append("**Reconciliation warnings:**\n")
            for w in warnings:
                lines.append(f"- \u26a0\ufe0f {w}")
            lines.append("")
        lines.append("> Implementation/maintenance benchmarks are midpoints of standard RPA delivery ranges, shown in the "
                     "project currency without FX conversion. Labour savings use the stated currency and rate, and handling "
                     "times are calibrated to the stated team size so savings never exceed the team's actual annual cost. "
                     "Headline labour-savings, effort-reduction and FTE-freed figures are the mature steady-state ceiling; the "
                     "Year-1 ramp rows show the realistic first-year realization. Any benefit stated in a different currency than "
                     "the base is converted using approximate reference FX rates (not live rates).\n")

    # Opportunities
    lines.append("## Top Automation Opportunities\n")
    for opp in state.get("opportunities", []):
        lines.append(f"### {opp['step_name']} -> {opp['ap_pattern']}\n")
        lines.append(f"**Estimated Effort Reduction:** {opp['effort_reduction_pct']}%\n")
        if "automation_analysis" in opp:
            analysis = opp["automation_analysis"]
            lines.append(f"**Manual Process:** {analysis.get('current_manual_process', '')}\n")
            lines.append(f"**Automated Process:** {analysis.get('proposed_solution', '')}\n")
            lines.append(f"**Time & Cost Reduction:** {analysis.get('projected_savings', '')}\n")
        else:
            lines.append(f"{opp.get('narrative', '')}\n")
        lines.append("")

    # Non-Automated Processes
    lines.append("## Manual & Complex Processes\n")
    lines.append("The following processes are currently flagged as difficult to fully automate.\n")
    non_automated = [s for s in state["scored_steps"] if not s.get("is_priority") and "automation_analysis" in s and ("Not Automatable" in s["automation_analysis"].get("automation_potential", "") or "Partially" in s["automation_analysis"].get("automation_potential", ""))]
    if non_automated:
        for step in non_automated:
            lines.append(f"### {step['step_number']}. {step['name']} ({step.get('estimated_time_minutes', 0)}m)\n")
            reason = step["automation_analysis"].get("non_automation_reason", {})
            if reason:
                lines.append(f"**Explanation:** {reason.get('explanation', '')}\n")
                lines.append(f"- **Human Strengths (Plus Points):** {reason.get('plus_points', '')}")
                lines.append(f"- **Bot Limitations (Minus Points):** {reason.get('minus_points', '')}\n")
            lines.append("")
    else:
        lines.append("No exceptionally complex or non-automatable processes found.\n\n")

    # Pain Points
    lines.append("## Pain Points Identified\n")
    if pain_points:
        for p in pain_points:
            lines.append(f"- {p}")
    else:
        lines.append("- No specific pain points were identified in the provided transcript.")
    lines.append("")

    return "\n".join(lines)


def generate_summary_node(state: APProcessState) -> dict:
    """Node 5: Generate executive summary and Markdown report."""
    roi_estimate = state.get("roi_estimate", {}) or {}

    # Generate executive summary via LLM, grounded in the computed ROI
    exec_summary = generate_executive_summary(
        state["scored_steps"], state.get("opportunities", []), roi_estimate
    )

    # Generate intelligent timeline, then deterministically reconcile its totals
    timeline_dict = generate_dynamic_timeline(state["scored_steps"])
    timeline_dict = _reconcile_timeline(timeline_dict)
    state["project_timeline"] = timeline_dict

    state["executive_summary"] = exec_summary
    markdown_report = generate_markdown_report(state)
    state["markdown_report"] = markdown_report

    return {
        "project_timeline": timeline_dict,
        "executive_summary": exec_summary,
        "markdown_report": markdown_report,
    }
