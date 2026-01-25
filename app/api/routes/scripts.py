from fastapi import APIRouter, HTTPException, UploadFile, File, Form
from uuid import UUID
from typing import Optional
import structlog

from app.db.models import ScriptCreate, Script, Scene
from app.db import queries
from app.agents.script_parser import parse_script

router = APIRouter()
logger = structlog.get_logger()


@router.post("/", response_model=dict)
async def upload_script(
    title: str = Form(...),
    content: Optional[str] = Form(None),
    file: Optional[UploadFile] = File(None),
):
    """Upload and parse a script."""
    if not content and not file:
        raise HTTPException(status_code=400, detail="Either content or file must be provided")

    if file:
        content = (await file.read()).decode("utf-8")

    # Create script record
    script_data = ScriptCreate(title=title, content=content)
    script = await queries.create_script(script_data)
    logger.info("Script created", script_id=script["id"])

    # Parse script to extract scenes
    scenes = await parse_script(script["id"], content)
    logger.info("Scenes extracted", count=len(scenes))

    return {"script": script, "scenes": scenes}


@router.get("/", response_model=list[dict])
async def list_scripts():
    """List all scripts."""
    return await queries.get_scripts()


@router.get("/{script_id}", response_model=dict)
async def get_script(script_id: UUID):
    """Get a script with its scenes."""
    script = await queries.get_script(script_id)
    if not script:
        raise HTTPException(status_code=404, detail="Script not found")

    scenes = await queries.get_scenes_by_script(script_id)
    return {"script": script, "scenes": scenes}
