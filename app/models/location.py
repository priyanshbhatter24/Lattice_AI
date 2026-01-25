from typing import Literal

from pydantic import BaseModel, Field


class Vibe(BaseModel):
    """Visual/aesthetic classification of a location."""

    primary: str = Field(
        description="Main aesthetic category: industrial, luxury, suburban, urban-gritty, natural, retro-vintage, futuristic, institutional, commercial, residential"
    )
    secondary: str | None = Field(default=None, description="Optional secondary aesthetic")
    descriptors: list[str] = Field(
        description="3-5 specific visual descriptors from the script"
    )
    confidence: float = Field(ge=0.0, le=1.0, description="Confidence score 0.0-1.0")


class Constraints(BaseModel):
    """Physical requirements and constraints for a filming location."""

    interior_exterior: Literal["interior", "exterior", "both"]
    time_of_day: Literal["day", "night", "both"]
    min_ceiling_height_ft: int | None = None
    min_floor_space_sqft: int | None = None
    parking_spaces_needed: int = Field(default=10)
    power_requirements: Literal["standard_120v", "heavy_duty", "generator_ok"] = "standard_120v"
    acoustic_needs: Literal["dialogue_heavy", "action_ok", "any"] = "any"
    special_requirements: list[str] = Field(default_factory=list)


class LocationRequirement(BaseModel):
    """Complete location requirement for a scene."""

    scene_id: str
    scene_header: str
    page_numbers: list[int]
    vibe: Vibe
    constraints: Constraints
    script_context: str = Field(description="Relevant script excerpt for context")
    estimated_shoot_duration_hours: float
    location_description: str = Field(
        description="Detailed description for finding real-world location"
    )
    scouting_notes: str = Field(
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
