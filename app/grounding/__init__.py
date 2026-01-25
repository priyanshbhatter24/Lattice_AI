"""
Stage 2: Grounding & Discovery Module

This module handles finding real-world locations that match
the vibe and constraints extracted from script analysis (Stage 1).

Uses Google GenAI with Google Maps grounding for location discovery.
"""

from app.grounding.grounding_agent import GroundingAgent
from app.grounding.models import (
    LocationCandidate,
    LocationRequirement,
    GroundingResult,
    VibeCategory,
)

__all__ = [
    "GroundingAgent",
    "LocationCandidate",
    "LocationRequirement",
    "GroundingResult",
    "VibeCategory",
]
