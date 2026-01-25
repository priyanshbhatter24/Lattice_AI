"""
Data models for Stage 2: Grounding & Discovery

Defines the input (LocationRequirement from Stage 1) and output (LocationCandidate) schemas.
"""

from datetime import datetime
from enum import Enum
from typing import Literal
from uuid import uuid4

from pydantic import BaseModel, Field


class VibeCategory(str, Enum):
    """Visual aesthetic categories for locations."""

    INDUSTRIAL = "industrial"
    LUXURY = "luxury"
    URBAN_GRITTY = "urban-gritty"
    SUBURBAN = "suburban"
    NATURAL = "natural"
    RETRO_VINTAGE = "retro-vintage"
    FUTURISTIC = "futuristic"
    INSTITUTIONAL = "institutional"
    COMMERCIAL = "commercial"
    RESIDENTIAL = "residential"


class Vibe(BaseModel):
    """Vibe classification for a scene."""

    primary: VibeCategory
    secondary: VibeCategory | None = None
    descriptors: list[str] = Field(default_factory=list)
    confidence: float = Field(ge=0.0, le=1.0)


class Constraints(BaseModel):
    """Physical constraints for a location."""

    interior_exterior: Literal["interior", "exterior", "both"]
    time_of_day: Literal["day", "night", "both"]
    min_ceiling_height_ft: float | None = None
    min_floor_space_sqft: float | None = None
    parking_spaces_needed: int = 0
    power_requirements: Literal["standard_120v", "heavy_duty", "generator_ok"] = "standard_120v"
    acoustic_needs: Literal["dialogue_heavy", "action_ok", "any"] = "any"
    special_requirements: list[str] = Field(default_factory=list)


class LocationRequirement(BaseModel):
    """
    Input from Stage 1: Script Analysis.
    Represents what we need to find for a particular scene.
    """

    id: str = Field(default_factory=lambda: str(uuid4()))
    project_id: str
    scene_number: str
    scene_header: str  # e.g., "INT. WAREHOUSE - NIGHT"
    page_numbers: list[int] = Field(default_factory=list)
    script_excerpt: str = ""

    vibe: Vibe
    constraints: Constraints

    estimated_shoot_hours: int = 12
    priority: Literal["critical", "important", "flexible"] = "important"

    # Search configuration
    target_city: str = "Los Angeles, CA"
    search_radius_km: float = 50.0
    max_results: int = 10


class OpeningPeriod(BaseModel):
    """Opening hours period."""

    day: int  # 0 = Sunday, 6 = Saturday
    open_time: str  # "0900"
    close_time: str  # "1700"


class OpeningHours(BaseModel):
    """Opening hours for a venue."""

    weekday_text: list[str] = Field(default_factory=list)
    periods: list[OpeningPeriod] = Field(default_factory=list)


class VapiCallStatus(str, Enum):
    """Status of Vapi outbound call."""

    NOT_INITIATED = "not_initiated"
    QUEUED = "queued"
    RINGING = "ringing"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    VOICEMAIL = "voicemail"
    NO_ANSWER = "no_answer"
    BUSY = "busy"
    FAILED = "failed"
    NO_PHONE_NUMBER = "no_phone_number"


class CandidateStatus(str, Enum):
    """Workflow status for a location candidate."""

    DISCOVERED = "discovered"
    CALL_PENDING = "call_pending"
    CALL_IN_PROGRESS = "call_in_progress"
    CALL_COMPLETED = "call_completed"
    CALL_FAILED = "call_failed"
    HUMAN_REVIEW = "human_review"
    APPROVED = "approved"
    REJECTED = "rejected"
    BOOKED = "booked"


class LocationCandidate(BaseModel):
    """
    Output from Stage 2: A real-world location candidate.
    This is the central pipeline object that flows through Stages 2-4.
    """

    id: str = Field(default_factory=lambda: str(uuid4()))
    scene_id: str  # FK to LocationRequirement
    project_id: str

    # ─── Google Places Data ───────────────────────────────
    google_place_id: str | None = None
    venue_name: str
    formatted_address: str
    latitude: float
    longitude: float
    phone_number: str | None = None
    website_url: str | None = None
    google_rating: float | None = None
    google_review_count: int = 0
    price_level: int | None = None  # 1-4 scale

    # Photos
    photo_urls: list[str] = Field(default_factory=list)
    photo_attributions: list[str] = Field(default_factory=list)

    # Opening hours
    opening_hours: OpeningHours | None = None

    # Computed fields
    match_score: float = Field(ge=0.0, le=1.0, default=0.0)
    distance_from_center_km: float = 0.0

    # Why this location was selected
    match_reasoning: str = ""

    # ─── Vapi Call Data (initialized for Stage 3) ─────────
    vapi_call_status: VapiCallStatus = VapiCallStatus.NOT_INITIATED
    vapi_call_id: str | None = None
    vapi_call_initiated_at: datetime | None = None
    vapi_call_completed_at: datetime | None = None
    vapi_call_duration_seconds: int | None = None
    vapi_recording_url: str | None = None
    vapi_transcript: str | None = None

    # Negotiation data (populated by Stage 3)
    venue_available: bool | None = None
    availability_details: str | None = None
    negotiated_price: float | None = None
    price_unit: Literal["hourly", "half_day", "full_day", "flat_fee"] | None = None
    manager_name: str | None = None
    manager_title: str | None = None
    manager_email: str | None = None
    manager_direct_phone: str | None = None
    callback_required: bool = False
    callback_details: str | None = None
    red_flags: list[str] = Field(default_factory=list)
    call_summary: str | None = None
    call_success_score: float | None = None

    # ─── Workflow Status ──────────────────────────────────
    status: CandidateStatus = CandidateStatus.DISCOVERED
    rejection_reason: str | None = None
    approved_by: str | None = None
    approved_at: datetime | None = None
    booking_id: str | None = None

    # Metadata
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

    def set_no_phone_status(self) -> None:
        """Mark candidate as having no phone number (needs manual research)."""
        self.vapi_call_status = VapiCallStatus.NO_PHONE_NUMBER
        self.status = CandidateStatus.HUMAN_REVIEW
        self.red_flags.append("Phone number not available in listing")


class GroundingResult(BaseModel):
    """Result from the grounding agent for a single scene."""

    scene_id: str
    project_id: str
    query_used: str
    candidates: list[LocationCandidate]
    total_found: int
    filtered_count: int
    processing_time_seconds: float
    errors: list[str] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)
