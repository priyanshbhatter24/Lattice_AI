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


DEDUP_PASS1_PROMPT = """Analyze these screenplay scene headers to identify locations that should be MERGED as the same physical place.

Scene headers:
{location_list}

MERGE AGGRESSIVELY - these are all the SAME LOCATION and should be merged:
1. Same place, different times: "INT. COFFEE SHOP - DAY" + "INT. COFFEE SHOP - NIGHT" = same
2. Same place, INT/EXT variation: "INT. HOUSE" + "EXT. HOUSE" = same location
3. Shortened names: "MARK'S DORM ROOM" + "MARK'S ROOM" + "DORM ROOM" = same
4. Word order changes: "CAMERON AND TYLER'S ROOM" + "TYLER AND CAMERON'S ROOM" = same
5. Suffix dropped: "PORCELLIAN CLUB" + "PORCELLIAN" = same
6. Minor variations: "THE OFFICE" + "OFFICE" + "MAIN OFFICE" = likely same
7. Continuous action: "HALLWAY" + "HALLWAY (CONTINUOUS)" = same
8. Same building areas: "HOSPITAL ROOM" + "HOSPITAL CORRIDOR" + "HOSPITAL" = same building
9. Possessive variations: "JOHN'S APARTMENT" + "JOHN'S PLACE" + "JOHN'S" = same

FLAG for context review (only if appearing multiple times with NO distinguishing details):
- Truly generic: "BEDROOM", "CAR", "STREET" (could be anyone's)

Return JSON with the CANONICAL header (pick the most complete one) as key:
{{
  "merge": {{
    "INT. COFFEE SHOP - DAY": ["INT. COFFEE SHOP - NIGHT", "INT. COFFEE SHOP"],
    "INT. MARK'S DORM ROOM": ["INT. MARK'S ROOM", "MARK'S DORM"]
  }},
  "needs_context": ["INT. BEDROOM", "INT. CAR"]
}}

Be AGGRESSIVE about merging - when in doubt, merge. Only include headers that have duplicates. Respond with valid JSON only."""


DEDUP_PASS2_PROMPT = """These screenplay locations have generic names. Decide if they're the SAME or DIFFERENT physical locations.

{location_contexts}

LEAN TOWARD "same" - merge unless clearly different:
- Same or overlapping characters = SAME place
- Similar setting/vibe = SAME place
- Could reasonably be shot at one location = SAME place
- Only say "different" if they MUST be different locations (e.g., one is a mansion, one is a shack)

Return JSON:
{{
  "INT. BEDROOM": "same",
  "INT. HALLWAY": "same"
}}

When in doubt, say "same" - it's better to scout one location than two similar ones. Respond with valid JSON only."""


# Location types that can be merged for scouting purposes
MERGEABLE_LOCATION_TYPES = [
    (r"dorm\s*room", "DORM ROOM"),
    (r"bedroom", "BEDROOM"),
    (r"bathroom", "BATHROOM"),
    (r"kitchen", "KITCHEN"),
    (r"living\s*room", "LIVING ROOM"),
    (r"office(?!\s+building)", "OFFICE"),
    (r"classroom", "CLASSROOM"),
    (r"hallway|corridor", "HALLWAY"),
    (r"lobby", "LOBBY"),
    (r"elevator", "ELEVATOR"),
    (r"stairwell|stairs", "STAIRWELL"),
    (r"parking\s*(lot|garage)", "PARKING"),
    (r"conference\s*room", "CONFERENCE ROOM"),
    (r"hospital\s*room", "HOSPITAL ROOM"),
    (r"hotel\s*room", "HOTEL ROOM"),
    (r"bar(?!\w)", "BAR"),
    (r"restaurant", "RESTAURANT"),
    (r"cafe|coffee\s*shop", "CAFE"),
]


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


def _get_location_type(header: str) -> str | None:
    """Check if a header matches a mergeable location type."""
    h = header.lower()
    for pattern, type_name in MERGEABLE_LOCATION_TYPES:
        if re.search(pattern, h):
            logger.debug(f"Location type match: '{header}' -> {type_name}")
            return type_name
    return None


def _merge_by_location_type(locations: list[UniqueLocation]) -> tuple[list[UniqueLocation], int]:
    """
    Merge locations that are the same TYPE for scouting purposes.
    E.g., all dorm rooms can be filmed at one dorm room set.
    Returns (merged_locations, merge_count).
    """
    # Group by location type
    type_groups: dict[str, list[UniqueLocation]] = {}
    non_typed: list[UniqueLocation] = []

    logger.info(f"Type-based merge: processing {len(locations)} locations")

    for loc in locations:
        loc_type = _get_location_type(loc.scene_header)
        if loc_type:
            if loc_type not in type_groups:
                type_groups[loc_type] = []
            type_groups[loc_type].append(loc)
        else:
            non_typed.append(loc)

    logger.info(f"Type groups found: {list(type_groups.keys())}, non-typed: {len(non_typed)}")

    # Merge each type group
    merged_locations = list(non_typed)
    total_merged = 0

    for loc_type, locs in type_groups.items():
        if len(locs) == 1:
            merged_locations.append(locs[0])
        else:
            # Sort by page number to get earliest occurrence first
            locs.sort(key=lambda x: x.page_numbers[0] if x.page_numbers else 999)

            # Create merged location with combined info
            canonical = locs[0]
            all_headers = [loc.scene_header for loc in locs]

            # Use a generic header for the merged location
            interior_ext = canonical.interior_exterior
            for loc in locs[1:]:
                canonical.occurrences.extend(loc.occurrences)
                canonical.page_numbers = sorted(set(canonical.page_numbers + loc.page_numbers))
                if canonical.time_of_day != loc.time_of_day:
                    canonical.time_of_day = "both"
                if interior_ext != loc.interior_exterior:
                    interior_ext = "both"

            canonical.interior_exterior = interior_ext
            # Update header to show it's a merged type
            canonical.scene_header = f"INT. {loc_type}" if interior_ext == "interior" else f"INT./EXT. {loc_type}"

            merged_locations.append(canonical)
            total_merged += len(locs) - 1
            logger.info(f"Merged {len(locs)} locations into {loc_type}", headers=all_headers)

    merged_locations.sort(key=lambda loc: loc.page_numbers[0] if loc.page_numbers else 0)
    return merged_locations, total_merged


def _normalize_header_for_matching(header: str) -> str:
    """
    Normalize a scene header for matching purposes.
    Strips INT/EXT prefix, time of day suffix, and normalizes whitespace.
    """
    h = header.upper().strip()

    # Remove INT./EXT./INT/EXT prefix
    h = re.sub(r'^(INT\.|EXT\.|INT|EXT)[\s/]*', '', h)

    # Remove time of day suffixes
    h = re.sub(r'\s*[-–]\s*(DAY|NIGHT|MORNING|EVENING|DAWN|DUSK|SUNSET|SUNRISE|LATER|CONTINUOUS|SAME|MOMENTS LATER)(\s|$)', '', h)

    # Remove parenthetical notes
    h = re.sub(r'\s*\([^)]*\)\s*', ' ', h)

    # Normalize whitespace and punctuation
    h = re.sub(r'[\s\-–]+', ' ', h).strip()
    h = re.sub(r"['\"]", '', h)  # Remove quotes/apostrophes for matching

    return h


def _pre_merge_obvious_duplicates(locations: list[UniqueLocation]) -> tuple[list[UniqueLocation], int]:
    """
    Pre-merge obvious duplicates before LLM processing.
    Returns (merged_locations, merge_count).
    """
    # Group by normalized header
    groups: dict[str, list[UniqueLocation]] = {}

    for loc in locations:
        normalized = _normalize_header_for_matching(loc.scene_header)
        if normalized not in groups:
            groups[normalized] = []
        groups[normalized].append(loc)

    # Merge each group
    merged_locations = []
    total_merged = 0

    for normalized, locs in groups.items():
        if len(locs) == 1:
            merged_locations.append(locs[0])
        else:
            # Pick the most complete header as canonical (longest one)
            locs.sort(key=lambda x: len(x.scene_header), reverse=True)
            canonical = locs[0]

            # Merge all others into canonical
            for other in locs[1:]:
                canonical.occurrences.extend(other.occurrences)
                canonical.page_numbers = sorted(set(canonical.page_numbers + other.page_numbers))
                if canonical.interior_exterior != other.interior_exterior:
                    canonical.interior_exterior = "both"
                if canonical.time_of_day != other.time_of_day:
                    canonical.time_of_day = "both"

            merged_locations.append(canonical)
            total_merged += len(locs) - 1

    merged_locations.sort(key=lambda loc: loc.page_numbers[0] if loc.page_numbers else 0)
    return merged_locations, total_merged


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
            if existing.interior_exterior != loc.interior_exterior:
                existing.interior_exterior = "both"
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
    Four-pass deduplication for aggressive location merging:
    0. Pre-merge: Automatically merge obvious duplicates (same location, different INT/EXT or time of day)
    1. Name-based: merge similar names with LLM assistance, flag ambiguous ones
    2. Context-based: for flagged locations, look at script context to decide
    3. Type-based: merge all locations of the same type (e.g., all dorm rooms → one dorm room set)
    """
    if not locations:
        return locations

    # === PASS 0: Pre-merge obvious duplicates ===
    locations, pre_merged = _pre_merge_obvious_duplicates(locations)
    if pre_merged > 0:
        logger.info("Pre-merge complete", merged=pre_merged, remaining=len(locations))

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

    # === PASS 3: Type-based merge for scouting efficiency ===
    # Merge all locations of the same type (e.g., all dorm rooms → one dorm room set)
    locations, type_merged = _merge_by_location_type(locations)
    if type_merged > 0:
        logger.info("Type-based merge complete", merged=type_merged, remaining=len(locations))

    logger.info("Deduplication complete", final_count=len(locations))
    return locations
