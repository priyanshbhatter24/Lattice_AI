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

# Optional DB import - only used if save_to_db=True
try:
    from app.db.repository import save_grounding_results
    DB_AVAILABLE = True
except ImportError:
    DB_AVAILABLE = False
    save_grounding_results = None

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
        used_words = set()  # Track words to avoid duplicates

        def add_part(text: str) -> None:
            """Add a part if it doesn't duplicate existing words."""
            words = text.lower().split()
            # Check if any word is already used
            if not any(w in used_words for w in words):
                parts.append(text)
                used_words.update(words)

        # Add vibe-based terms
        vibe_terms = VIBE_SEARCH_TERMS.get(requirement.vibe.primary, [])
        if vibe_terms:
            add_part(vibe_terms[0])

        # Add top descriptor
        if requirement.vibe.descriptors:
            add_part(requirement.vibe.descriptors[0])

        # Add "outdoor" for exterior locations
        if requirement.constraints.interior_exterior == "exterior":
            add_part("outdoor")

        # Add first special requirement
        if requirement.constraints.special_requirements:
            add_part(requirement.constraints.special_requirements[0])

        # Combine and add location context
        query = " ".join(parts)
        query = f"{query} in {requirement.target_city}"

        return query

    def build_grounding_prompt(self, requirement: LocationRequirement, query: str) -> str:
        """
        Build the prompt for the Gemini model with Google Maps grounding.

        The prompt instructs the model to find locations and return structured data.
        """
        # Build script context section if available
        script_context = ""
        if requirement.script_excerpt:
            script_context = f"""
**Scene Context from Script:**
{requirement.script_excerpt}
"""

        return f"""You are a professional location scout for film productions.
Find real-world locations that match the following requirements:

**Scene:** {requirement.scene_header}
**Vibe:** {requirement.vibe.primary.value} (descriptors: {', '.join(requirement.vibe.descriptors)})
**Search Query:** {query}
{script_context}
**Physical Requirements:**
- Interior/Exterior: {requirement.constraints.interior_exterior}
- Time of Day: {requirement.constraints.time_of_day}
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
- Google Place ID (important for fetching photos)
- Phone number (if available)
- Website (if available)
- Why it matches the scene requirements (reference the script context when explaining how this venue fits the scene's mood, action, or narrative)
- Rating and review count
- Any potential concerns for filming

Format your response as a JSON array of locations with the following structure:
```json
[
  {{
    "venue_name": "Example Venue",
    "formatted_address": "123 Main St, Los Angeles, CA 90001",
    "place_id": "ChIJ...",
    "phone_number": "+1-555-123-4567",
    "website_url": "https://example.com",
    "latitude": 34.0522,
    "longitude": -118.2437,
    "google_rating": 4.5,
    "google_review_count": 127,
    "match_reasoning": "The raw industrial space with exposed brick and high ceilings creates the tense atmosphere needed for the confrontation scene. The loading dock area could serve as the entrance point described in the script.",
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
                    latitude=float(loc.get("latitude") or 0),
                    longitude=float(loc.get("longitude") or 0),
                    phone_number=loc.get("phone_number"),
                    website_url=loc.get("website_url"),
                    google_rating=float(loc.get("google_rating")) if loc.get("google_rating") else None,
                    google_review_count=int(loc.get("google_review_count") or 0),
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

    async def _fetch_photos_for_candidates(
        self,
        candidates: list[LocationCandidate],
        prefer_interior: bool = False,
    ) -> None:
        """
        Fetch photos from Google Places API for all candidates.

        Uses the place_id to get photo references, then constructs photo URLs.
        Falls back to Street View if no Place photos available.

        Args:
            candidates: List of candidates to fetch photos for
            prefer_interior: If True, try to get interior photos (for interior scenes)
        """
        if not self.config.google_maps_api_key:
            logger.warning("GOOGLE_MAPS_API_KEY not configured - photos will not be fetched")
            return

        api_key = self.config.google_maps_api_key
        logger.info(
            "Fetching photos for candidates",
            count=len(candidates),
            prefer_interior=prefer_interior,
            api_key_prefix=api_key[:10] + "...",
        )

        async with httpx.AsyncClient(timeout=10.0) as client:
            for candidate in candidates:
                try:
                    photo_urls = await self._fetch_place_photos(
                        client, candidate, api_key, prefer_interior=prefer_interior
                    )
                    if photo_urls:
                        candidate.photo_urls = photo_urls
                        logger.info("Got photos", venue=candidate.venue_name, count=len(photo_urls), first_url=photo_urls[0][:60] + "...")
                    else:
                        logger.warning("No photos found", venue=candidate.venue_name)
                except Exception as e:
                    logger.error("Failed to fetch photos", venue=candidate.venue_name, error=str(e))

    async def _fetch_place_photos(
        self,
        client: httpx.AsyncClient,
        candidate: LocationCandidate,
        api_key: str,
        prefer_interior: bool = False,
    ) -> list[str]:
        """
        Fetch photo URLs for a single candidate from Google Places API.

        Args:
            client: HTTP client
            candidate: The location candidate
            api_key: Google Maps API key
            prefer_interior: If True, try to prioritize interior photos
        """
        urls = []
        place_id = candidate.google_place_id
        logger.info(
            "Fetching photos for venue",
            venue=candidate.venue_name,
            has_place_id=bool(place_id),
            prefer_interior=prefer_interior,
        )

        # If no place_id, search for it using venue name and address
        if not place_id:
            logger.info("No place_id, searching via Find Place API", venue=candidate.venue_name)
            place_id = await self._find_place_id(client, candidate, api_key)

        # Try to get photos via Place Details API if we have a place_id
        if place_id:
            details_url = (
                f"https://maps.googleapis.com/maps/api/place/details/json"
                f"?place_id={place_id}"
                f"&fields=photos"
                f"&key={api_key}"
            )

            try:
                response = await client.get(details_url)
                logger.info("Place Details API response", venue=candidate.venue_name, status=response.status_code)

                if response.status_code == 200:
                    data = response.json()
                    status = data.get("status")
                    photos = data.get("result", {}).get("photos", [])
                    logger.info("Place Details result", venue=candidate.venue_name, api_status=status, photo_count=len(photos))

                    # Get up to 5 photos (more variety for vision analysis)
                    # For interior preference, skip first photo (often exterior) if we have enough
                    photos_to_use = photos
                    if prefer_interior and len(photos) > 3:
                        # Skip first 1-2 photos which are often exterior/building shots
                        photos_to_use = photos[1:6]
                    else:
                        photos_to_use = photos[:5]

                    for photo in photos_to_use:
                        photo_ref = photo.get("photo_reference")
                        if photo_ref:
                            # Construct the photo URL with larger size for better vision analysis
                            photo_url = (
                                f"https://maps.googleapis.com/maps/api/place/photo"
                                f"?maxwidth=800"
                                f"&photo_reference={photo_ref}"
                                f"&key={api_key}"
                            )
                            urls.append(photo_url)

                            # Store attribution if available
                            attributions = photo.get("html_attributions", [])
                            if attributions:
                                candidate.photo_attributions.extend(attributions)

                    if urls:
                        return urls
                else:
                    logger.warning("Place Details API error", venue=candidate.venue_name, status=response.status_code, body=response.text[:200])
            except Exception as e:
                logger.error("Place Details API failed", venue=candidate.venue_name, error=str(e))

        # Fallback to Street View if no Place photos (exterior only)
        if candidate.latitude and candidate.longitude:
            streetview_url = (
                f"https://maps.googleapis.com/maps/api/streetview"
                f"?size=800x600"
                f"&location={candidate.latitude},{candidate.longitude}"
                f"&fov=90&pitch=0"
                f"&key={api_key}"
            )
            urls.append(streetview_url)
            logger.debug("Using Street View fallback", venue=candidate.venue_name)

        return urls

    async def _find_place_id(
        self,
        client: httpx.AsyncClient,
        candidate: LocationCandidate,
        api_key: str
    ) -> str | None:
        """
        Search for a place_id using venue name and address.
        """
        import urllib.parse

        # Build search query from venue name and address
        search_query = f"{candidate.venue_name} {candidate.formatted_address}"
        encoded_query = urllib.parse.quote(search_query)

        find_place_url = (
            f"https://maps.googleapis.com/maps/api/place/findplacefromtext/json"
            f"?input={encoded_query}"
            f"&inputtype=textquery"
            f"&fields=place_id"
            f"&key={api_key}"
        )

        try:
            response = await client.get(find_place_url)
            if response.status_code == 200:
                data = response.json()
                candidates = data.get("candidates", [])
                if candidates:
                    place_id = candidates[0].get("place_id")
                    if place_id:
                        logger.debug("Found place_id via search", venue=candidate.venue_name, place_id=place_id[:20])
                        return place_id
        except Exception as e:
            logger.debug("Find Place API failed", venue=candidate.venue_name, error=str(e))

        return None

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
            # Use asyncio.to_thread to avoid blocking the event loop
            import asyncio

            def _call_gemini():
                return self.client.models.generate_content(
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

            response = await asyncio.to_thread(_call_gemini)

            # Parse the response
            response_text = response.text

            if not response_text:
                logger.warning("Gemini returned empty response", scene=requirement.scene_header)
                errors.append("Gemini returned empty response - query may be too restrictive")
                candidates = []
            else:
                logger.info("Received response from Gemini", length=len(response_text))
                candidates = self.parse_response(response_text, requirement)

            # Sort by match score
            candidates.sort(key=lambda c: c.match_score, reverse=True)

            # Limit to max results
            candidates = candidates[:requirement.max_results]

            # Fetch photos for all candidates
            if candidates:
                logger.info("=" * 50)
                logger.info("PHOTO FETCH: Starting for candidates", count=len(candidates))
                # Prefer interior photos for interior scenes
                prefer_interior = requirement.constraints.interior_exterior in ("interior", "both")
                await self._fetch_photos_for_candidates(candidates, prefer_interior=prefer_interior)
                logger.info("PHOTO FETCH: Complete")
                for c in candidates:
                    logger.info("Candidate photos", venue=c.venue_name, photo_count=len(c.photo_urls), has_photos=bool(c.photo_urls))
                logger.info("=" * 50)

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

    def _build_visual_verification_prompt(
        self,
        vibe: Vibe,
        interior_exterior: str = "interior",
        scene_header: str = "",
        special_requirements: list[str] = None,
    ) -> str:
        """Build prompt for visual vibe verification."""
        location_type = {
            "interior": "This MUST be an INTERIOR shot showing indoor spaces. Exterior/building shots should score LOW.",
            "exterior": "This MUST be an EXTERIOR shot showing the outside/facade. Interior shots should score LOW.",
            "both": "This can be either interior or exterior.",
        }.get(interior_exterior, "")

        special_reqs = ""
        if special_requirements:
            special_reqs = f"\n**Special Requirements:** {', '.join(special_requirements)}"

        return f"""You are a professional film location scout evaluating venue photos.

**Scene:** {scene_header}
**Required Vibe:** {vibe.primary.value}
**Descriptors:** {', '.join(vibe.descriptors)}
{f"**Secondary Vibe:** {vibe.secondary.value}" if vibe.secondary else ""}
**Location Type Required:** {interior_exterior.upper()}
{location_type}{special_reqs}

BE STRICT in your evaluation. This is for a professional film production.

Critical evaluation criteria:
1. Does this photo show the CORRECT type (interior vs exterior)?
2. Does the aesthetic/vibe ACTUALLY match what's needed?
3. Are there visible issues that would require expensive fixes (modern fixtures, branding, wrong period)?
4. Would a location scout recommend this venue to the director?

IMPORTANT considerations:
1. Does this photo show an INTERIOR or EXTERIOR view?
2. Does the aesthetic match the required vibe?
3. Are there practical concerns for filming (visible branding, modern elements that break period, etc.)?

Respond with ONLY a JSON object (no markdown, no extra text):
{{
    "vibe_match_score": 0.85,
    "is_interior": true,
    "detected_features": ["exposed brick walls", "high industrial ceilings", "concrete floors"],
    "concerns": ["modern light fixtures visible", "too renovated"],
    "summary": "Strong industrial aesthetic with authentic warehouse features. Minor concern about modern renovations."
}}

Rules for scoring:
- 0.9-1.0: Perfect match, exactly the vibe needed AND correct interior/exterior type
- 0.7-0.89: Good match, minor adjustments needed
- 0.5-0.69: Partial match, significant set dressing required OR wrong interior/exterior type
- 0.3-0.49: Poor match, major concerns
- 0.0-0.29: Does not match the required vibe at all"""

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
        interior_exterior: str = "interior",
        scene_header: str = "",
        special_requirements: list[str] = None,
    ) -> LocationCandidate:
        """
        Verify a location's visual vibe using Perplexity Sonar vision.

        Analyzes the location photo against the required vibe and updates
        the candidate with visual verification results.

        Args:
            candidate: The location candidate to verify
            vibe: Required vibe for the scene
            image_url: Optional specific image URL to analyze
            interior_exterior: "interior", "exterior", or "both"
            scene_header: The scene header for context
            special_requirements: List of special requirements from the scene
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
            # Build the prompt with full context
            prompt = self._build_visual_verification_prompt(
                vibe, interior_exterior, scene_header, special_requirements
            )

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
        interior_exterior: str = "interior",
        status_callback: callable = None,
        scene_header: str = "",
        special_requirements: list[str] = None,
    ) -> list[LocationCandidate]:
        """
        Verify multiple candidates' visual vibes.

        Returns candidates sorted by updated match score.

        Args:
            candidates: List of candidates to verify
            vibe: Required vibe for the scene
            interior_exterior: "interior", "exterior", or "both"
            status_callback: Optional async callback for status updates
            scene_header: The scene header for context
            special_requirements: List of special requirements from the scene
        """
        verified = []

        # Agentic evaluation phrases
        eval_phrases = [
            "Taking a closer look at",
            "Considering",
            "What about",
            "Checking out",
            "Examining",
            "Let me evaluate",
        ]

        for i, candidate in enumerate(candidates):
            # Emit status for each venue being analyzed with varied language
            # Include photo_url so frontend can show image during evaluation
            if status_callback:
                try:
                    phrase = eval_phrases[i % len(eval_phrases)]
                    await status_callback("thinking", {
                        "action": "evaluating",
                        "message": f"{phrase} {candidate.venue_name}...",
                        "detail": f"Does this match the {vibe.primary.value} vibe we need?",
                        "venue_name": candidate.venue_name,
                        "photo_url": candidate.photo_urls[0] if candidate.photo_urls else None,
                        "match_score": candidate.match_score,
                        "formatted_address": candidate.formatted_address,
                        "google_rating": candidate.google_rating,
                    })
                except Exception:
                    pass

            verified_candidate = await self.verify_visual_vibe(
                candidate,
                vibe,
                interior_exterior=interior_exterior,
                scene_header=scene_header,
                special_requirements=special_requirements,
            )
            verified.append(verified_candidate)

        # Re-sort by updated match score
        verified.sort(key=lambda c: c.match_score, reverse=True)

        return verified

    async def find_and_verify_locations(
        self,
        requirement: LocationRequirement,
        verify_visuals: bool = True,
        save_to_db: bool = False,
        status_callback: callable = None,
    ) -> GroundingResult:
        """
        Find locations and optionally verify their visual vibe.

        This is the main entry point that combines grounding + visual verification.

        Args:
            requirement: The location requirement to search for
            verify_visuals: Whether to run visual vibe verification
            save_to_db: Whether to save results to Supabase
            status_callback: Optional async callback for status updates: async fn(event_type, data)
        """
        async def emit_status(event_type: str, data: dict):
            """Emit a status update if callback provided."""
            if status_callback:
                try:
                    await status_callback(event_type, data)
                except Exception as e:
                    logger.warning("Status callback failed", error=str(e))

        # Build search query for display
        search_query = self.build_search_query(requirement)

        # Emit: Starting search with agentic personality
        await emit_status("thinking", {
            "action": "searching",
            "message": f"Looking for venues that match \"{requirement.scene_header}\"",
            "detail": f"Searching for: {search_query}",
        })

        # First, find locations via Google Maps grounding
        result = await self.find_locations(requirement)

        # Emit: Found potential venues with enthusiasm
        if result.candidates:
            venue_names = [c.venue_name for c in result.candidates[:3]]
            await emit_status("thinking", {
                "action": "found",
                "message": f"Found {len(result.candidates)} possibilities to consider",
                "detail": f"Including {venue_names[0]}" + (f", {venue_names[1]}" if len(venue_names) > 1 else "") + "...",
            })
        else:
            await emit_status("thinking", {
                "action": "found",
                "message": "Hmm, not finding great matches. Let me expand the search...",
                "detail": "Trying alternative venues",
            })

        # Then verify visuals if enabled and we have candidates with photos
        if verify_visuals and result.candidates:
            candidates_with_photos = [c for c in result.candidates if c.photo_urls]

            if candidates_with_photos:
                logger.info(
                    "Starting visual verification",
                    count=len(candidates_with_photos),
                    scene=requirement.scene_header,
                    interior_exterior=requirement.constraints.interior_exterior,
                )

                # Emit: Starting vision analysis with agentic personality
                await emit_status("thinking", {
                    "action": "vision",
                    "message": f"Let me analyze the photos to see which ones actually fit...",
                    "detail": f"Need: {requirement.vibe.primary.value} aesthetic, {requirement.constraints.interior_exterior} shots",
                })

                result.candidates = await self.verify_candidates_visual(
                    result.candidates,
                    requirement.vibe,
                    interior_exterior=requirement.constraints.interior_exterior,
                    status_callback=status_callback,
                    scene_header=requirement.scene_header,
                    special_requirements=requirement.constraints.special_requirements,
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

        # Save to database if enabled
        if save_to_db:
            if DB_AVAILABLE and save_grounding_results:
                save_grounding_results([result])
                logger.info("Saved results to database", scene=requirement.scene_header)
            else:
                logger.warning("Database not available, skipping save")

        return result

    async def _process_single_scene(
        self,
        requirement: LocationRequirement,
        verify_visuals: bool,
    ) -> GroundingResult:
        """Process a single scene (helper for parallel processing)."""
        logger.info(
            "Processing scene",
            scene=requirement.scene_header,
            vibe=requirement.vibe.primary.value,
        )

        result = await self.find_and_verify_locations(
            requirement,
            verify_visuals=verify_visuals,
            save_to_db=False,
        )

        logger.info(
            "Found candidates",
            scene=requirement.scene_header,
            count=result.total_found,
            errors=len(result.errors),
        )

        return result

    async def process_scenes(
        self,
        requirements: list[LocationRequirement],
        verify_visuals: bool = True,
        save_to_db: bool = False,
        max_concurrent: int = 15,
    ) -> list[GroundingResult]:
        """
        Process multiple scenes with grounding + visual verification.

        Processes scenes in PARALLEL for faster execution.

        Args:
            requirements: List of location requirements to process
            verify_visuals: Whether to run visual vibe verification
            save_to_db: Whether to save results to Supabase
            max_concurrent: Maximum concurrent API calls (default 5)
        """
        import asyncio

        # Create semaphore to limit concurrent requests
        semaphore = asyncio.Semaphore(max_concurrent)

        async def process_with_limit(req: LocationRequirement) -> GroundingResult:
            async with semaphore:
                return await self._process_single_scene(req, verify_visuals)

        # Process all scenes in parallel
        results = await asyncio.gather(
            *[process_with_limit(req) for req in requirements],
            return_exceptions=True,
        )

        # Handle any exceptions
        final_results = []
        for i, result in enumerate(results):
            if isinstance(result, Exception):
                logger.error(
                    "Scene processing failed",
                    scene=requirements[i].scene_header,
                    error=str(result),
                )
                # Create error result
                final_results.append(GroundingResult(
                    scene_id=requirements[i].id,
                    project_id=requirements[i].project_id,
                    query_used="",
                    candidates=[],
                    total_found=0,
                    filtered_count=0,
                    processing_time_seconds=0,
                    errors=[str(result)],
                ))
            else:
                final_results.append(result)

        # Batch save all results at end
        if save_to_db:
            if DB_AVAILABLE and save_grounding_results:
                summary = save_grounding_results(final_results)
                logger.info("Batch saved to database", **summary)
            else:
                logger.warning("Database not available, skipping save")

        return final_results
