"""
Configuration for Stage 2: Grounding & Discovery

Google Maps grounding requires Vertex AI. Authentication options:
1. gcloud auth application-default login (recommended for local dev)
2. Service account JSON file (for production/CI)

Environment variables required:
- GOOGLE_CLOUD_PROJECT: Your GCP project ID
"""

import os

from pydantic_settings import BaseSettings


class GroundingConfig(BaseSettings):
    """Configuration for the grounding agent."""

    # Google Cloud / Vertex AI settings (for Google Maps grounding)
    google_cloud_project: str
    google_cloud_location: str = "global"
    google_application_credentials: str = ""  # Optional: path to service account JSON

    # Google Maps API key (for static map images and photos)
    # Enable "Maps Static API" and "Places API" in GCP Console
    google_maps_api_key: str = ""

    # Gemini model settings (for grounding)
    model_name: str = "gemini-2.5-flash"
    api_version: str = "v1"

    # Perplexity settings (for visual verification)
    perplexity_api_key: str = ""
    perplexity_model: str = "sonar-pro"
    perplexity_base_url: str = "https://api.perplexity.ai"

    # Default search settings
    default_city: str = "Los Angeles, CA"
    default_latitude: float = 34.0522
    default_longitude: float = -118.2437
    default_search_radius_km: float = 50.0
    default_max_results: int = 10

    # Language settings
    language_code: str = "en_US"

    class Config:
        env_prefix = ""
        case_sensitive = False


def get_config() -> GroundingConfig:
    """Get grounding configuration from environment."""
    return GroundingConfig()


def setup_environment() -> None:
    """
    Set up environment variables for Google GenAI with Vertex AI.

    Authentication (choose one):
    1. Run: gcloud auth application-default login
    2. Set GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json
    """
    config = get_config()

    os.environ["GOOGLE_CLOUD_PROJECT"] = config.google_cloud_project
    os.environ["GOOGLE_CLOUD_LOCATION"] = config.google_cloud_location
    os.environ["GOOGLE_GENAI_USE_VERTEXAI"] = "True"

    if config.google_application_credentials:
        os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = config.google_application_credentials


# City coordinates lookup for common filming locations
CITY_COORDINATES: dict[str, tuple[float, float]] = {
    "Los Angeles, CA": (34.0522, -118.2437),
    "New York, NY": (40.7128, -74.0060),
    "Atlanta, GA": (33.7490, -84.3880),
    "Chicago, IL": (41.8781, -87.6298),
    "Vancouver, BC": (49.2827, -123.1207),
    "Toronto, ON": (43.6532, -79.3832),
    "London, UK": (51.5074, -0.1278),
    "Sydney, Australia": (-33.8688, 151.2093),
}


def get_city_coordinates(city: str) -> tuple[float, float]:
    """Get coordinates for a city, with fallback to LA."""
    return CITY_COORDINATES.get(city, CITY_COORDINATES["Los Angeles, CA"])
