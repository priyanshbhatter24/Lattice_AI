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

from app.api.middleware.auth import AuthenticatedUser, get_current_user
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
    parallel_workers: int = 5  # Number of parallel workers


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
    auth: AuthenticatedUser = Depends(get_current_user),
) -> list[dict[str, Any]]:
    """
    Get all scenes for a project that can be grounded.

    Returns scenes with their current grounding status.
    """
    project_repo = ProjectRepository(access_token=auth.access_token)
    scene_repo = SceneRepository(access_token=auth.access_token)
    candidate_repo = LocationCandidateRepository(access_token=auth.access_token)

    # Verify project ownership
    project = project_repo.get(project_id)
    if not project or project.get("user_id") != auth.user_id:
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
    auth: AuthenticatedUser = Depends(get_current_user),
):
    """
    Ground multiple scenes with SSE streaming progress.

    Uses parallel workers to speed up processing significantly.

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
    scene_repo = SceneRepository(access_token=auth.access_token)
    project_repo = ProjectRepository(access_token=auth.access_token)
    verified_projects: set[str] = set()

    for scene_id in request.scene_ids:
        scene = scene_repo.get(scene_id)
        if not scene:
            raise HTTPException(status_code=404, detail=f"Scene {scene_id} not found")

        project_id = scene["project_id"]
        if project_id not in verified_projects:
            project = project_repo.get(project_id)
            if not project or project.get("user_id") != auth.user_id:
                raise HTTPException(status_code=404, detail=f"Scene {scene_id} not found")
            verified_projects.add(project_id)

    # Capture access_token for use in the generator
    access_token = auth.access_token

    async def event_stream():
        scene_repo = SceneRepository(access_token=access_token)
        candidate_repo = LocationCandidateRepository(access_token=access_token)

        total_scenes = len(request.scene_ids)
        num_workers = min(request.parallel_workers, total_scenes, 10)  # Cap at 10 workers

        # Queue for scenes to process and results
        scene_queue: asyncio.Queue = asyncio.Queue()
        result_queue: asyncio.Queue = asyncio.Queue()

        # Track progress
        processed_count = [0]  # Use list to allow mutation in nested function
        all_candidates = []

        # Send initial status
        yield _sse_event("status", {
            "message": f"Starting parallel grounding for {total_scenes} scenes with {num_workers} workers"
        })

        # Load all scenes upfront
        scenes_data = {}
        for scene_id in request.scene_ids:
            scene = scene_repo.get(scene_id)
            if scene:
                scenes_data[scene_id] = scene
                await scene_queue.put(scene_id)
            else:
                yield _sse_event("error", {"scene_id": scene_id, "error": "Scene not found"})

        # Worker function
        async def grounding_worker(worker_id: int):
            agent = GroundingAgent()  # Each worker gets its own agent

            while True:
                try:
                    # Get next scene with timeout
                    scene_id = await asyncio.wait_for(scene_queue.get(), timeout=0.5)
                except asyncio.TimeoutError:
                    # Check if we're done
                    if scene_queue.empty():
                        break
                    continue

                try:
                    scene = scenes_data[scene_id]

                    # Signal scene start
                    await result_queue.put(("scene_start", {
                        "scene_id": scene_id,
                        "scene_header": scene["scene_header"],
                        "worker_id": worker_id,
                    }))

                    # Build requirement and run grounding
                    requirement = _scene_to_requirement(scene, request.target_city, request.max_results)
                    result = await agent.find_and_verify_locations(
                        requirement,
                        verify_visuals=False,
                        save_to_db=False,
                    )

                    # Send each candidate
                    for candidate in result.candidates:
                        await result_queue.put(("candidate", {
                            "scene_id": scene_id,
                            "candidate": _candidate_to_dict(candidate),
                        }))

                    # Save to DB if requested
                    if request.save_to_db and result.candidates:
                        candidate_repo.create_many(result.candidates)
                        scene_repo.update_status(scene_id, "candidates_found")

                    # Signal scene complete - convert candidates to dicts for JSON serialization
                    await result_queue.put(("scene_complete", {
                        "scene_id": scene_id,
                        "scene_header": scene["scene_header"],
                        "candidates_found": len(result.candidates),
                        "candidates": [_candidate_to_dict(c) for c in result.candidates],
                        "query_used": result.query_used,
                        "processing_time": result.processing_time_seconds,
                    }))

                except Exception as e:
                    logger.error("Worker grounding failed", worker_id=worker_id, scene_id=scene_id, error=str(e))
                    await result_queue.put(("error", {
                        "scene_id": scene_id,
                        "error": str(e),
                    }))

                finally:
                    scene_queue.task_done()

        # Start workers
        workers = [asyncio.create_task(grounding_worker(i)) for i in range(num_workers)]

        # Stream results as they come in
        active_workers = num_workers
        while processed_count[0] < len(scenes_data) or not result_queue.empty():
            try:
                event_type, data = await asyncio.wait_for(result_queue.get(), timeout=0.5)

                yield _sse_event(event_type, data)

                if event_type == "scene_complete":
                    processed_count[0] += 1
                    all_candidates.extend(data.get("candidates", []))
                    yield _sse_event("progress", {
                        "processed": processed_count[0],
                        "total": total_scenes,
                        "percent": round((processed_count[0] / total_scenes) * 100),
                    })
                elif event_type == "error":
                    processed_count[0] += 1
                    yield _sse_event("progress", {
                        "processed": processed_count[0],
                        "total": total_scenes,
                        "percent": round((processed_count[0] / total_scenes) * 100),
                    })

            except asyncio.TimeoutError:
                # Check if all workers are done
                if all(w.done() for w in workers) and result_queue.empty():
                    break
                continue

        # Wait for all workers to complete
        await asyncio.gather(*workers, return_exceptions=True)

        # Final completion event
        yield _sse_event("complete", {
            "success": True,
            "total_scenes": total_scenes,
            "total_candidates": len(all_candidates),
            "workers_used": num_workers,
            "message": f"Parallel grounding complete. Found {len(all_candidates)} candidates across {total_scenes} scenes using {num_workers} workers.",
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
    auth: AuthenticatedUser = Depends(get_current_user),
) -> dict[str, Any]:
    """
    Ground a single scene (non-streaming).

    Returns all candidates found.
    """
    scene_repo = SceneRepository(access_token=auth.access_token)
    project_repo = ProjectRepository(access_token=auth.access_token)
    candidate_repo = LocationCandidateRepository(access_token=auth.access_token)
    agent = GroundingAgent()

    scene = scene_repo.get(request.scene_id)
    if not scene:
        raise HTTPException(status_code=404, detail="Scene not found")

    # Verify project ownership
    project = project_repo.get(scene["project_id"])
    if not project or project.get("user_id") != auth.user_id:
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
