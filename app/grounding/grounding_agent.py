"""
Stage 2: Grounding Agent

Uses Google GenAI with Google Maps grounding to find real-world locations
that match the vibe and constraints from script analysis.

Also performs visual verification using Gemini 3 Flash vision to ensure
location photos match the required aesthetic.
"""

import json
import re
import time
from typing import Any

import httpx
import structlog
from google import genai
from google.genai import types
from google.genai.types import (
    GenerateContentConfig,
    GoogleMaps,
    HttpOptions,
    Tool,
)

from app.grounding.config import get_city_coordinates, get_config, setup_environment
from app.grounding.models import (
    CandidateStatus,
    GroundingResult,
    LocationCandidate,
    LocationRequirement,
    VapiCallStatus,
    Vibe,
    VibeCategory,
)

logger = structlog.get_logger()


# Mapping from vibe categories to search terms
VIBE_SEARCH_TERMS: dict[VibeCategory, list[str]] = {
    VibeCategory.INDUSTRIAL: [
        "warehouse",
        "factory",
        "industrial loft",
        "manufacturing facility",
        "workshop",
    ],
    VibeCategory.LUXURY: [
        "luxury hotel",
        "upscale restaurant",
        "mansion",
        "penthouse",
        "high-end venue",
    ],
    VibeCategory.URBAN_GRITTY: [
        "dive bar",
        "parking garage",
        "bodega",
        "laundromat",
        "pawn shop",
    ],
    VibeCategory.SUBURBAN: [
        "suburban home",
        "community center",
        "strip mall",
        "diner",
        "local church",
    ],
    VibeCategory.NATURAL: [
        "park",
        "botanical garden",
        "hiking trail",
        "lake",
        "beach",
    ],
    VibeCategory.RETRO_VINTAGE: [
        "retro diner",
        "antique shop",
        "vintage theater",
        "classic car garage",
        "old bookstore",
    ],
    VibeCategory.FUTURISTIC: [
        "modern office",
        "tech campus",
        "contemporary art museum",
        "glass building",
        "innovation center",
    ],
    VibeCategory.INSTITUTIONAL: [
        "hospital",
        "school",
        "library",
        "government building",
        "courthouse",
    ],
    VibeCategory.COMMERCIAL: [
        "office building",
        "shopping center",
        "bank",
        "corporate lobby",
        "conference center",
    ],
    VibeCategory.RESIDENTIAL: [
        "apartment building",
        "townhouse",
        "loft apartment",
        "brownstone",
        "condo",
    ],
}


class GroundingAgent:
    """
    Agent that grounds abstract location requirements to real-world places.

    Uses Google GenAI with Google Maps grounding for intelligent location discovery.
    """

    def __init__(self) -> None:
        """Initialize the grounding agent."""
        setup_environment()
        self.config = get_config()
        self.client = genai.Client(http_options=HttpOptions(api_version=self.config.api_version))

    def build_search_query(self, requirement: LocationRequirement) -> str:
        """
        Build a natural language search query from the location requirement.

        Combines vibe, constraints, and descriptors into a search query
        optimized for Google Maps grounding.
        """
        parts = []

        # Add vibe-based terms
        vibe_terms = VIBE_SEARCH_TERMS.get(requirement.vibe.primary, [])
        if vibe_terms:
            parts.append(vibe_terms[0])  # Use primary term

        # Add descriptors
        if requirement.vibe.descriptors:
            parts.extend(requirement.vibe.descriptors[:2])  # Top 2 descriptors

        # Add constraint-based modifiers
        if requirement.constraints.min_ceiling_height_ft and requirement.constraints.min_ceiling_height_ft > 15:
            parts.append("high ceilings")

        if requirement.constraints.min_floor_space_sqft and requirement.constraints.min_floor_space_sqft > 3000:
            parts.append("large space")

        if requirement.constraints.interior_exterior == "exterior":
            parts.append("outdoor")

        # Add special requirements
        for req in requirement.constraints.special_requirements[:2]:
            parts.append(req)

        # Combine into query
        query = " ".join(parts)

        # Add filming context
        query = f"{query} venue for filming in {requirement.target_city}"

        return query

    def build_grounding_prompt(self, requirement: LocationRequirement, query: str) -> str:
        """
        Build the prompt for the Gemini model with Google Maps grounding.

        The prompt instructs the model to find locations and return structured data.
        """
        return f"""You are a professional location scout for film productions.
Find real-world locations that match the following requirements:

**Scene:** {requirement.scene_header}
**Vibe:** {requirement.vibe.primary.value} (descriptors: {', '.join(requirement.vibe.descriptors)})
**Search Query:** {query}

**Physical Requirements:**
- Interior/Exterior: {requirement.constraints.interior_exterior}
- Minimum ceiling height: {requirement.constraints.min_ceiling_height_ft or 'N/A'} ft
- Minimum floor space: {requirement.constraints.min_floor_space_sqft or 'N/A'} sqft
- Parking needed: {requirement.constraints.parking_spaces_needed} spaces
- Acoustic needs: {requirement.constraints.acoustic_needs}
- Special requirements: {', '.join(requirement.constraints.special_requirements) or 'None'}

**Instructions:**
1. Search for {requirement.max_results} locations in {requirement.target_city} that match these requirements
2. Prioritize venues that:
   - Allow filming or private events
   - Have the right aesthetic/vibe
   - Meet the physical constraints
   - Have available contact information (phone number is critical)

For each location found, provide:
- Venue name
- Full address
- Phone number (if available)
- Website (if available)
- Why it matches the requirements (brief explanation)
- Rating and review count
- Any potential concerns for filming

Format your response as a JSON array of locations with the following structure:
```json
[
  {{
    "venue_name": "Example Venue",
    "formatted_address": "123 Main St, Los Angeles, CA 90001",
    "phone_number": "+1-555-123-4567",
    "website_url": "https://example.com",
    "latitude": 34.0522,
    "longitude": -118.2437,
    "google_rating": 4.5,
    "google_review_count": 127,
    "match_reasoning": "Industrial warehouse with 25ft ceilings, brick walls match the gritty aesthetic",
    "potential_concerns": ["Limited parking", "Noise restrictions after 10pm"]
  }}
]
```

Return ONLY the JSON array, no other text."""

    def parse_response(
        self,
        response_text: str,
        requirement: LocationRequirement,
    ) -> list[LocationCandidate]:
        """Parse the model response into LocationCandidate objects."""
        candidates = []

        # Extract JSON from response
        json_match = re.search(r'\[[\s\S]*\]', response_text)
        if not json_match:
            logger.warning("No JSON array found in response", response=response_text[:500])
            return candidates

        try:
            locations_data = json.loads(json_match.group())
        except json.JSONDecodeError as e:
            logger.error("Failed to parse JSON response", error=str(e))
            return candidates

        for loc in locations_data:
            try:
                candidate = LocationCandidate(
                    scene_id=requirement.id,
                    project_id=requirement.project_id,
                    venue_name=loc.get("venue_name", "Unknown Venue"),
                    formatted_address=loc.get("formatted_address", ""),
                    latitude=float(loc.get("latitude", 0)),
                    longitude=float(loc.get("longitude", 0)),
                    phone_number=loc.get("phone_number"),
                    website_url=loc.get("website_url"),
                    google_rating=float(loc.get("google_rating", 0)) if loc.get("google_rating") else None,
                    google_review_count=int(loc.get("google_review_count", 0)),
                    match_reasoning=loc.get("match_reasoning", ""),
                    google_place_id=loc.get("place_id"),
                )

                # Add any concerns as red flags
                concerns = loc.get("potential_concerns", [])
                if concerns:
                    candidate.red_flags = concerns

                # Calculate match score based on available data
                candidate.match_score = self._calculate_match_score(candidate, requirement)

                # Set status based on phone number availability
                if candidate.phone_number:
                    candidate.vapi_call_status = VapiCallStatus.NOT_INITIATED
                    candidate.status = CandidateStatus.DISCOVERED
                else:
                    candidate.set_no_phone_status()

                candidates.append(candidate)

            except Exception as e:
                logger.warning("Failed to parse location", error=str(e), location=loc)
                continue

        return candidates

    def _calculate_match_score(
        self,
        candidate: LocationCandidate,
        requirement: LocationRequirement,
    ) -> float:
        """Calculate a match score for a candidate."""
        score = 0.0

        # Has phone number (25% weight) - critical for Stage 3
        if candidate.phone_number:
            score += 0.25

        # Has reasoning (indicates good match) - 25% weight
        if candidate.match_reasoning:
            score += 0.25

        # Rating quality (25% weight)
        if candidate.google_rating:
            if candidate.google_rating >= 4.0 and candidate.google_review_count >= 50:
                score += 0.25
            elif candidate.google_rating >= 3.5:
                score += 0.15
            elif candidate.google_rating >= 3.0:
                score += 0.10

        # Has website (10% weight)
        if candidate.website_url:
            score += 0.10

        # Few red flags (15% weight)
        if len(candidate.red_flags) == 0:
            score += 0.15
        elif len(candidate.red_flags) == 1:
            score += 0.10

        return min(score, 1.0)

    async def find_locations(self, requirement: LocationRequirement) -> GroundingResult:
        """
        Find real-world locations matching the requirement.

        Uses Google GenAI with Google Maps grounding for intelligent search.
        """
        start_time = time.time()
        errors = []
        warnings = []

        # Build the search query
        query = self.build_search_query(requirement)
        logger.info("Built search query", query=query, scene=requirement.scene_header)

        # Get coordinates for the target city
        lat, lng = get_city_coordinates(requirement.target_city)

        # Build the prompt
        prompt = self.build_grounding_prompt(requirement, query)

        try:
            # Call Gemini with Google Maps grounding
            response = self.client.models.generate_content(
                model=self.config.model_name,
                contents=prompt,
                config=GenerateContentConfig(
                    tools=[
                        Tool(google_maps=GoogleMaps())
                    ],
                    tool_config=types.ToolConfig(
                        retrieval_config=types.RetrievalConfig(
                            lat_lng=types.LatLng(
                                latitude=lat,
                                longitude=lng,
                            ),
                            language_code=self.config.language_code,
                        ),
                    ),
                ),
            )

            # Parse the response
            response_text = response.text
            logger.info("Received response from Gemini", length=len(response_text))

            candidates = self.parse_response(response_text, requirement)

            # Sort by match score
            candidates.sort(key=lambda c: c.match_score, reverse=True)

            # Limit to max results
            candidates = candidates[:requirement.max_results]

            # Count filtered
            no_phone_count = sum(1 for c in candidates if c.vapi_call_status == VapiCallStatus.NO_PHONE_NUMBER)
            if no_phone_count > 0:
                warnings.append(f"{no_phone_count} locations have no phone number")

        except Exception as e:
            logger.error("Failed to find locations", error=str(e))
            errors.append(str(e))
            candidates = []

        processing_time = time.time() - start_time

        return GroundingResult(
            scene_id=requirement.id,
            project_id=requirement.project_id,
            query_used=query,
            candidates=candidates,
            total_found=len(candidates),
            filtered_count=0,
            processing_time_seconds=processing_time,
            errors=errors,
            warnings=warnings,
        )

    async def find_locations_for_scenes(
        self,
        requirements: list[LocationRequirement],
    ) -> list[GroundingResult]:
        """
        Find locations for multiple scenes.

        Processes each scene requirement and returns grounding results.
        """
        results = []

        for requirement in requirements:
            logger.info(
                "Processing scene",
                scene=requirement.scene_header,
                vibe=requirement.vibe.primary.value,
            )
            result = await self.find_locations(requirement)
            results.append(result)

            logger.info(
                "Found candidates",
                scene=requirement.scene_header,
                count=result.total_found,
                errors=len(result.errors),
            )

        return results

    # ─── Visual Verification Methods (using Perplexity Sonar) ─────────

    def _build_visual_verification_prompt(self, vibe: Vibe) -> str:
        """Build prompt for visual vibe verification."""
        return f"""Analyze this location photo for film production scouting.

**Required Vibe:** {vibe.primary.value}
**Descriptors:** {', '.join(vibe.descriptors)}
{f"**Secondary Vibe:** {vibe.secondary.value}" if vibe.secondary else ""}

Evaluate how well this location matches the required aesthetic for filming.

Respond with ONLY a JSON object (no markdown, no extra text):
{{
    "vibe_match_score": 0.85,
    "detected_features": ["exposed brick walls", "high industrial ceilings", "concrete floors"],
    "concerns": ["modern light fixtures visible", "too renovated"],
    "summary": "Strong industrial aesthetic with authentic warehouse features. Minor concern about modern renovations."
}}

Rules for scoring:
- 0.9-1.0: Perfect match, exactly the vibe needed
- 0.7-0.89: Good match, minor adjustments needed
- 0.5-0.69: Partial match, significant set dressing required
- 0.3-0.49: Poor match, major concerns
- 0.0-0.29: Does not match the required vibe"""

    async def _fetch_image_as_base64(self, image_url: str) -> tuple[str, str] | None:
        """Fetch image and convert to base64 data URI."""
        try:
            async with httpx.AsyncClient() as client:
                response = await client.get(image_url, timeout=10.0)
                response.raise_for_status()

                # Determine mime type
                content_type = response.headers.get("content-type", "image/jpeg")
                if "png" in content_type:
                    mime_type = "image/png"
                elif "webp" in content_type:
                    mime_type = "image/webp"
                elif "gif" in content_type:
                    mime_type = "image/gif"
                else:
                    mime_type = "image/jpeg"

                import base64
                encoded = base64.b64encode(response.content).decode("utf-8")
                data_uri = f"data:{mime_type};base64,{encoded}"

                return data_uri, mime_type

        except Exception as e:
            logger.warning("Failed to fetch image", url=image_url, error=str(e))
            return None

    async def _call_perplexity_vision(self, image_data_uri: str, prompt: str) -> str | None:
        """Call Perplexity Sonar API with an image for vision analysis."""
        if not self.config.perplexity_api_key:
            logger.warning("Perplexity API key not configured, skipping visual verification")
            return None

        try:
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    f"{self.config.perplexity_base_url}/chat/completions",
                    headers={
                        "Authorization": f"Bearer {self.config.perplexity_api_key}",
                        "Content-Type": "application/json",
                    },
                    json={
                        "model": self.config.perplexity_model,
                        "messages": [
                            {
                                "role": "user",
                                "content": [
                                    {"type": "text", "text": prompt},
                                    {"type": "image_url", "image_url": {"url": image_data_uri}},
                                ],
                            }
                        ],
                    },
                    timeout=30.0,
                )
                response.raise_for_status()
                data = response.json()
                return data["choices"][0]["message"]["content"]

        except Exception as e:
            logger.error("Perplexity API call failed", error=str(e))
            return None

    async def verify_visual_vibe(
        self,
        candidate: LocationCandidate,
        vibe: Vibe,
        image_url: str | None = None,
    ) -> LocationCandidate:
        """
        Verify a location's visual vibe using Perplexity Sonar vision.

        Analyzes the location photo against the required vibe and updates
        the candidate with visual verification results.
        """
        # Use provided URL or first photo from candidate
        photo_url = image_url or (candidate.photo_urls[0] if candidate.photo_urls else None)

        if not photo_url:
            logger.warning("No photo available for visual verification", venue=candidate.venue_name)
            return candidate

        # Fetch and encode the image
        result = await self._fetch_image_as_base64(photo_url)
        if not result:
            return candidate

        image_data_uri, _ = result

        try:
            # Build the prompt
            prompt = self._build_visual_verification_prompt(vibe)

            # Call Perplexity Sonar with the image
            response_text = await self._call_perplexity_vision(image_data_uri, prompt)

            if not response_text:
                return candidate

            # Extract JSON from response
            json_match = re.search(r'\{[\s\S]*\}', response_text)
            if json_match:
                result = json.loads(json_match.group())

                candidate.visual_vibe_score = float(result.get("vibe_match_score", 0))
                candidate.visual_features_detected = result.get("detected_features", [])
                candidate.visual_concerns = result.get("concerns", [])
                candidate.visual_analysis_summary = result.get("summary", "")

                # Add visual concerns to red flags
                for concern in candidate.visual_concerns:
                    if concern not in candidate.red_flags:
                        candidate.red_flags.append(f"Visual: {concern}")

                # Update match score (blend with visual score)
                if candidate.visual_vibe_score is not None:
                    # Weight: 60% original score, 40% visual score
                    candidate.match_score = (
                        candidate.match_score * 0.6 +
                        candidate.visual_vibe_score * 0.4
                    )

                logger.info(
                    "Visual verification complete",
                    venue=candidate.venue_name,
                    visual_score=candidate.visual_vibe_score,
                    features=len(candidate.visual_features_detected),
                )

        except Exception as e:
            logger.error("Visual verification failed", venue=candidate.venue_name, error=str(e))

        return candidate

    async def verify_candidates_visual(
        self,
        candidates: list[LocationCandidate],
        vibe: Vibe,
    ) -> list[LocationCandidate]:
        """
        Verify multiple candidates' visual vibes.

        Returns candidates sorted by updated match score.
        """
        verified = []

        for candidate in candidates:
            verified_candidate = await self.verify_visual_vibe(candidate, vibe)
            verified.append(verified_candidate)

        # Re-sort by updated match score
        verified.sort(key=lambda c: c.match_score, reverse=True)

        return verified

    async def find_and_verify_locations(
        self,
        requirement: LocationRequirement,
        verify_visuals: bool = True,
    ) -> GroundingResult:
        """
        Find locations and optionally verify their visual vibe.

        This is the main entry point that combines grounding + visual verification.
        """
        # First, find locations via Google Maps grounding
        result = await self.find_locations(requirement)

        # Then verify visuals if enabled and we have candidates with photos
        if verify_visuals and result.candidates:
            candidates_with_photos = [c for c in result.candidates if c.photo_urls]

            if candidates_with_photos:
                logger.info(
                    "Starting visual verification",
                    count=len(candidates_with_photos),
                    scene=requirement.scene_header,
                )

                result.candidates = await self.verify_candidates_visual(
                    result.candidates,
                    requirement.vibe,
                )

                # Update warnings
                low_visual_count = sum(
                    1 for c in result.candidates
                    if c.visual_vibe_score is not None and c.visual_vibe_score < 0.5
                )
                if low_visual_count > 0:
                    result.warnings.append(
                        f"{low_visual_count} locations have low visual vibe match (<0.5)"
                    )

        return result
