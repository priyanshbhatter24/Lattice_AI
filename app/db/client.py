"""
Supabase client configuration.
"""

import os
from functools import lru_cache

from supabase import Client, create_client


@lru_cache(maxsize=1)
def get_supabase_client() -> Client:
    """
    Get a cached Supabase client instance.

    Requires environment variables:
    - SUPABASE_URL
    - SUPABASE_SECRET_KEY
    """
    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_SECRET_KEY")

    if not url or not key:
        raise ValueError("SUPABASE_URL and SUPABASE_SECRET_KEY must be set")

    return create_client(url, key)


# Convenience alias
supabase = get_supabase_client
