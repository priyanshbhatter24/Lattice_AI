import httpx
import structlog
from uuid import UUID

from app.config import get_settings
from app.db import queries
from app.agents.voice.call_scripts import get_location_inquiry_prompt

logger = structlog.get_logger()

VAPI_API_BASE = "https://api.vapi.ai"


async def initiate_call(
    location: dict,
    phone_number: str,
    outreach_log_id: str,
    preferred_dates: str | None = None,
):
    """Initiate a Vapi voice call to inquire about a location."""
    settings = get_settings()

    if not settings.vapi_api_key:
        logger.warning("Vapi API key not configured")
        await queries.update_outreach_log(
            UUID(outreach_log_id),
            {"status": "failed", "transcript": "Vapi API key not configured"},
        )
        return

    # Build the assistant prompt
    assistant_prompt = get_location_inquiry_prompt(
        location_name=location.get("name", "the location"),
        location_address=location.get("address", ""),
        preferred_dates=preferred_dates,
    )

    try:
        async with httpx.AsyncClient() as client:
            # Create a call using Vapi API
            response = await client.post(
                f"{VAPI_API_BASE}/call/phone",
                headers={
                    "Authorization": f"Bearer {settings.vapi_api_key}",
                    "Content-Type": "application/json",
                },
                json={
                    "phoneNumberId": settings.vapi_assistant_id,  # Your Vapi phone number
                    "customer": {
                        "number": phone_number,
                    },
                    "assistant": {
                        "model": {
                            "provider": "openai",
                            "model": "gpt-4",
                            "messages": [
                                {
                                    "role": "system",
                                    "content": assistant_prompt,
                                }
                            ],
                        },
                        "voice": {
                            "provider": "11labs",
                            "voiceId": "21m00Tcm4TlvDq8ikWAM",  # Rachel voice
                        },
                        "firstMessage": f"Hi, this is Alex calling from Scout Productions. Am I speaking with someone who manages {location.get('name', 'your property')}?",
                    },
                    "metadata": {
                        "location_id": location.get("id"),
                        "outreach_log_id": outreach_log_id,
                    },
                },
                timeout=30.0,
            )

            if response.status_code == 201:
                call_data = response.json()
                call_id = call_data.get("id")

                logger.info("Vapi call initiated", call_id=call_id)

                # Update outreach log with call ID
                await queries.update_outreach_log(
                    UUID(outreach_log_id),
                    {"status": "in_progress", "vapi_call_id": call_id},
                )

                return call_id
            else:
                logger.error(
                    "Vapi call failed",
                    status=response.status_code,
                    response=response.text,
                )
                await queries.update_outreach_log(
                    UUID(outreach_log_id),
                    {"status": "failed", "transcript": f"API error: {response.status_code}"},
                )

    except Exception as e:
        logger.error("Failed to initiate Vapi call", error=str(e))
        await queries.update_outreach_log(
            UUID(outreach_log_id),
            {"status": "failed", "transcript": str(e)},
        )


async def handle_vapi_webhook(payload: dict):
    """Handle incoming Vapi webhook for call status updates."""
    event_type = payload.get("type")
    call_id = payload.get("call", {}).get("id")
    metadata = payload.get("call", {}).get("metadata", {})
    outreach_log_id = metadata.get("outreach_log_id")

    if not outreach_log_id:
        logger.warning("Webhook missing outreach_log_id", call_id=call_id)
        return

    logger.info("Vapi webhook received", event_type=event_type, call_id=call_id)

    if event_type == "call.ended":
        # Extract call results
        transcript = payload.get("transcript", "")
        summary = payload.get("summary", "")
        duration = payload.get("call", {}).get("duration")

        # Parse the summary to extract structured data
        extracted_data = parse_call_summary(summary, transcript)

        await queries.update_outreach_log(
            UUID(outreach_log_id),
            {
                "status": "completed",
                "transcript": transcript,
                "summary": extracted_data,
                "availability": extracted_data.get("availability"),
                "quoted_price": extracted_data.get("price"),
                "restrictions": extracted_data.get("restrictions"),
                "next_steps": extracted_data.get("next_steps"),
            },
        )

        logger.info("Call completed", call_id=call_id, duration=duration)

    elif event_type == "call.failed":
        error = payload.get("error", "Unknown error")
        await queries.update_outreach_log(
            UUID(outreach_log_id),
            {"status": "failed", "transcript": f"Call failed: {error}"},
        )


def parse_call_summary(summary: str, transcript: str) -> dict:
    """Parse the call summary/transcript to extract structured information."""
    # This is a simple parser - could be enhanced with LLM extraction
    data = {
        "availability": None,
        "price": None,
        "restrictions": None,
        "next_steps": None,
        "raw_summary": summary,
    }

    text = (summary + " " + transcript).lower()

    # Look for pricing patterns
    import re

    price_patterns = [
        r"\$[\d,]+(?:\s*(?:per|/)\s*(?:hour|day|night))?",
        r"[\d,]+\s*dollars?\s*(?:per|/|an?)\s*(?:hour|day|night)?",
    ]
    for pattern in price_patterns:
        match = re.search(pattern, text)
        if match:
            data["price"] = match.group(0)
            break

    # Look for availability indicators
    if "available" in text:
        data["availability"] = "Available"
    elif "not available" in text or "unavailable" in text or "booked" in text:
        data["availability"] = "Not Available"

    return data
