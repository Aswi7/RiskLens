from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException, status, Request
from app.db.mongodb import get_database
from app.core.security import hash_password, verify_password, create_access_token
from app.features.auth.schemas import UserRegister, Token, UserOut

router = APIRouter(prefix="/auth", tags=["Authentication"])


@router.post("/register", response_model=UserOut, status_code=status.HTTP_201_CREATED)
async def register(user_in: UserRegister):
    db = get_database()
    
    # Check if user email already exists
    existing_user = await db.users.find_one({"email": user_in.email.lower()})
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="User with this email already exists"
        )

    hashed = hash_password(user_in.password)
    created_at = datetime.now(timezone.utc).isoformat()

    user_doc = {
        "email": user_in.email.lower(),
        "password": hashed,
        "full_name": user_in.full_name,
        "created_at": created_at
    }

    result = await db.users.insert_one(user_doc)
    user_id = str(result.inserted_id)

    return UserOut(
        id=user_id,
        email=user_in.email.lower(),
        full_name=user_in.full_name,
        created_at=created_at
    )


@router.post("/login", response_model=Token)
async def login(request: Request):
    """
    Login endpoint supporting both OAuth2 form-data (for Swagger /docs) and JSON bodies.
    """
    content_type = request.headers.get("content-type", "")
    email = None
    password = None

    if "application/x-www-form-urlencoded" in content_type or "multipart/form-data" in content_type:
        form = await request.form()
        email = form.get("username") or form.get("email")
        password = form.get("password")
    else:
        try:
            data = await request.json()
            email = data.get("email") or data.get("username")
            password = data.get("password")
        except Exception:
            pass

    if not email or not password:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email (or username) and password are required"
        )

    email = str(email).lower().strip()
    password = str(password)

    db = get_database()
    user = await db.users.find_one({"email": email})

    if not user or not verify_password(password, user["password"]):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    user_id = str(user["_id"])
    access_token = create_access_token(data={"sub": user_id, "email": user["email"]})

    return Token(access_token=access_token, token_type="bearer")
