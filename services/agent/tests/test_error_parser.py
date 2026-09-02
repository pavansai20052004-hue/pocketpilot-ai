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
