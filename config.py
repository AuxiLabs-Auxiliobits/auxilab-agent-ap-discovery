"""Central configuration for the AP Process Discovery Agent.

Everything is read from environment variables (see .env.example). The only hard
requirement to run the tool is ONE LLM key:

    LLM_PROVIDER=gemini   + GEMINI_API_KEY
    LLM_PROVIDER=anthropic + ANTHROPIC_API_KEY

No databases, no OAuth, no cloud services. The deterministic ROI module runs
entirely offline in Python.
"""
import os

from dotenv import load_dotenv

load_dotenv()

# ── LLM provider selection ────────────────────────────────────────────
# Which LLM backs the pipeline. Either "gemini" or "anthropic".
LLM_PROVIDER = os.getenv("LLM_PROVIDER", "gemini").strip().lower()

# --- Google Gemini ---
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-2.0-flash")

# --- Anthropic Claude ---
ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY", "")
ANTHROPIC_MODEL = os.getenv("ANTHROPIC_MODEL", "claude-3-5-sonnet-latest")


def active_model() -> str:
    """Return the model id for the currently selected provider."""
    return ANTHROPIC_MODEL if LLM_PROVIDER == "anthropic" else GEMINI_MODEL


def validate_llm_config() -> None:
    """Raise a clear error if the selected provider has no API key."""
    if LLM_PROVIDER == "anthropic":
        if not ANTHROPIC_API_KEY:
            raise RuntimeError(
                "LLM_PROVIDER=anthropic but ANTHROPIC_API_KEY is not set. "
                "Copy .env.example to .env and add your Anthropic key."
            )
    elif LLM_PROVIDER == "gemini":
        if not GEMINI_API_KEY:
            raise RuntimeError(
                "LLM_PROVIDER=gemini but GEMINI_API_KEY is not set. "
                "Copy .env.example to .env and add your Gemini key."
            )
    else:
        raise RuntimeError(
            f"Unknown LLM_PROVIDER '{LLM_PROVIDER}'. Use 'gemini' or 'anthropic'."
        )


# ── Input handling ────────────────────────────────────────────────────
# Documents the tool can read directly (no external services required).
SUPPORTED_DOC_EXTENSIONS = {".docx"}
SUPPORTED_PDF_EXTENSIONS = {".pdf"}
SUPPORTED_TEXT_EXTENSIONS = {".txt", ".md"}
ALL_SUPPORTED_EXTENSIONS = (
    SUPPORTED_DOC_EXTENSIONS | SUPPORTED_PDF_EXTENSIONS | SUPPORTED_TEXT_EXTENSIONS
)


# ── Deterministic ROI: optional live pricing (Gemini only, off by default) ──
# When false (default) the ROI module uses its static, offline benchmark table
# converted at reference FX — fully deterministic and network-free. When true
# AND the provider is Gemini, component unit costs are fetched via Google-Search
# grounding. Anthropic has no grounded-search equivalent here, so live pricing
# is automatically ignored for Anthropic and the deterministic fallback is used.
ENABLE_LIVE_PRICING = (
    os.getenv("ENABLE_LIVE_PRICING", "false").strip().lower() in ("1", "true", "yes", "on")
    and LLM_PROVIDER == "gemini"
)
DEFAULT_PRICING_REGION = os.getenv("DEFAULT_PRICING_REGION", "US")
PRICING_CACHE_TTL_HOURS = int(os.getenv("PRICING_CACHE_TTL_HOURS", "168"))  # 7 days
