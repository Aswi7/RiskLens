from pydantic import BaseModel, Field
from typing import Optional, List


class HospitalResult(BaseModel):
    id: str
    name: str
    specialty: str = Field(..., description="Specialty label (e.g., 'Endocrinologist', 'Cardiologist', 'General Hospital')")
    address: str
    rating: float = 4.8
    user_ratings_total: int = 120
    distance: str = Field(..., description="Distance from user location (e.g., '1.4 miles')")
    open_now: bool = True
    phone: Optional[str] = None
    lat: Optional[float] = None
    lng: Optional[float] = None
    google_maps_url: Optional[str] = None


class HospitalSearchResponse(BaseModel):
    condition_filter: str
    results_count: int
    hospitals: List[HospitalResult]
