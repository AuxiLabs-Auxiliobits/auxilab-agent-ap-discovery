#!/usr/bin/env python3
"""AP Process Discovery Agent — Demo Day CLI demo.

Runs the full LangGraph discovery pipeline on an Accounts Payable process and
prints the structured assessment: executive summary, discovered steps,
automation opportunities, and the deterministic ROI projection.

The agent accepts the process as TEXT, a WORD document, an AUDIO recording, or a
VIDEO walkthrough. For audio/video you simply pass the PATH to the file — the
pipeline transcribes it with Gemini (multimodal) before analyzing it.

USAGE
-----
    # From the repository root, with backend deps installed and GEMINI_API_KEY set:

    python demo/demo.py                              # bundled sample transcript (text)
    python demo/demo.py --text "Our AP team..."      # inline text
    python demo/demo.py --file path/to/notes.txt     # a .txt file
    python demo/demo.py --file path/to/process.docx   # a Word document
    python demo/demo.py --file path/to/interview.mp3  # an audio recording
    python demo/demo.py --file path/to/walkthrough.mp4 # a video walkthrough

The input type is detected automatically from the file extension:
    audio: .mp3 .wav .m4a .ogg .webm     video: .mp4 .webm .mov
    docs:  .docx                          text:  .txt

REQUIREMENTS
------------
    pip install -r requirements.txt     (run inside the backend/ venv)
    A valid GEMINI_API_KEY in backend/.env (see .env.example)

Note: a real LLM run takes ~30-60s for text; audio/video are slower because the
file is first uploaded to Gemini and transcribed. Network access is required.
"""
import argparse
import os
import sys

# Make the backend package importable and run with backend/ as the working dir
# so relative paths inside the pipeline (templates, data, .env) resolve.
REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BACKEND_DIR = os.path.join(REPO_ROOT, "backend")
sys.path.insert(0, BACKEND_DIR)

SAMPLE_TRANSCRIPT = os.path.join(
    BACKEND_DIR, "data", "transcripts", "transcript_01_manufacturer.txt"
)


def _load_env():
    """Best-effort load of backend/.env so GEMINI_API_KEY is available."""
    try:
        from dotenv import load_dotenv
        load_dotenv(os.path.join(BACKEND_DIR, ".env"))
    except Exception:
        pass


def _money(sym, value):
    try:
        return f"{sym}{value:,.0f}"
    except Exception:
        return f"{sym}{value}"


def _build_pipeline_input(args):
    """Turn CLI args into the pipeline's input state.

    Returns a dict with raw_text / input_format / original_filename / file_path,
    mirroring exactly what the /api/analyze endpoint passes to the pipeline.
    """
    from utils.media_processor import detect_input_type

    # Inline text
    if args.text:
        return {
            "raw_text": args.text,
            "input_format": "text",
            "original_filename": "inline_input.txt",
            "file_path": "",
        }

    path = args.file or SAMPLE_TRANSCRIPT
    if not os.path.exists(path):
        print(f"ERROR: file not found: {path}")
        sys.exit(1)

    # Detect the type from the extension (raises ValueError if unsupported).
    try:
        input_format = detect_input_type(path)
    except ValueError as e:
        print(f"ERROR: {e}")
        print("Supported: text(.txt) docx(.docx) audio(.mp3/.wav/.m4a/.ogg/.webm) video(.mp4/.webm/.mov)")
        sys.exit(1)

    filename = os.path.basename(path)

    if input_format == "text":
        # Read text files directly; the pipeline's text path uses raw_text.
        with open(path, "r", encoding="utf-8") as f:
            text = f.read()
        print(f"Input: TEXT  ({filename}, {len(text):,} chars)")
        return {"raw_text": text, "input_format": "text",
                "original_filename": filename, "file_path": ""}

    # docx / audio / video: hand the FILE PATH to the pipeline; node 0
    # (preprocess_media) extracts/transcribes it via Gemini.
    size_mb = os.path.getsize(path) / (1024 * 1024)
    label = input_format.upper()
    if input_format in ("audio", "video"):
        print(f"Input: {label}  ({filename}, {size_mb:.1f} MB) — will be transcribed by Gemini first...")
    else:
        print(f"Input: {label}  ({filename}, {size_mb:.1f} MB)")
    return {"raw_text": "", "input_format": input_format,
            "original_filename": filename, "file_path": path}


def main():
    parser = argparse.ArgumentParser(
        description="AP Process Discovery Agent demo (text / docx / audio / video)"
    )
    group = parser.add_mutually_exclusive_group()
    group.add_argument("--file", help="Path to a .txt/.docx/audio/video file to analyze")
    group.add_argument("--text", help="Inline AP process description to analyze")
    parser.add_argument("--out", help="Optional path to save the full Markdown report (e.g. report.md)")
    parser.add_argument("--summary", action="store_true",
                        help="Print only the short structured summary instead of the full report")
    args = parser.parse_args()

    _load_env()

    if not os.getenv("GEMINI_API_KEY"):
        print("ERROR: GEMINI_API_KEY is not set.")
        print("Copy .env.example to backend/.env and add your Gemini API key, then retry.")
        sys.exit(1)

    pipeline_input = _build_pipeline_input(args)

    # Imported here (after sys.path setup) so --help works without backend deps.
    os.chdir(BACKEND_DIR)
    from graph.pipeline import pipeline

    print("\nRunning the discovery pipeline... this may take a while.\n")
    result = pipeline.invoke(pipeline_input)

    # If the input was transcribed, show a short preview of the transcript.
    if pipeline_input["input_format"] in ("audio", "video"):
        transcript = result.get("raw_text", "") or ""
        if transcript:
            preview = transcript.strip().replace("\n", " ")[:300]
            print("-" * 60)
            print("TRANSCRIBED TEXT (preview)")
            print("-" * 60)
            print(preview + ("..." if len(transcript) > 300 else ""))
            print()

    # The full, web-identical report the pipeline assembles.
    full_report = result.get("markdown_report", "") or ""

    if args.summary or not full_report:
        # Short structured view (fallback if the full report is unavailable).
        print("=" * 60)
        print("EXECUTIVE SUMMARY")
        print("=" * 60)
        print(result.get("executive_summary", "(none)"))

        steps = result.get("scored_steps", []) or []
        opportunities = result.get("opportunities", []) or []
        print("\n" + "=" * 60)
        print(f"DISCOVERED STEPS: {len(steps)}   |   OPPORTUNITIES: {len(opportunities)}")
        print("=" * 60)
        for opp in opportunities:
            print(
                f"  - {opp.get('step_name')} -> {opp.get('ap_pattern')} "
                f"({opp.get('effort_reduction_pct')}% effort reduction)"
            )

        roi = result.get("roi_estimate") or {}
        if roi:
            sym = roi.get("currency_symbol", "$")
            print("\n" + "=" * 60)
            print("ROI PROJECTION (deterministic)")
            print("=" * 60)
            print(f"  Annual labour savings : {_money(sym, roi.get('annual_labor_savings', 0))}")
            print(f"  Total annual benefits : {_money(sym, roi.get('total_annual_benefits', 0))}")
            print(f"  Implementation cost   : {_money(sym, roi.get('estimated_implementation_cost', 0))}")
            print(f"  Net annual savings    : {_money(sym, roi.get('net_annual_savings', 0))}")
            print(f"  Payback (months)      : {roi.get('payback_months')}")
            print(f"  Effort reduction      : {roi.get('effort_reduction_pct')}%")
            print(f"  FTE freed (ceiling)   : {roi.get('fte_freed')}")
    else:
        # Full detailed report — the SAME Markdown the web app renders.
        print("=" * 60)
        print("FULL ASSESSMENT REPORT (same as the web app)")
        print("=" * 60)
        print(full_report)

    # Optionally save the full Markdown report to a file.
    if args.out and full_report:
        out_path = args.out if os.path.isabs(args.out) else os.path.join(REPO_ROOT, args.out)
        with open(out_path, "w", encoding="utf-8") as f:
            f.write(full_report)
        print(f"\nFull report saved to: {out_path}")

    print("\nDone.")


if __name__ == "__main__":
    main()
