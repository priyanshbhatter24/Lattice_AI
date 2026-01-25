"""
Location models for Stage 1: Script Analysis.

These models are designed to be compatible with Stage 2's input requirements.
"""

from typing import Literal
from uuid import uuid4

from pydantic import BaseModel, Field

# Import shared types from Stage 2 (source of truth)
from app.grounding.models import VibeCategory


class Vibe(BaseModel):
    """Visual/aesthetic classification of a location."""

    primary: VibeCategory = Field(
        description="Main aesthetic category"
    )
    secondary: VibeCategory | None = Field(
        default=None, description="Optional secondary aesthetic"
    )
    descriptors: list[str] = Field(
        default_factory=list,
        description="3-5 specific visual descriptors from the script"
    )
    confidence: float = Field(ge=0.0, le=1.0, description="Confidence score 0.0-1.0")


class Constraints(BaseModel):
    """Physical requirements and constraints for a filming location."""

    interior_exterior: Literal["interior", "exterior", "both"]
    time_of_day: Literal["day", "night", "both"]
    special_requirements: list[str] = Field(
        default_factory=list,
        description="Specific requirements derived from the script (props, stunts, features)",
    )


class LocationRequirement(BaseModel):
    """
    Complete location requirement for a scene.

    Compatible with Stage 2's LocationRequirement input format.
    """

    # Core identifiers
    id: str = Field(default_factory=lambda: str(uuid4()))
    project_id: str = Field(default="")
    scene_number: str = Field(description="Scene number/identifier (e.g., '1', 'SC_001')")
    scene_header: str = Field(description="Full scene header (e.g., 'INT. WAREHOUSE - NIGHT')")
    page_numbers: list[int] = Field(default_factory=list)
    script_excerpt: str = Field(default="", description="Relevant script excerpt for context")

    # Vibe and constraints
    vibe: Vibe
    constraints: Constraints

    # Scheduling
    estimated_shoot_hours: int = Field(default=8, description="Estimated shoot duration in hours")
    priority: Literal["critical", "important", "flexible"] = "important"

    # Search configuration (can be overridden per-scene or set at project level)
    target_city: str = "Los Angeles, CA"
    search_radius_km: float = 50.0
    max_results: int = 10

    # Scouting notes (Stage 1 enrichment, not required by Stage 2)
    location_description: str = Field(
        default="",
        description="Detailed description for finding real-world location"
    )
    scouting_notes: str = Field(
        default="",
        description="Practical notes for location scouts with must-haves and deal-breakers"
    )


class SceneOccurrence(BaseModel):
    """A single occurrence of a scene in the script."""

    page_number: int
    context: str = Field(description="Script text around this scene occurrence")


class UniqueLocation(BaseModel):
    """A unique location that may appear multiple times in the script."""

    scene_header: str = Field(description="Normalized location name")
    interior_exterior: str = Field(description="INT, EXT, or INT/EXT")
    time_of_day: str = Field(description="DAY, NIGHT, etc.")
    occurrences: list[SceneOccurrence] = Field(
        description="All times this location appears in the script"
    )
    page_numbers: list[int] = Field(description="All pages where this location appears")

    @property
    def combined_context(self) -> str:
        """Combine context from all occurrences for LLM analysis."""
        contexts = [f"[Page {occ.page_number}]\n{occ.context}" for occ in self.occurrences]
        return "\n\n---\n\n".join(contexts)
