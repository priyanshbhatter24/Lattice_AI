from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime
from uuid import UUID


class ScriptCreate(BaseModel):
    title: str
    content: str


class Script(BaseModel):
    id: UUID
    title: str
    content: str
    created_at: datetime


class SceneCreate(BaseModel):
    script_id: UUID
    slugline: Optional[str] = None
    int_ext: Optional[str] = None
    time_of_day: Optional[str] = None
    description: Optional[str] = None
    mood: Optional[str] = None
    period: Optional[str] = None
    requirements: list[str] = Field(default_factory=list)
    scene_number: Optional[int] = None


class Scene(BaseModel):
    id: UUID
    script_id: UUID
    slugline: Optional[str] = None
    int_ext: Optional[str] = None
    time_of_day: Optional[str] = None
    description: Optional[str] = None
    mood: Optional[str] = None
    period: Optional[str] = None
    requirements: list[str] = Field(default_factory=list)
    scene_number: Optional[int] = None
    created_at: datetime


class Coordinates(BaseModel):
    lat: float
    lng: float


class Contact(BaseModel):
    name: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None


class LocationCreate(BaseModel):
    source: str
    source_id: Optional[str] = None
    name: str
    address: Optional[str] = None
    coordinates: Optional[Coordinates] = None
    description: Optional[str] = None
    images: list[str] = Field(default_factory=list)
    price: Optional[str] = None
    amenities: list[str] = Field(default_factory=list)
    contact: Optional[Contact] = None
    source_url: Optional[str] = None


class Location(BaseModel):
    id: UUID
    source: str
    source_id: Optional[str] = None
    name: str
    address: Optional[str] = None
    coordinates: Optional[Coordinates] = None
    description: Optional[str] = None
    images: list[str] = Field(default_factory=list)
    price: Optional[str] = None
    amenities: list[str] = Field(default_factory=list)
    contact: Optional[Contact] = None
    source_url: Optional[str] = None
    scraped_at: datetime


class MatchScoreCreate(BaseModel):
    scene_id: UUID
    location_id: UUID
    visual_score: int
    functional_score: int
    logistics_score: int
    overall_score: int
    reasoning: Optional[str] = None


class MatchScore(BaseModel):
    id: UUID
    scene_id: UUID
    location_id: UUID
    visual_score: int
    functional_score: int
    logistics_score: int
    overall_score: int
    reasoning: Optional[str] = None
    scored_at: datetime


class OutreachLogCreate(BaseModel):
    location_id: UUID
    type: str  # call, email
    status: str = "pending"
    vapi_call_id: Optional[str] = None
    transcript: Optional[str] = None
    summary: Optional[dict] = None
    availability: Optional[str] = None
    quoted_price: Optional[str] = None
    restrictions: Optional[str] = None
    next_steps: Optional[str] = None


class OutreachLog(BaseModel):
    id: UUID
    location_id: UUID
    type: str
    status: str
    vapi_call_id: Optional[str] = None
    transcript: Optional[str] = None
    summary: Optional[dict] = None
    availability: Optional[str] = None
    quoted_price: Optional[str] = None
    restrictions: Optional[str] = None
    next_steps: Optional[str] = None
    called_at: datetime
