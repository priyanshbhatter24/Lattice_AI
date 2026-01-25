"""
Authentication middleware for Supabase Auth.

Validates access tokens via Supabase API and extracts user_id for route handlers.
"""

from dataclasses import dataclass
from typing import Optional

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.db.client import get_supabase_client

# Optional bearer token - allows endpoints to work without auth
security = HTTPBearer()
optional_security = HTTPBearer(auto_error=False)


@dataclass
class AuthenticatedUser:
    """Authenticated user with ID and access token."""
    user_id: str
    access_token: str


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
) -> AuthenticatedUser:
    """
    Validate Supabase access token and return user info.

    Raises 401 if token is missing or invalid.

    Usage:
        @router.get("/protected")
        async def protected_route(auth: AuthenticatedUser = Depends(get_current_user)):
            user_id = auth.user_id
            # Use auth.access_token for RLS-authenticated DB operations
    """
    return await _validate_token(credentials.credentials)


async def get_optional_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(optional_security),
) -> Optional[AuthenticatedUser]:
    """
    Optionally validate Supabase access token and return user info.

    Returns None if no token provided.
    """
    if credentials is None:
        return None
    return await _validate_token(credentials.credentials)


async def _validate_token(token: str) -> AuthenticatedUser:
    """
    Validate a Supabase access token and extract user info.

    Uses Supabase's auth.get_user() API to verify the token.

    Args:
        token: The access token from the Authorization header

    Returns:
        AuthenticatedUser with user_id and access_token

    Raises:
        HTTPException(401): If token is invalid, expired, or missing required claims
    """
    try:
        supabase = get_supabase_client()

        # Use Supabase to verify the token and get user info
        response = supabase.auth.get_user(token)

        if response.user is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid or expired token",
            )

        return AuthenticatedUser(
            user_id=response.user.id,
            access_token=token,
        )

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Authentication failed: {str(e)}",
        )
