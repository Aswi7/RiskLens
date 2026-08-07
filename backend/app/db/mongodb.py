from motor.motor_asyncio import AsyncIOMotorClient
from app.core.config import settings

class Database:
    client: AsyncIOMotorClient = None
    db = None

db = Database()

def get_database():
    """Helper dependency to retrieve the active MongoDB database instance."""
    return db.db

async def connect_to_mongo():
    """Initializes the MongoDB Async Client using Motor."""
    db.client = AsyncIOMotorClient(settings.MONGODB_URI)
    db.db = db.client[settings.MONGO_DB_NAME]

async def close_mongo_connection():
    """Closes the MongoDB client connection."""
    if db.client:
        db.client.close()
