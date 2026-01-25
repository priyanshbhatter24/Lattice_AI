"""
Webhook handlers for Vapi callbacks.

Receives real-time updates from Vapi about call status and results.
"""

from typing import Any

import structlog
from fastapi import APIRouter, Request

from app.vapi.service import get_vapi_service

logger = structlog.get_logger()

router = APIRouter(prefix="/api/webhooks", tags=["webhooks"])


@router.post("/vapi")
async def handle_vapi_webhook(request: Request) -> dict[str, Any]:
    """
    Handle incoming webhooks from Vapi.

    Vapi sends several types of webhooks:
    - status-update: Call status changes (ringing, in-progress, ended)
    - end-of-call-report: Complete call data with transcript and analysis
    - transcript: Real-time transcript updates
    - function-call: When assistant needs to call a function

    We primarily care about:
    1. status-update - Update call status in database
    2. end-of-call-report - Extract structured data and update candidate
    """
    try:
        payload = await request.json()
    except Exception as e:
        logger.error("Failed to parse webhook payload", error=str(e))
        return {"success": False, "error": "Invalid JSON payload"}

    # Log the webhook type
    message = payload.get("message", {})
    message_type = message.get("type", "unknown")
    call_id = message.get("call", {}).get("id")

    logger.info(
        "Received Vapi webhook",
        type=message_type,
        call_id=call_id,
    )

    # Handle different webhook types
    if message_type in ["status-update", "end-of-call-report"]:
        vapi_service = get_vapi_service()
        result = await vapi_service.update_candidate_from_webhook(payload)

        if result:
            logger.info(
                "Candidate updated from webhook",
                type=message_type,
                call_id=call_id,
            )
            return {"success": True, "updated": True}
        else:
            logger.warning(
                "Could not update candidate from webhook",
                type=message_type,
                call_id=call_id,
            )
            return {"success": True, "updated": False}

    elif message_type == "transcript":
        # Real-time transcript - log but don't process
        logger.debug("Received transcript update", call_id=call_id)
        return {"success": True, "type": "transcript"}

    elif message_type == "function-call":
        # Function calls - we don't use these currently
        logger.debug("Received function call", call_id=call_id)
        return {"success": True, "type": "function-call"}

    else:
        logger.debug("Received unhandled webhook type", type=message_type)
        return {"success": True, "type": message_type}


@router.get("/vapi/health")
async def webhook_health() -> dict[str, str]:
    """Health check for webhook endpoint."""
    return {"status": "ok", "endpoint": "vapi"}
