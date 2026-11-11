"""Demo reset and links, and the live version counter and stream."""

import threading
import time
from dataclasses import replace

import anyio.to_thread
import pytest
from conftest import auth_header
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.core import live
from app.models import AuditLog, Organiser
from app.seed.run import demo_password

SCOPE = "event-abcdefghijkl"


def test_demo_reset_refuses_sessions_and_missing_key(
    client: TestClient, organiser: Organiser, staff: Organiser
) -> None:
    # Only the X-Demo-Key header may reset. An organiser session used to be
    # enough, and the demo organiser's password is public in the repository.
    assert client.post("/api/demo/reset").status_code == 401
    assert client.post("/api/demo/reset", headers=auth_header(staff)).status_code == 401
    assert client.post("/api/demo/reset", headers=auth_header(organiser)).status_code == 401


def test_empty_demo_key_rejects_everyone(client: TestClient) -> None:
    # DEMO_KEY is empty in the fixture: no header value, not even "", may pass.
    assert client.post("/api/demo/reset", headers={"X-Demo-Key": ""}).status_code == 401
    assert client.post("/api/demo/reset", headers={"X-Demo-Key": "guess"}).status_code == 401


def test_demo_reset_with_demo_key(
    client: TestClient, session: Session, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("DEMO_KEY", "a-long-demo-key-for-tests")
    get_settings.cache_clear()
    wrong = client.post("/api/demo/reset", headers={"X-Demo-Key": "wrong"})
    right = client.post("/api/demo/reset", headers={"X-Demo-Key": "a-long-demo-key-for-tests"})
    assert wrong.status_code == 401
    assert right.status_code == 200, right.text
    assert "links" in right.json()
    assert client.get("/api/demo/links").json() == right.json()
    # The demo accounts now exist and the documented demo password works (SQLite).
    login = client.post(
        "/api/auth/login",
        json={"email": "organiser@example.com", "password": "demo-organiser-2026"},
    )
    assert login.status_code == 200


def test_demo_links_are_not_written_to_the_audit_log(
    client: TestClient, session: Session, monkeypatch: pytest.MonkeyPatch
) -> None:
    # The links hold raw bearer tokens; the audit log must never contain them.
    monkeypatch.setenv("DEMO_KEY", "a-long-demo-key-for-tests")
    get_settings.cache_clear()
    response = client.post("/api/demo/reset", headers={"X-Demo-Key": "a-long-demo-key-for-tests"})
    tokens = [path.rsplit("/", 1)[-1] for path in response.json()["links"].values()]
    audit_text = " ".join(str(row.detail) for row in session.scalars(select(AuditLog)))
    assert tokens
    assert not any(len(token) > 20 and token in audit_text for token in tokens)


def test_demo_passwords_have_no_public_default_on_postgres(
    database_url: str, monkeypatch: pytest.MonkeyPatch
) -> None:
    # Any Postgres database is a deployment, demo mode or not: the public
    # defaults must not apply there.
    settings = replace(
        get_settings(),
        database_url="postgresql+psycopg://u:p@db.example.com/seatplan",
        demo_mode=True,
    )
    monkeypatch.delenv("DEMO_ORGANISER_PASSWORD", raising=False)
    with pytest.raises(RuntimeError, match="DEMO_ORGANISER_PASSWORD"):
        demo_password("DEMO_ORGANISER_PASSWORD", settings)
    monkeypatch.setenv("DEMO_ORGANISER_PASSWORD", "a-private-password")
    assert demo_password("DEMO_ORGANISER_PASSWORD", settings) == "a-private-password"


def test_demo_routes_hidden_when_demo_mode_off(
    client: TestClient, organiser: Organiser, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("DEMO_MODE", "0")
    get_settings.cache_clear()
    assert client.post("/api/demo/reset", headers=auth_header(organiser)).status_code == 404
    assert client.get("/api/demo/links").status_code == 404


def test_live_version_counts_bumps(client: TestClient, session: Session) -> None:
    assert client.get(f"/api/live/{SCOPE}/version").json() == {"version": 0}
    live.bump(session, SCOPE)
    live.bump(session, SCOPE)
    session.commit()
    assert client.get(f"/api/live/{SCOPE}/version").json() == {"version": 2}


@pytest.mark.parametrize(
    "scope", ["event-short", "venue-abcdefghijkl-2026-1-1", "../etc", "events-abcdefghijkl"]
)
def test_live_rejects_bad_scopes(client: TestClient, scope: str) -> None:
    assert client.get(f"/api/live/{scope}/version").status_code == 404


def test_live_accepts_venue_date_scope(client: TestClient) -> None:
    response = client.get("/api/live/venue-abc_def-ghijk-2026-11-20/version")
    assert response.status_code == 200


def test_stream_sends_version_and_ends(
    client: TestClient, session: Session, monkeypatch: pytest.MonkeyPatch
) -> None:
    # Shorten the 25 s stream so the test finishes quickly; the logic is the same.
    monkeypatch.setattr(live, "STREAM_SECONDS", 0.3)
    monkeypatch.setattr(live, "CHECK_EVERY_SECONDS", 0.1)
    live.bump(session, SCOPE)
    session.commit()
    response = client.get(f"/api/live/{SCOPE}/stream")
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/event-stream")
    assert "event: version\ndata: 1\n\n" in response.text
    # Sent once, not once per check: the version did not change after that.
    assert response.text.count("event: version") == 1


def _one_worker_thread() -> None:
    # Runs inside the app's event loop: leave a single threadpool worker, so a
    # stream that holds a worker would block every other (sync) route.
    anyio.to_thread.current_default_thread_limiter().total_tokens = 1


def test_open_stream_does_not_hold_a_worker_thread(
    app: FastAPI, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(live, "STREAM_SECONDS", 2.0)
    monkeypatch.setattr(live, "CHECK_EVERY_SECONDS", 0.1)
    with TestClient(app) as client:
        client.portal.call(_one_worker_thread)
        reader = threading.Thread(target=client.get, args=(f"/api/live/{SCOPE}/stream",))
        reader.start()
        time.sleep(0.5)  # the stream is now open and waiting for changes
        started = time.monotonic()
        assert client.get("/api/health").status_code == 200
        waited = time.monotonic() - started
        reader.join()
    assert waited < 0.5


def test_stream_is_rate_limited_per_ip(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(live, "STREAM_SECONDS", 0.0)
    for _ in range(live.STREAMS_PER_IP_PER_MINUTE):
        assert client.get(f"/api/live/{SCOPE}/stream").status_code == 200
    refused = client.get(f"/api/live/{SCOPE}/stream")
    assert refused.status_code == 429
    assert refused.json()["error"]["code"] == "rate_limited"
    # Polling stays open: it is the dependable path when streams are refused.
    assert client.get(f"/api/live/{SCOPE}/version").status_code == 200


def test_stream_refused_when_instance_is_full(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(live, "MAX_OPEN_STREAMS", 0)
    assert client.get(f"/api/live/{SCOPE}/stream").status_code == 429


def test_demo_reset_wipes_guest_accounts_and_codes(
    client: TestClient, session: Session, monkeypatch: pytest.MonkeyPatch
) -> None:
    from guest_helpers import make_account

    from app.models import EmailCode, GuestAccount, utc_now

    monkeypatch.setenv("DEMO_KEY", "a-long-demo-key-for-tests")
    get_settings.cache_clear()
    make_account(session, "demo.visitor@example.com")
    session.add(
        EmailCode(
            email="demo.visitor@example.com",
            purpose="reset",
            code_hash="0" * 64,
            expires_at=utc_now(),
        )
    )
    session.commit()
    reset = client.post("/api/demo/reset", headers={"X-Demo-Key": "a-long-demo-key-for-tests"})
    assert reset.status_code == 200, reset.text
    session.expire_all()
    assert session.scalars(select(GuestAccount)).all() == []
    assert session.scalars(select(EmailCode)).all() == []
    assert {"wedding_share", "conference_share"} <= set(reset.json()["links"])
