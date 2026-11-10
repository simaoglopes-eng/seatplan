"""The cron endpoint and the organiser email log."""

import pytest
from conftest import auth_header
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.config import get_settings
from app.mail.outbox import enqueue
from app.models import Organiser
from app.routers.emails import mask_email

SECRET = "cron-secret-for-tests-only"


@pytest.fixture
def cron_env(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("CRON_SECRET", SECRET)
    monkeypatch.setenv("EMAIL_PROVIDER", "console")
    monkeypatch.setenv("EMAIL_ALLOWLIST", "ana.silva@example.com")
    get_settings.cache_clear()


def _queue(session: Session, key: str, to_email: str) -> None:
    enqueue(
        session,
        idempotency_key=key,
        to_email=to_email,
        kind="booking_confirmed",
        subject="Booking confirmed",
        body_text="Hello",
        body_html="<p>Hello</p>",
    )
    session.commit()


def test_wrong_secret_is_rejected(client: TestClient, cron_env: None, session: Session) -> None:
    _queue(session, "k1", "ana.silva@example.com")
    for headers in ({}, {"X-Cron-Secret": "wrong"}, {"X-Cron-Secret": SECRET + "x"}):
        response = client.post("/api/internal/email/process", headers=headers)
        assert response.status_code == 401
        assert response.json()["error"]["code"] == "unauthorised"


def test_empty_configured_secret_rejects_everyone(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("CRON_SECRET", "")
    get_settings.cache_clear()
    response = client.post("/api/internal/email/process", headers={"X-Cron-Secret": ""})
    assert response.status_code == 401


def test_right_secret_processes_the_outbox(
    client: TestClient, cron_env: None, session: Session
) -> None:
    _queue(session, "k1", "ana.silva@example.com")
    _queue(session, "k2", "stranger@example.com")
    response = client.post("/api/internal/email/process", headers={"X-Cron-Secret": SECRET})
    assert response.status_code == 200
    assert response.json() == {"sent": 1, "skipped": 1, "retrying": 0, "failed": 0}


def test_log_masks_recipients_and_needs_an_organiser(
    client: TestClient, session: Session, organiser: Organiser, staff: Organiser
) -> None:
    _queue(session, "k1", "ana.silva@example.com")
    assert client.get("/api/emails/log").status_code == 401
    assert client.get("/api/emails/log", headers=auth_header(staff)).status_code == 403
    response = client.get("/api/emails/log", headers=auth_header(organiser))
    assert response.status_code == 200
    [item] = response.json()
    assert item["to"] == "an***@example.com"
    assert "ana.silva" not in response.text
    assert item["status"] == "queued"


def test_mask_email_short_local_part() -> None:
    assert mask_email("al@example.com") == "a***@example.com"
    assert mask_email("ana.silva@example.com") == "an***@example.com"
