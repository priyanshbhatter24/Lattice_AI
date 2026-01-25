"""
JWT Authentication middleware for Supabase Auth.

Validates JWTs from Supabase and extracts user_id for route handlers.
"""

import os
from typing import Optional

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

# Optional bearer token - allows endpoints to work without auth
security = HTTPBearer()
optional_security = HTTPBearer(auto_error=False)


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
) -> str:
    """
    Validate Supabase JWT and return user_id.

    Raises 401 if token is missing or invalid.

    Usage:
        @router.get("/protected")
        async def protected_route(user_id: str = Depends(get_current_user)):
            ...
    """
    return _validate_token(credentials.credentials)


async def get_optional_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(optional_security),
) -> Optional[str]:
    """
    Optionally validate Supabase JWT and return user_id.

    Returns None if no token provided (useful for routes that work
    both with and without auth).

    Usage:
        @router.get("/maybe-protected")
        async def maybe_protected(user_id: Optional[str] = Depends(get_optional_user)):
            if user_id:
                # Authenticated
            else:
                # Anonymous
    """
    if credentials is None:
        return None
    return _validate_token(credentials.credentials)


def _validate_token(token: str) -> str:
    """
    Validate a Supabase JWT and extract the user_id.

    Args:
        token: The JWT access token from the Authorization header

    Returns:
        The user_id (UUID string) from the 'sub' claim

    Raises:
        HTTPException(401): If token is invalid, expired, or missing required claims
    """
    jwt_secret = os.environ.get("SUPABASE_JWT_SECRET")

    if not jwt_secret:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Server auth configuration error",
        )

    try:
        # Decode and validate the JWT
        # Supabase uses HS256 algorithm and 'authenticated' audience
        payload = jwt.decode(
            token,
            jwt_secret,
            algorithms=["HS256"],
            audience="authenticated",
        )

        # Extract user_id from 'sub' claim
        user_id = payload.get("sub")
        if not user_id:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid token: missing user identifier",
            )

        return user_id

    except jwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token has expired",
        )
    except jwt.InvalidAudienceError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token audience",
        )
    except jwt.InvalidTokenError as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Invalid token: {str(e)}",
        )
