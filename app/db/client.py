"""
Supabase client configuration.
"""

import os
from functools import lru_cache

from supabase import Client, ClientOptions, create_client


def _get_url_and_key() -> tuple[str, str]:
    """Get Supabase URL and key from environment."""
    url = (
        os.environ.get("SUPABASE_URL")
        or os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
    )
    key = (
        os.environ.get("SUPABASE_SECRET_KEY")
        or os.environ.get("SUPABASE_ANON_KEY")
        or os.environ.get("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY")
    )

    if not url or not key:
        raise ValueError(
            "Supabase URL and key must be set. "
            "Set SUPABASE_URL and SUPABASE_SECRET_KEY (or SUPABASE_ANON_KEY)"
        )

    return url, key


@lru_cache(maxsize=1)
def get_supabase_client() -> Client:
    """
    Get a cached Supabase client instance (for auth verification).

    Accepts environment variables (in order of preference):
    - SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL
    - SUPABASE_SECRET_KEY or SUPABASE_ANON_KEY or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY
    """
    url, key = _get_url_and_key()
    return create_client(url, key)


def get_supabase_client_with_token(access_token: str) -> Client:
    """
    Get a Supabase client authenticated with the user's access token.

    This client respects RLS policies because auth.uid() will return the user's ID.

    Args:
        access_token: The user's JWT access token

    Returns:
        A Supabase client with the user's auth context
    """
    url, key = _get_url_and_key()

    # Create client with the user's access token in headers
    options = ClientOptions(
        headers={"Authorization": f"Bearer {access_token}"}
    )

    return create_client(url, key, options=options)


# Convenience alias
supabase = get_supabase_client
