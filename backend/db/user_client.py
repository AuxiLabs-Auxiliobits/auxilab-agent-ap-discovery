from typing import Optional
from bson.objectid import ObjectId
from .mongo_client import get_database

def get_user_by_id(user_id: str) -> Optional[dict]:
    """Find a user by their database ID."""
    users_coll = get_users_collection()
    if users_coll is None:
        return None
    try:
        user = users_coll.find_one({"_id": ObjectId(user_id)})
        if user:
            user["id"] = str(user["_id"])
            del user["_id"]
        return user
    except Exception:
        return None

def get_users_collection():
    """Helper to get the users collection."""
    db = get_database()
    return db["users"] if db is not None else None

def get_user_by_email(email: str) -> Optional[dict]:
    """Find a user by their email address."""
    users_coll = get_users_collection()
    if users_coll is None:
        return None
        
    return users_coll.find_one({"email": email})

def create_user(user_data: dict) -> str:
    """Insert a new user document into the database."""
    users_coll = get_users_collection()
    if users_coll is None:
        raise Exception("Database connection failed")
        
    result = users_coll.insert_one(user_data)
    return str(result.inserted_id)

def update_password(email: str, hashed_password: str) -> bool:
    """Update a user's password."""
    users_coll = get_users_collection()
    if users_coll is None:
        return False
        
    result = users_coll.update_one(
        {"email": email},
        {"$set": {"password": hashed_password}}
    )
    return result.modified_count > 0
