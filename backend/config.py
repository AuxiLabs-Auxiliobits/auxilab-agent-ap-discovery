import os
from dotenv import load_dotenv

load_dotenv()

# Gemini API
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
# Use GEMINI_API_KEY for Live Chat as it supports the Live API and has active credits
GEMINI_LIVE_API_KEY = os.getenv("GEMINI_API_KEY")
GEMINI_MODEL_FAST = "gemini-3.5-flash"      # For scoring, pattern mapping
GEMINI_MODEL_QUALITY = "gemini-3.1"          # For extraction, summaries
GEMINI_MODEL = GEMINI_MODEL_FAST             # Default model to use

# MongoDB
MONGODB_URI = os.getenv("MONGODB_URI", "")

# Google OAuth
GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID")

# Upload limits
MAX_UPLOAD_SIZE_MB = int(os.getenv("MAX_UPLOAD_SIZE_MB", "100"))

# Supported file extensions
SUPPORTED_AUDIO_EXTENSIONS = {".mp3", ".wav", ".m4a", ".ogg", ".webm"}
SUPPORTED_VIDEO_EXTENSIONS = {".mp4", ".webm", ".mov"}
SUPPORTED_DOC_EXTENSIONS = {".docx"}
SUPPORTED_TEXT_EXTENSIONS = {".txt"}

ALL_SUPPORTED_EXTENSIONS = (
    SUPPORTED_AUDIO_EXTENSIONS
    | SUPPORTED_VIDEO_EXTENSIONS
    | SUPPORTED_DOC_EXTENSIONS
    | SUPPORTED_TEXT_EXTENSIONS
)

# --- Live pricing (Google Search grounded) ---
# When true, component costs are fetched in the project's own currency via
# Gemini + Google Search grounding (cached). When false (default), the static
# benchmark table converted at reference FX is used (fully deterministic).
ENABLE_LIVE_PRICING = os.getenv("ENABLE_LIVE_PRICING", "false").strip().lower() in ("1", "true", "yes", "on")
DEFAULT_PRICING_REGION = os.getenv("DEFAULT_PRICING_REGION", "US")
PRICING_CACHE_TTL_HOURS = int(os.getenv("PRICING_CACHE_TTL_HOURS", "168"))  # 7 days
