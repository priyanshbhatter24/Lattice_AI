"""
LLM Worker for Stage 1: Script Analysis

Uses Gemini 2.5 Flash for fast, structured location extraction from screenplays.
"""

import asyncio
import json
import re
import structlog
from collections.abc import AsyncGenerator

from google import genai
from google.genai.types import GenerateContentConfig

from app.config import settings
from app.grounding.config import setup_environment, get_config
from app.models.location import Constraints, LocationRequirement, UniqueLocation, Vibe
from app.grounding.models import VibeCategory


logger = structlog.get_logger()

# Valid vibe categories for validation
VALID_VIBES = [v.value for v in VibeCategory]


LOCATION_ANALYSIS_PROMPT = """You are a professional film location scout analyzing a screenplay to extract detailed location requirements.

Analyze this screenplay location and extract everything a location scout would need to find a real-world filming location.

SCENE HEADER: {scene_header}
SCRIPT CONTEXT (from {num_occurrences} scene(s) in the script):
{script_context}

IMPORTANT RULES:
1. ONLY include details that are explicitly mentioned or clearly implied in the script
2. If the script doesn't describe the location in detail, keep your output brief - don't pad with generic filmmaking advice
3. DO NOT include generic requirements that apply to every location (like "space for camera coverage", "controllable sound", "parking for crew")
4. special_requirements should ONLY list things specifically mentioned in the script (props, stunts, architectural features, specific actions)
5. If the script gives minimal location details, it's okay for special_requirements to be empty or very short

Provide a JSON response:
{{
  "vibe": {{
    "primary": "<MUST be one of: industrial, luxury, suburban, urban-gritty, natural, retro-vintage, futuristic, institutional, commercial, residential>",
    "secondary": "<one of the above categories, or null if not applicable>",
    "descriptors": ["<3-5 visual descriptors ONLY from script details, not generic assumptions>"],
    "confidence": <0.0-1.0 based on how much detail the script provides about this location>
  }},
  "constraints": {{
    "interior_exterior": "<interior, exterior, or both>",
    "time_of_day": "<day, night, or both>",
    "special_requirements": ["<ONLY list specific things from the script: props, set dressing, stunts, architectural features, specific actions. If the script doesn't mention specifics, this can be empty or very short.>"]
  }},
  "location_description": "<Describe what this location should look like based on the script. Include architectural style, key features, atmosphere, and era/period if specified. Be detailed when the script is detailed, brief when the script is sparse.>",
  "scouting_notes": "<Only mention deal-breakers or must-haves SPECIFIC to this location based on script requirements. Skip generic filming logistics that apply to every location. If nothing specific, just say 'Standard location requirements.'>",
  "estimated_shoot_hours": <integer estimate based on scene complexity and number of pages>,
  "priority": "<MUST be exactly one of: critical, important, flexible>"
}}

Respond with valid JSON only."""


DEDUP_PASS1_PROMPT = """Analyze these screenplay scene headers to identify duplicates.

Scene headers:
{location_list}

Do TWO things:

1. MERGE headers that CLEARLY refer to the same location based on names:
   - "MARK'S DORM ROOM" and "MARK'S ROOM" = same (shortened)
   - "CAMERON AND TYLER'S DORM ROOM" and "TYLER AND CAMERON'S DORM ROOM" = same (name order)
   - "PORCELLIAN CLUB" and "PORCELLIAN" = same (suffix dropped)

2. FLAG headers that are generic/ambiguous and MIGHT be the same location but need script context to decide:
   - Generic names like "BEDROOM", "HALLWAY", "KITCHEN", "OFFICE", "CAR"
   - Only flag if the same generic name appears multiple times

Return JSON:
{{
  "merge": {{
    "canonical_header": ["header1", "header2"]
  }},
  "needs_context": ["INT. BEDROOM", "INT. HALLWAY"]
}}

Only include headers that have duplicates or need context review. Respond with valid JSON only."""


DEDUP_PASS2_PROMPT = """These screenplay locations have generic names. Look at the script context to determine if they're the SAME or DIFFERENT physical locations.

{location_contexts}

For each location name, decide based on:
- Characters present (same characters = likely same place)
- Setting details mentioned
- Story continuity

Return JSON with your decision for each:
{{
  "INT. BEDROOM": "same",
  "INT. HALLWAY": "different"
}}

Respond with valid JSON only."""


def _normalize_vibe(value: str | None) -> VibeCategory | None:
    """Normalize a vibe string to a VibeCategory enum."""
    if not value:
        return None
    normalized = value.lower().strip()
    if normalized in VALID_VIBES:
        return VibeCategory(normalized)
    # Fallback: try to match partial
    for valid in VALID_VIBES:
        if valid in normalized or normalized in valid:
            return VibeCategory(valid)
    # Default fallback
    logger.warning("Unknown vibe category, defaulting to commercial", vibe=value)
    return VibeCategory.COMMERCIAL


def _normalize_priority(value: str | None) -> str:
    """Normalize priority to one of: critical, important, flexible."""
    if not value:
        return "important"
    normalized = value.lower().strip()
    if "critical" in normalized:
        return "critical"
    if "flexible" in normalized:
        return "flexible"
    return "important"  # Default


def _extract_json(text: str) -> dict:
    """Extract JSON from response text, handling markdown code blocks."""
    if not text:
        raise ValueError("Empty response")

    # Try to find JSON in code blocks first
    json_match = re.search(r'```(?:json)?\s*([\s\S]*?)```', text)
    if json_match:
        text = json_match.group(1)

    # Try to find raw JSON object
    json_match = re.search(r'\{[\s\S]*\}', text)
    if json_match:
        return json.loads(json_match.group())

    # Try parsing the whole thing
    return json.loads(text)


# Initialize Gemini client (lazy initialization)
_client = None

def _get_client():
    global _client
    if _client is None:
        setup_environment()
        config = get_config()
        _client = genai.Client(http_options={"api_version": config.api_version})
    return _client


async def analyze_location_with_llm(
    location: UniqueLocation,
    location_idx: int,
    project_id: str = "",
    target_city: str = "Los Angeles, CA",
) -> LocationRequirement:
    """
    Analyze a single location using Gemini and return structured requirements.

    Args:
        location: The unique location to analyze
        location_idx: Index for generating scene_number
        project_id: Project ID to associate with this requirement
        target_city: Target city for location search

    Returns:
        LocationRequirement with all extracted details (Stage 2 compatible)
    """
    prompt = LOCATION_ANALYSIS_PROMPT.format(
        scene_header=location.scene_header,
        num_occurrences=len(location.occurrences),
        script_context=location.combined_context,
    )

    config = get_config()
    client = _get_client()

    max_retries = 3
    for attempt in range(max_retries):
        try:
            # Run Gemini call in thread to avoid blocking
            def _call_gemini():
                return client.models.generate_content(
                    model=config.model_name,
                    contents=prompt,
                    config=GenerateContentConfig(
                        response_mime_type="application/json",
                    ),
                )

            response = await asyncio.to_thread(_call_gemini)
            content = response.text
            data = _extract_json(content)

            # Parse vibe with enum validation
            primary_vibe = _normalize_vibe(data["vibe"]["primary"])
            secondary_vibe = _normalize_vibe(data["vibe"].get("secondary"))

            vibe = Vibe(
                primary=primary_vibe,
                secondary=secondary_vibe,
                descriptors=data["vibe"].get("descriptors", []),
                confidence=data["vibe"].get("confidence", 0.5),
            )

            # Parse constraints
            constraints_data = data.get("constraints", {})
            constraints = Constraints(
                interior_exterior=constraints_data.get("interior_exterior", "both"),
                time_of_day=constraints_data.get("time_of_day", "both"),
                special_requirements=constraints_data.get("special_requirements", []),
            )

            # Build scene number from index
            scene_number = f"SC_{location_idx:03d}"

            return LocationRequirement(
                project_id=project_id,
                scene_number=scene_number,
                scene_header=location.scene_header,
                page_numbers=location.page_numbers,
                script_excerpt=location.combined_context[:500],
                vibe=vibe,
                constraints=constraints,
                estimated_shoot_hours=int(data.get("estimated_shoot_hours", 8)),
                priority=_normalize_priority(data.get("priority")),
                target_city=target_city,
                location_description=data.get("location_description", ""),
                scouting_notes=data.get("scouting_notes", ""),
            )

        except Exception as e:
            logger.warning(
                "LLM analysis failed",
                location=location.scene_header,
                attempt=attempt + 1,
                error=str(e),
            )
            if attempt < max_retries - 1:
                await asyncio.sleep(2 ** attempt)
            else:
                raise


async def process_locations_streaming(
    locations: list[UniqueLocation],
    project_id: str = "",
    target_city: str = "Los Angeles, CA",
    max_concurrent: int | None = None,
) -> AsyncGenerator[LocationRequirement, None]:
    """
    Process locations in parallel, yielding each result as it completes.

    Args:
        locations: List of unique locations to analyze
        project_id: Project ID to associate with all requirements
        target_city: Target city for location search
        max_concurrent: Maximum concurrent LLM calls (defaults to 5)

    Yields:
        LocationRequirement for each analyzed location (Stage 2 compatible)
    """
    if max_concurrent is None:
        max_concurrent = settings.max_concurrent_llm_calls

    semaphore = asyncio.Semaphore(max_concurrent)
    queue: asyncio.Queue[tuple[int, LocationRequirement | Exception]] = asyncio.Queue()

    async def process_single(location: UniqueLocation, idx: int) -> None:
        async with semaphore:
            try:
                result = await analyze_location_with_llm(
                    location, idx, project_id=project_id, target_city=target_city
                )
                await queue.put((idx, result))
            except Exception as e:
                logger.error(
                    "Failed to analyze location",
                    location=location.scene_header,
                    error=str(e),
                )
                await queue.put((idx, e))

    # Start all tasks
    tasks = [
        asyncio.create_task(process_single(loc, i + 1))
        for i, loc in enumerate(locations)
    ]

    # Yield results as they complete
    completed = 0
    while completed < len(locations):
        idx, result = await queue.get()
        completed += 1

        if isinstance(result, Exception):
            logger.warning(f"Skipping location {idx} due to error")
            continue

        yield result

    # Ensure all tasks complete
    await asyncio.gather(*tasks, return_exceptions=True)


def _merge_locations(
    locations: list[UniqueLocation],
    header_to_canonical: dict[str, str],
) -> list[UniqueLocation]:
    """Merge locations based on header mapping."""
    merged: dict[str, UniqueLocation] = {}

    for loc in locations:
        canonical = header_to_canonical.get(loc.scene_header, loc.scene_header)

        if canonical in merged:
            existing = merged[canonical]
            existing.occurrences.extend(loc.occurrences)
            existing.page_numbers = sorted(set(existing.page_numbers + loc.page_numbers))
            if existing.time_of_day != loc.time_of_day and loc.time_of_day != "both":
                existing.time_of_day = "both"
        else:
            merged[canonical] = UniqueLocation(
                scene_header=canonical,
                interior_exterior=loc.interior_exterior,
                time_of_day=loc.time_of_day,
                occurrences=loc.occurrences.copy(),
                page_numbers=loc.page_numbers.copy(),
            )

    result = list(merged.values())
    result.sort(key=lambda loc: loc.page_numbers[0] if loc.page_numbers else 0)
    return result


async def deduplicate_locations_with_llm(
    locations: list[UniqueLocation],
) -> list[UniqueLocation]:
    """
    Two-pass deduplication:
    1. Name-based: merge obvious duplicates, flag ambiguous ones
    2. Context-based: for flagged locations, look at script context to decide
    """
    if not locations:
        return locations

    headers = [loc.scene_header for loc in locations]
    location_list = "\n".join(f"- {h}" for h in headers)

    config = get_config()
    client = _get_client()

    # === PASS 1: Name-based ===
    needs_context: list[str] = []
    header_to_canonical: dict[str, str] = {}

    try:
        def _call_dedup_pass1():
            return client.models.generate_content(
                model=config.model_name,
                contents=DEDUP_PASS1_PROMPT.format(location_list=location_list),
                config=GenerateContentConfig(
                    response_mime_type="application/json",
                ),
            )

        response = await asyncio.to_thread(_call_dedup_pass1)
        result = _extract_json(response.text)

        # Process merges
        merge_groups = result.get("merge", {})
        for canonical, duplicates in merge_groups.items():
            for dup in duplicates:
                header_to_canonical[dup] = canonical

        # Get flagged ambiguous locations
        needs_context = result.get("needs_context", [])

        locations = _merge_locations(locations, header_to_canonical)
        logger.info(
            "Pass 1 complete",
            merged=len(header_to_canonical),
            flagged_for_context=len(needs_context),
        )

    except Exception as e:
        logger.warning("Pass 1 deduplication failed", error=str(e))

    # === PASS 2: Context-based for flagged locations ===
    if needs_context:
        flagged_groups: dict[str, list[UniqueLocation]] = {}
        for loc in locations:
            if loc.scene_header in needs_context:
                base = loc.scene_header
                if base not in flagged_groups:
                    flagged_groups[base] = []
                flagged_groups[base].append(loc)

        groups_to_check = {k: v for k, v in flagged_groups.items() if len(v) > 1}

        if groups_to_check:
            try:
                context_parts = []
                for header, locs in groups_to_check.items():
                    context_parts.append(f"\n## {header}")
                    for i, loc in enumerate(locs, 1):
                        snippet = loc.occurrences[0].context[:300] if loc.occurrences else "No context"
                        context_parts.append(f"Occurrence {i} (pages {loc.page_numbers}):\n{snippet}...")

                location_contexts = "\n".join(context_parts)

                def _call_dedup_pass2():
                    return client.models.generate_content(
                        model=config.model_name,
                        contents=DEDUP_PASS2_PROMPT.format(location_contexts=location_contexts),
                        config=GenerateContentConfig(
                            response_mime_type="application/json",
                        ),
                    )

                response = await asyncio.to_thread(_call_dedup_pass2)
                decisions = _extract_json(response.text)

                # Merge locations decided as "same"
                header_to_canonical = {}
                for header, decision in decisions.items():
                    if decision.lower() == "same" and header in groups_to_check:
                        locs = groups_to_check[header]
                        canonical = locs[0].scene_header
                        for loc in locs[1:]:
                            header_to_canonical[loc.scene_header] = canonical

                if header_to_canonical:
                    locations = _merge_locations(locations, header_to_canonical)
                    logger.info("Pass 2 merged", count=len(header_to_canonical))

            except Exception as e:
                logger.warning("Pass 2 deduplication failed", error=str(e))

    logger.info("Deduplication complete", final_count=len(locations))
    return locations
