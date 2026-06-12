"""Authentication utilities for Open-Inspect.

Re-exports from sandbox_runtime.auth for backward compatibility.
"""

from sandbox_runtime.auth import (
    AuthConfigurationError,
    generate_installation_token,
    generate_internal_token,
    require_secret,
    verify_internal_token,
)

from .installation_map import parse_installation_map, resolve_installation_id

__all__ = [
    "AuthConfigurationError",
    "generate_installation_token",
    "generate_internal_token",
    "parse_installation_map",
    "require_secret",
    "resolve_installation_id",
    "verify_internal_token",
]
