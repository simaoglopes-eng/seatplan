"""Shared set-up for the events tests: a small event built through the real API.

Other events test files import make_event() from here. Building the venue
through PUT /venues/.../layout means the seat neighbours are computed by the
real layout code, exactly as in production.
"""

import math
from collections.abc import Iterator
from contextlib import contextmanager
from dataclasses import dataclass, field
from typing import Any

from conftest import auth_header
from fastapi.testclient import TestClient
from sqlalchemy import event

from app import db
from app.models import Organiser

SeatExtras = dict[tuple[int, int], dict[str, Any]]


@dataclass
class EventSetup:
    eid: str
    headers: dict[str, str]
    seats: list[list[int]]  # seat ids per table, in label order
    guests: dict[str, int] = field(default_factory=dict)  # name -> guest id
    tokens: dict[str, str] = field(default_factory=dict)  # name -> raw token

    def page(self, client: TestClient, name: str) -> dict[str, Any]:
        response = client.get(f"/api/a/{self.tokens[name]}")
        assert response.status_code == 200, response.text
        return response.json()


def round_layout(tables: int, per_table: int, extras: SeatExtras) -> dict[str, Any]:
    """`tables` round tables in a line, `per_table` seats around each."""
    layout: dict[str, Any] = {"zones": [], "tables": [], "seats": []}
    for t in range(tables):
        cx, cy = 150 + t * 250, 200
        layout["tables"].append(
            {
                "key": f"t{t}",
                "label": f"T{t + 1}",
                "shape": "round",
                "x": cx - 40,
                "y": cy - 40,
                "w": 80,
                "h": 80,
                "max_party": per_table,
            }
        )
        for s in range(per_table):
            angle = -math.pi / 2 + s * 2 * math.pi / per_table
            seat = {
                "key": f"t{t}s{s}",
                "table_key": f"t{t}",
                "label": str(s + 1),
                "x": round(cx + 60 * math.cos(angle), 2),
                "y": round(cy + 60 * math.sin(angle), 2),
            }
            layout["seats"].append({**seat, **extras.get((t, s), {})})
    return layout


def make_event(
    client: TestClient,
    organiser: Organiser,
    guests: list[dict[str, Any]],
    tables: int = 2,
    per_table: int = 4,
    privacy_mode: str = "first_initial",
    change_deadline: str | None = None,
    extras: SeatExtras | None = None,
) -> EventSetup:
    headers = auth_header(organiser)
    venue = client.post(
        "/api/venues",
        headers=headers,
        json={"kind": "event", "name": "Hall", "width": 1000, "height": 500},
    )
    assert venue.status_code == 201, venue.text
    vid = venue.json()["public_id"]
    saved = client.put(
        f"/api/venues/{vid}/layout",
        headers=headers,
        json=round_layout(tables, per_table, extras or {}),
    )
    assert saved.status_code == 200, saved.text
    seats: list[list[int]] = [[] for _ in range(tables)]
    table_index = {table["id"]: i for i, table in enumerate(saved.json()["tables"])}
    for seat in sorted(saved.json()["seats"], key=lambda s: int(s["label"])):
        seats[table_index[seat["table_id"]]].append(seat["id"])
    body: dict[str, Any] = {
        "venue_id": vid,
        "name": "Test party",
        "privacy_mode": privacy_mode,
        "starts_at": "2030-05-01T18:00:00Z",
        "ends_at": "2030-05-01T23:00:00Z",
    }
    if change_deadline:
        body["change_deadline"] = change_deadline
    event = client.post("/api/events", headers=headers, json=body)
    assert event.status_code == 201, event.text
    setup = EventSetup(eid=event.json()["public_id"], headers=headers, seats=seats)
    for guest in guests:
        add_guest(client, setup, guest)
    return setup


def add_guest(client: TestClient, setup: EventSetup, guest: dict[str, Any]) -> int:
    response = client.post(f"/api/events/{setup.eid}/guests", headers=setup.headers, json=guest)
    assert response.status_code == 201, response.text
    data = response.json()
    setup.guests[guest["name"]] = data["id"]
    setup.tokens[guest["name"]] = data["link"].removeprefix("/e/")
    return data["id"]


def choose(client: TestClient, setup: EventSetup, name: str, seat_id: int) -> None:
    """The attendee holds and confirms a seat themselves."""
    token = setup.tokens[name]
    held = client.post(f"/api/a/{token}/hold", json={"seat_id": seat_id})
    assert held.status_code == 200, held.text
    confirmed = client.post(f"/api/a/{token}/confirm", json={"seat_id": seat_id})
    assert confirmed.status_code == 200, confirmed.text


@contextmanager
def recorded_writes() -> Iterator[list[str]]:
    """Collect every INSERT, UPDATE and DELETE sent to the database meanwhile.

    The rate limiter is left out: it commits on its own before the request's
    real work starts, so it is not part of the request's transaction.
    """
    writes: list[str] = []

    def remember(_conn: Any, _cursor: Any, statement: str, *_args: Any) -> None:
        verb = statement.lstrip().split(" ", 1)[0].upper()
        if verb in {"INSERT", "UPDATE", "DELETE"} and "rate_limits" not in statement:
            writes.append(statement)

    engine = db.get_engine()
    event.listen(engine, "before_cursor_execute", remember)
    try:
        yield writes
    finally:
        event.remove(engine, "before_cursor_execute", remember)


def seat_state(page: dict[str, Any], seat_id: int) -> str:
    return next(seat["state"] for seat in page["map"]["seats"] if seat["id"] == seat_id)


def test_make_event_builds_tables_and_guests(client: TestClient, organiser: Organiser) -> None:
    setup = make_event(client, organiser, [{"name": "Ana Silva", "email": "ana@example.com"}])
    assert [len(table) for table in setup.seats] == [4, 4]
    page = setup.page(client, "Ana Silva")
    assert {seat["state"] for seat in page["map"]["seats"]} == {"free"}
