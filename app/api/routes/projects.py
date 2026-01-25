"""
API routes for project management.

Provides endpoints for creating and managing film projects.
All endpoints require authentication. RLS handles authorization.
"""

from typing import Any

import structlog
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.api.middleware.auth import AuthenticatedUser, get_current_user
from app.db.repository import ProjectRepository, SceneRepository

logger = structlog.get_logger()

router = APIRouter(prefix="/api/projects", tags=["projects"])


# ══════════════════════════════════════════════════════════
# Request/Response Models
# ══════════════════════════════════════════════════════════


class CreateProjectRequest(BaseModel):
    """Request to create a new project."""

    name: str
    company_name: str
    target_city: str = "Los Angeles, CA"
    crew_size: int = 20
    filming_start_date: str | None = None
    filming_end_date: str | None = None
    script_path: str | None = None


class CreateSceneRequest(BaseModel):
    """Request to create a test scene."""

    scene_number: str
    scene_header: str
    estimated_shoot_hours: int = 12


# ══════════════════════════════════════════════════════════
# Endpoints
# ══════════════════════════════════════════════════════════


@router.get("")
async def list_projects(
    limit: int = 50,
    auth: AuthenticatedUser = Depends(get_current_user),
) -> list[dict[str, Any]]:
    """List all projects for the authenticated user."""
    # RLS automatically filters to user's projects
    repo = ProjectRepository(access_token=auth.access_token)
    return repo.list_by_user(auth.user_id, limit=limit)


@router.get("/{project_id}")
async def get_project(
    project_id: str,
    auth: AuthenticatedUser = Depends(get_current_user),
) -> dict[str, Any]:
    """Get a single project by ID (RLS ensures ownership)."""
    repo = ProjectRepository(access_token=auth.access_token)
    project = repo.get(project_id)

    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    return project


@router.post("")
async def create_project(
    request: CreateProjectRequest,
    auth: AuthenticatedUser = Depends(get_current_user),
) -> dict[str, Any]:
    """Create a new project for the authenticated user."""
    repo = ProjectRepository(access_token=auth.access_token)

    project = repo.create(
        name=request.name,
        company_name=request.company_name,
        target_city=request.target_city,
        crew_size=request.crew_size,
        filming_start_date=request.filming_start_date,
        filming_end_date=request.filming_end_date,
        script_path=request.script_path,
        user_id=auth.user_id,
    )

    logger.info("Created project", project_id=project["id"], name=request.name, user_id=auth.user_id)

    return project


@router.patch("/{project_id}")
async def update_project(
    project_id: str,
    updates: dict[str, Any],
    auth: AuthenticatedUser = Depends(get_current_user),
) -> dict[str, Any]:
    """Update a project (RLS ensures ownership)."""
    repo = ProjectRepository(access_token=auth.access_token)

    # Filter allowed fields
    allowed_fields = {
        "name",
        "company_name",
        "target_city",
        "crew_size",
        "filming_start_date",
        "filming_end_date",
        "status",
        "script_path",
    }
    filtered_updates = {k: v for k, v in updates.items() if k in allowed_fields}

    if not filtered_updates:
        raise HTTPException(status_code=400, detail="No valid fields to update")

    result = repo.update(project_id, **filtered_updates)

    if not result:
        raise HTTPException(status_code=404, detail="Project not found")

    logger.info("Updated project", project_id=project_id, fields=list(filtered_updates.keys()))

    return result


@router.delete("/{project_id}")
async def delete_project(
    project_id: str,
    auth: AuthenticatedUser = Depends(get_current_user),
) -> dict[str, Any]:
    """Delete a project (RLS ensures ownership)."""
    repo = ProjectRepository(access_token=auth.access_token)

    # Check exists first (RLS will filter)
    project = repo.get(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    repo.delete(project_id)

    logger.info("Deleted project", project_id=project_id, user_id=auth.user_id)

    return {"success": True, "deleted_id": project_id}


@router.get("/{project_id}/scenes")
async def list_project_scenes(
    project_id: str,
    auth: AuthenticatedUser = Depends(get_current_user),
) -> list[dict[str, Any]]:
    """List all scenes for a project (RLS ensures ownership)."""
    repo = ProjectRepository(access_token=auth.access_token)
    scene_repo = SceneRepository(access_token=auth.access_token)

    # Verify project exists and user can access it
    project = repo.get(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    return scene_repo.list_by_project(project_id)


@router.post("/{project_id}/scenes")
async def create_scene(
    project_id: str,
    request: CreateSceneRequest,
    auth: AuthenticatedUser = Depends(get_current_user),
) -> dict[str, Any]:
    """
    Create a test scene for a project (RLS ensures ownership).

    This is primarily for testing - normally scenes come from Stage 1 script analysis.
    """
    from uuid import uuid4

    repo = ProjectRepository(access_token=auth.access_token)
    scene_repo = SceneRepository(access_token=auth.access_token)

    # Verify project exists and user can access it
    project = repo.get(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    scene_id = str(uuid4())

    data = {
        "id": scene_id,
        "project_id": project_id,
        "scene_number": request.scene_number,
        "scene_header": request.scene_header,
        "estimated_shoot_hours": request.estimated_shoot_hours,
        "vibe": {},
        "constraints": {},
        "status": "pending",
    }

    result = scene_repo._table().insert(data).execute()

    logger.info("Created test scene", scene_id=scene_id, project_id=project_id)

    return result.data[0]
