from langgraph.graph import StateGraph, END
from graph.state import APProcessState
from graph.nodes.preprocess_media import preprocess_media_node
from graph.nodes.parse_input import parse_input_node
from graph.nodes.structure_process import structure_process_node
from graph.nodes.score_steps import score_steps_node
from graph.nodes.map_patterns import map_patterns_node
from graph.nodes.calculate_roi import calculate_roi_node
from graph.nodes.generate_summary import generate_summary_node


def build_pipeline():
    """Build and compile the LangGraph pipeline."""
    workflow = StateGraph(APProcessState)

    # Add all nodes
    workflow.add_node("preprocess_media", preprocess_media_node)
    workflow.add_node("parse_input", parse_input_node)
    workflow.add_node("structure_process", structure_process_node)
    workflow.add_node("score_steps", score_steps_node)
    workflow.add_node("map_patterns", map_patterns_node)
    workflow.add_node("calculate_roi", calculate_roi_node)
    workflow.add_node("generate_summary", generate_summary_node)

    # Define the flow
    workflow.set_entry_point("preprocess_media")
    workflow.add_edge("preprocess_media", "parse_input")
    workflow.add_edge("parse_input", "structure_process")
    workflow.add_edge("structure_process", "score_steps")
    workflow.add_edge("score_steps", "map_patterns")
    workflow.add_edge("map_patterns", "calculate_roi")
    workflow.add_edge("calculate_roi", "generate_summary")
    workflow.add_edge("generate_summary", END)

    return workflow.compile()


# Compile the pipeline (singleton)
pipeline = build_pipeline()
