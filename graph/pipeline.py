"""The AP Process Discovery pipeline (LangGraph).

This is the core asset: a linear LangGraph StateGraph that turns a raw AP
process description (text) into a structured process map, automation candidate
scores (ACS), a ranked opportunity list, a deterministic ROI projection, and an
executive summary.

Flow:
    parse_input -> structure_process -> score_steps -> map_patterns
                -> calculate_roi -> generate_summary -> END

Input handling (reading .txt/.docx/.pdf files into raw text) lives outside the
graph in `utils.document_parser`, so the pipeline itself only ever deals with
plain text and stays fully provider-agnostic.
"""
from langgraph.graph import StateGraph, END

from graph.state import APProcessState
from graph.nodes.parse_input import parse_input_node
from graph.nodes.structure_process import structure_process_node
from graph.nodes.score_steps import score_steps_node
from graph.nodes.map_patterns import map_patterns_node
from graph.nodes.calculate_roi import calculate_roi_node
from graph.nodes.generate_summary import generate_summary_node


def build_pipeline():
    """Build and compile the LangGraph pipeline."""
    workflow = StateGraph(APProcessState)

    workflow.add_node("parse_input", parse_input_node)
    workflow.add_node("structure_process", structure_process_node)
    workflow.add_node("score_steps", score_steps_node)
    workflow.add_node("map_patterns", map_patterns_node)
    workflow.add_node("calculate_roi", calculate_roi_node)
    workflow.add_node("generate_summary", generate_summary_node)

    workflow.set_entry_point("parse_input")
    workflow.add_edge("parse_input", "structure_process")
    workflow.add_edge("structure_process", "score_steps")
    workflow.add_edge("score_steps", "map_patterns")
    workflow.add_edge("map_patterns", "calculate_roi")
    workflow.add_edge("calculate_roi", "generate_summary")
    workflow.add_edge("generate_summary", END)

    return workflow.compile()


# Compiled singleton used by the Gradio app and the CLI.
pipeline = build_pipeline()


def run_pipeline(raw_text: str) -> dict:
    """Convenience wrapper: run the full discovery pipeline on plain text.

    Returns the final state dict containing (among others):
        process_map, scored_steps, opportunities, roi_estimate,
        executive_summary, markdown_report.
    """
    if not raw_text or not raw_text.strip():
        raise ValueError("No input text provided.")
    return pipeline.invoke(
        {
            "raw_text": raw_text,
            "input_format": "text",
            "original_filename": "input.txt",
            "file_path": "",
        }
    )
