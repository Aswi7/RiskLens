from fastapi import APIRouter, Depends, Query
from typing import Optional, Dict, Any
from app.features.auth.dependencies import get_current_user
from app.features.hospitals.schemas import HospitalSearchResponse
from app.features.hospitals.service import fetch_nearby_hospitals

router = APIRouter(tags=["Hospitals & Specialists"])


@router.get("/hospitals/nearby", response_model=HospitalSearchResponse)
async def get_nearby_hospitals(
    lat: Optional[float] = Query(None, ge=-90.0, le=90.0, description="User latitude in degrees (-90 to 90)"),
    lng: Optional[float] = Query(None, ge=-180.0, le=180.0, description="User longitude in degrees (-180 to 180)"),
    location: Optional[str] = Query(None, max_length=200, description="Optional manual location input (city or zip code)"),
    condition: Optional[str] = Query(None, max_length=50, description="'diabetes', 'heart', 'both', or 'general'"),
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """
    GET /hospitals/nearby:
    Accepts lat/lng and user's predicted condition ('diabetes', 'heart', 'both', or 'general').
    Calls Google Places API filtered by 'hospital' plus specialist keywords:
    - Diabetes risk -> Endocrinologist
    - Heart disease risk -> Cardiologist
    - Both elevated -> Returns both specialist types, labeled.
    Returns name, address, distance, rating, and Google Maps directions link for each result.
    Handles API failures (rate limits, missing keys) gracefully.
    """
    hospitals = await fetch_nearby_hospitals(lat=lat, lng=lng, location=location, condition=condition)
    return HospitalSearchResponse(
        condition_filter=condition or "general",
        results_count=len(hospitals),
        hospitals=hospitals
    )
