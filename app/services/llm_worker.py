import asyncio
import json
import structlog
from collections.abc import AsyncGenerator

from openai import AsyncOpenAI

from app.config import settings
from app.models.location import Constraints, LocationRequirement, UniqueLocation, Vibe


logger = structlog.get_logger()

# Initialize OpenAI client
client = AsyncOpenAI(api_key=settings.openai_api_key)


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
    "primary": "<aesthetic: industrial, luxury, suburban, urban-gritty, natural, retro-vintage, futuristic, institutional, commercial, residential>",
    "secondary": "<optional secondary aesthetic or null>",
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
  "estimated_shoot_duration_hours": <estimate based on scene complexity and number of pages>
}}

Respond with valid JSON only."""


async def analyze_location_with_llm(
    location: UniqueLocation, location_idx: int
) -> LocationRequirement:
    """
    Analyze a single location using OpenAI and return structured requirements.

    Args:
        location: The unique location to analyze
        location_idx: Index for generating scene_id

    Returns:
        LocationRequirement with all extracted details
    """
    prompt = LOCATION_ANALYSIS_PROMPT.format(
        scene_header=location.scene_header,
        num_occurrences=len(location.occurrences),
        script_context=location.combined_context,
    )

    max_retries = 3
    for attempt in range(max_retries):
        try:
            response = await client.chat.completions.create(
                model=settings.openai_model,
                messages=[
                    {
                        "role": "system",
                        "content": "You are a professional film location scout. Respond only with valid JSON.",
                    },
                    {"role": "user", "content": prompt},
                ],
                response_format={"type": "json_object"},
                temperature=0.7,
            )

            content = response.choices[0].message.content
            data = json.loads(content)

            # Parse the response into our models
            vibe = Vibe(
                primary=data["vibe"]["primary"],
                secondary=data["vibe"].get("secondary"),
                descriptors=data["vibe"]["descriptors"],
                confidence=data["vibe"]["confidence"],
            )

            constraints = Constraints(
                interior_exterior=data["constraints"]["interior_exterior"],
                time_of_day=data["constraints"]["time_of_day"],
                special_requirements=data["constraints"].get("special_requirements", []),
            )

            return LocationRequirement(
                scene_id=f"LOC_{location_idx:03d}",
                scene_header=location.scene_header,
                page_numbers=location.page_numbers,
                vibe=vibe,
                constraints=constraints,
                script_context=location.combined_context[:500],  # Truncate for response
                estimated_shoot_duration_hours=data.get("estimated_shoot_duration_hours", 8),
                location_description=data["location_description"],
                scouting_notes=data["scouting_notes"],
            )

        except Exception as e:
            logger.warning(
                "LLM analysis failed",
                location=location.scene_header,
                attempt=attempt + 1,
                error=str(e),
            )
            if attempt < max_retries - 1:
                await asyncio.sleep(2 ** attempt)  # Exponential backoff
            else:
                raise


async def process_locations_streaming(
    locations: list[UniqueLocation],
    max_concurrent: int | None = None,
) -> AsyncGenerator[LocationRequirement, None]:
    """
    Process locations in parallel, yielding each result as it completes.

    This allows SSE streaming of results as they become available.

    Args:
        locations: List of unique locations to analyze
        max_concurrent: Maximum concurrent LLM calls (defaults to settings)

    Yields:
        LocationRequirement for each analyzed location
    """
    if max_concurrent is None:
        max_concurrent = settings.max_concurrent_llm_calls

    semaphore = asyncio.Semaphore(max_concurrent)
    queue: asyncio.Queue[tuple[int, LocationRequirement | Exception]] = asyncio.Queue()

    async def process_single(location: UniqueLocation, idx: int) -> None:
        async with semaphore:
            try:
                result = await analyze_location_with_llm(location, idx)
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


# Pass 1: Name-based - merge obvious duplicates, flag ambiguous ones
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


# Pass 2: Context-based - decide on flagged ambiguous locations
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
    header_to_loc = {loc.scene_header: loc for loc in locations}

    # === PASS 1: Name-based ===
    needs_context: list[str] = []
    header_to_canonical: dict[str, str] = {}

    try:
        response = await client.chat.completions.create(
            model=settings.openai_model,
            messages=[
                {
                    "role": "system",
                    "content": "You identify duplicate screenplay locations. Respond only with valid JSON.",
                },
                {"role": "user", "content": DEDUP_PASS1_PROMPT.format(location_list=location_list)},
            ],
            response_format={"type": "json_object"},
            temperature=0.1,
        )

        content = response.choices[0].message.content
        result = json.loads(content)

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
        # Find locations matching the flagged headers
        flagged_groups: dict[str, list[UniqueLocation]] = {}
        for loc in locations:
            if loc.scene_header in needs_context:
                base = loc.scene_header
                if base not in flagged_groups:
                    flagged_groups[base] = []
                flagged_groups[base].append(loc)

        # Only process if we found matching locations (should always match)
        # and there are multiple with same header (otherwise nothing to merge)
        groups_to_check = {k: v for k, v in flagged_groups.items() if len(v) > 1}

        if groups_to_check:
            try:
                # Build context for each flagged location
                context_parts = []
                for header, locs in groups_to_check.items():
                    context_parts.append(f"\n## {header}")
                    for i, loc in enumerate(locs, 1):
                        snippet = loc.occurrences[0].context[:300] if loc.occurrences else "No context"
                        context_parts.append(f"Occurrence {i} (pages {loc.page_numbers}):\n{snippet}...")

                location_contexts = "\n".join(context_parts)

                response = await client.chat.completions.create(
                    model=settings.openai_model,
                    messages=[
                        {
                            "role": "system",
                            "content": "You analyze screenplay context. Respond only with valid JSON.",
                        },
                        {"role": "user", "content": DEDUP_PASS2_PROMPT.format(location_contexts=location_contexts)},
                    ],
                    response_format={"type": "json_object"},
                    temperature=0.1,
                )

                content = response.choices[0].message.content
                decisions = json.loads(content)

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
