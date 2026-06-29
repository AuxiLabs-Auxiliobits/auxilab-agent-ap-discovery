"""Pytest configuration for the AP Process Discovery Agent test suite.

- Makes the backend package importable (so `from graph...` / `from utils...` work).
- Sets dummy API keys so importing modules that construct a Gemini client at
  import time does not fail. No real key is needed: every test that touches a
  pipeline node MOCKS the Gemini calls, so nothing ever hits the network.
"""
import os
import sys

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BACKEND_DIR = os.path.join(REPO_ROOT, "backend")
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)

# Dummy keys so `genai.Client(api_key=...)` constructs without a real secret.
os.environ.setdefault("GEMINI_API_KEY", "test-dummy-key")
os.environ.setdefault("GEMINI_LIVE_API_KEY", "test-dummy-key")
