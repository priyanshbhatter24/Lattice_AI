from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    # Server
    port: int = 8000
    debug: bool = False

    # Supabase
    supabase_url: str
    supabase_anon_key: str
    supabase_service_key: str

    # Google Gemini
    gemini_api_key: str

    # Vapi Voice
    vapi_api_key: str = ""
    vapi_assistant_id: str = ""

    # Browserbase
    browserbase_api_key: str = ""
    browserbase_project_id: str = ""

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


@lru_cache
def get_settings() -> Settings:
    return Settings()
