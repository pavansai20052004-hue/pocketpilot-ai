# Python demo — User Service

## Setup and starting failure

Run `npm run demo:reset`, select **Python User Service**, then run this from `demo/python-broken-app`:

```powershell
..\..\.venv\Scripts\python -m pytest -q
```

The real result is `1 failed, 1 passed`: `get_user_name(None)` subscripts `None` at `user_service.py:5` and raises `TypeError: 'NoneType' object is not subscriptable`. Photograph the traceback block containing `TypeError`, `NoneType`, `user_service.py`, and `get_user_name`.

## Expected repair flow

Expected analysis concepts: the user may be `None`, no guard runs before dictionary access, and the documented fallback is skipped. The one-file patch guards `None` and returns `"Unknown"`. Approval runs real pytest and must produce `2 passed`. Undo restores the exact source bytes; pytest must return to `1 failed, 1 passed`.

Reset with `npm run demo:reset` or the registered Reset button. Local failing validation measured about 0.7 seconds; the deterministic automated repair/validation/rollback workflow is benchmarked in the Milestone 8 report. Allow about 2 minutes in the camera-and-voice presentation.
