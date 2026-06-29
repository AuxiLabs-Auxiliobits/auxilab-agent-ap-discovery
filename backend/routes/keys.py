"""API-key management routes (Lane 2: behind the normal app login).

These endpoints let a logged-in user create / list / revoke API keys for the
public developer API. They are protected by the SAME JWT cookie auth as the
rest of the app (Depends(get_current_user)) -- no new login method is needed to
*manage* keys. The keys themselves are what authenticate the public /v1 API
(Lane 3, see get_api_account).

This router is intentionally self-contained (it does not import main.py) so it
can be included via app.include_router(...) without any circular import.
"""

from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from utils.auth import get_current_user
from utils.api_keys import generate_api_key, hash_api_key, mask_api_key
from db.mongo_client import create_api_key, list_api_keys, revoke_api_key, get_api_usage_stats

router = APIRouter(prefix="/api/keys", tags=["api-keys"])

# The named models a key may be granted access to. Keep in sync with main.py V1_MODELS.
AVAILABLE_MODELS = ["ap_analysis", "ap_pdd-sdd", "ap_bpmn"]


class ApiKeyCreateRequest(BaseModel):
    name: str
    # If omitted/empty, the key is granted access to ALL available models.
    allowed_models: Optional[List[str]] = None


@router.get("")
async def list_keys(user_id: str = Depends(get_current_user)):
    """List the current user's API keys (masked; never returns raw secrets)."""
    return {
        "keys": list_api_keys(user_id),
        "available_models": AVAILABLE_MODELS,
        "usage": get_api_usage_stats(user_id),
    }



@router.post("")
async def create_key(payload: ApiKeyCreateRequest, user_id: str = Depends(get_current_user)):
    """Create a new API key. The raw secret is returned EXACTLY ONCE here."""
    name = (payload.name or "").strip() or "Untitled key"

    # Validate / default the requested model scopes.
    requested = payload.allowed_models or []
    models = [m for m in requested if m in AVAILABLE_MODELS]
    if not models:
        models = list(AVAILABLE_MODELS)

    raw_key = generate_api_key()
    key_hash = hash_api_key(raw_key)
    display = mask_api_key(raw_key)

    key_id = create_api_key(user_id, name, key_hash, display, models, secret=raw_key)
    if not key_id:
        raise HTTPException(status_code=500, detail="Failed to create API key (database unavailable).")

    # NOTE: 'secret' is the only time the raw key is ever exposed.
    return {
        "id": key_id,
        "name": name,
        "secret": raw_key,
        "display": display,
        "allowed_models": models,
    }


@router.delete("/{key_id}")
async def delete_key(key_id: str, user_id: str = Depends(get_current_user)):
    """Revoke (deactivate) an API key the user owns."""
    ok = revoke_api_key(user_id, key_id)
    if not ok:
        raise HTTPException(status_code=404, detail="API key not found.")
    return {"status": "revoked", "id": key_id}
