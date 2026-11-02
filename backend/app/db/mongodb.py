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
    """Initializes the MongoDB Async Client using Motor with optimized pool limits and timeouts."""
    db.client = AsyncIOMotorClient(
        settings.MONGODB_URI,
        maxPoolSize=10,
        minPoolSize=1,
        maxIdleTimeMS=30000,
        connectTimeoutMS=5000,
        serverSelectionTimeoutMS=5000,
    )
    db_name = (settings.MONGO_DB_NAME or "risklens_db").strip()
    if "." in db_name:
        db_name = db_name.split(".")[0].strip() or "risklens_db"
    db.db = db.client[db_name]
    try:
        await db.db.users.create_index("email", unique=True)
    except Exception:
        pass



async def close_mongo_connection():
    """Closes the MongoDB client connection."""
    if db.client:
        db.client.close()
