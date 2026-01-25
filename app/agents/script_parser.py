import google.generativeai as genai
import json
import structlog
from uuid import UUID

from app.config import get_settings
from app.db.models import SceneCreate
from app.db import queries

logger = structlog.get_logger()

SCRIPT_PARSER_PROMPT = """You are an expert screenplay analyst. Parse the following screenplay and extract all unique locations/scenes.

For each scene, identify:
1. slugline - The scene header (e.g., "INT. COFFEE SHOP - DAY")
2. int_ext - Whether it's interior (INT) or exterior (EXT)
3. time_of_day - Time of day (DAY, NIGHT, MORNING, EVENING, SUNSET, etc.)
4. description - A description of the location from the scene content
5. mood - The mood/atmosphere (e.g., "warm", "tense", "romantic", "gritty")
6. period - Time period if specified (e.g., "1950s", "modern", "futuristic")
7. requirements - List of specific visual/physical requirements for this location

Return a JSON array of scenes. Example:
```json
[
  {
    "scene_number": 1,
    "slugline": "INT. UPSCALE COFFEE SHOP - DAY",
    "int_ext": "interior",
    "time_of_day": "day",
    "description": "A warm, modern coffee shop with exposed brick walls and reclaimed wood furniture",
    "mood": "warm, upscale",
    "period": "modern",
    "requirements": ["exposed brick", "reclaimed wood tables", "natural lighting", "seating for 20+"]
  }
]
```

SCREENPLAY:
{script_content}

Return ONLY the JSON array, no other text.
"""


async def parse_script(script_id: str, content: str) -> list[dict]:
    """Parse a screenplay and extract scenes using Gemini."""
    settings = get_settings()
    genai.configure(api_key=settings.gemini_api_key)

    model = genai.GenerativeModel("gemini-1.5-flash")

    prompt = SCRIPT_PARSER_PROMPT.format(script_content=content)

    try:
        response = model.generate_content(prompt)
        response_text = response.text.strip()

        # Clean up response - extract JSON from markdown code blocks if present
        if "```json" in response_text:
            response_text = response_text.split("```json")[1].split("```")[0].strip()
        elif "```" in response_text:
            response_text = response_text.split("```")[1].split("```")[0].strip()

        scenes_data = json.loads(response_text)
        logger.info("Parsed scenes from script", count=len(scenes_data))

        # Create scene records in database
        scene_creates = []
        for scene in scenes_data:
            scene_create = SceneCreate(
                script_id=UUID(script_id),
                slugline=scene.get("slugline"),
                int_ext=scene.get("int_ext"),
                time_of_day=scene.get("time_of_day"),
                description=scene.get("description"),
                mood=scene.get("mood"),
                period=scene.get("period"),
                requirements=scene.get("requirements", []),
                scene_number=scene.get("scene_number"),
            )
            scene_creates.append(scene_create)

        # Batch insert scenes
        created_scenes = await queries.create_scenes_batch(scene_creates)
        return created_scenes

    except json.JSONDecodeError as e:
        logger.error("Failed to parse Gemini response as JSON", error=str(e))
        raise ValueError(f"Failed to parse script: {e}")
    except Exception as e:
        logger.error("Script parsing failed", error=str(e))
        raise
