"""Tests for input-format detection (pure, no API key / network needed).

This is the very first thing the agent does with any upload — deciding whether
the input is text, a document, audio, or video — so it deserves direct coverage.
"""
import pytest

from utils.media_processor import detect_input_type


def test_detect_input_type_text():
    assert detect_input_type("interview.txt") == "text"


def test_detect_input_type_docx():
    assert detect_input_type("process.docx") == "docx"


def test_detect_input_type_audio():
    assert detect_input_type("call.mp3") == "audio"
    assert detect_input_type("call.wav") == "audio"


def test_detect_input_type_video():
    assert detect_input_type("screen.mp4") == "video"


def test_detect_input_type_is_case_insensitive():
    assert detect_input_type("RECORDING.MP3") == "audio"


def test_detect_input_type_unsupported_raises():
    with pytest.raises(ValueError):
        detect_input_type("malware.exe")
