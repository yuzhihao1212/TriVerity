from typing import Any, Literal
from pydantic import BaseModel, ConfigDict, Field

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

class FareLine(BaseModel):
    label: str
    amount: float

class FareData(BaseModel):
    expected: float | None = None
    actual: float | None = None
    cancellation_fee: float | None = None
    surge_multiplier: float | None = None
    promo_code: str | None = None
    promo_discount: float | None = None
    # Itemised charges before any promo discount, e.g. base, distance, time, surge, tolls.
    breakdown: list[FareLine] = Field(default_factory=list)

class ChatMessage(BaseModel):
    # Keep unknown fields from external datasets instead of rejecting them.
    model_config = ConfigDict(extra="allow")

    sender: Literal["rider", "driver", "system"]
    message: str
    timestamp: str | None = None

class PartyHistory(BaseModel):
    model_config = ConfigDict(extra="allow")

    account_age_days: int | None = None
    rating: float | None = None
    completed_trips: int | None = None
    disputes_last_90d: int | None = None

class DisputeCase(BaseModel):
    dispute_id: str
    type: DisputeType
    rider_claim: str
    driver_statement: str | None = None
    trip: TripData = Field(default_factory=TripData)
    fare: FareData = Field(default_factory=FareData)
    chat_logs: list[ChatMessage] = Field(default_factory=list)
    gps_points: list[dict[str, Any]] = Field(default_factory=list)
    rider_history: PartyHistory = Field(default_factory=PartyHistory)
    driver_history: PartyHistory = Field(default_factory=PartyHistory)
