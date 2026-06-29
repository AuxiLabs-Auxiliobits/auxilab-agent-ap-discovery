"""
Persistence for user-uploaded PDD/SDD Word templates.

Each assessment can have one template per doc type. Files are stored on disk
under backend/templates/{assessment_id}/{doc_type}.docx so they survive across
requests (generation reads the structure, download reuses the design).
"""
import os
import shutil

# backend/ directory (this file lives in backend/utils/)
_BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TEMPLATES_DIR = os.path.join(_BACKEND_DIR, "templates")


def _safe(part: str) -> str:
    """Prevent path traversal in ids / doc types."""
    return "".join(c for c in str(part) if c.isalnum() or c in ("-", "_"))


def template_path(assessment_id: str, doc_type: str) -> str:
    """Absolute path where the template for this assessment + doc type lives."""
    return os.path.join(
        TEMPLATES_DIR, _safe(assessment_id), f"{_safe(doc_type.lower())}.docx"
    )


def save_template(assessment_id: str, doc_type: str, data: bytes) -> str:
    """Persist the uploaded .docx bytes and return the stored path."""
    path = template_path(assessment_id, doc_type)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "wb") as f:
        f.write(data)
    return path


def get_template_path(assessment_id: str, doc_type: str):
    """Return the stored template path if it exists, else None."""
    path = template_path(assessment_id, doc_type)
    return path if os.path.exists(path) else None


def has_template(assessment_id: str, doc_type: str) -> bool:
    return get_template_path(assessment_id, doc_type) is not None


def delete_template(assessment_id: str, doc_type: str) -> bool:
    """Delete a stored template. Returns True if a file was removed."""
    path = get_template_path(assessment_id, doc_type)
    if path:
        os.remove(path)
        # Clean up the assessment dir if now empty.
        parent = os.path.dirname(path)
        try:
            if not os.listdir(parent):
                shutil.rmtree(parent)
        except OSError:
            pass
        return True
    return False
