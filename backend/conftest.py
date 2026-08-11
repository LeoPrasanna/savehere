# Presence of this file puts the backend/ directory on sys.path so tests can
# `import app...` regardless of how pytest is invoked.
import pytest


@pytest.fixture(autouse=True)
def _run_background_work_inline(monkeypatch):
    """Make reels._enqueue synchronous for the whole suite.

    Extraction and summarization moved off FastAPI BackgroundTasks onto
    reels._executor (a sync BackgroundTask held one of anyio's 40 threadpool
    tokens for the entire 20s chain, which starved every route under load). That
    is right for production and wrong for tests, twice over:

      1. Assertions made straight after a POST would race the pool.
      2. Worse, a stray worker can outlive the test that spawned it. Fixtures
         monkeypatch SessionLocal per-test and restore it on teardown, so a slow
         background thread would then commit through the REAL SessionLocal —
         writing test rows into the dev savehere.db and polluting later tests.

    Running inline removes both. Tests that specifically want to exercise the
    dispatch seam can patch it back.
    """
    from app.routes import reels
    monkeypatch.setattr(reels, "_enqueue", lambda fn, *args: fn(*args))
