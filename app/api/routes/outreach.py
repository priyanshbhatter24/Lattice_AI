from fastapi import APIRouter, HTTPException, BackgroundTasks
from uuid import UUID
from pydantic import BaseModel
from typing import Optional
import structlog

from app.db import queries
from app.db.models import OutreachLogCreate
from app.agents.voice.vapi_client import initiate_call

router = APIRouter()
logger = structlog.get_logger()


class CallRequest(BaseModel):
    location_id: UUID
    phone_number: str
    preferred_dates: Optional[str] = None


class EmailRequest(BaseModel):
    location_id: UUID
    email: str
    message: Optional[str] = None


@router.post("/call")
async def start_call(request: CallRequest, background_tasks: BackgroundTasks):
    """Initiate a Vapi voice call to a location."""
    location = await queries.get_location(request.location_id)
    if not location:
        raise HTTPException(status_code=404, detail="Location not found")

    # Create outreach log
    log_data = OutreachLogCreate(
        location_id=request.location_id,
        type="call",
        status="pending",
    )
    outreach_log = await queries.create_outreach_log(log_data)

    # Start call in background
    background_tasks.add_task(
        initiate_call,
        location=location,
        phone_number=request.phone_number,
        outreach_log_id=outreach_log["id"],
        preferred_dates=request.preferred_dates,
    )

    logger.info("Call initiated", location_id=str(request.location_id))

    return {
        "status": "calling",
        "outreach_log_id": outreach_log["id"],
        "location_name": location["name"],
    }


@router.post("/email")
async def send_email(request: EmailRequest):
    """Send an inquiry email to a location."""
    location = await queries.get_location(request.location_id)
    if not location:
        raise HTTPException(status_code=404, detail="Location not found")

    # Create outreach log
    log_data = OutreachLogCreate(
        location_id=request.location_id,
        type="email",
        status="sent",
    )
    outreach_log = await queries.create_outreach_log(log_data)

    # TODO: Implement email sending
    logger.info("Email sent", location_id=str(request.location_id))

    return {
        "status": "sent",
        "outreach_log_id": outreach_log["id"],
    }


@router.get("/logs/{location_id}")
async def get_outreach_logs(location_id: UUID):
    """Get outreach history for a location."""
    logs = await queries.get_outreach_logs_by_location(location_id)
    return logs
