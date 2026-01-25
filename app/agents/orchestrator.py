import asyncio
import structlog
from uuid import UUID

from app.db import queries
from app.db.models import LocationCreate, MatchScoreCreate
from app.agents.browser.airbnb import search_airbnb
from app.agents.browser.google import search_google_maps
from app.agents.matcher import score_location_for_scene
from app.api.routes.events import publish_event

logger = structlog.get_logger()


async def run_location_search(
    scene_ids: list[str],
    location: str,
    sources: list[str],
    max_results: int = 20,
):
    """Orchestrate browser agents to search for locations and score them."""
    logger.info("Starting location search", scene_ids=scene_ids, location=location)

    # Fetch scene details
    scenes = []
    for scene_id in scene_ids:
        scene = await queries.get_scene(UUID(scene_id))
        if scene:
            scenes.append(scene)

    if not scenes:
        logger.error("No valid scenes found")
        return

    # Publish search started event
    await publish_event(
        "search_started",
        {"scene_ids": scene_ids, "location": location, "sources": sources},
    )

    # Run browser agents in parallel
    all_locations = []
    tasks = []

    for scene in scenes:
        search_query = build_search_query(scene, location)

        if "airbnb" in sources:
            tasks.append(search_airbnb(search_query, max_results=max_results // 2))

        if "google" in sources:
            tasks.append(search_google_maps(search_query, max_results=max_results // 2))

    # Gather results from all agents
    results = await asyncio.gather(*tasks, return_exceptions=True)

    for result in results:
        if isinstance(result, Exception):
            logger.error("Agent search failed", error=str(result))
            continue
        if result:
            all_locations.extend(result)

    logger.info("Browser agents found locations", count=len(all_locations))

    # Save locations and score them
    for loc_data in all_locations:
        try:
            # Create location record
            location_create = LocationCreate(
                source=loc_data.get("source", "unknown"),
                source_id=loc_data.get("source_id"),
                name=loc_data.get("name", "Unknown Location"),
                address=loc_data.get("address"),
                coordinates=loc_data.get("coordinates"),
                description=loc_data.get("description"),
                images=loc_data.get("images", []),
                price=loc_data.get("price"),
                amenities=loc_data.get("amenities", []),
                contact=loc_data.get("contact"),
                source_url=loc_data.get("source_url"),
            )
            saved_location = await queries.create_location(location_create)

            # Publish location found event
            await publish_event(
                "location_found",
                {"location": saved_location},
            )

            # Score location against each scene
            for scene in scenes:
                try:
                    score_result = await score_location_for_scene(scene, saved_location)

                    match_score = MatchScoreCreate(
                        scene_id=UUID(scene["id"]),
                        location_id=UUID(saved_location["id"]),
                        visual_score=score_result["visual_score"],
                        functional_score=score_result["functional_score"],
                        logistics_score=score_result["logistics_score"],
                        overall_score=score_result["overall_score"],
                        reasoning=score_result["reasoning"],
                    )
                    saved_score = await queries.create_match_score(match_score)

                    # Publish score event
                    await publish_event(
                        "location_scored",
                        {
                            "location_id": saved_location["id"],
                            "scene_id": scene["id"],
                            "score": saved_score,
                        },
                    )

                except Exception as e:
                    logger.error(
                        "Failed to score location",
                        location_id=saved_location["id"],
                        scene_id=scene["id"],
                        error=str(e),
                    )

        except Exception as e:
            logger.error("Failed to save location", error=str(e))

    # Publish search completed event
    await publish_event(
        "search_completed",
        {"scene_ids": scene_ids, "locations_found": len(all_locations)},
    )

    logger.info("Location search completed", total_locations=len(all_locations))


def build_search_query(scene: dict, location: str) -> str:
    """Build a search query from scene requirements."""
    parts = []

    # Add location type from slugline
    if scene.get("slugline"):
        # Extract location name from slugline (e.g., "INT. COFFEE SHOP - DAY" -> "coffee shop")
        slugline = scene["slugline"]
        if "." in slugline:
            loc_part = slugline.split(".")[1].split("-")[0].strip().lower()
            parts.append(loc_part)

    # Add mood/style keywords
    if scene.get("mood"):
        parts.append(scene["mood"])

    # Add specific requirements
    if scene.get("requirements"):
        parts.extend(scene["requirements"][:3])  # Top 3 requirements

    # Add geographic location
    parts.append(location)

    return " ".join(parts)
