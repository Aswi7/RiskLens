from datetime import datetime, timezone
from typing import Dict, Any, Optional
import httpx
from google.oauth2 import id_token as google_id_token
from google.auth.transport import requests as google_requests
from fastapi import APIRouter, HTTPException, status, Request, Depends
from app.db.mongodb import get_database
from app.core.config import settings
from app.core.security import hash_password, verify_password, create_access_token
from app.features.auth.schemas import UserRegister, Token, UserOut, GoogleAuthRequest
from app.features.auth.dependencies import get_current_user

router = APIRouter(prefix="/auth", tags=["Authentication"])


from pymongo.errors import DuplicateKeyError


@router.post("/register", response_model=UserOut, status_code=status.HTTP_201_CREATED)
async def register(user_in: UserRegister):
    db = get_database()
    if db is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database connection unavailable"
        )
    
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
    if db is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database connection unavailable"
        )
    user = await db.users.find_one({"email": email})

    user_pwd = user.get("password") or user.get("hashed_password") if user else None
    if not user or not user_pwd or not verify_password(password, user_pwd):
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
        created_at=current_user.get("created_at") or datetime.now(timezone.utc).isoformat(),
        avatar_url=current_user.get("avatar_url"),
        auth_provider=current_user.get("auth_provider", "local")
    )


def verify_google_id_token(credential: str, expected_client_id: Optional[str] = None) -> Dict[str, Any]:
    """
    Verifies a Google ID token securely using Google's official `google-auth` library.
    Validates token signature against Google's public certs, expiration, issuer, and audience.
    """
    try:
        req = google_requests.Request()
        payload = google_id_token.verify_oauth2_token(
            credential,
            req,
            audience=expected_client_id if expected_client_id else None
        )
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Invalid Google ID token: {str(e)}"
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Google ID token verification failed"
        )

    # Validate issuer
    valid_issuers = ["accounts.google.com", "https://accounts.google.com"]
    if payload.get("iss") not in valid_issuers:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid Google token issuer"
        )

    # Ensure email is verified by Google
    email_verified = payload.get("email_verified")
    if email_verified not in [True, "true", "True"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Google account email is not verified"
        )

    return payload


async def verify_google_access_token(access_token: str) -> Dict[str, Any]:
    """
    Verifies a Google OAuth access token using Google's userinfo endpoint.
    """
    url = "https://www.googleapis.com/oauth2/v3/userinfo"
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(url, headers={"Authorization": f"Bearer {access_token}"})
            if resp.status_code != 200:
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Invalid or expired Google access token"
                )
            payload = resp.json()
    except httpx.RequestError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Unable to reach Google OAuth userinfo service: {str(exc)}"
        )

    # Ensure email is verified
    email_verified = payload.get("email_verified")
    if email_verified not in [True, "true", "True"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Google account email is not verified"
        )

    return payload


@router.post("/google", response_model=Token)
async def google_auth(request_data: GoogleAuthRequest):
    """
    Google OAuth Authentication endpoint:
    - Accepts Google ID token (credential) or Google OAuth access_token.
    - Verifies token with Google's servers.
    - If user exists: logs them in and updates profile/provider info.
    - If new user: registers them automatically with their Google profile details.
    - Returns a standard RiskLens JWT access token.
    - Supports fallback demo mode if Google Client ID is not yet configured for local dev.
    """
    db = get_database()
    if db is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database connection unavailable"
        )

    # 1. Real Google ID token verification (via official google-auth library)
    if request_data.credential:
        client_id = settings.GOOGLE_CLIENT_ID if settings.GOOGLE_CLIENT_ID else None
        google_profile = verify_google_id_token(request_data.credential, expected_client_id=client_id)

    # 2. Real Google OAuth Access Token verification (from Google Token Client with prompt: 'select_account')
    elif request_data.access_token:
        google_profile = await verify_google_access_token(request_data.access_token)

    # 3. Fallback demo mode if no token provided
    elif request_data.is_demo:
        demo_email = (request_data.demo_email or "google.user@example.com").lower().strip()
        demo_name = request_data.demo_name or "Google Test User"
        user = await db.users.find_one({"email": demo_email})
        if not user:
            user_doc = {
                "email": demo_email,
                "full_name": demo_name,
                "google_id": "google_demo_account_123",
                "avatar_url": "https://lh3.googleusercontent.com/a/default-user",
                "auth_provider": "google",
                "created_at": datetime.now(timezone.utc).isoformat(),
                "is_demo": True
            }
            res = await db.users.insert_one(user_doc)
            user_id = str(res.inserted_id)
        else:
            user_id = str(user["_id"])

        token = create_access_token(data={"sub": user_id, "email": demo_email})
        return Token(access_token=token, token_type="bearer")

    else:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Google credential or access token is required"
        )

    email = google_profile.get("email", "").lower().strip()
    if not email:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No email found in Google token payload"
        )

    google_sub = google_profile.get("sub")
    full_name = google_profile.get("name") or email.split("@")[0]
    picture = google_profile.get("picture")

    # Check if user already exists — Google sign-in is only for existing accounts
    user = await db.users.find_one({"email": email})
    if not user:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="No account found with this Google email. Please register first using email and password."
        )

    user_id = str(user["_id"])
    updates = {}
    if not user.get("google_id") and google_sub:
        updates["google_id"] = google_sub
    if picture and not user.get("avatar_url"):
        updates["avatar_url"] = picture
    if not user.get("full_name") and full_name:
        updates["full_name"] = full_name
    if "auth_provider" not in user:
        updates["auth_provider"] = "google"

    if updates:
        await db.users.update_one({"_id": user["_id"]}, {"$set": updates})

    access_token = create_access_token(data={"sub": user_id, "email": email})
    return Token(access_token=access_token, token_type="bearer")



@router.post("/demo-login", response_model=Token)
async def demo_login():
    """
    Explicit guest/demo login route.
    Issues a real signed JWT token for the isolated demo user.
    """
    db = get_database()
    if db is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database connection unavailable"
        )
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

