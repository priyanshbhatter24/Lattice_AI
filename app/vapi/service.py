"""
Vapi service for Stage 3: Voice Outreach.

Handles all interactions with the Vapi API for outbound calls
to venue managers.
"""

import asyncio
from datetime import datetime, timezone
from typing import Any
from uuid import uuid4

import httpx
import structlog

from app.db.repository import LocationCandidateRepository
from app.grounding.models import VapiCallStatus
from app.vapi.call_context import CallContext
from app.vapi.config import get_vapi_config

logger = structlog.get_logger()


class VapiService:
    """Service for managing Vapi voice calls."""

    def __init__(self):
        self.config = get_vapi_config()
        self.base_url = self.config.vapi_base_url
        self.headers = {
            "Authorization": f"Bearer {self.config.vapi_api_key}",
            "Content-Type": "application/json",
        }
        self.candidate_repo = LocationCandidateRepository()

    async def trigger_call(self, context: CallContext) -> str:
        """
        Trigger a single outbound call via Vapi.

        Args:
            context: The call context with candidate and project info

        Returns:
            The Vapi call ID

        Raises:
            ValueError: If candidate has no phone number
            httpx.HTTPError: If Vapi API call fails
        """
        candidate = context.candidate

        # Build the API payload
        payload = context.to_vapi_call_payload(
            phone_number_id=self.config.vapi_phone_number_id,
            assistant_id=self.config.vapi_assistant_id,
        )

        logger.info(
            "Triggering Vapi call",
            candidate_id=candidate.id,
            venue=candidate.venue_name,
            phone=candidate.phone_number,
        )

        # Update status to queued
        self.candidate_repo.update_vapi_call(
            candidate_id=candidate.id,
            vapi_call_status=VapiCallStatus.QUEUED.value,
            vapi_call_initiated_at=datetime.now(timezone.utc).isoformat(),
        )

        try:
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    f"{self.base_url}/call",
                    headers=self.headers,
                    json=payload,
                    timeout=30.0,
                )
                response.raise_for_status()
                data = response.json()

            vapi_call_id = data.get("id")

            # Update with call ID
            self.candidate_repo.update_vapi_call(
                candidate_id=candidate.id,
                vapi_call_status=VapiCallStatus.RINGING.value,
                vapi_call_id=vapi_call_id,
            )

            logger.info(
                "Vapi call initiated",
                candidate_id=candidate.id,
                vapi_call_id=vapi_call_id,
            )

            return vapi_call_id

        except httpx.HTTPError as e:
            logger.error(
                "Vapi call failed",
                candidate_id=candidate.id,
                error=str(e),
            )
            self.candidate_repo.update_vapi_call(
                candidate_id=candidate.id,
                vapi_call_status=VapiCallStatus.FAILED.value,
            )
            raise

    async def trigger_batch_calls(
        self,
        contexts: list[CallContext],
        max_concurrent: int | None = None,
    ) -> str:
        """
        Trigger multiple calls concurrently.

        Args:
            contexts: List of call contexts
            max_concurrent: Max concurrent calls (defaults to config value)

        Returns:
            Batch ID for tracking
        """
        batch_id = str(uuid4())
        max_concurrent = max_concurrent or self.config.max_concurrent_calls

        logger.info(
            "Starting batch calls",
            batch_id=batch_id,
            total_calls=len(contexts),
            max_concurrent=max_concurrent,
        )

        # Use semaphore to limit concurrency
        semaphore = asyncio.Semaphore(max_concurrent)

        async def call_with_semaphore(context: CallContext) -> tuple[str, str | None, str | None]:
            async with semaphore:
                try:
                    call_id = await self.trigger_call(context)
                    return (context.candidate.id, call_id, None)
                except Exception as e:
                    return (context.candidate.id, None, str(e))

        # Run all calls concurrently (with semaphore limiting)
        results = await asyncio.gather(
            *[call_with_semaphore(ctx) for ctx in contexts],
            return_exceptions=True,
        )

        # Log results
        successful = sum(1 for r in results if isinstance(r, tuple) and r[1] is not None)
        failed = len(results) - successful

        logger.info(
            "Batch calls completed",
            batch_id=batch_id,
            successful=successful,
            failed=failed,
        )

        return batch_id

    async def get_call_status(self, vapi_call_id: str) -> dict[str, Any]:
        """
        Get the current status of a call from Vapi.

        Args:
            vapi_call_id: The Vapi call ID

        Returns:
            Call status data from Vapi
        """
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"{self.base_url}/call/{vapi_call_id}",
                headers=self.headers,
                timeout=30.0,
            )
            response.raise_for_status()
            return response.json()

    def parse_webhook_payload(self, payload: dict[str, Any]) -> dict[str, Any]:
        """
        Parse a Vapi webhook payload and extract relevant data.

        Args:
            payload: The raw webhook payload from Vapi

        Returns:
            Parsed data ready for database update
        """
        message_type = payload.get("message", {}).get("type")

        if message_type == "end-of-call-report":
            return self._parse_end_of_call_report(payload)
        elif message_type == "status-update":
            return self._parse_status_update(payload)
        else:
            logger.warning("Unknown webhook message type", type=message_type)
            return {}

    def _parse_end_of_call_report(self, payload: dict[str, Any]) -> dict[str, Any]:
        """Parse end-of-call-report webhook."""
        message = payload.get("message", {})
        call = message.get("call", {})
        analysis = message.get("analysis", {})
        metadata = call.get("metadata", {})

        # Get structured data from analysis
        structured_data = analysis.get("structuredData", {})

        # Build the update data
        update_data = {
            "candidate_id": metadata.get("candidate_id"),
            "vapi_call_id": call.get("id"),
            "vapi_call_status": VapiCallStatus.COMPLETED.value,
            "vapi_call_completed_at": datetime.now(timezone.utc).isoformat(),
            "vapi_call_duration_seconds": call.get("duration"),
            "vapi_recording_url": call.get("recordingUrl"),
            "vapi_transcript": message.get("transcript"),
            # Extracted data
            "venue_available": structured_data.get("venue_available"),
            "availability_details": str(structured_data.get("availability_slots", [])),
            "negotiated_price": structured_data.get("price_quoted"),
            "price_unit": structured_data.get("price_unit"),
            "manager_name": structured_data.get("contact_name"),
            "manager_title": structured_data.get("contact_title"),
            "manager_email": structured_data.get("reservation_details")
            if structured_data.get("reservation_method") == "email"
            else None,
            "red_flags": structured_data.get("red_flags", []),
            "call_summary": analysis.get("summary"),
            "call_success_score": analysis.get("successEvaluation"),
        }

        # Add reservation method details
        reservation_method = structured_data.get("reservation_method")
        if reservation_method:
            update_data["reservation_method"] = reservation_method
            update_data["reservation_details"] = structured_data.get("reservation_details")

        return update_data

    def _parse_status_update(self, payload: dict[str, Any]) -> dict[str, Any]:
        """Parse status-update webhook."""
        message = payload.get("message", {})
        call = message.get("call", {})
        status = message.get("status")
        metadata = call.get("metadata", {})

        # Map Vapi status to our enum
        status_map = {
            "ringing": VapiCallStatus.RINGING.value,
            "in-progress": VapiCallStatus.IN_PROGRESS.value,
            "ended": VapiCallStatus.COMPLETED.value,
            "busy": VapiCallStatus.BUSY.value,
            "no-answer": VapiCallStatus.NO_ANSWER.value,
            "voicemail": VapiCallStatus.VOICEMAIL.value,
            "failed": VapiCallStatus.FAILED.value,
        }

        return {
            "candidate_id": metadata.get("candidate_id"),
            "vapi_call_status": status_map.get(status, status),
        }

    async def update_candidate_from_webhook(self, payload: dict[str, Any]) -> dict | None:
        """
        Process a webhook payload and update the database.

        Args:
            payload: Raw webhook payload from Vapi

        Returns:
            Updated candidate data, or None if update failed
        """
        parsed = self.parse_webhook_payload(payload)

        if not parsed or not parsed.get("candidate_id"):
            logger.warning("Could not parse webhook payload")
            return None

        candidate_id = parsed.pop("candidate_id")

        # Filter out None values
        update_data = {k: v for k, v in parsed.items() if v is not None}

        if update_data:
            result = self.candidate_repo.update(candidate_id, **update_data)
            logger.info(
                "Updated candidate from webhook",
                candidate_id=candidate_id,
                status=update_data.get("vapi_call_status"),
            )
            return result

        return None


# Singleton instance
_vapi_service: VapiService | None = None


def get_vapi_service() -> VapiService:
    """Get or create the VapiService singleton."""
    global _vapi_service
    if _vapi_service is None:
        _vapi_service = VapiService()
    return _vapi_service
