from typing import Annotated, Any, Literal
from pydantic import BaseModel, ConfigDict, Field

from app.core import limits

DisputeType = Literal["route_deviation", "no_show_charge"]

# Bounded numbers: NaN and Infinity are rejected, so a forged fare or distance gets a
# 422 instead of reaching the rules (findings F1 and F3). Limits live in core/limits.py.
Km = Annotated[float, Field(ge=0, le=limits.MAX_DISTANCE_KM, allow_inf_nan=False)]
Minutes = Annotated[float, Field(ge=0, le=limits.MAX_DURATION_MIN, allow_inf_nan=False)]
Money = Annotated[float, Field(ge=0, le=limits.MAX_FARE, allow_inf_nan=False)]
# A breakdown line may be negative (e.g. a discount line).
SignedMoney = Annotated[float, Field(ge=-limits.MAX_FARE, le=limits.MAX_FARE, allow_inf_nan=False)]
Latitude = Annotated[float, Field(ge=-90, le=90, allow_inf_nan=False)]
Longitude = Annotated[float, Field(ge=-180, le=180, allow_inf_nan=False)]
Surge = Annotated[float, Field(ge=limits.MIN_SURGE, le=limits.MAX_SURGE, allow_inf_nan=False)]
Rating = Annotated[float, Field(ge=0, le=limits.MAX_RATING, allow_inf_nan=False)]
Statement = Annotated[str, Field(max_length=limits.MAX_STATEMENT_CHARS)]

class TripData(BaseModel):
    expected_distance_km: Km | None = None
    actual_distance_km: Km | None = None
    expected_duration_min: Minutes | None = None
    actual_duration_min: Minutes | None = None
    pickup_lat: Latitude | None = None
    pickup_lng: Longitude | None = None
    driver_arrival_lat: Latitude | None = None
    driver_arrival_lng: Longitude | None = None
    driver_wait_min: Minutes | None = None

class FareLine(BaseModel):
    label: str = Field(max_length=limits.MAX_FARE_LABEL_CHARS)
    amount: SignedMoney

class FareData(BaseModel):
    expected: Money | None = None
    actual: Money | None = None
    cancellation_fee: Money | None = None
    surge_multiplier: Surge | None = None
    # Codes only: free text here would reach the prompts raw (finding F4, attack PI-07).
    promo_code: str | None = Field(default=None, pattern=limits.PROMO_CODE_PATTERN)
    promo_discount: Money | None = None
    # Itemised charges before any promo discount, e.g. base, distance, time, surge, tolls.
    breakdown: list[FareLine] = Field(default_factory=list, max_length=limits.MAX_FARE_LINES)

class ChatMessage(BaseModel):
    # Keep unknown fields from external datasets instead of rejecting them.
    model_config = ConfigDict(extra="allow")

    sender: Literal["rider", "driver", "system"]
    message: str = Field(max_length=limits.MAX_CHAT_MESSAGE_CHARS)
    timestamp: str | None = Field(default=None, max_length=limits.MAX_TIMESTAMP_CHARS)

class PartyHistory(BaseModel):
    model_config = ConfigDict(extra="allow")

    account_age_days: int | None = Field(default=None, ge=0, le=limits.MAX_ACCOUNT_AGE_DAYS)
    rating: Rating | None = None
    completed_trips: int | None = Field(default=None, ge=0, le=limits.MAX_COMPLETED_TRIPS)
    disputes_last_90d: int | None = Field(default=None, ge=0, le=limits.MAX_DISPUTES_90D)

class DisputeCase(BaseModel):
    dispute_id: str = Field(pattern=limits.DISPUTE_ID_PATTERN)
    type: DisputeType
    rider_claim: Statement
    driver_statement: Statement | None = None
    trip: TripData = Field(default_factory=TripData)
    fare: FareData = Field(default_factory=FareData)
    chat_logs: list[ChatMessage] = Field(default_factory=list, max_length=limits.MAX_CHAT_MESSAGES)
    gps_points: list[dict[str, Any]] = Field(default_factory=list)
    rider_history: PartyHistory = Field(default_factory=PartyHistory)
    driver_history: PartyHistory = Field(default_factory=PartyHistory)
