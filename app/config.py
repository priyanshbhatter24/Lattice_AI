from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    openai_api_key: str
    openai_model: str = "gpt-4o"
    max_concurrent_llm_calls: int = 5

    class Config:
        env_file = ".env.local"
        env_file_encoding = "utf-8"


settings = Settings()
