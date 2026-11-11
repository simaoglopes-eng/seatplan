"""Regression tests for the red-team audit (docs/security.md).

Each test is named after the finding it guards (S1, S2, ...). Every one of
them failed before its fix and passes after it.
"""

import json
from pathlib import Path

import pytest
from conftest import auth_header
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session
from test_restaurant_helpers import make_restaurant

from app.config import get_settings, load_settings
from app.mail.providers import ConsoleProvider, OutgoingEmail
from app.models import Organiser, RateLimit

VERCEL_JSON = Path(__file__).resolve().parents[2] / "vercel.json"
LOGIN = {"email": "nobody@example.com", "password": "wrong password"}


# S1: X-Forwarded-For is only trusted where the platform writes it itself.


def test_s1_forged_forwarded_for_cannot_dodge_the_login_limit(client: TestClient) -> None:
    # Off Vercel, anyone can type any X-Forwarded-For. A new made-up address on
    # every try must not give a fresh allowance of 10 password guesses a minute.
    codes = [
        client.post(
            "/api/auth/login", json=LOGIN, headers={"X-Forwarded-For": f"198.51.100.{n}"}
        ).status_code
        for n in range(12)
    ]
    assert codes[:10] == [401] * 10
    assert codes[10:] == [429, 429]


def test_s1_on_vercel_the_forwarded_address_is_used(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    # Vercel overwrites X-Forwarded-For with the real client address, so there
    # two different addresses really are two different people.
    monkeypatch.setenv("VERCEL", "1")
    get_settings.cache_clear()
    for n in range(10):
        headers = {"X-Forwarded-For": "198.51.100.1"}
        assert client.post("/api/auth/login", json=LOGIN, headers=headers).status_code == 401
    other = {"X-Forwarded-For": "198.51.100.2"}
    assert client.post("/api/auth/login", json=LOGIN, headers=other).status_code == 401


# S2: a venue's time zone must be a real one.


def test_s2_unknown_time_zone_is_refused(client: TestClient, organiser: Organiser) -> None:
    body = {
        "kind": "restaurant",
        "name": "Casa Teste",
        "timezone": "Not/AZone",
        "width": 100,
        "height": 100,
    }
    response = client.post("/api/venues", json=body, headers=auth_header(organiser))
    # Before the fix this was 201, and every public page of the venue then
    # answered 500 because ZoneInfo("Not/AZone") raises.
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "validation"


@pytest.mark.parametrize("zone", ["../../etc/passwd", "Europe", "/etc/localtime"])
def test_s2_path_like_time_zone_is_refused(
    client: TestClient, organiser: Organiser, zone: str
) -> None:
    body = {"kind": "event", "name": "X", "timezone": zone, "width": 1, "height": 1}
    response = client.post("/api/venues", json=body, headers=auth_header(organiser))
    assert response.status_code == 422


# S3: dates at the very edge of the calendar give 422, not 500.


def test_s3_booking_on_the_last_day_of_year_9999_is_a_validation_error(
    client: TestClient, session: Session, organiser: Organiser
) -> None:
    place = make_restaurant(session, organiser)
    # 9999-12-31 is a Friday; the helper restaurant serves dinner every day.
    body = {"date": "9999-12-31", "time": "22:45", "party": 2}
    held = client.post(f"/api/r/{place.public_id}/hold", json=body)
    assert held.status_code == 201, held.text
    booking = {
        "hold_id": held.json()["hold_id"],
        "name": "Zoe Example",
        "email": "zoe@example.com",
        "party": 2,
    }
    response = client.post(f"/api/r/{place.public_id}/bookings", json=booking)
    # Before the fix: the end of the stay is midnight of year 10000, which
    # Python cannot represent, so the request crashed with a 500.
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "validation"


def test_s3_dashboard_for_year_one_is_a_validation_error(
    client: TestClient, session: Session, organiser: Organiser, staff: Organiser
) -> None:
    place = make_restaurant(session, organiser)
    response = client.get(
        f"/api/staff/{place.public_id}/dashboard",
        params={"date": "0001-01-01"},
        headers=auth_header(staff),
    )
    assert response.status_code == 422


# S4: the console email log does not write full addresses into server logs.


def test_s4_console_log_masks_the_address(caplog: pytest.LogCaptureFixture) -> None:
    caplog.set_level("INFO", logger="seatplan.mail")
    message = OutgoingEmail("ana.silva@example.com", "Hi", "body", "<p>x</p>", None, "key-1")
    ConsoleProvider().send(message)
    assert "ana.silva@example.com" not in caplog.text
    assert "an***@example.com" in caplog.text


# S5: a weak SECRET_KEY is refused on any deployment (Postgres).


def test_s5_short_secret_key_is_refused_on_postgres(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("DATABASE_URL", "postgres://user:pass@db.example.com:5432/seatplan")
    monkeypatch.setenv("SECRET_KEY", "secret")
    with pytest.raises(RuntimeError, match="SECRET_KEY"):
        load_settings()


# S6: the static frontend also tells browsers to use HTTPS only.


def test_s6_vercel_headers_include_hsts() -> None:
    config = json.loads(VERCEL_JSON.read_text(encoding="utf-8"))
    names = {
        header["key"].lower(): header["value"]
        for rule in config["headers"]
        for header in rule["headers"]
    }
    assert "max-age=" in names.get("strict-transport-security", "")


# S7: the rate-limit table does not keep raw IP addresses (personal data).


def test_s7_rate_limit_rows_hold_no_ip_address(client: TestClient, session: Session) -> None:
    client.post("/api/auth/login", json=LOGIN)
    session.expire_all()
    keys = list(session.scalars(select(RateLimit.key)))
    assert keys, "the login should have counted one attempt"
    # TestClient's address is "testclient"; on Vercel it would be the visitor's IP.
    assert all("testclient" not in key for key in keys)
    assert all(key.startswith("login:") for key in keys)


def test_a_guest_session_is_not_an_organiser_session(
    client: TestClient, organiser: Organiser, session: Session
) -> None:
    """Guest account 1 and organiser 1 share the number; the tokens must not cross."""
    from guest_helpers import account_headers, make_account

    account = make_account(session, "same.id@example.com")
    assert account.id == organiser.id
    guest = account_headers(account)
    assert client.get("/api/auth/me", headers=guest).status_code == 401
    assert client.get("/api/events", headers=guest).status_code == 401
    assert client.get("/api/guest/me", headers=auth_header(organiser)).status_code == 401
