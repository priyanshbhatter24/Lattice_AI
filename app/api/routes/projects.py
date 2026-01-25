"""
API routes for project management.

Provides endpoints for creating and managing film projects.
"""

from typing import Any

import structlog
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

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


class CreateSceneRequest(BaseModel):
    """Request to create a test scene."""

    scene_number: str
    scene_header: str
    estimated_shoot_hours: int = 12


# ══════════════════════════════════════════════════════════
# Endpoints
# ══════════════════════════════════════════════════════════


@router.get("")
async def list_projects(limit: int = 50) -> list[dict[str, Any]]:
    """List all projects."""
    repo = ProjectRepository()
    return repo.list_all(limit=limit)


@router.get("/{project_id}")
async def get_project(project_id: str) -> dict[str, Any]:
    """Get a single project by ID."""
    repo = ProjectRepository()
    project = repo.get(project_id)

    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    return project


@router.post("")
async def create_project(request: CreateProjectRequest) -> dict[str, Any]:
    """Create a new project."""
    repo = ProjectRepository()

    project = repo.create(
        name=request.name,
        company_name=request.company_name,
        target_city=request.target_city,
        crew_size=request.crew_size,
        filming_start_date=request.filming_start_date,
        filming_end_date=request.filming_end_date,
    )

    logger.info("Created project", project_id=project["id"], name=request.name)

    return project


@router.patch("/{project_id}")
async def update_project(project_id: str, updates: dict[str, Any]) -> dict[str, Any]:
    """Update a project."""
    repo = ProjectRepository()

    project = repo.get(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    # Filter allowed fields
    allowed_fields = {
        "name",
        "company_name",
        "target_city",
        "crew_size",
        "filming_start_date",
        "filming_end_date",
        "status",
    }
    filtered_updates = {k: v for k, v in updates.items() if k in allowed_fields}

    if not filtered_updates:
        raise HTTPException(status_code=400, detail="No valid fields to update")

    result = repo.update(project_id, **filtered_updates)

    logger.info("Updated project", project_id=project_id, fields=list(filtered_updates.keys()))

    return result


@router.get("/{project_id}/scenes")
async def list_project_scenes(project_id: str) -> list[dict[str, Any]]:
    """List all scenes for a project."""
    project_repo = ProjectRepository()
    scene_repo = SceneRepository()

    project = project_repo.get(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    return scene_repo.list_by_project(project_id)


@router.post("/{project_id}/scenes")
async def create_scene(project_id: str, request: CreateSceneRequest) -> dict[str, Any]:
    """
    Create a test scene for a project.

    This is primarily for testing - normally scenes come from Stage 1 script analysis.
    """
    from uuid import uuid4

    project_repo = ProjectRepository()
    scene_repo = SceneRepository()

    project = project_repo.get(project_id)
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
