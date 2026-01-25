"""
API routes for Stage 2: Location Grounding.

Provides endpoints for finding real-world locations that match script requirements.
Uses SSE streaming for real-time progress updates.
All endpoints require authentication.
"""

import asyncio
import json
from typing import Any

import structlog
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from app.api.middleware.auth import get_current_user
from app.db.repository import (
    LocationCandidateRepository,
    ProjectRepository,
    SceneRepository,
)
from app.grounding.grounding_agent import GroundingAgent
from app.grounding.models import (
    Constraints,
    LocationRequirement,
    Vibe,
    VibeCategory,
)

logger = structlog.get_logger()

router = APIRouter(prefix="/api/grounding", tags=["grounding"])


# ══════════════════════════════════════════════════════════
# Request/Response Models
# ══════════════════════════════════════════════════════════


class GroundSceneRequest(BaseModel):
    """Request to ground a single scene."""

    scene_id: str
    target_city: str = "Los Angeles, CA"
    max_results: int = 10


class GroundScenesRequest(BaseModel):
    """Request to ground multiple scenes."""

    scene_ids: list[str]
    target_city: str = "Los Angeles, CA"
    max_results: int = 10
    save_to_db: bool = True


class GroundingProgress(BaseModel):
    """Progress update during grounding."""

    scene_id: str
    scene_header: str
    status: str  # "processing", "completed", "error"
    candidates_found: int = 0
    error: str | None = None


# ══════════════════════════════════════════════════════════
# Endpoints
# ══════════════════════════════════════════════════════════


@router.get("/scenes/{project_id}")
async def get_groundable_scenes(
    project_id: str,
    user_id: str = Depends(get_current_user),
) -> list[dict[str, Any]]:
    """
    Get all scenes for a project that can be grounded.

    Returns scenes with their current grounding status.
    """
    project_repo = ProjectRepository()
    scene_repo = SceneRepository()
    candidate_repo = LocationCandidateRepository()

    # Verify project ownership
    project = project_repo.get(project_id)
    if not project or project.get("user_id") != user_id:
        raise HTTPException(status_code=404, detail="Project not found")

    scenes = scene_repo.list_by_project(project_id)

    # Enrich with candidate counts
    enriched = []
    for scene in scenes:
        candidates = candidate_repo.list_by_scene(scene["id"])
        enriched.append({
            **scene,
            "candidate_count": len(candidates),
            "has_candidates": len(candidates) > 0,
        })

    return enriched


@router.post("/ground")
async def ground_scenes_stream(
    request: GroundScenesRequest,
    user_id: str = Depends(get_current_user),
):
    """
    Ground multiple scenes with SSE streaming progress.

    Streams events:
    - status: General status messages
    - scene_start: Starting to process a scene
    - candidate: A new candidate found
    - scene_complete: Finished processing a scene
    - progress: Overall progress update
    - complete: All scenes processed
    - error: Error occurred
    """
    # Verify all scenes belong to projects owned by the user
    scene_repo = SceneRepository()
    project_repo = ProjectRepository()
    verified_projects: set[str] = set()

    for scene_id in request.scene_ids:
        scene = scene_repo.get(scene_id)
        if not scene:
            raise HTTPException(status_code=404, detail=f"Scene {scene_id} not found")

        project_id = scene["project_id"]
        if project_id not in verified_projects:
            project = project_repo.get(project_id)
            if not project or project.get("user_id") != user_id:
                raise HTTPException(status_code=404, detail=f"Scene {scene_id} not found")
            verified_projects.add(project_id)

    async def event_stream():
        scene_repo = SceneRepository()
        candidate_repo = LocationCandidateRepository()
        agent = GroundingAgent()

        total_scenes = len(request.scene_ids)
        processed = 0
        all_candidates = []

        # Send initial status
        yield _sse_event("status", {"message": f"Starting grounding for {total_scenes} scenes"})

        for scene_id in request.scene_ids:
            try:
                # Get scene data
                scene = scene_repo.get(scene_id)
                if not scene:
                    yield _sse_event("error", {
                        "scene_id": scene_id,
                        "error": "Scene not found",
                    })
                    continue

                yield _sse_event("scene_start", {
                    "scene_id": scene_id,
                    "scene_header": scene["scene_header"],
                    "index": processed + 1,
                    "total": total_scenes,
                })

                # Build LocationRequirement from scene data
                requirement = _scene_to_requirement(scene, request.target_city, request.max_results)

                # Run grounding
                result = await agent.find_and_verify_locations(
                    requirement,
                    verify_visuals=False,  # Skip visual verification for speed
                    save_to_db=False,  # We'll save manually
                )

                # Stream each candidate
                for candidate in result.candidates:
                    candidate_dict = _candidate_to_dict(candidate)
                    yield _sse_event("candidate", {
                        "scene_id": scene_id,
                        "candidate": candidate_dict,
                    })
                    all_candidates.append(candidate)
                    # Small delay for UI smoothness
                    await asyncio.sleep(0.05)

                # Save to DB if requested
                if request.save_to_db and result.candidates:
                    candidate_repo.create_many(result.candidates)
                    scene_repo.update_status(scene_id, "candidates_found")

                yield _sse_event("scene_complete", {
                    "scene_id": scene_id,
                    "scene_header": scene["scene_header"],
                    "candidates_found": len(result.candidates),
                    "query_used": result.query_used,
                    "processing_time": result.processing_time_seconds,
                    "errors": result.errors,
                    "warnings": result.warnings,
                })

                processed += 1
                yield _sse_event("progress", {
                    "processed": processed,
                    "total": total_scenes,
                    "percent": round((processed / total_scenes) * 100),
                })

            except Exception as e:
                logger.error("Grounding failed for scene", scene_id=scene_id, error=str(e))
                yield _sse_event("error", {
                    "scene_id": scene_id,
                    "error": str(e),
                })
                processed += 1

        # Final completion event
        yield _sse_event("complete", {
            "success": True,
            "total_scenes": total_scenes,
            "total_candidates": len(all_candidates),
            "message": f"Grounding complete. Found {len(all_candidates)} candidates across {total_scenes} scenes.",
        })

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.post("/ground-single")
async def ground_single_scene(
    request: GroundSceneRequest,
    user_id: str = Depends(get_current_user),
) -> dict[str, Any]:
    """
    Ground a single scene (non-streaming).

    Returns all candidates found.
    """
    scene_repo = SceneRepository()
    project_repo = ProjectRepository()
    candidate_repo = LocationCandidateRepository()
    agent = GroundingAgent()

    scene = scene_repo.get(request.scene_id)
    if not scene:
        raise HTTPException(status_code=404, detail="Scene not found")

    # Verify project ownership
    project = project_repo.get(scene["project_id"])
    if not project or project.get("user_id") != user_id:
        raise HTTPException(status_code=404, detail="Scene not found")

    requirement = _scene_to_requirement(scene, request.target_city, request.max_results)

    result = await agent.find_and_verify_locations(
        requirement,
        verify_visuals=False,
        save_to_db=False,
    )

    # Save candidates
    if result.candidates:
        candidate_repo.create_many(result.candidates)
        scene_repo.update_status(request.scene_id, "candidates_found")

    return {
        "scene_id": request.scene_id,
        "candidates": [_candidate_to_dict(c) for c in result.candidates],
        "total_found": len(result.candidates),
        "query_used": result.query_used,
        "processing_time_seconds": result.processing_time_seconds,
        "errors": result.errors,
        "warnings": result.warnings,
    }


# ══════════════════════════════════════════════════════════
# Helper Functions
# ══════════════════════════════════════════════════════════


def _sse_event(event_type: str, data: dict) -> str:
    """Format an SSE event."""
    return f"event: {event_type}\ndata: {json.dumps(data)}\n\n"


def _scene_to_requirement(
    scene: dict,
    target_city: str,
    max_results: int,
) -> LocationRequirement:
    """Convert a scene dict to a LocationRequirement."""
    # Parse vibe from stored JSON
    vibe_data = scene.get("vibe", {})
    primary_vibe = vibe_data.get("primary", "commercial")

    # Handle string enum conversion
    try:
        primary_category = VibeCategory(primary_vibe)
    except ValueError:
        primary_category = VibeCategory.COMMERCIAL

    secondary_vibe = vibe_data.get("secondary")
    try:
        secondary_category = VibeCategory(secondary_vibe) if secondary_vibe else None
    except ValueError:
        secondary_category = None

    vibe = Vibe(
        primary=primary_category,
        secondary=secondary_category,
        descriptors=vibe_data.get("descriptors", []),
        confidence=vibe_data.get("confidence", 0.8),
    )

    # Parse constraints
    constraints_data = scene.get("constraints", {})
    constraints = Constraints(
        interior_exterior=constraints_data.get("interior_exterior", "interior"),
        time_of_day=constraints_data.get("time_of_day", "day"),
        special_requirements=constraints_data.get("special_requirements", []),
    )

    return LocationRequirement(
        id=scene["id"],
        project_id=scene["project_id"],
        scene_number=scene.get("scene_number", "1"),
        scene_header=scene["scene_header"],
        page_numbers=scene.get("page_numbers", []),
        script_excerpt=scene.get("script_excerpt", ""),
        vibe=vibe,
        constraints=constraints,
        estimated_shoot_hours=scene.get("estimated_shoot_hours", 8),
        priority=scene.get("priority", "important"),
        target_city=target_city,
        max_results=max_results,
    )


def _candidate_to_dict(candidate) -> dict[str, Any]:
    """Convert a LocationCandidate to a serializable dict."""
    return {
        "id": candidate.id,
        "scene_id": candidate.scene_id,
        "project_id": candidate.project_id,
        "google_place_id": candidate.google_place_id,
        "venue_name": candidate.venue_name,
        "formatted_address": candidate.formatted_address,
        "latitude": candidate.latitude,
        "longitude": candidate.longitude,
        "phone_number": candidate.phone_number,
        "website_url": candidate.website_url,
        "google_rating": candidate.google_rating,
        "google_review_count": candidate.google_review_count,
        "price_level": candidate.price_level,
        "photo_urls": candidate.photo_urls,
        "photo_attributions": candidate.photo_attributions,
        "match_score": candidate.match_score,
        "match_reasoning": candidate.match_reasoning,
        "distance_from_center_km": candidate.distance_from_center_km,
        "visual_vibe_score": candidate.visual_vibe_score,
        "visual_features_detected": candidate.visual_features_detected,
        "visual_concerns": candidate.visual_concerns,
        "vapi_call_status": candidate.vapi_call_status.value,
        "red_flags": candidate.red_flags,
        "status": candidate.status.value,
    }
