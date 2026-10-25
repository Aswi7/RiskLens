from datetime import datetime, timezone
from typing import Dict, Any
from fastapi import APIRouter, HTTPException, status, Request, Depends
from app.db.mongodb import get_database
from app.core.security import hash_password, verify_password, create_access_token
from app.features.auth.schemas import UserRegister, Token, UserOut
from app.features.auth.dependencies import get_current_user

router = APIRouter(prefix="/auth", tags=["Authentication"])


from pymongo.errors import DuplicateKeyError


@router.post("/register", response_model=UserOut, status_code=status.HTTP_201_CREATED)
async def register(user_in: UserRegister):
    db = get_database()
    
    # Check if user email already exists
    existing_user = await db.users.find_one({"email": user_in.email.lower()})
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
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

    try:
        result = await db.users.insert_one(user_doc)
    except DuplicateKeyError:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="User with this email already exists"
        )

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


@router.get("/me", response_model=UserOut)
async def get_me(current_user: Dict[str, Any] = Depends(get_current_user)):
    """Retrieves the profile of the currently authenticated user."""
    return UserOut(
        id=current_user["id"],
        email=current_user["email"],
        full_name=current_user.get("full_name"),
        created_at=current_user.get("created_at") or datetime.now(timezone.utc).isoformat()
    )


@router.post("/demo-login", response_model=Token)
async def demo_login():
    """
    Explicit guest/demo login route.
    Issues a real signed JWT token for the isolated demo user.
    """
    db = get_database()
    demo_email = "demo@risklens.com"
    demo_user = await db.users.find_one({"email": demo_email})
    if not demo_user:
        hashed = hash_password("DemoPassword123!")
        doc = {
            "email": demo_email,
            "password": hashed,
            "full_name": "Demo Guest User",
            "created_at": datetime.now(timezone.utc).isoformat(),
            "is_demo": True
        }
        res = await db.users.insert_one(doc)
        user_id = str(res.inserted_id)
    else:
        user_id = str(demo_user["_id"])

    access_token = create_access_token(data={"sub": user_id, "email": demo_email})
    return Token(access_token=access_token, token_type="bearer")

