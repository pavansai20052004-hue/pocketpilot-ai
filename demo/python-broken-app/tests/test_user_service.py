from user_service import get_user_name


def test_present_user() -> None:
    assert get_user_name({"name": "Ada"}) == "Ada"


def test_missing_user_uses_fallback() -> None:
    assert get_user_name(None) == "Unknown"
