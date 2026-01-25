"""
API routes for Vapi call management.

Provides endpoints for triggering and monitoring voice calls.
All endpoints require authentication.
"""

from typing import Any

import structlog
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.api.middleware.auth import get_current_user
from app.db.repository import LocationCandidateRepository, ProjectRepository, SceneRepository
from app.vapi.call_context import CallContext, ProjectContext
from app.vapi.service import get_vapi_service

logger = structlog.get_logger()

router = APIRouter(prefix="/api/calls", tags=["calls"])


# ══════════════════════════════════════════════════════════
# Request/Response Models
# ══════════════════════════════════════════════════════════


class TriggerCallRequest(BaseModel):
    """Request to trigger a single call."""

    candidate_id: str


class TriggerBatchRequest(BaseModel):
    """Request to trigger batch calls."""

    candidate_ids: list[str]
    max_concurrent: int | None = None


class CallResponse(BaseModel):
    """Response for a triggered call."""

    success: bool
    candidate_id: str
    vapi_call_id: str | None = None
    error: str | None = None


class BatchResponse(BaseModel):
    """Response for batch call trigger."""

    success: bool
    batch_id: str
    total_calls: int


# ══════════════════════════════════════════════════════════
# Endpoints
# ══════════════════════════════════════════════════════════


@router.post("/trigger", response_model=CallResponse)
async def trigger_call(
    request: TriggerCallRequest,
    user_id: str = Depends(get_current_user),
) -> CallResponse:
    """
    Trigger a single outbound call to a venue.

    The candidate must have a phone number and be in a callable state.
    """
    candidate_repo = LocationCandidateRepository()
    project_repo = ProjectRepository()
    scene_repo = SceneRepository()

    # Get candidate
    candidate_data = candidate_repo.get(request.candidate_id)
    if not candidate_data:
        raise HTTPException(status_code=404, detail="Candidate not found")

    # Verify project ownership
    project_data = project_repo.get(candidate_data["project_id"])
    if not project_data or project_data.get("user_id") != user_id:
        raise HTTPException(status_code=404, detail="Candidate not found")

    # Check phone number
    if not candidate_data.get("phone_number"):
        raise HTTPException(status_code=400, detail="Candidate has no phone number")

    # Get scene for context
    scene_data = scene_repo.get(candidate_data["scene_id"])

    # Build project context
    project_context = ProjectContext(
        production_company=project_data.get("company_name", "Production Company"),
        project_name=project_data.get("name", "Film Project"),
        filming_dates=_format_filming_dates(project_data),
        duration_description=f"{scene_data.get('estimated_shoot_hours', 12)} hours" if scene_data else "12 hours",
        crew_size=project_data.get("crew_size", 20),
        scene_description=scene_data.get("scene_header", "") if scene_data else "",
        special_requirements=_extract_special_requirements(scene_data) if scene_data else [],
    )

    # Build call context
    call_context = CallContext(
        candidate_id=candidate_data["id"],
        venue_name=candidate_data["venue_name"],
        phone_number=candidate_data["phone_number"],
        venue_address=candidate_data.get("formatted_address", ""),
        project_context=project_context,
    )

    # Trigger call
    try:
        vapi_service = get_vapi_service()
        vapi_call_id = await vapi_service.trigger_call(call_context)

        logger.info(
            "Call triggered successfully",
            candidate_id=request.candidate_id,
            vapi_call_id=vapi_call_id,
        )

        return CallResponse(
            success=True,
            candidate_id=request.candidate_id,
            vapi_call_id=vapi_call_id,
        )

    except Exception as e:
        logger.error(
            "Failed to trigger call",
            candidate_id=request.candidate_id,
            error=str(e),
        )
        return CallResponse(
            success=False,
            candidate_id=request.candidate_id,
            error=str(e),
        )


@router.post("/batch", response_model=BatchResponse)
async def trigger_batch_calls(
    request: TriggerBatchRequest,
    user_id: str = Depends(get_current_user),
) -> BatchResponse:
    """
    Trigger multiple outbound calls concurrently.

    Calls are limited by max_concurrent to avoid overwhelming the system.
    """
    candidate_repo = LocationCandidateRepository()
    project_repo = ProjectRepository()
    scene_repo = SceneRepository()

    # Track verified project IDs to avoid redundant lookups
    verified_projects: set[str] = set()

    contexts: list[CallContext] = []

    for candidate_id in request.candidate_ids:
        candidate_data = candidate_repo.get(candidate_id)
        if not candidate_data:
            logger.warning("Candidate not found for batch", candidate_id=candidate_id)
            continue

        if not candidate_data.get("phone_number"):
            logger.warning("Candidate has no phone number", candidate_id=candidate_id)
            continue

        # Get project and verify ownership (cache verified projects)
        project_id = candidate_data["project_id"]
        if project_id not in verified_projects:
            project_data = project_repo.get(project_id)
            if not project_data or project_data.get("user_id") != user_id:
                logger.warning("Candidate not owned by user", candidate_id=candidate_id)
                continue
            verified_projects.add(project_id)
        else:
            project_data = project_repo.get(project_id)

        scene_data = scene_repo.get(candidate_data["scene_id"])

        if not project_data:
            continue

        # Build contexts
        project_context = ProjectContext(
            production_company=project_data.get("company_name", "Production Company"),
            project_name=project_data.get("name", "Film Project"),
            filming_dates=_format_filming_dates(project_data),
            duration_description=f"{scene_data.get('estimated_shoot_hours', 12)} hours" if scene_data else "12 hours",
            crew_size=project_data.get("crew_size", 20),
            scene_description=scene_data.get("scene_header", "") if scene_data else "",
            special_requirements=_extract_special_requirements(scene_data) if scene_data else [],
        )

        call_context = CallContext(
            candidate_id=candidate_data["id"],
            venue_name=candidate_data["venue_name"],
            phone_number=candidate_data["phone_number"],
            venue_address=candidate_data.get("formatted_address", ""),
            project_context=project_context,
        )
        contexts.append(call_context)

    if not contexts:
        raise HTTPException(status_code=400, detail="No valid candidates for calling")

    # Trigger batch
    vapi_service = get_vapi_service()
    batch_id = await vapi_service.trigger_batch_calls(
        contexts=contexts,
        max_concurrent=request.max_concurrent,
    )

    logger.info(
        "Batch calls triggered",
        batch_id=batch_id,
        total_calls=len(contexts),
    )

    return BatchResponse(
        success=True,
        batch_id=batch_id,
        total_calls=len(contexts),
    )


@router.get("/{vapi_call_id}", response_model=dict[str, Any])
async def get_call_status(
    vapi_call_id: str,
    user_id: str = Depends(get_current_user),
) -> dict[str, Any]:
    """
    Get the current status of a call from Vapi.
    """
    # Note: We validate the user is authenticated but don't have a direct
    # mapping from vapi_call_id to project. The vapi_call_id is opaque.
    # In production, you might want to store vapi_call_id -> project_id mapping.
    try:
        vapi_service = get_vapi_service()
        status = await vapi_service.get_call_status(vapi_call_id)
        return status
    except Exception as e:
        logger.error("Failed to get call status", vapi_call_id=vapi_call_id, error=str(e))
        raise HTTPException(status_code=500, detail=str(e))


# ══════════════════════════════════════════════════════════
# Helper Functions
# ══════════════════════════════════════════════════════════


def _format_filming_dates(project_data: dict) -> str:
    """Format filming dates from project data."""
    start = project_data.get("filming_start_date")
    end = project_data.get("filming_end_date")

    if start and end:
        return f"{start} to {end}"
    elif start:
        return f"Starting {start}"
    else:
        return "Flexible dates"


def _extract_special_requirements(scene_data: dict) -> list[str]:
    """Extract special requirements from scene constraints."""
    requirements = []
    constraints = scene_data.get("constraints", {})

    if isinstance(constraints, dict):
        if constraints.get("power_requirements"):
            requirements.append(f"Power: {constraints['power_requirements']}")
        if constraints.get("vehicle_access"):
            requirements.append("Vehicle access required")
        if constraints.get("accessibility_needs"):
            requirements.append(f"Accessibility: {constraints['accessibility_needs']}")
        if constraints.get("noise_level"):
            requirements.append(f"Noise level: {constraints['noise_level']}")

    return requirements
