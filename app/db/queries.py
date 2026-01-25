from uuid import UUID
from app.db.supabase import get_supabase
from app.db.models import (
    ScriptCreate,
    SceneCreate,
    LocationCreate,
    MatchScoreCreate,
    OutreachLogCreate,
)
import structlog

logger = structlog.get_logger()


# Scripts
async def create_script(data: ScriptCreate) -> dict:
    supabase = get_supabase()
    result = supabase.table("scripts").insert(data.model_dump()).execute()
    return result.data[0]


async def get_script(script_id: UUID) -> dict | None:
    supabase = get_supabase()
    result = supabase.table("scripts").select("*").eq("id", str(script_id)).execute()
    return result.data[0] if result.data else None


async def get_scripts() -> list[dict]:
    supabase = get_supabase()
    result = supabase.table("scripts").select("*").order("created_at", desc=True).execute()
    return result.data


# Scenes
async def create_scene(data: SceneCreate) -> dict:
    supabase = get_supabase()
    payload = data.model_dump()
    payload["script_id"] = str(payload["script_id"])
    result = supabase.table("scenes").insert(payload).execute()
    return result.data[0]


async def create_scenes_batch(scenes: list[SceneCreate]) -> list[dict]:
    supabase = get_supabase()
    payloads = []
    for scene in scenes:
        payload = scene.model_dump()
        payload["script_id"] = str(payload["script_id"])
        payloads.append(payload)
    result = supabase.table("scenes").insert(payloads).execute()
    return result.data


async def get_scenes_by_script(script_id: UUID) -> list[dict]:
    supabase = get_supabase()
    result = (
        supabase.table("scenes")
        .select("*")
        .eq("script_id", str(script_id))
        .order("scene_number")
        .execute()
    )
    return result.data


async def get_scene(scene_id: UUID) -> dict | None:
    supabase = get_supabase()
    result = supabase.table("scenes").select("*").eq("id", str(scene_id)).execute()
    return result.data[0] if result.data else None


async def update_scene(scene_id: UUID, data: dict) -> dict:
    supabase = get_supabase()
    result = supabase.table("scenes").update(data).eq("id", str(scene_id)).execute()
    return result.data[0]


# Locations
async def create_location(data: LocationCreate) -> dict:
    supabase = get_supabase()
    payload = data.model_dump()
    if payload.get("coordinates"):
        payload["coordinates"] = payload["coordinates"]
    if payload.get("contact"):
        payload["contact"] = payload["contact"]
    result = supabase.table("locations").insert(payload).execute()
    return result.data[0]


async def get_locations() -> list[dict]:
    supabase = get_supabase()
    result = supabase.table("locations").select("*").order("scraped_at", desc=True).execute()
    return result.data


async def get_location(location_id: UUID) -> dict | None:
    supabase = get_supabase()
    result = supabase.table("locations").select("*").eq("id", str(location_id)).execute()
    return result.data[0] if result.data else None


# Match Scores
async def create_match_score(data: MatchScoreCreate) -> dict:
    supabase = get_supabase()
    payload = data.model_dump()
    payload["scene_id"] = str(payload["scene_id"])
    payload["location_id"] = str(payload["location_id"])
    result = supabase.table("match_scores").insert(payload).execute()
    return result.data[0]


async def get_match_scores_by_scene(scene_id: UUID) -> list[dict]:
    supabase = get_supabase()
    result = (
        supabase.table("match_scores")
        .select("*, locations(*)")
        .eq("scene_id", str(scene_id))
        .order("overall_score", desc=True)
        .execute()
    )
    return result.data


async def get_match_scores_by_location(location_id: UUID) -> list[dict]:
    supabase = get_supabase()
    result = (
        supabase.table("match_scores")
        .select("*, scenes(*)")
        .eq("location_id", str(location_id))
        .execute()
    )
    return result.data


# Outreach Logs
async def create_outreach_log(data: OutreachLogCreate) -> dict:
    supabase = get_supabase()
    payload = data.model_dump()
    payload["location_id"] = str(payload["location_id"])
    result = supabase.table("outreach_logs").insert(payload).execute()
    return result.data[0]


async def update_outreach_log(log_id: UUID, data: dict) -> dict:
    supabase = get_supabase()
    result = supabase.table("outreach_logs").update(data).eq("id", str(log_id)).execute()
    return result.data[0]


async def get_outreach_logs_by_location(location_id: UUID) -> list[dict]:
    supabase = get_supabase()
    result = (
        supabase.table("outreach_logs")
        .select("*")
        .eq("location_id", str(location_id))
        .order("called_at", desc=True)
        .execute()
    )
    return result.data
