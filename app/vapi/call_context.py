"""
Call context builder for Vapi voice calls.

Builds the context variables that are passed to the Vapi assistant
for each outbound call to a venue.
"""

from dataclasses import dataclass
from typing import Any

from app.grounding.models import LocationCandidate


@dataclass
class ProjectContext:
    """Project-level context for calls."""

    project_id: str
    project_name: str
    production_company: str
    filming_dates: str = "the next few weeks"
    duration_description: str = "a full day of filming"
    crew_size: int = 20
    special_requirements: list[str] | None = None

    def to_dict(self) -> dict[str, Any]:
        """Convert to dictionary for Vapi variables."""
        return {
            "project_name": self.project_name,
            "production_company": self.production_company,
            "filming_dates": self.filming_dates,
            "duration_description": self.duration_description,
            "crew_size": str(self.crew_size),
            "special_requirements": ", ".join(self.special_requirements or []) or "none",
        }


@dataclass
class CallContext:
    """Complete context for a single Vapi call."""

    candidate: LocationCandidate
    project: ProjectContext
    scene_description: str = ""

    def build_assistant_variables(self) -> dict[str, str]:
        """
        Build the variable overrides for the Vapi assistant.

        These variables are substituted into the assistant's system prompt
        using {{variable_name}} syntax.
        """
        project_vars = self.project.to_dict()

        return {
            # Venue info
            "venue_name": self.candidate.venue_name,
            "venue_address": self.candidate.formatted_address,
            # Project info
            **project_vars,
            # Scene context
            "scene_description": self.scene_description or "a production scene",
        }

    def to_vapi_call_payload(
        self,
        phone_number_id: str,
        assistant_id: str,
    ) -> dict[str, Any]:
        """
        Build the complete payload for Vapi's create call API.

        Args:
            phone_number_id: The Vapi phone number ID to call from
            assistant_id: The Vapi assistant ID to use

        Returns:
            Dict ready to be sent to POST /call
        """
        if not self.candidate.phone_number:
            raise ValueError(f"Candidate {self.candidate.id} has no phone number")

        return {
            "phoneNumberId": phone_number_id,
            "assistantId": assistant_id,
            "customer": {
                "number": self.candidate.phone_number,
                "name": self.candidate.venue_name,
            },
            "assistantOverrides": {
                "variableValues": self.build_assistant_variables(),
            },
            # Metadata for webhook handling
            "metadata": {
                "candidate_id": self.candidate.id,
                "project_id": self.candidate.project_id,
                "scene_id": self.candidate.scene_id,
                "venue_name": self.candidate.venue_name,
            },
        }


def build_call_context(
    candidate: LocationCandidate,
    project_name: str,
    production_company: str,
    filming_dates: str | None = None,
    crew_size: int = 20,
    scene_description: str | None = None,
    special_requirements: list[str] | None = None,
) -> CallContext:
    """
    Convenience function to build a CallContext from individual parameters.

    Args:
        candidate: The location candidate to call
        project_name: Name of the film/production
        production_company: Name of the production company
        filming_dates: Description of when filming will occur
        crew_size: Number of crew members
        scene_description: Brief description of the scene
        special_requirements: List of special requirements

    Returns:
        CallContext ready for use with VapiService
    """
    project = ProjectContext(
        project_id=candidate.project_id,
        project_name=project_name,
        production_company=production_company,
        filming_dates=filming_dates or "the next few weeks",
        crew_size=crew_size,
        special_requirements=special_requirements,
    )

    return CallContext(
        candidate=candidate,
        project=project,
        scene_description=scene_description or "",
    )
