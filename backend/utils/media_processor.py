import os
from config import (
    SUPPORTED_AUDIO_EXTENSIONS,
    SUPPORTED_VIDEO_EXTENSIONS,
    SUPPORTED_DOC_EXTENSIONS,
    SUPPORTED_TEXT_EXTENSIONS,
)


def detect_input_type(filename: str) -> str:
    """Detect input type from file extension."""
    ext = os.path.splitext(filename)[1].lower()

    if ext in SUPPORTED_AUDIO_EXTENSIONS:
        return "audio"
    elif ext in SUPPORTED_VIDEO_EXTENSIONS:
        return "video"
    elif ext in SUPPORTED_DOC_EXTENSIONS:
        return "docx"
    elif ext in SUPPORTED_TEXT_EXTENSIONS:
        return "text"
    else:
        raise ValueError(f"Unsupported file type: {ext}")


def process_audio(file_path: str) -> str:
    """Transcribe audio file using Gemini multimodal."""
    from utils.gemini_client import call_gemini_multimodal

    prompt = (
        "Transcribe this audio recording of an Accounts Payable process interview verbatim. "
        "Include all mentioned systems (ERP, email, Excel, etc.), roles (AP clerk, manager, etc.), "
        "and process steps. Preserve the conversational tone and all details."
    )
    return call_gemini_multimodal(file_path, prompt)


def process_video(file_path: str) -> str:
    """Transcribe video file using Gemini multimodal."""
    from utils.gemini_client import call_gemini_multimodal

    prompt = (
        "This is a video recording of an Accounts Payable process walkthrough or interview. "
        "Transcribe all spoken content verbatim. Also describe any on-screen process flows, "
        "system interfaces (ERP screens, Excel sheets), or documents shown. "
        "Include all mentioned systems, roles, and process steps."
    )
    return call_gemini_multimodal(file_path, prompt)
