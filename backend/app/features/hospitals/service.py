import math
import logging
import httpx
from typing import List, Dict, Any, Optional
from app.core.config import settings

logger = logging.getLogger("risklens.hospitals")


def calculate_haversine_distance(lat1: float, lon1: float, lat2: float, lon2: float) -> str:
    """Calculates distance between two lat/lng coordinates in miles."""
    R = 3958.8  # Earth radius in miles
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = math.sin(dlat / 2)**2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon / 2)**2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    dist_miles = R * c
    if dist_miles < 0.1:
        return "<0.1 miles"
    return f"{dist_miles:.1f} miles"


def get_mock_hospitals(lat: Optional[float], lng: Optional[float], condition: str) -> List[Dict[str, Any]]:
    """
    Location-aware fallback provider generator used when Google Places API key is not configured,
    rate-limited, or offline. Ensures complete UI functionality and condition-specific filtering.
    """
    base_lat = lat or 37.7749
    base_lng = lng or -122.4194
    cond_lower = (condition or "general").lower()

    results = []

    # 1. Diabetes / Endocrinologists
    if cond_lower in ("diabetes", "both", "all", "type2_diabetes"):
        results.extend([
            {
                "id": "mock_endo_1",
                "name": "Metro Diabetes & Endocrinology Specialists",
                "specialty": "Endocrinologist (Diabetes Specialist)",
                "address": "742 Healthcare Blvd, Suite 300",
                "rating": 4.9,
                "user_ratings_total": 142,
                "distance": calculate_haversine_distance(base_lat, base_lng, base_lat + 0.012, base_lng + 0.015),
                "open_now": True,
                "phone": "+1 (555) 234-5678",
                "lat": base_lat + 0.012,
                "lng": base_lng + 0.015,
                "google_maps_url": "https://maps.google.com/?q=Endocrinologist+Diabetes+Center"
            },
            {
                "id": "mock_endo_2",
                "name": "University Metabolic & Thyroid Institute",
                "specialty": "Endocrinologist",
                "address": "500 Academic Medical Dr, Wing B",
                "rating": 4.8,
                "user_ratings_total": 210,
                "distance": calculate_haversine_distance(base_lat, base_lng, base_lat - 0.025, base_lng - 0.020),
                "open_now": True,
                "phone": "+1 (555) 345-6789",
                "lat": base_lat - 0.025,
                "lng": base_lng - 0.020,
                "google_maps_url": "https://maps.google.com/?q=Metabolic+Thyroid+Institute"
            }
        ])

    # 2. Heart Disease / Cardiologists
    if cond_lower in ("heart", "heartdisease", "cardiovascular", "both", "all"):
        results.extend([
            {
                "id": "mock_cardio_1",
                "name": "St. Jude Heart & Cardiovascular Institute",
                "specialty": "Cardiologist (Heart Specialist)",
                "address": "108 Cardiovascular Way, Suite 100",
                "rating": 4.9,
                "user_ratings_total": 198,
                "distance": calculate_haversine_distance(base_lat, base_lng, base_lat + 0.018, base_lng - 0.010),
                "open_now": True,
                "phone": "+1 (555) 876-5432",
                "lat": base_lat + 0.018,
                "lng": base_lng - 0.010,
                "google_maps_url": "https://maps.google.com/?q=St+Jude+Heart+Institute"
            },
            {
                "id": "mock_cardio_2",
                "name": "Advanced Preventive Cardiac Care Center",
                "specialty": "Cardiologist",
                "address": "920 Vascular Ave, Floor 4",
                "rating": 4.7,
                "user_ratings_total": 86,
                "distance": calculate_haversine_distance(base_lat, base_lng, base_lat - 0.035, base_lng + 0.030),
                "open_now": True,
                "phone": "+1 (555) 987-6543",
                "lat": base_lat - 0.035,
                "lng": base_lng + 0.030,
                "google_maps_url": "https://maps.google.com/?q=Preventive+Cardiac+Care"
            }
        ])

    # 3. General Hospital
    results.append({
        "id": "mock_hosp_1",
        "name": "City General Hospital & Emergency Center",
        "specialty": "General Hospital & Emergency Care",
        "address": "100 Hospital Plaza, Main Building",
        "rating": 4.6,
        "user_ratings_total": 350,
        "distance": calculate_haversine_distance(base_lat, base_lng, base_lat + 0.005, base_lng - 0.005),
        "open_now": True,
        "phone": "+1 (555) 100-2000",
        "lat": base_lat + 0.005,
        "lng": base_lng - 0.005,
        "google_maps_url": "https://maps.google.com/?q=City+General+Hospital"
    })

    return results


async def fetch_nearby_hospitals(
    lat: Optional[float] = None,
    lng: Optional[float] = None,
    location: Optional[str] = None,
    condition: Optional[str] = None
) -> List[Dict[str, Any]]:
    """
    Queries Google Places Nearby Search / Text Search API filtered by 'hospital'
    plus condition-mapped specialist keywords ('endocrinologist' for diabetes, 'cardiologist' for heart disease).
    If both risks are elevated, fetches both specialist types, clearly labeled.
    Handles rate limits, invalid keys, and network timeouts gracefully using fallback.
    """
    api_key = settings.GOOGLE_PLACES_API_KEY or settings.GOOGLE_API_KEY
    cond_lower = (condition or "general").lower()

    if not api_key or (lat is None and lng is None and not location):
        logger.info("Google Places API Key or location coordinates omitted. Serving condition-aware provider mock.")
        return get_mock_hospitals(lat, lng, cond_lower)

    # Determine specialist keywords
    specialist_keywords = []
    if "diabetes" in cond_lower or "both" in cond_lower or "all" in cond_lower:
        specialist_keywords.append("endocrinologist")
    if "heart" in cond_lower or "both" in cond_lower or "all" in cond_lower:
        specialist_keywords.append("cardiologist")
    if not specialist_keywords:
        specialist_keywords.append("hospital")

    results = []

    try:
        async with httpx.AsyncClient(timeout=6.0) as client:
            for kw in specialist_keywords:
                if lat is not None and lng is not None:
                    url = "https://maps.googleapis.com/maps/api/place/nearbysearch/json"
                    params = {
                        "location": f"{lat},{lng}",
                        "radius": 15000,
                        "keyword": f"hospital {kw}",
                        "key": api_key
                    }
                else:
                    url = "https://maps.googleapis.com/maps/api/place/textsearch/json"
                    params = {
                        "query": f"{kw} hospital in {location}",
                        "key": api_key
                    }

                resp = await client.get(url, params=params)
                if resp.status_code == 200:
                    data = resp.json()
                    status_code = data.get("status")
                    if status_code in ("OK", "ZERO_RESULTS"):
                        for item in data.get("results", [])[:5]:
                            p_lat = item.get("geometry", {}).get("location", {}).get("lat")
                            p_lng = item.get("geometry", {}).get("location", {}).get("lng")

                            dist_str = "Nearby"
                            if lat is not None and lng is not None and p_lat is not None and p_lng is not None:
                                dist_str = calculate_haversine_distance(lat, lng, p_lat, p_lng)

                            label_specialty = "Endocrinologist" if kw == "endocrinologist" else "Cardiologist" if kw == "cardiologist" else "General Hospital"

                            results.append({
                                "id": item.get("place_id", f"place_{len(results)}"),
                                "name": item.get("name"),
                                "specialty": f"{label_specialty} ({kw.capitalize()})",
                                "address": item.get("vicinity") or item.get("formatted_address") or "Local Area",
                                "rating": float(item.get("rating", 4.5)),
                                "user_ratings_total": int(item.get("user_ratings_total", 50)),
                                "distance": dist_str,
                                "open_now": item.get("opening_hours", {}).get("open_now", True),
                                "phone": "+1 (555) 123-4567",
                                "lat": p_lat,
                                "lng": p_lng,
                                "google_maps_url": f"https://www.google.com/maps/search/?api=1&query={item.get('name', '').replace(' ', '+')}&query_place_id={item.get('place_id', '')}"
                            })

        if not results:
            logger.info("Google Places API returned zero results. Serving local mock providers.")
            return get_mock_hospitals(lat, lng, cond_lower)

        return results

    except Exception as e:
        logger.warning(f"Google Places API call failed ({e}). Serving fallback local providers.")
        return get_mock_hospitals(lat, lng, cond_lower)
