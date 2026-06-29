import os
import redis

# Use the REDIS_URL from environment variables, or a default local fallback
REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379")

# Create a global Redis connection pool
try:
    redis_client = redis.from_url(REDIS_URL, decode_responses=True)
except Exception as e:
    print(f"Failed to connect to Redis: {e}")
    redis_client = None

def get_redis_client():
    return redis_client
