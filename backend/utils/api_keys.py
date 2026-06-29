"""API key helpers for the public developer API (\"named models\").

Keys follow the format:  ap_sk_<urlsafe-token>
  - ap_     -> AlphaFold namespace (project convention)
  - sk_     -> \"secret key\"
  - token   -> cryptographically-random secret

We NEVER store the raw secret. Only a SHA-256 hash is persisted in MongoDB,
plus a masked \"display\" string so the user can recognise the key in the UI.
The raw secret is shown exactly once, at creation time.

This module is intentionally dependency-free (pure stdlib) so it can be reused
from anywhere (routes, auth dependency, scripts) without circular imports.
"""

import hashlib
import secrets

# Project-wide prefix. \"ap\" = AlphaFold. Keeping the prefix on the raw key lets
# us (and the user) instantly recognise an AlphaFold key, and lets us add
# server-side validation/rotation later without guessing.
KEY_PREFIX = "ap_sk_"


def generate_api_key() -> str:
    """Generate a new raw API secret, e.g. 'ap_sk_Xy9...'. Shown to the user ONCE."""
    token = secrets.token_urlsafe(32)
    return f"{KEY_PREFIX}{token}"


def hash_api_key(raw_key: str) -> str:
    """Return the SHA-256 hex digest of a raw key. This is what we store + look up by."""
    return hashlib.sha256(raw_key.encode("utf-8")).hexdigest()


def mask_api_key(raw_key: str) -> str:
    """Return a masked, display-only version of a raw key, e.g. 'ap_sk_Xy...8fa2'.

    Safe to store and show in the UI because it reveals neither the full token
    nor enough entropy to reconstruct it.
    """
    if not raw_key:
        return ""
    if len(raw_key) <= 12:
        return raw_key
    return f"{raw_key[:9]}...{raw_key[-4:]}"
