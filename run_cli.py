#!/usr/bin/env python3
"""AP Process Discovery Agent — command-line demo.

Runs the full LangGraph discovery pipeline on an AP process description and
prints the structured output: process map, ACS scores, ranked opportunities,
deterministic ROI, and the executive summary.

Usage
-----
    python run_cli.py                          # uses the bundled sample transcript
    python run_cli.py --file path/to/notes.txt # a .txt / .md / .docx / .pdf file
    python run_cli.py --text "Our AP team..."   # inline text
    python run_cli.py --json out.json          # also save the full result as JSON

The LLM provider (Gemini or Anthropic) is selected in .env.
"""
import argparse
import json
import os
import sys

from config import active_model, LLM_PROVIDER, validate_llm_config
from graph.pipeline import run_pipeline
from utils.document_parser import extract_text

SAMPLE_PATH = os.path.join(os.path.dirname(__file__), "data", "sample_transcript.txt")


def _resolve_text(args) -> str:
    if args.text:
        return args.text
    path = args.file or SAMPLE_PATH
    if not os.path.exists(path):
        print(f"ERROR: file not found: {path}")
        sys.exit(1)
    print(f"Input file: {path}")
    return extract_text(path)


def main():
    parser = argparse.ArgumentParser(description="AP Process Discovery Agent CLI")
    group = parser.add_mutually_exclusive_group()
    group.add_argument("--file", help="Path to a .txt/.md/.docx/.pdf file")
    group.add_argument("--text", help="Inline AP process description")
    parser.add_argument("--json", help="Optional path to save the full result as JSON")
    args = parser.parse_args()

    try:
        validate_llm_config()
    except Exception as e:
        print(f"ERROR: {e}")
        sys.exit(1)

    text = _resolve_text(args)
    print(f"Provider: {LLM_PROVIDER}  |  Model: {active_model()}")
    print("\nRunning the discovery pipeline... (this calls the LLM and may take ~30-60s)\n")

    result = run_pipeline(text)

    print("=" * 70)
    print("EXECUTIVE SUMMARY")
    print("=" * 70)
    print(result.get("executive_summary", "(none)"))

    opportunities = result.get("opportunities", []) or []
    print("\n" + "=" * 70)
    print(f"AUTOMATION OPPORTUNITIES ({len(opportunities)})")
    print("=" * 70)
    for opp in opportunities:
        name = opp.get("step_name", "?")
        pattern = opp.get("ap_pattern", "")
        pct = opp.get("effort_reduction_pct", "")
        print(f"  - {name} -> {pattern} ({pct}% effort reduction)")

    roi = result.get("roi_estimate") or {}
    if roi:
        sym = roi.get("currency_symbol", "$")
        print("\n" + "=" * 70)
        print("DETERMINISTIC ROI")
        print("=" * 70)
        for label, key in [
            ("Annual labour savings", "annual_labor_savings"),
            ("Total annual benefits", "total_annual_benefits"),
            ("Implementation cost", "estimated_implementation_cost"),
            ("Net annual savings", "net_annual_savings"),
        ]:
            v = roi.get(key)
            try:
                print(f"  {label:<24}: {sym}{v:,.0f}")
            except Exception:
                print(f"  {label:<24}: {v}")
        print(f"  {'Payback (months)':<24}: {roi.get('payback_months')}")
        print(f"  {'Effort reduction':<24}: {roi.get('effort_reduction_pct')}%")
        print(f"  {'FTE freed':<24}: {roi.get('fte_freed')}")

    if args.json:
        with open(args.json, "w", encoding="utf-8") as f:
            json.dump(result, f, indent=2, ensure_ascii=False, default=str)
        print(f"\nFull result saved to: {args.json}")

    print("\nDone.")


if __name__ == "__main__":
    main()
