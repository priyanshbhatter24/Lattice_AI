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

Provide a JSON response with the following structure:
{{
  "vibe": {{
    "primary": "<main aesthetic: industrial, luxury, suburban, urban-gritty, natural, retro-vintage, futuristic, institutional, commercial, residential>",
    "secondary": "<optional secondary aesthetic or null>",
    "descriptors": ["<3-5 specific visual descriptors from the script>"],
    "confidence": <0.0-1.0 confidence score>
  }},
  "constraints": {{
    "interior_exterior": "<interior, exterior, or both>",
    "time_of_day": "<day, night, or both>",
    "min_ceiling_height_ft": <estimated minimum ceiling height or null>,
    "min_floor_space_sqft": <estimated minimum floor space or null>,
    "parking_spaces_needed": <estimated parking needs, default 10>,
    "power_requirements": "<standard_120v, heavy_duty, or generator_ok>",
    "acoustic_needs": "<dialogue_heavy, action_ok, or any>",
    "special_requirements": ["<list of specific requirements from the script>"]
  }},
  "location_description": "<A detailed paragraph describing exactly what this location should look like, including architectural style, key features, atmosphere, era/period if applicable, and any specific details mentioned in the script. This should help a location scout visualize and find a real place.>",
  "scouting_notes": "<Practical notes for location scouts: what to look for when visiting potential locations, must-haves, deal-breakers, and any logistical considerations for filming.>",
  "estimated_shoot_duration_hours": <estimated hours based on scene complexity and number of occurrences>
}}

Respond with valid JSON only. No markdown, no code blocks, just the JSON object."""


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
                min_ceiling_height_ft=data["constraints"].get("min_ceiling_height_ft"),
                min_floor_space_sqft=data["constraints"].get("min_floor_space_sqft"),
                parking_spaces_needed=data["constraints"].get("parking_spaces_needed", 10),
                power_requirements=data["constraints"].get("power_requirements", "standard_120v"),
                acoustic_needs=data["constraints"].get("acoustic_needs", "any"),
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
