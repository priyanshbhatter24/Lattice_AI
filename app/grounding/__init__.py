"""
Stage 2: Grounding & Discovery Module

This module handles finding real-world locations that match
the vibe and constraints extracted from script analysis (Stage 1).

Uses Google GenAI (Gemini 3 Flash) with:
- Google Maps grounding for location discovery
- Vision analysis for visual vibe verification
"""

from app.grounding.grounding_agent import GroundingAgent
from app.grounding.models import (
    GroundingResult,
    LocationCandidate,
    LocationRequirement,
    Vibe,
    VibeCategory,
)

__all__ = [
    "GroundingAgent",
    "GroundingResult",
    "LocationCandidate",
    "LocationRequirement",
    "Vibe",
    "VibeCategory",
]
