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


DEDUP_PROMPT = """Analyze these screenplay scene headers and identify which ones refer to the SAME physical location.

Scene headers:
{location_list}

Group headers that refer to the SAME location. Consider:
- "MARK'S DORM ROOM" and "MARK'S ROOM" = same location
- "CAMERON AND TYLER'S DORM ROOM" and "TYLER AND CAMERON'S DORM ROOM" = same (name order swapped)
- "PORCELLIAN CLUB" and "PORCELLIAN" = same (suffix dropped)
- "FIRST DEPOSITION ROOM" vs "SECOND DEPOSITION ROOM" = DIFFERENT rooms
- Generic names like "HALLWAY" or "BEDROOM" in different contexts might be different locations

Return JSON where keys are the canonical name and values are arrays of headers to merge:
{{
  "canonical_header": ["header1", "header2"],
  ...
}}

Only include entries where there are duplicates to merge. Respond with valid JSON only."""


async def deduplicate_locations_with_llm(
    locations: list[UniqueLocation],
) -> list[UniqueLocation]:
    """
    Use LLM to identify and merge duplicate locations with similar names.
    """
    if not locations:
        return locations

    headers = [loc.scene_header for loc in locations]
    location_list = "\n".join(f"- {h}" for h in headers)

    try:
        response = await client.chat.completions.create(
            model=settings.openai_model,
            messages=[
                {
                    "role": "system",
                    "content": "You identify duplicate screenplay locations. Respond only with valid JSON.",
                },
                {"role": "user", "content": DEDUP_PROMPT.format(location_list=location_list)},
            ],
            response_format={"type": "json_object"},
            temperature=0.1,
        )

        content = response.choices[0].message.content
        merge_groups = json.loads(content)

        if not merge_groups:
            return locations

        # Build mapping from header -> canonical header
        header_to_canonical: dict[str, str] = {}
        for canonical, duplicates in merge_groups.items():
            for dup in duplicates:
                header_to_canonical[dup] = canonical

        # Merge locations
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

        logger.info(
            "LLM deduplication complete",
            original_count=len(locations),
            merged_count=len(result),
            merges=len(locations) - len(result),
        )

        return result

    except Exception as e:
        logger.warning("LLM deduplication failed, using original locations", error=str(e))
        return locations
