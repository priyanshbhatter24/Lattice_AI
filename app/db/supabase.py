from supabase import create_client, Client
from app.config import get_settings
import structlog

logger = structlog.get_logger()

_supabase_client: Client | None = None


def init_supabase() -> Client:
    global _supabase_client
    settings = get_settings()
    _supabase_client = create_client(settings.supabase_url, settings.supabase_service_key)
    logger.info("Supabase client initialized")
    return _supabase_client


def get_supabase() -> Client:
    global _supabase_client
    if _supabase_client is None:
        return init_supabase()
    return _supabase_client
