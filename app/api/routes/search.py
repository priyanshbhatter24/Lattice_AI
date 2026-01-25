from fastapi import APIRouter, HTTPException, BackgroundTasks
from uuid import UUID
from pydantic import BaseModel
import structlog

from app.db import queries
from app.agents.orchestrator import run_location_search

router = APIRouter()
logger = structlog.get_logger()


class SearchRequest(BaseModel):
    scene_ids: list[UUID]
    location: str  # e.g., "Los Angeles, CA"
    sources: list[str] = ["airbnb", "google"]
    max_results: int = 20


@router.post("/")
async def start_search(request: SearchRequest, background_tasks: BackgroundTasks):
    """Start browser agents to search for locations."""
    # Validate scenes exist
    for scene_id in request.scene_ids:
        scene = await queries.get_scene(scene_id)
        if not scene:
            raise HTTPException(status_code=404, detail=f"Scene {scene_id} not found")

    # Start search in background
    background_tasks.add_task(
        run_location_search,
        scene_ids=[str(sid) for sid in request.scene_ids],
        location=request.location,
        sources=request.sources,
        max_results=request.max_results,
    )

    logger.info(
        "Search started",
        scene_ids=[str(sid) for sid in request.scene_ids],
        location=request.location,
    )

    return {
        "status": "started",
        "message": f"Searching for locations in {request.location}",
        "scene_ids": [str(sid) for sid in request.scene_ids],
    }
