"""AP Process Discovery Agent — Gradio interface.

Single-command entry point:

    python app.py

Left side:  paste an AP process transcript (or upload a .txt/.docx/.pdf).
Right side: the structured output in tabs —
    • Process Map        (structured JSON)
    • ACS Scores         (automation candidate scores per step)
    • Opportunities      (ranked automation opportunities)
    • Executive Summary  (plus deterministic ROI + full report)

The LLM provider (Gemini or Anthropic) is chosen entirely via the .env file.
"""
import json
import os

import gradio as gr

from config import LLM_PROVIDER, active_model, validate_llm_config
from graph.pipeline import run_pipeline
from utils.document_parser import extract_text

SAMPLE_PATH = os.path.join(os.path.dirname(__file__), "data", "sample_transcript.txt")


def _load_sample() -> str:
    try:
        with open(SAMPLE_PATH, "r", encoding="utf-8") as f:
            return f.read()
    except Exception:
        return ""


def _pretty(value) -> str:
    """JSON-encode lists/dicts for display; pass strings through."""
    if value is None:
        return ""
    if isinstance(value, str):
        return value
    return json.dumps(value, indent=2, ensure_ascii=False)


def _format_roi(roi: dict) -> str:
    """Render the deterministic ROI estimate as readable Markdown."""
    if not roi:
        return "_No ROI estimate was produced._"
    sym = roi.get("currency_symbol", "")

    def money(key):
        v = roi.get(key)
        try:
            return f"{sym}{v:,.0f}"
        except Exception:
            return str(v)

    lines = [
        "### Deterministic ROI projection",
        "",
        f"- **Annual labour savings:** {money('annual_labor_savings')}",
        f"- **Total annual benefits:** {money('total_annual_benefits')}",
        f"- **Estimated implementation cost:** {money('estimated_implementation_cost')}",
        f"- **Net annual savings:** {money('net_annual_savings')}",
        f"- **Payback (months):** {roi.get('payback_months', 'n/a')}",
        f"- **Effort reduction:** {roi.get('effort_reduction_pct', 'n/a')}%",
        f"- **FTE freed:** {roi.get('fte_freed', 'n/a')}",
    ]
    return "\n".join(lines)


def analyze(transcript_text: str, uploaded_file):
    """Run the pipeline and return the values for each output tab."""
    # Resolve the input: an uploaded document takes precedence over the textbox.
    text = (transcript_text or "").strip()
    if uploaded_file is not None:
        path = uploaded_file if isinstance(uploaded_file, str) else uploaded_file.name
        try:
            text = extract_text(path).strip()
        except Exception as e:
            err = f"⚠️ Could not read the uploaded file: {e}"
            return err, "", "", "", err, err

    if not text:
        msg = "⚠️ Please paste a transcript or upload a document first."
        return msg, "", "", "", msg, msg

    try:
        validate_llm_config()
    except Exception as e:
        msg = f"⚠️ {e}"
        return msg, "", "", "", msg, msg

    try:
        result = run_pipeline(text)
    except Exception as e:
        msg = f"⚠️ Pipeline error: {e}"
        return msg, "", "", "", msg, msg

    process_map = _pretty(result.get("process_map") or result.get("scored_steps") or [])
    acs_scores = _pretty(result.get("scored_steps") or [])
    opportunities = _pretty(result.get("opportunities") or [])
    exec_summary = result.get("executive_summary") or "_No executive summary produced._"
    roi_md = _format_roi(result.get("roi_estimate") or {})
    full_report = result.get("markdown_report") or "_No report produced._"

    return process_map, acs_scores, opportunities, exec_summary, roi_md, full_report


def build_ui() -> gr.Blocks:
    with gr.Blocks(title="AP Process Discovery Agent") as demo:
        gr.Markdown(
            "# AP Process Discovery Agent\n"
            "Turn an Accounts Payable process description into a structured process "
            "map, automation candidate scores, ranked opportunities, a deterministic "
            "ROI projection, and an executive summary.\n\n"
            f"**LLM provider:** `{LLM_PROVIDER}` — **model:** `{active_model()}` "
            "(configure in `.env`)"
        )
        with gr.Row():
            # ── Left: input ──
            with gr.Column(scale=1):
                gr.Markdown("### Input")
                transcript = gr.Textbox(
                    label="Process transcript",
                    placeholder="Paste an AP process interview transcript or description here...",
                    lines=22,
                )
                upload = gr.File(
                    label="...or upload a document (.txt, .md, .docx, .pdf)",
                    file_types=[".txt", ".md", ".docx", ".pdf"],
                )
                with gr.Row():
                    sample_btn = gr.Button("Load sample transcript")
                    run_btn = gr.Button("Analyze process", variant="primary")

            # ── Right: structured output ──
            with gr.Column(scale=1):
                gr.Markdown("### Structured output")
                with gr.Tabs():
                    with gr.Tab("Process Map"):
                        out_map = gr.Code(label="Process map (JSON)", language="json")
                    with gr.Tab("ACS Scores"):
                        out_acs = gr.Code(
                            label="Automation candidate scores (JSON)", language="json"
                        )
                    with gr.Tab("Opportunities"):
                        out_opps = gr.Code(
                            label="Ranked automation opportunities (JSON)", language="json"
                        )
                    with gr.Tab("Executive Summary"):
                        out_summary = gr.Markdown()
                        out_roi = gr.Markdown()
                    with gr.Tab("Full Report"):
                        out_report = gr.Markdown()

        outputs = [out_map, out_acs, out_opps, out_summary, out_roi, out_report]
        run_btn.click(analyze, inputs=[transcript, upload], outputs=outputs)
        sample_btn.click(lambda: _load_sample(), inputs=None, outputs=transcript)

    return demo


if __name__ == "__main__":
    build_ui().launch(server_name="127.0.0.1", server_port=int(os.getenv("PORT", "7860")), theme=gr.themes.Soft())
