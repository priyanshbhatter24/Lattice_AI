"""
Stage 3: Vapi Voice Outreach Module.

Handles AI-powered voice calls to venue managers for location scouting.
"""

from app.vapi.call_context import CallContext, ProjectContext, build_call_context
from app.vapi.config import VapiConfig, get_vapi_config, validate_vapi_config
from app.vapi.extraction_schema import (
    ANALYSIS_PLAN,
    EXTRACTION_SCHEMA,
    get_analysis_plan,
    get_extraction_schema,
)
from app.vapi.service import VapiService, get_vapi_service

__all__ = [
    # Config
    "VapiConfig",
    "get_vapi_config",
    "validate_vapi_config",
    # Context
    "CallContext",
    "ProjectContext",
    "build_call_context",
    # Schema
    "EXTRACTION_SCHEMA",
    "ANALYSIS_PLAN",
    "get_extraction_schema",
    "get_analysis_plan",
    # Service
    "VapiService",
    "get_vapi_service",
]
