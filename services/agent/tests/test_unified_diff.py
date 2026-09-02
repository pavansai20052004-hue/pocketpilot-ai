import pytest

from pocketpilot_agent.unified_diff import UnifiedDiffError, UnifiedDiffParser

VALID = """--- a/service.py
+++ b/service.py
@@ -1,2 +1,4 @@
 def name(user):
+    if user is None:
+        return "Unknown"
     return user["name"]
"""


def test_valid_unified_diff_parses_and_applies() -> None:
    parser = UnifiedDiffParser()
    parsed = parser.parse(VALID)

    result = parser.apply(parsed, 'def name(user):\n    return user["name"]\n')

    assert parsed.relative_path == "service.py"
    assert parsed.additions == 2
    assert parsed.deletions == 0
    assert 'return "Unknown"' in result


def test_crlf_is_preserved() -> None:
    parser = UnifiedDiffParser()
    result = parser.apply(
        parser.parse(VALID), 'def name(user):\r\n    return user["name"]\r\n'
    )

    assert "\r\n" in result
    assert result.count("\r\n") == 4
    assert "\n" not in result.replace("\r\n", "")


@pytest.mark.parametrize(
    "raw",
    [
        "--- a/../outside.py\n+++ b/../outside.py\n@@ -1 +1 @@\n-x\n+y\n",
        "--- C:/Windows/file.py\n+++ C:/Windows/file.py\n@@ -1 +1 @@\n-x\n+y\n",
        "--- a/a.py\n+++ /dev/null\n@@ -1 +0,0 @@\n-x\n",
        "GIT binary patch\n--- a/a.py\n+++ b/a.py\n@@ -1 +1 @@\n-x\n+y\n",
        "--- a/a.py\n+++ b/a.py\n@@ broken @@\n-x\n+y\n",
        "--- a/a.py\n+++ b/a.py\n@@ -1 +1 @@\n-x\n+y\n--- a/b.py\n+++ b/b.py\n",
    ],
)
def test_rejects_unsafe_or_malformed_diff(raw: str) -> None:
    with pytest.raises(UnifiedDiffError):
        UnifiedDiffParser().parse(raw)


def test_context_mismatch_is_rejected() -> None:
    parser = UnifiedDiffParser()

    with pytest.raises(UnifiedDiffError, match="context"):
        parser.apply(parser.parse(VALID), "def other():\n    pass\n")
