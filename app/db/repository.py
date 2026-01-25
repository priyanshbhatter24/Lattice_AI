"""
Repository layer for database operations.

Provides CRUD operations for all AutoScout entities.
"""

from datetime import datetime
from typing import Any
from uuid import UUID

import structlog
from supabase import Client

from app.db.client import get_supabase_client
from app.grounding.models import (
    GroundingResult,
    LocationCandidate,
    LocationRequirement,
)

logger = structlog.get_logger()


class BaseRepository:
    """Base repository with common operations."""

    table_name: str = ""

    def __init__(self, client: Client | None = None):
        self.client = client or get_supabase_client()

    def _table(self):
        return self.client.table(self.table_name)


class ProjectRepository(BaseRepository):
    """Repository for projects table."""

    table_name = "projects"

    def create(
        self,
        name: str,
        company_name: str,
        target_city: str = "Los Angeles, CA",
        crew_size: int = 20,
        **kwargs,
    ) -> dict:
        """Create a new project."""
        data = {
            "name": name,
            "company_name": company_name,
            "target_city": target_city,
            "crew_size": crew_size,
            "status": "draft",
            **kwargs,
        }
        result = self._table().insert(data).execute()
        logger.info("Created project", project_id=result.data[0]["id"], name=name)
        return result.data[0]

    def get(self, project_id: str | UUID) -> dict | None:
        """Get a project by ID."""
        result = self._table().select("*").eq("id", str(project_id)).execute()
        return result.data[0] if result.data else None

    def update(self, project_id: str | UUID, **kwargs) -> dict:
        """Update a project."""
        result = self._table().update(kwargs).eq("id", str(project_id)).execute()
        return result.data[0] if result.data else None

    def update_status(self, project_id: str | UUID, status: str) -> dict:
        """Update project status."""
        return self.update(project_id, status=status)

    def list_all(self, limit: int = 100) -> list[dict]:
        """List all projects."""
        result = self._table().select("*").order("created_at", desc=True).limit(limit).execute()
        return result.data


class SceneRepository(BaseRepository):
    """Repository for scenes table (LocationRequirements)."""

    table_name = "scenes"

    def create(self, requirement: LocationRequirement) -> dict:
        """Create a scene from a LocationRequirement."""
        data = {
            "id": requirement.id,
            "project_id": requirement.project_id,
            "scene_number": requirement.scene_number,
            "scene_header": requirement.scene_header,
            "page_numbers": requirement.page_numbers,
            "script_excerpt": requirement.script_excerpt,
            "vibe": requirement.vibe.model_dump(),
            "constraints": requirement.constraints.model_dump(),
            "estimated_shoot_hours": requirement.estimated_shoot_hours,
            "priority": requirement.priority,
            "status": "pending",
        }
        result = self._table().insert(data).execute()
        logger.info("Created scene", scene_id=result.data[0]["id"], header=requirement.scene_header)
        return result.data[0]

    def create_many(self, requirements: list[LocationRequirement]) -> list[dict]:
        """Batch create scenes from LocationRequirements."""
        data = [
            {
                "id": req.id,
                "project_id": req.project_id,
                "scene_number": req.scene_number,
                "scene_header": req.scene_header,
                "page_numbers": req.page_numbers,
                "script_excerpt": req.script_excerpt,
                "vibe": req.vibe.model_dump(),
                "constraints": req.constraints.model_dump(),
                "estimated_shoot_hours": req.estimated_shoot_hours,
                "priority": req.priority,
                "status": "pending",
            }
            for req in requirements
        ]
        result = self._table().insert(data).execute()
        logger.info("Created scenes", count=len(result.data))
        return result.data

    def get(self, scene_id: str | UUID) -> dict | None:
        """Get a scene by ID."""
        result = self._table().select("*").eq("id", str(scene_id)).execute()
        return result.data[0] if result.data else None

    def list_by_project(self, project_id: str | UUID) -> list[dict]:
        """List all scenes for a project."""
        result = self._table().select("*").eq("project_id", str(project_id)).execute()
        return result.data

    def update_status(self, scene_id: str | UUID, status: str) -> dict:
        """Update scene status."""
        result = self._table().update({"status": status}).eq("id", str(scene_id)).execute()
        return result.data[0] if result.data else None


class LocationCandidateRepository(BaseRepository):
    """Repository for location_candidates table."""

    table_name = "location_candidates"

    def create(self, candidate: LocationCandidate) -> dict:
        """Create a location candidate."""
        data = self._candidate_to_dict(candidate)
        result = self._table().insert(data).execute()
        logger.info("Created candidate", candidate_id=result.data[0]["id"], venue=candidate.venue_name)
        return result.data[0]

    def create_many(self, candidates: list[LocationCandidate]) -> list[dict]:
        """Batch create location candidates."""
        data = [self._candidate_to_dict(c) for c in candidates]
        if not data:
            return []
        result = self._table().insert(data).execute()
        logger.info("Created candidates", count=len(result.data))
        return result.data

    def _candidate_to_dict(self, candidate: LocationCandidate) -> dict:
        """Convert LocationCandidate to database dict."""
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
            "opening_hours": candidate.opening_hours.model_dump() if candidate.opening_hours else None,
            "match_score": candidate.match_score,
            "match_reasoning": candidate.match_reasoning,
            "distance_from_center_km": candidate.distance_from_center_km,
            "visual_vibe_score": candidate.visual_vibe_score,
            "visual_features_detected": candidate.visual_features_detected,
            "visual_concerns": candidate.visual_concerns,
            "visual_analysis_summary": candidate.visual_analysis_summary,
            "vapi_call_status": candidate.vapi_call_status.value,
            "red_flags": candidate.red_flags,
            "status": candidate.status.value,
        }

    def get(self, candidate_id: str | UUID) -> dict | None:
        """Get a candidate by ID."""
        result = self._table().select("*").eq("id", str(candidate_id)).execute()
        return result.data[0] if result.data else None

    def list_by_scene(self, scene_id: str | UUID) -> list[dict]:
        """List all candidates for a scene."""
        result = (
            self._table()
            .select("*")
            .eq("scene_id", str(scene_id))
            .order("match_score", desc=True)
            .execute()
        )
        return result.data

    def list_by_project(self, project_id: str | UUID) -> list[dict]:
        """List all candidates for a project."""
        result = (
            self._table()
            .select("*")
            .eq("project_id", str(project_id))
            .order("match_score", desc=True)
            .execute()
        )
        return result.data

    def update(self, candidate_id: str | UUID, **kwargs) -> dict:
        """Update a candidate."""
        result = self._table().update(kwargs).eq("id", str(candidate_id)).execute()
        return result.data[0] if result.data else None

    def update_status(self, candidate_id: str | UUID, status: str) -> dict:
        """Update candidate status."""
        return self.update(candidate_id, status=status)

    def update_vapi_call(
        self,
        candidate_id: str | UUID,
        vapi_call_status: str,
        vapi_call_id: str | None = None,
        **call_data,
    ) -> dict:
        """Update Vapi call data for a candidate."""
        data = {"vapi_call_status": vapi_call_status, **call_data}
        if vapi_call_id:
            data["vapi_call_id"] = vapi_call_id
        return self.update(candidate_id, **data)

    def approve(self, candidate_id: str | UUID, approved_by: str | UUID) -> dict:
        """Approve a candidate."""
        return self.update(
            candidate_id,
            status="approved",
            approved_by=str(approved_by),
            approved_at=datetime.utcnow().isoformat(),
        )

    def reject(self, candidate_id: str | UUID, reason: str) -> dict:
        """Reject a candidate."""
        return self.update(
            candidate_id,
            status="rejected",
            rejection_reason=reason,
        )


class BookingRepository(BaseRepository):
    """Repository for bookings table."""

    table_name = "bookings"

    def create(
        self,
        candidate: LocationCandidate,
        approved_by: str | UUID,
        filming_dates: list[dict] | None = None,
    ) -> dict:
        """Create a booking from an approved candidate."""
        data = {
            "location_candidate_id": candidate.id,
            "project_id": candidate.project_id,
            "scene_id": candidate.scene_id,
            "venue_name": candidate.venue_name,
            "venue_address": candidate.formatted_address,
            "venue_phone": candidate.phone_number,
            "contact_name": candidate.manager_name,
            "contact_email": candidate.manager_email,
            "confirmed_price": candidate.negotiated_price,
            "price_unit": candidate.price_unit,
            "filming_dates": filming_dates,
            "status": "pending_confirmation",
            "approved_by": str(approved_by),
            "approved_at": datetime.utcnow().isoformat(),
        }
        result = self._table().insert(data).execute()
        logger.info("Created booking", booking_id=result.data[0]["id"], venue=candidate.venue_name)
        return result.data[0]

    def get(self, booking_id: str | UUID) -> dict | None:
        """Get a booking by ID."""
        result = self._table().select("*").eq("id", str(booking_id)).execute()
        return result.data[0] if result.data else None

    def list_by_project(self, project_id: str | UUID) -> list[dict]:
        """List all bookings for a project."""
        result = self._table().select("*").eq("project_id", str(project_id)).execute()
        return result.data

    def update_status(self, booking_id: str | UUID, status: str) -> dict:
        """Update booking status."""
        result = self._table().update({"status": status}).eq("id", str(booking_id)).execute()
        return result.data[0] if result.data else None

    def mark_email_sent(self, booking_id: str | UUID, email_id: str) -> dict:
        """Mark confirmation email as sent."""
        result = (
            self._table()
            .update({
                "confirmation_email_sent_at": datetime.utcnow().isoformat(),
                "confirmation_email_id": email_id,
            })
            .eq("id", str(booking_id))
            .execute()
        )
        return result.data[0] if result.data else None


# ══════════════════════════════════════════════════════════
# Convenience function for saving grounding results
# ══════════════════════════════════════════════════════════


def save_grounding_results(
    results: list[GroundingResult],
    client: Client | None = None,
) -> dict[str, Any]:
    """
    Save grounding results to database (batch operation).

    Updates scene status and creates all location candidates.
    Returns summary of saved data.
    """
    candidate_repo = LocationCandidateRepository(client)
    scene_repo = SceneRepository(client)

    total_candidates = 0
    scenes_updated = 0

    for result in results:
        # Save candidates
        if result.candidates:
            candidate_repo.create_many(result.candidates)
            total_candidates += len(result.candidates)

        # Update scene status
        scene_repo.update_status(result.scene_id, "candidates_found")
        scenes_updated += 1

    logger.info(
        "Saved grounding results",
        scenes=scenes_updated,
        candidates=total_candidates,
    )

    return {
        "scenes_updated": scenes_updated,
        "candidates_created": total_candidates,
    }
