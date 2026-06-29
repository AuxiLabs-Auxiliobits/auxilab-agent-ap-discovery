import os
from datetime import datetime
from bson.objectid import ObjectId
from pymongo import MongoClient
from pymongo.errors import ConnectionFailure
import certifi
from config import MONGODB_URI

# Global client
client = None
db = None
collection = None

def get_db():
    """Initialize and return the MongoDB collection."""
    global client, db, collection
    
    if not MONGODB_URI:
        print("Warning: MONGODB_URI is not set. Database operations will be skipped.")
        return None

    if client is None:
        try:
            client = MongoClient(MONGODB_URI, tlsCAFile=certifi.where(), serverSelectionTimeoutMS=5000)
            # Verify connection
            client.admin.command('ping')
            db = client["AlphaFold"]
            collection = db["assessments"]
            print("Successfully connected to MongoDB.")
        except ConnectionFailure as e:
            print(f"Failed to connect to MongoDB: {e}")
            client = None
            return None
            
    return collection

def get_database():
    """Initialize and return the MongoDB database object."""
    get_db() # Ensures the connection is initialized
    return db

def save_assessment(assessment_data: dict, user_id: str) -> str:
    """Save an assessment to MongoDB and return its ID."""
    coll = get_db()
    if coll is None:
        return ""
        
    # Add timestamp
    document = assessment_data.copy()
    document["created_at"] = datetime.utcnow()
    document["user_id"] = user_id
    
    # Insert
    result = coll.insert_one(document)
    return str(result.inserted_id)

def get_all_assessments(user_id: str) -> list:
    """Get a summary of all past assessments (excluding large text fields)."""
    coll = get_db()
    if coll is None:
        return []
        
    # Fetch all, sorted by newest first, but only pull necessary fields for sidebar
    projection = {
        "_id": 1,
        "created_at": 1,
        "original_filename": 1,
        "input_format": 1,
        "executive_summary": 1,
        "process_map": 1,
        "opportunities": 1
    }
    
    cursor = coll.find({"user_id": user_id}, projection).sort("created_at", -1)
    
    results = []
    for doc in cursor:
        # Calculate some summary stats for the sidebar
        process_count = len(doc.get("process_map", []))
        opp_count = len(doc.get("opportunities", []))
        
        # Get highest ACS score
        highest_acs = 0
        for opp in doc.get("opportunities", []):
            if opp.get("acs", 0) > highest_acs:
                highest_acs = opp.get("acs", 0)
                
        # Generate a title
        title = doc.get("original_filename")
        if not title:
            # Fallback title from summary
            summary = doc.get("executive_summary", "")
            title = "Text Analysis" if doc.get("input_format") == "text" else "Analysis"
            
        results.append({
            "id": str(doc["_id"]),
            "title": title,
            "created_at": doc.get("created_at", datetime.utcnow()).isoformat() + "Z",
            "step_count": process_count,
            "highest_acs": highest_acs,
            "opportunity_count": opp_count
        })
        
    return results

def sanitize_for_json(obj):
    """Recursively removes or converts binary data to prevent JSON serialization errors."""
    if isinstance(obj, bytes):
        return "<binary_data>"
    elif isinstance(obj, dict):
        return {k: sanitize_for_json(v) for k, v in obj.items()}
    elif isinstance(obj, list):
        return [sanitize_for_json(v) for v in obj]
    return obj

def get_assessment(assessment_id: str, user_id: str) -> dict:
    """Get a complete assessment by ID."""
    coll = get_db()
    if coll is None:
        return None
        
    try:
        doc = coll.find_one({"_id": ObjectId(assessment_id), "user_id": user_id})
        if doc:
            doc["id"] = str(doc["_id"])
            del doc["_id"]
            if "created_at" in doc:
                doc["created_at"] = doc["created_at"].isoformat() + "Z"
            return sanitize_for_json(doc)
        return None
    except Exception:
        return None

def delete_assessment(assessment_id: str, user_id: str) -> bool:
    """Delete an assessment by ID and user ID."""
    coll = get_db()
    if coll is None:
        return False
        
    try:
        result = coll.delete_one({"_id": ObjectId(assessment_id), "user_id": user_id})
        return result.deleted_count > 0
    except Exception:
        return False

def update_assessment_bpmn(assessment_id: str, user_id: str, bpmn_xml: str) -> bool:
    """Update the BPMN diagram XML of an assessment."""
    coll = get_db()
    if coll is None:
        return False
        
    try:
        result = coll.update_one(
            {"_id": ObjectId(assessment_id), "user_id": user_id},
            {"$set": {"bpmn_xml": bpmn_xml}}
        )
        return result.modified_count > 0 or result.matched_count > 0
    except Exception:
        return False

def update_assessment_chat(assessment_id: str, user_id: str, chat_history: list) -> bool:
    """Update the chat history of an assessment."""
    coll = get_db()
    if coll is None:
        return False
        
    try:
        result = coll.update_one(
            {"_id": ObjectId(assessment_id), "user_id": user_id},
            {"$set": {"chat_history": chat_history}}
        )
        return result.modified_count > 0 or result.matched_count > 0
    except Exception:
        return False

def update_assessment_hourly_rate(assessment_id: str, user_id: str, hourly_rate: float) -> bool:
    """Update the hourly rate for an assessment."""
    coll = get_db()
    if coll is None:
        return False
        
    try:
        result = coll.update_one(
            {"_id": ObjectId(assessment_id), "user_id": user_id},
            {"$set": {"hourly_rate": hourly_rate}}
        )
        return result.modified_count > 0 or result.matched_count > 0
    except Exception:
        return False

def update_assessment_audio_script(assessment_id: str, user_id: str, language: str, script: str) -> bool:
    """Update the audio script for a specific language in an assessment."""
    coll = get_db()
    if coll is None:
        return False
        
    try:
        # We use dot notation to update a specific key inside the `audio_scripts` dictionary
        field_path = f"audio_scripts.{language}"
        result = coll.update_one(
            {"_id": ObjectId(assessment_id), "user_id": user_id},
            {"$set": {field_path: script}}
        )
        return result.modified_count > 0 or result.matched_count > 0
    except Exception:
        return False

def _push_global_history(coll, assessment):
    """Takes a snapshot of the entire assessment (minus metadata) and pushes it to global_history."""
    if not assessment: return
    snapshot = {k: v for k, v in assessment.items() if k not in ["_id", "user_id", "global_history", "created_at", "updated_at"]}
    coll.update_one(
        {"_id": assessment["_id"]},
        {"$push": {"global_history": {"$each": [snapshot], "$slice": -5}}}
    )

def update_assessment_document(assessment_id: str, user_id: str, doc_type: str, content: str) -> bool:
    """Save or replace a PDD/SDD document markdown in an assessment, saving a global snapshot."""
    coll = get_db()
    if coll is None:
        return False
        
    try:
        assessment = coll.find_one({"_id": ObjectId(assessment_id), "user_id": user_id})
        if assessment:
            _push_global_history(coll, assessment)
            
        field_path = f"documents.{doc_type}"
        result = coll.update_one({"_id": ObjectId(assessment_id), "user_id": user_id}, {"$set": {field_path: content}})
        return result.modified_count > 0 or result.matched_count > 0
    except Exception:
        return False

def revert_global_assessment(assessment_id: str, user_id: str) -> dict:
    """Pop the last global snapshot from history and restore it. Returns the restored assessment."""
    coll = get_db()
    if coll is None:
        return None
        
    try:
        assessment = coll.find_one({"_id": ObjectId(assessment_id), "user_id": user_id})
        if not assessment:
            return None
            
        history = assessment.get("global_history", [])
        if not history:
            return None
            
        previous_snapshot = history[-1]
        new_history = history[:-1]
        
        base_doc = {k: v for k, v in assessment.items() if k in ["_id", "user_id", "created_at", "updated_at"]}
        restored_doc = {**base_doc, **previous_snapshot, "global_history": new_history}
        
        coll.replace_one({"_id": ObjectId(assessment_id), "user_id": user_id}, restored_doc)
        
        restored_doc["id"] = str(restored_doc["_id"])
        del restored_doc["_id"]
        return sanitize_for_json(restored_doc)
    except Exception:
        return None

def update_assessment_data(assessment_id: str, user_id: str, update_fields: dict) -> bool:
    """Update multiple fields of an assessment at once, saving a global snapshot."""
    coll = get_db()
    if coll is None:
        return False
        
    try:
        assessment = coll.find_one({"_id": ObjectId(assessment_id), "user_id": user_id})
        if assessment:
            _push_global_history(coll, assessment)

        # Never override _id, user_id, timestamps, or history
        safe_fields = {k: v for k, v in update_fields.items() if k not in ["_id", "user_id", "id", "created_at", "updated_at", "global_history"]}
        if not safe_fields:
            return True
            
        result = coll.update_one(
            {"_id": ObjectId(assessment_id), "user_id": user_id},
            {"$set": safe_fields}
        )
        return result.modified_count > 0 or result.matched_count > 0
    except Exception:
        return False


def save_live_chat_session(user_id: str, messages: list, language: str = "English") -> bool:
    """Save or update the temporary live chat session for a user."""
    database = get_database()
    if database is None:
        return False
    try:
        coll = database["live_chat_sessions"]
        coll.update_one(
            {"user_id": user_id},
            {"$set": {"messages": messages, "language": language, "updated_at": datetime.utcnow()}},
            upsert=True
        )
        return True
    except Exception as e:
        print(f"Error saving live chat session: {e}")
        return False


def get_live_chat_session(user_id: str) -> dict:
    """Retrieve the temporary live chat session for a user."""
    database = get_database()
    if database is None:
        return {"messages": [], "language": "English"}
    try:
        coll = database["live_chat_sessions"]
        doc = coll.find_one({"user_id": user_id})
        if doc:
            return {"messages": doc.get("messages", []), "language": doc.get("language", "English")}
        return {"messages": [], "language": "English"}
    except Exception as e:
        print(f"Error retrieving live chat session: {e}")
        return {"messages": [], "language": "English"}


def delete_live_chat_session(user_id: str) -> bool:
    """Delete the temporary live chat session for a user."""
    database = get_database()
    if database is None:
        return False
    try:
        coll = database["live_chat_sessions"]
        coll.delete_one({"user_id": user_id})
        return True
    except Exception as e:
        print(f"Error deleting live chat session: {e}")
        return False


# ============================================================
# API keys (public developer API)
# ============================================================
def get_api_keys_collection():
    """Return the api_keys collection, or None if the database is unavailable."""
    database = get_database()
    if database is None:
        return None
    return database["api_keys"]


def create_api_key(user_id: str, name: str, key_hash: str, display: str, allowed_models: list, secret: str = None) -> str:
    """Insert a new API key document. Returns the new key id (str) or None."""
    coll = get_api_keys_collection()
    if coll is None:
        return None
    try:
        doc = {
            "user_id": user_id,
            "name": name,
            "key_hash": key_hash,
            "display": display,
            "secret": secret,
            "allowed_models": allowed_models,
            "active": True,
            "created_at": datetime.utcnow(),
            "last_used_at": None,
        }
        result = coll.insert_one(doc)
        return str(result.inserted_id)
    except Exception as e:
        print(f"Error creating API key: {e}")
        return None


def list_api_keys(user_id: str) -> list:
    """Return the user's API keys (newest first)."""
    coll = get_api_keys_collection()
    if coll is None:
        return []
    try:
        out = []
        for doc in coll.find({"user_id": user_id}).sort("created_at", -1):
            created = doc.get("created_at")
            last_used = doc.get("last_used_at")
            out.append({
                "id": str(doc["_id"]),
                "name": doc.get("name", ""),
                "display": doc.get("display", ""),
                "secret": doc.get("secret") or doc.get("display", ""),
                "allowed_models": doc.get("allowed_models", []),
                "active": doc.get("active", True),
                "created_at": (created.isoformat() + "Z") if created else None,
                "last_used_at": (last_used.isoformat() + "Z") if last_used else None,
            })
        return out
    except Exception as e:
        print(f"Error listing API keys: {e}")
        return []


def get_api_key_by_hash(key_hash: str):
    """Look up an ACTIVE API key by its hash. Returns a minimal account dict or None."""
    coll = get_api_keys_collection()
    if coll is None:
        return None
    try:
        doc = coll.find_one({"key_hash": key_hash, "active": True})
        if not doc:
            return None
        return {
            "id": str(doc["_id"]),
            "user_id": doc.get("user_id"),
            "name": doc.get("name", ""),
            "allowed_models": doc.get("allowed_models", []),
            "active": doc.get("active", True),
        }
    except Exception as e:
        print(f"Error fetching API key: {e}")
        return None


def revoke_api_key(user_id: str, key_id: str) -> bool:
    """Deactivate an API key the user owns. Returns True if a matching key was found."""
    coll = get_api_keys_collection()
    if coll is None:
        return False
    try:
        result = coll.update_one(
            {"_id": ObjectId(key_id), "user_id": user_id},
            {"$set": {"active": False}},
        )
        return result.modified_count > 0 or result.matched_count > 0
    except Exception as e:
        print(f"Error revoking API key: {e}")
        return False


def touch_api_key_last_used(key_id: str) -> None:
    """Best-effort update of last_used_at. Never raises."""
    coll = get_api_keys_collection()
    if coll is None:
        return
    try:
        coll.update_one(
            {"_id": ObjectId(key_id)},
            {"$set": {"last_used_at": datetime.utcnow()}},
        )
    except Exception:
        pass


# In-memory tracking fallback when MongoDB is disconnected/unavailable
_api_usage_memory = {}


def get_api_usage_collection():
    """Return the api_usage collection, or None if the database is unavailable."""
    database = get_database()
    if database is None:
        return None
    return database["api_usage"]


def get_api_usage_stats(user_id: str, limit: int = 7) -> dict:
    """Return current API usage statistics for a user for today (UTC)."""
    coll = get_api_usage_collection()
    now = datetime.utcnow()
    start_of_day = now.replace(hour=0, minute=0, second=0, microsecond=0)
    date_key = start_of_day.strftime("%Y-%m-%d")

    db_count = 0
    if coll is not None:
        try:
            db_count = coll.count_documents({
                "user_id": user_id,
                "timestamp": {"$gte": start_of_day}
            })
        except Exception as e:
            print(f"Error fetching API usage count: {e}")

    mem_count = _api_usage_memory.get(user_id, {}).get(date_key, 0)
    total_used = max(db_count, mem_count)
    return {
        "used_today": total_used,
        "limit_per_day": limit,
        "remaining": max(0, limit - total_used)
    }


def check_and_record_api_usage(user_id: str, limit: int = 7) -> tuple:
    """Check if user has exceeded the daily API limit, and record the request if allowed.

    Returns (allowed: bool, current_used: int, limit: int).
    """
    coll = get_api_usage_collection()
    now = datetime.utcnow()
    start_of_day = now.replace(hour=0, minute=0, second=0, microsecond=0)
    date_key = start_of_day.strftime("%Y-%m-%d")

    db_count = 0
    if coll is not None:
        try:
            db_count = coll.count_documents({
                "user_id": user_id,
                "timestamp": {"$gte": start_of_day}
            })
        except Exception as e:
            print(f"Error checking API usage in DB: {e}")

    mem_user = _api_usage_memory.setdefault(user_id, {})
    mem_count = mem_user.get(date_key, 0)
    current_used = max(db_count, mem_count)

    if current_used >= limit:
        return (False, current_used, limit)

    new_count = current_used + 1
    mem_user[date_key] = new_count

    if coll is not None:
        try:
            coll.insert_one({
                "user_id": user_id,
                "timestamp": now
            })
        except Exception as e:
            print(f"Error recording API usage in DB: {e}")

    return (True, new_count, limit)

