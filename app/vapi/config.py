"""
Vapi.ai configuration for Stage 3: Voice Outreach.

Requires environment variables:
- VAPI_API_KEY: API authentication key
- VAPI_PHONE_NUMBER_ID: Outbound phone number ID
- VAPI_ASSISTANT_ID: Pre-configured assistant ID
"""

from functools import lru_cache

from pydantic_settings import BaseSettings


class VapiConfig(BaseSettings):
    """Configuration for Vapi voice calling service."""

    # Required credentials
    vapi_api_key: str
    vapi_phone_number_id: str
    vapi_assistant_id: str

    # API settings
    vapi_base_url: str = "https://api.vapi.ai"

    # Call settings
    max_call_duration_seconds: int = 300  # 5 minutes max
    max_concurrent_calls: int = 5

    class Config:
        env_prefix = ""
        case_sensitive = False


@lru_cache(maxsize=1)
def get_vapi_config() -> VapiConfig:
    """Get cached Vapi configuration from environment."""
    return VapiConfig()


def validate_vapi_config() -> bool:
    """Validate that all required Vapi config is present."""
    try:
        config = get_vapi_config()
        return bool(
            config.vapi_api_key
            and config.vapi_phone_number_id
            and config.vapi_assistant_id
        )
    except Exception:
        return False
