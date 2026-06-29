from graph.state import APProcessState
from utils.docx_parser import extract_text_from_docx
from utils.media_processor import process_audio, process_video


def preprocess_media_node(state: APProcessState) -> dict:
    """Node 0: Convert any input format into plain text."""
    input_format = state.get("input_format", "text")
    file_path = state.get("file_path", "")
    raw_text = state.get("raw_text", "")

    if input_format == "text":
        # Already have text, pass through
        return {"raw_text": raw_text}

    elif input_format == "docx":
        text = extract_text_from_docx(file_path)
        return {"raw_text": text}

    elif input_format == "audio":
        text = process_audio(file_path)
        return {"raw_text": text}

    elif input_format == "video":
        text = process_video(file_path)
        return {"raw_text": text}

    else:
        raise ValueError(f"Unsupported input format: {input_format}")
