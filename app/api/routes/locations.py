from fastapi import APIRouter, HTTPException
from uuid import UUID
import structlog

from app.db import queries
from app.db.models import LocationCreate

router = APIRouter()
logger = structlog.get_logger()


@router.get("/", response_model=list[dict])
async def list_locations():
    """List all discovered locations."""
    return await queries.get_locations()


@router.get("/{location_id}", response_model=dict)
async def get_location(location_id: UUID):
    """Get a specific location with match scores and outreach history."""
    location = await queries.get_location(location_id)
    if not location:
        raise HTTPException(status_code=404, detail="Location not found")

    match_scores = await queries.get_match_scores_by_location(location_id)
    outreach_logs = await queries.get_outreach_logs_by_location(location_id)

    return {
        "location": location,
        "match_scores": match_scores,
        "outreach_logs": outreach_logs,
    }


@router.post("/", response_model=dict)
async def create_location(data: LocationCreate):
    """Manually add a location."""
    location = await queries.create_location(data)
    logger.info("Location created", location_id=location["id"])
    return location
