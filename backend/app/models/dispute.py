from typing import Any, Literal
from pydantic import BaseModel, Field

DisputeType = Literal["route_deviation", "no_show_charge"]

class TripData(BaseModel):
    expected_distance_km: float | None = None
    actual_distance_km: float | None = None
    expected_duration_min: float | None = None
    actual_duration_min: float | None = None
    pickup_lat: float | None = None
    pickup_lng: float | None = None
    driver_arrival_lat: float | None = None
    driver_arrival_lng: float | None = None
    driver_wait_min: float | None = None

class FareData(BaseModel):
    expected: float | None = None
    actual: float | None = None
    cancellation_fee: float | None = None

class DisputeCase(BaseModel):
    dispute_id: str
    type: DisputeType
    rider_claim: str
    driver_statement: str | None = None
    trip: TripData = Field(default_factory=TripData)
    fare: FareData = Field(default_factory=FareData)
    # Each entry: {"sender": "rider" | "driver", "message": str, ...}
    chat_logs: list[dict[str, Any]] = Field(default_factory=list)
    gps_points: list[dict[str, Any]] = Field(default_factory=list)
    rider_history: dict[str, Any] = Field(default_factory=dict)
    driver_history: dict[str, Any] = Field(default_factory=dict)
