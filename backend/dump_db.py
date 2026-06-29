import os
from dotenv import load_dotenv
load_dotenv()
from db.mongo_client import get_database

db = get_database()
chat_sessions = list(db['live_chat_sessions'].find({}))
for s in chat_sessions:
    print(f"--- User {s.get('user_id')} ---")
    for msg in s.get("messages", []):
        print(f"{msg.get('role')}: {msg.get('content')}")
