"""User-name behavior for the deterministic repair demonstration."""

def get_user_name(user: dict[str, str] | None) -> str:
    """Return the display name for a repository result."""
    return user["name"]
