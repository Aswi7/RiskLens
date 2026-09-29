from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from bson import ObjectId
from app.core.security import decode_access_token
from app.db.mongodb import get_database

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login", auto_error=False)


DEMO_USER = {
    "id": "demo_user",
    "_id": "demo_user",
    "email": "demo@risklens.local",
    "full_name": "Demo User"
}


async def get_current_user(token: str = Depends(oauth2_scheme)):
    if not token:
        return DEMO_USER

    payload = decode_access_token(token)
    if payload is None:
        return DEMO_USER

    user_id: str = payload.get("sub")
    if user_id is None:
        return DEMO_USER

    db = get_database()
    
    # Try finding user by ObjectId or by string id / email
    user = None
    if ObjectId.is_valid(user_id):
        user = await db.users.find_one({"_id": ObjectId(user_id)})
    if not user:
        user = await db.users.find_one({"email": user_id})

    if user is None:
        return DEMO_USER

    # Attach string id for easy access
    user["id"] = str(user["_id"])
    return user
