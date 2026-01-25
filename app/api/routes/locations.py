"""
API routes for location candidate management.

Provides endpoints for listing and managing location candidates.
"""

from typing import Any

import structlog
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.db.repository import LocationCandidateRepository

logger = structlog.get_logger()

router = APIRouter(prefix="/api/locations", tags=["locations"])


# ══════════════════════════════════════════════════════════
# Request/Response Models
# ══════════════════════════════════════════════════════════


class CreateLocationRequest(BaseModel):
    """Request to create a mock location candidate for testing."""

    venue_name: str
    phone_number: str
    formatted_address: str
    project_id: str
    scene_id: str
    google_place_id: str | None = None
    latitude: float | None = None
    longitude: float | None = None
    website_url: str | None = None
    match_score: float = 0.8


# ══════════════════════════════════════════════════════════
# Endpoints
# ══════════════════════════════════════════════════════════


@router.get("")
async def list_locations(
    project_id: str | None = None,
    scene_id: str | None = None,
    limit: int = 50,
) -> list[dict[str, Any]]:
    """
    List location candidates.

    Filter by project_id or scene_id, or get all.
    """
    repo = LocationCandidateRepository()

    if scene_id:
        candidates = repo.list_by_scene(scene_id)
    elif project_id:
        candidates = repo.list_by_project(project_id)
    else:
        # Get all (limited)
        result = repo._table().select("*").order("created_at", desc=True).limit(limit).execute()
        candidates = result.data

    return candidates


@router.get("/{candidate_id}")
async def get_location(candidate_id: str) -> dict[str, Any]:
    """Get a single location candidate by ID."""
    repo = LocationCandidateRepository()
    candidate = repo.get(candidate_id)

    if not candidate:
        raise HTTPException(status_code=404, detail="Location candidate not found")

    return candidate


@router.post("")
async def create_location(request: CreateLocationRequest) -> dict[str, Any]:
    """
    Create a mock location candidate for testing.

    This endpoint is primarily for testing the Vapi integration
    before Stage 2 grounding is connected.
    """
    repo = LocationCandidateRepository()

    # Create minimal candidate data
    from uuid import uuid4

    candidate_id = str(uuid4())

    data = {
        "id": candidate_id,
        "scene_id": request.scene_id,
        "project_id": request.project_id,
        "google_place_id": request.google_place_id,
        "venue_name": request.venue_name,
        "formatted_address": request.formatted_address,
        "latitude": request.latitude,
        "longitude": request.longitude,
        "phone_number": request.phone_number,
        "website_url": request.website_url,
        "match_score": request.match_score,
        "vapi_call_status": "not_initiated",
        "status": "discovered",
    }

    result = repo._table().insert(data).execute()

    logger.info("Created test location candidate", candidate_id=candidate_id, venue=request.venue_name)

    return result.data[0]


@router.delete("/{candidate_id}")
async def delete_location(candidate_id: str) -> dict[str, str]:
    """Delete a location candidate."""
    repo = LocationCandidateRepository()

    # Check exists
    candidate = repo.get(candidate_id)
    if not candidate:
        raise HTTPException(status_code=404, detail="Location candidate not found")

    # Delete
    repo._table().delete().eq("id", candidate_id).execute()

    logger.info("Deleted location candidate", candidate_id=candidate_id)

    return {"status": "deleted", "candidate_id": candidate_id}


@router.patch("/{candidate_id}/approve")
async def approve_location(candidate_id: str, approved_by: str) -> dict[str, Any]:
    """Approve a location candidate for booking."""
    repo = LocationCandidateRepository()

    candidate = repo.get(candidate_id)
    if not candidate:
        raise HTTPException(status_code=404, detail="Location candidate not found")

    result = repo.approve(candidate_id, approved_by)

    logger.info("Approved location candidate", candidate_id=candidate_id, approved_by=approved_by)

    return result


@router.patch("/{candidate_id}/reject")
async def reject_location(candidate_id: str, reason: str) -> dict[str, Any]:
    """Reject a location candidate."""
    repo = LocationCandidateRepository()

    candidate = repo.get(candidate_id)
    if not candidate:
        raise HTTPException(status_code=404, detail="Location candidate not found")

    result = repo.reject(candidate_id, reason)

    logger.info("Rejected location candidate", candidate_id=candidate_id, reason=reason)

    return result
