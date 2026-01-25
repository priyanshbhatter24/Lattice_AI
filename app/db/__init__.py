"""
Database layer for AutoScout.

Uses Supabase as the backend for:
- PostgreSQL database
- File storage
- Realtime subscriptions
"""

from app.db.client import get_supabase_client, supabase
from app.db.repository import (
    BookingRepository,
    LocationCandidateRepository,
    ProjectRepository,
    SceneRepository,
)

__all__ = [
    "get_supabase_client",
    "supabase",
    "BookingRepository",
    "LocationCandidateRepository",
    "ProjectRepository",
    "SceneRepository",
]
