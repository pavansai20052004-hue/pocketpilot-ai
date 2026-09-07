import pytest

from pocketpilot_agent.error_parser import ErrorParser


def test_parses_java_stack_frame() -> None:
    parsed = ErrorParser().parse(
        "java.lang.NullPointerException: user was null\n"
        "  at demo.UserService.displayName(UserService.java:12)"
    )

    assert parsed.language == "Java"
    assert parsed.exception_type == "java.lang.NullPointerException"
    assert parsed.frames[0].path == "UserService.java"
    assert parsed.frames[0].line == 12


def test_parses_python_and_typescript_frames() -> None:
    python = ErrorParser().parse(
        'Traceback (most recent call last):\n  File "src/jobs.py", line 7, in run\nValueError: bad'
    )
    typescript = ErrorParser().parse("TypeError: nope\n    at render (src/App.tsx:19:4)")

    assert python.frames[0].symbol == "run"
    assert python.exception_type == "ValueError"
    assert typescript.frames[0].path == "src/App.tsx"
    assert typescript.frames[0].line == 19


def test_plain_text_falls_back_without_inventing_frames() -> None:
    parsed = ErrorParser().parse("The page crashes after opening a missing user")

    assert parsed.language == "Unknown"
    assert parsed.frames == []
    assert parsed.message == "The page crashes after opening a missing user"


@pytest.mark.parametrize("frame", [
    'File"user_service.py",line 5, in get_user_name',
    'File "user_service.py", line 5, in get_user_name',
    'File\t"user_service.py" ,\tline 5,\tin get_user_name',
    'user_service.py:5: in get_user_name',
])
def test_parses_physical_phone_frame_formats(frame: str) -> None:
    parsed = ErrorParser().parse(frame + "\nTypeError: NoneType object is not subscriptable")
    assert parsed.language == "Python"
    assert len(parsed.frames) == 1
    assert parsed.frames[0].path == "user_service.py"
    assert parsed.frames[0].line == 5
    assert parsed.frames[0].symbol == "get_user_name"


@pytest.mark.parametrize("frame", [
    'File"user_service. py",line 5, in get_user_name',
    'File"user_service.py",line unknown, in get_user_name',
    'File"user_service.py",line\n5, in get_user_name',
    'user_service.py:5: in get_user_name and unrelated text',
])
def test_frame_tolerance_does_not_guess_paths_or_missing_metadata(frame: str) -> None:
    assert ErrorParser().parse(frame).frames == []
