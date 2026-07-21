"""Read a process description from plain text or an uploaded document.

Supported inputs (no external services required):
    .txt / .md   -> read directly
    .docx        -> extracted with python-docx
    .pdf         -> extracted with pypdf (optional dependency)

Audio/video transcription and multimodal ingestion were intentionally removed
for the published tool — the brief only requires a text transcript or an
uploaded document as input.
"""
import os

from config import (
    SUPPORTED_DOC_EXTENSIONS,
    SUPPORTED_PDF_EXTENSIONS,
    SUPPORTED_TEXT_EXTENSIONS,
)


def _extract_docx(path: str) -> str:
    from docx import Document

    doc = Document(path)
    return "\n".join(p.text for p in doc.paragraphs if p.text and p.text.strip())


def _extract_pdf(path: str) -> str:
    try:
        from pypdf import PdfReader
    except Exception as e:  # pragma: no cover
        raise RuntimeError(
            "Reading PDF files requires the 'pypdf' package. Install it with "
            "`pip install pypdf`, or paste the text directly instead."
        ) from e

    reader = PdfReader(path)
    return "\n".join((page.extract_text() or "") for page in reader.pages).strip()


def extract_text(path: str) -> str:
    """Return the plain text content of a supported document."""
    if not path or not os.path.exists(path):
        raise FileNotFoundError(f"File not found: {path}")

    ext = os.path.splitext(path)[1].lower()
    if ext in SUPPORTED_TEXT_EXTENSIONS:
        with open(path, "r", encoding="utf-8", errors="ignore") as f:
            return f.read()
    if ext in SUPPORTED_DOC_EXTENSIONS:
        return _extract_docx(path)
    if ext in SUPPORTED_PDF_EXTENSIONS:
        return _extract_pdf(path)

    raise ValueError(
        f"Unsupported file type '{ext}'. Supported: .txt, .md, .docx, .pdf. "
        "For anything else, paste the text directly."
    )
