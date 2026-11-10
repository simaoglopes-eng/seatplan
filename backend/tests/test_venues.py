"""Venues and the layout save, including the neighbour rebuild."""

from typing import Any

from conftest import auth_header, make_user
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Organiser, SeatNeighbour


def _create_venue(client: TestClient, user: Organiser) -> str:
    response = client.post(
        "/api/venues",
        headers=auth_header(user),
        json={"kind": "event", "name": "Main hall", "width": 800, "height": 600},
    )
    assert response.status_code == 201, response.text
    return response.json()["public_id"]


def _round_table_layout() -> dict[str, Any]:
    """One zone, a round table with 4 seats (N, E, S, W) and a row of 3."""
    seats = [
        {"key": "n", "table_key": "t1", "label": "1", "x": 100, "y": 80},
        {"key": "e", "table_key": "t1", "label": "2", "x": 120, "y": 100},
        {"key": "s", "table_key": "t1", "label": "3", "x": 100, "y": 120},
        {"key": "w", "table_key": "t1", "label": "4", "x": 80, "y": 100},
        {"key": "r1", "table_key": "row", "label": "A1", "x": 300, "y": 105},
        {"key": "r2", "table_key": "row", "label": "A2", "x": 320, "y": 105},
        {"key": "r3", "table_key": "row", "label": "A3", "x": 340, "y": 105},
    ]
    return {
        "zones": [
            {"key": "z", "name": "Floor", "kind": "general", "x": 0, "y": 0, "w": 800, "h": 600}
        ],
        "tables": [
            {
                "key": "t1",
                "zone_key": "z",
                "label": "T1",
                "shape": "round",
                "x": 90,
                "y": 90,
                "w": 20,
                "h": 20,
                "max_party": 4,
            },
            {
                "key": "row",
                "zone_key": "z",
                "label": "Row A",
                "shape": "row",
                "x": 290,
                "y": 100,
                "w": 60,
                "h": 10,
                "max_party": 3,
            },
        ],
        "seats": seats,
    }


def _neighbour_labels(session: Session, venue: dict[str, Any]) -> set[frozenset[str]]:
    label_by_id = {seat["id"]: seat["label"] for seat in venue["seats"]}
    rows = session.scalars(select(SeatNeighbour)).all()
    return {frozenset({label_by_id[r.seat_id], label_by_id[r.neighbour_id]}) for r in rows}


def test_create_list_and_get(client: TestClient, organiser: Organiser) -> None:
    public_id = _create_venue(client, organiser)
    assert len(public_id) >= 12
    listed = client.get("/api/venues", headers=auth_header(organiser)).json()
    assert [v["public_id"] for v in listed] == [public_id]
    detail = client.get(f"/api/venues/{public_id}", headers=auth_header(organiser)).json()
    assert detail["zones"] == [] and detail["seats"] == []


def test_staff_cannot_create_venue(client: TestClient, staff: Organiser) -> None:
    response = client.post(
        "/api/venues",
        headers=auth_header(staff),
        json={"kind": "event", "name": "X", "width": 10, "height": 10},
    )
    assert response.status_code == 403


def test_other_organiser_gets_404(
    client: TestClient, organiser: Organiser, session: Session
) -> None:
    public_id = _create_venue(client, organiser)
    other = make_user(session, "other.organiser@example.com")
    assert client.get(f"/api/venues/{public_id}", headers=auth_header(other)).status_code == 404


def test_layout_save_builds_neighbours(
    client: TestClient, organiser: Organiser, session: Session
) -> None:
    public_id = _create_venue(client, organiser)
    response = client.put(
        f"/api/venues/{public_id}/layout",
        headers=auth_header(organiser),
        json=_round_table_layout(),
    )
    assert response.status_code == 200, response.text
    venue = response.json()
    assert len(venue["seats"]) == 7
    assert _neighbour_labels(session, venue) == {
        frozenset({"1", "2"}),
        frozenset({"2", "3"}),
        frozenset({"3", "4"}),
        frozenset({"4", "1"}),
        frozenset({"A1", "A2"}),
        frozenset({"A2", "A3"}),
    }
    # Stored in both directions: 6 pairs, 12 rows.
    assert len(session.scalars(select(SeatNeighbour)).all()) == 12


def test_layout_upsert_updates_by_id_and_removes_missing(
    client: TestClient, organiser: Organiser, session: Session
) -> None:
    public_id = _create_venue(client, organiser)
    first = client.put(
        f"/api/venues/{public_id}/layout",
        headers=auth_header(organiser),
        json=_round_table_layout(),
    ).json()
    # Send the saved layout back, renaming T1 and dropping the whole row.
    zones = [{k: v for k, v in z.items()} for z in first["zones"]]
    tables = [
        {**{k: v for k, v in t.items() if k != "zone_id"}, "zone_key": str(t["zone_id"])}
        for t in first["tables"]
        if t["label"] != "Row A"
    ]
    tables[0]["label"] = "Table one"
    table_key = tables[0]["key"]
    seats = [
        {**{k: v for k, v in s.items() if k != "table_id"}, "table_key": table_key}
        for s in first["seats"]
        if s["table_id"] == int(table_key)
    ]
    second = client.put(
        f"/api/venues/{public_id}/layout",
        headers=auth_header(organiser),
        json={"zones": zones, "tables": tables, "seats": seats},
    )
    assert second.status_code == 200, second.text
    body = second.json()
    assert [t["label"] for t in body["tables"]] == ["Table one"]
    assert body["tables"][0]["id"] == first["tables"][0]["id"]  # updated, not re-created
    assert len(body["seats"]) == 4
    assert len(session.scalars(select(SeatNeighbour)).all()) == 8


def test_layout_rejects_ids_from_another_venue(client: TestClient, organiser: Organiser) -> None:
    first_id = _create_venue(client, organiser)
    saved = client.put(
        f"/api/venues/{first_id}/layout", headers=auth_header(organiser), json=_round_table_layout()
    ).json()
    second_id = _create_venue(client, organiser)
    layout = _round_table_layout()
    layout["zones"][0]["id"] = saved["zones"][0]["id"]
    response = client.put(
        f"/api/venues/{second_id}/layout", headers=auth_header(organiser), json=layout
    )
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "validation"


def test_layout_rejects_seat_pointing_at_missing_table(
    client: TestClient, organiser: Organiser
) -> None:
    public_id = _create_venue(client, organiser)
    layout = _round_table_layout()
    layout["seats"][0]["table_key"] = "nope"
    response = client.put(
        f"/api/venues/{public_id}/layout", headers=auth_header(organiser), json=layout
    )
    assert response.status_code == 422


def test_venue_and_layout_text_with_a_nul_character_is_refused(
    client: TestClient, organiser: Organiser
) -> None:
    # Postgres cannot store NUL in text, so without the check this is a 500 there.
    headers = auth_header(organiser)
    body = {"kind": "event", "name": "Hall\x00", "width": 100, "height": 100}
    assert client.post("/api/venues", headers=headers, json=body).status_code == 422
    body["name"] = "Hall"
    vid = client.post("/api/venues", headers=headers, json=body).json()["public_id"]
    table = {"key": "t", "label": "T\x001", "shape": "round", "x": 1, "y": 1, "w": 9, "h": 9}
    layout = {"tables": [{**table, "max_party": 2}]}
    saved = client.put(f"/api/venues/{vid}/layout", headers=headers, json=layout)
    assert saved.status_code == 422
