from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    # Gemini / Google Cloud (Stage 1 + Stage 2)
    google_cloud_project: str = ""
    google_cloud_location: str = "global"
    google_genai_use_vertexai: str = "True"
    max_concurrent_llm_calls: int = 15

    # Perplexity (Stage 2 visual verification)
    perplexity_api_key: str = ""

    # Supabase (database)
    supabase_url: str = ""
    supabase_secret_key: str = ""

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        extra = "ignore"  # Ignore unknown env vars


settings = Settings()
