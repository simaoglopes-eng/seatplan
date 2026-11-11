"""The organiser's shared link: switch on and off, regenerate, SECRET_KEY changes, access."""

import pytest
from conftest import auth_header
from fastapi.testclient import TestClient
from guest_helpers import open_link, sign_up
from sqlalchemy import select
from sqlalchemy.orm import Session
from test_events_setup import make_event

from app.config import get_settings
from app.models import AuditLog, Guest, Organiser


def test_new_events_have_the_link_off(client: TestClient, organiser: Organiser) -> None:
    setup = make_event(client, organiser, [])
    settings = client.get(f"/api/events/{setup.eid}/share", headers=setup.headers).json()
    assert settings["enabled"] is False and settings["link"] is None
    assert settings["needs_new_link"] is False
    assert (settings["capacity"], settings["guests"], settings["joined"]) == (8, 0, 0)


def test_switching_on_gives_a_stable_43_character_link(
    client: TestClient, organiser: Organiser
) -> None:
    setup = make_event(client, organiser, [])
    token = open_link(client, setup)
    assert len(token) == 43
    again = client.get(f"/api/events/{setup.eid}/share", headers=setup.headers).json()
    assert again["link"] == f"/j/{token}" and again["enabled"] is True
    assert client.get(f"/api/j/{token}").status_code == 200


def test_regenerate_replaces_the_link_and_keeps_joined_people(
    client: TestClient, organiser: Organiser, session: Session
) -> None:
    setup = make_event(client, organiser, [])
    old = open_link(client, setup)
    joined = sign_up(client, old, "kai.new@example.com")
    assert joined["join"]["status"] == "joined"
    renewed = client.post(f"/api/events/{setup.eid}/share/regenerate", headers=setup.headers)
    new = renewed.json()["link"].removeprefix("/j/")
    assert new != old and client.get(f"/api/j/{new}").status_code == 200
    gone = client.get(f"/api/j/{old}")
    made_up = client.get(f"/api/j/{'x' * 43}")
    assert gone.status_code == made_up.status_code == 404
    assert gone.json() == made_up.json()
    rows = session.scalars(select(Guest).where(Guest.source == "self_registered")).all()
    assert len(rows) == 1 and rows[0].token_revoked_at is None


def test_switched_off_link_answers_link_closed_then_works_again(
    client: TestClient, organiser: Organiser
) -> None:
    setup = make_event(client, organiser, [])
    token = open_link(client, setup)
    off = client.patch(
        f"/api/events/{setup.eid}/share", headers=setup.headers, json={"enabled": False}
    )
    assert off.json()["enabled"] is False
    closed = client.get(f"/api/j/{token}")
    assert closed.status_code == 403 and closed.json()["error"]["code"] == "link_closed"
    assert open_link(client, setup) == token
    assert client.get(f"/api/j/{token}").status_code == 200


def test_a_new_secret_key_needs_a_new_link(
    client: TestClient, organiser: Organiser, monkeypatch: pytest.MonkeyPatch
) -> None:
    setup = make_event(client, organiser, [])
    token = open_link(client, setup)
    monkeypatch.setenv("SECRET_KEY", "another-secret-key-for-this-one-test-only")
    get_settings.cache_clear()
    headers = auth_header(organiser)  # organiser sessions are signed with the key too
    settings = client.get(f"/api/events/{setup.eid}/share", headers=headers).json()
    assert settings["needs_new_link"] is True and settings["link"] is None
    assert client.get(f"/api/j/{token}").status_code == 404
    renewed = client.post(f"/api/events/{setup.eid}/share/regenerate", headers=headers).json()
    assert renewed["needs_new_link"] is False
    assert client.get(f"/api/{renewed['link'].lstrip('/')}").status_code == 200


def test_cap_is_saved_and_validated(client: TestClient, organiser: Organiser) -> None:
    setup = make_event(client, organiser, [])
    url = f"/api/events/{setup.eid}/share"
    assert client.patch(url, headers=setup.headers, json={"cap": 2}).json()["cap"] == 2
    assert client.patch(url, headers=setup.headers, json={"cap": 0}).status_code == 422
    assert client.patch(url, headers=setup.headers, json={"cap": 5001}).status_code == 422
    assert client.patch(url, headers=setup.headers, json={"what": 1}).status_code == 422
    assert client.patch(url, headers=setup.headers, json={"cap": None}).json()["cap"] is None


def test_only_the_owner_may_see_or_change_the_link(
    client: TestClient, organiser: Organiser, staff: Organiser, session: Session
) -> None:
    from conftest import make_user

    setup = make_event(client, organiser, [])
    token = open_link(client, setup)
    other = auth_header(make_user(session, "otto.other@example.com"))
    for method, path in (
        ("get", "share"),
        ("patch", "share"),
        ("post", "share/regenerate"),
    ):
        url = f"/api/events/{setup.eid}/{path}"
        kwargs = {"json": {}} if method != "get" else {}
        assert getattr(client, method)(url, headers=other, **kwargs).status_code == 404
        assert getattr(client, method)(url, headers=auth_header(staff), **kwargs).status_code == 403
        assert getattr(client, method)(url, **kwargs).status_code == 401
    audit = session.scalars(select(AuditLog).where(AuditLog.action.like("share.%"))).all()
    assert audit and all(token not in str(row.detail) + row.entity_id for row in audit)


def test_demo_events_have_the_link_on(
    client: TestClient, session: Session, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("DEMO_KEY", "a-long-demo-key-for-tests")
    get_settings.cache_clear()
    reset = client.post("/api/demo/reset", headers={"X-Demo-Key": "a-long-demo-key-for-tests"})
    links = client.get("/api/demo/links").json()["links"]
    assert reset.status_code == 200
    for name in ("wedding_share", "conference_share"):
        assert links[name].startswith("/j/")
        page = client.get(f"/api{links[name]}")
        assert page.status_code == 200 and page.json()["join"]["open"] is True
