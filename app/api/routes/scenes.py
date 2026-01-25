from fastapi import APIRouter, HTTPException
from uuid import UUID
import structlog

from app.db import queries

router = APIRouter()
logger = structlog.get_logger()


@router.get("/", response_model=list[dict])
async def list_scenes(script_id: UUID = None):
    """List scenes, optionally filtered by script."""
    if script_id:
        return await queries.get_scenes_by_script(script_id)
    # Return all scenes (would need a get_all_scenes query)
    return []


@router.get("/{scene_id}", response_model=dict)
async def get_scene(scene_id: UUID):
    """Get a specific scene with match scores."""
    scene = await queries.get_scene(scene_id)
    if not scene:
        raise HTTPException(status_code=404, detail="Scene not found")

    match_scores = await queries.get_match_scores_by_scene(scene_id)
    return {"scene": scene, "match_scores": match_scores}


@router.patch("/{scene_id}", response_model=dict)
async def update_scene(scene_id: UUID, updates: dict):
    """Update scene requirements."""
    scene = await queries.get_scene(scene_id)
    if not scene:
        raise HTTPException(status_code=404, detail="Scene not found")

    updated = await queries.update_scene(scene_id, updates)
    logger.info("Scene updated", scene_id=str(scene_id))
    return updated
