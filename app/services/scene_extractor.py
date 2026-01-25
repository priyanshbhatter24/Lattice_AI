import re
from collections import defaultdict

import structlog

from app.models.location import SceneOccurrence, UniqueLocation


logger = structlog.get_logger()

# Pattern to match screenplay scene headers - more flexible version
# Matches various formats:
#   INT. LOCATION - DAY
#   EXT LOCATION - NIGHT  (no period)
#   INT/EXT. LOCATION - DAY
#   1. INT. LOCATION - DAY  (numbered scenes)
#   SC. 1 INT. LOCATION - DAY  (TV scripts)
#   INT. LOCATION (DAY)  (parenthetical time)
#   INT. LOCATION  (no time - will default to "day")
#   SCENE 1 - INT. LOCATION - DAY  (alternative TV format)
SCENE_HEADER_PATTERN = re.compile(
    r"^(?:SCENE\s*\d+\s*[-–—]\s*)?(?:SC\.?\s*\d+\s*)?(?:\d+\.?\s*)?(INT\.?|EXT\.?|INT\.?/EXT\.?|I/E\.?|INTERIOR|EXTERIOR)\s+([A-Z0-9][A-Z0-9\s\'\"\-\.\,\/\(\)]+?)(?:\s*[-–—]\s*(DAY|NIGHT|DAWN|DUSK|MORNING|EVENING|LATER|CONTINUOUS|SAME|MOMENTS?\s*LATER|SAME\s*TIME|LATER\s*THAT\s*(?:NIGHT|DAY))|\s*\((DAY|NIGHT|DAWN|DUSK|MORNING|EVENING)\)|\s*$)",
    re.MULTILINE | re.IGNORECASE,
)

# Fallback pattern for simpler matching - just INT/EXT followed by location
FALLBACK_SCENE_PATTERN = re.compile(
    r"^(?:\d+\.?\s*)?(INT\.?|EXT\.?)\s+([A-Z][A-Z0-9\s\'\"\-\.]+?)(?:\s*[-–—]|\s*\(|\s*$)",
    re.MULTILINE | re.IGNORECASE,
)


def normalize_location_name(location: str) -> str:
    """
    Normalize a location name for deduplication.
    Removes extra whitespace and standardizes formatting.
    """
    # Remove extra whitespace
    normalized = " ".join(location.split())
    # Convert to uppercase for comparison
    return normalized.upper()


def extract_scene_context(page_text: str, match_start: int, context_chars: int = 800) -> str:
    """
    Extract context around a scene header match.

    Args:
        page_text: The full page text
        match_start: Start position of the scene header match
        context_chars: Number of characters of context to extract after the header

    Returns:
        The scene header plus following context
    """
    # Get text from match start to context_chars after
    end_pos = min(match_start + context_chars, len(page_text))
    context = page_text[match_start:end_pos]

    # Try to end at a natural break (end of line or paragraph)
    last_newline = context.rfind("\n\n")
    if last_newline > 200:  # Only truncate if we have enough text
        context = context[:last_newline]

    return context.strip()


def extract_unique_locations(pages: list[tuple[int, str]]) -> list[UniqueLocation]:
    """
    Extract unique locations from screenplay pages, deduplicating and grouping.

    Args:
        pages: List of (page_number, page_text) tuples

    Returns:
        List of UniqueLocation objects with combined context from all occurrences
    """
    # Dictionary to group occurrences by normalized location key
    location_groups: dict[str, dict] = defaultdict(
        lambda: {"occurrences": [], "page_numbers": set(), "raw_header": "", "int_ext": "", "time": ""}
    )

    logger.info("Starting location extraction", total_pages=len(pages))
    total_matches = 0

    # First pass: count matches with main pattern to decide if we need fallback
    main_pattern_matches = 0
    for page_num, page_text in pages:
        for match in SCENE_HEADER_PATTERN.finditer(page_text):
            main_pattern_matches += 1

    # If no matches found with main pattern, use fallback
    use_fallback = main_pattern_matches == 0
    if use_fallback:
        logger.warning("No matches with main pattern, trying fallback pattern")
    else:
        logger.info("Main pattern found matches", count=main_pattern_matches)

    # Choose which pattern to use
    pattern = FALLBACK_SCENE_PATTERN if use_fallback else SCENE_HEADER_PATTERN

    for page_num, page_text in pages:
        # Find all scene headers on this page
        for match in pattern.finditer(page_text):
            total_matches += 1

            int_ext_raw = match.group(1).upper().rstrip(".")
            # Normalize INTERIOR/EXTERIOR to INT/EXT
            int_ext = int_ext_raw.replace("INTERIOR", "INT").replace("EXTERIOR", "EXT")
            location = match.group(2).strip()

            # Time can be in group 3 (dash format) or group 4 (parenthetical format) - only for main pattern
            if use_fallback:
                time_of_day = "DAY"  # Default for fallback
            else:
                time_of_day = (match.group(3) or match.group(4) or "DAY").upper()

            logger.debug("Found scene header", page=page_num, int_ext=int_ext, location=location, time=time_of_day, fallback=use_fallback)

            # Create a normalized key for deduplication
            # Key includes location name and INT/EXT, but NOT time of day
            # This way "INT. KITCHEN - DAY" and "INT. KITCHEN - NIGHT" are grouped
            normalized_key = f"{int_ext}|{normalize_location_name(location)}"

            # Extract context around this scene
            context = extract_scene_context(page_text, match.start())

            # Add occurrence
            occurrence = SceneOccurrence(page_number=page_num, context=context)
            location_groups[normalized_key]["occurrences"].append(occurrence)
            location_groups[normalized_key]["page_numbers"].add(page_num)

            # Store the first raw header as the canonical name
            if not location_groups[normalized_key]["raw_header"]:
                location_groups[normalized_key]["raw_header"] = f"{int_ext}. {location}"
                location_groups[normalized_key]["int_ext"] = int_ext
                location_groups[normalized_key]["time"] = time_of_day
            else:
                # Update time if we see both DAY and NIGHT
                existing_time = location_groups[normalized_key]["time"]
                if time_of_day != existing_time:
                    location_groups[normalized_key]["time"] = "both"

    # Convert to UniqueLocation objects
    unique_locations = []
    for key, data in location_groups.items():
        unique_location = UniqueLocation(
            scene_header=data["raw_header"],
            interior_exterior=data["int_ext"],
            time_of_day=data["time"].lower() if data["time"] != "both" else "both",
            occurrences=data["occurrences"],
            page_numbers=sorted(data["page_numbers"]),
        )
        unique_locations.append(unique_location)

    # Sort by first page number appearance
    unique_locations.sort(key=lambda loc: loc.page_numbers[0] if loc.page_numbers else 0)

    logger.info(
        "Location extraction complete",
        total_matches=total_matches,
        unique_locations=len(unique_locations),
    )

    return unique_locations
