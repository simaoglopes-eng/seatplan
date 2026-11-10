"""Organiser endpoints: events, guests, CSV import and export, GDPR erasure,
organiser moves and the printable chart."""

from conftest import auth_header, make_user
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session
from test_events_setup import choose, make_event, seat_state

from app.models import Acquaintance, AuditLog, EmailOutbox, Guest, Organiser, SeatAssignment

GUESTS = [
    {"name": "Ana Silva", "email": "ana.silva@example.com", "dietary_note": "Vegan"},
    {"name": "Bruno Costa", "email": "bruno.costa@example.com"},
]


def test_event_detail_shows_real_names_and_who_has_not_chosen(
    client: TestClient, organiser: Organiser
) -> None:
    setup = make_event(client, organiser, GUESTS, privacy_mode="anonymous")
    choose(client, setup, "Ana Silva", setup.seats[0][0])
    detail = client.get(f"/api/events/{setup.eid}", headers=setup.headers).json()
    seat = next(s for s in detail["map"]["seats"] if s["id"] == setup.seats[0][0])
    assert seat["occupant"] == "Ana Silva" and seat["source"] == "self"
    assert [person["name"] for person in detail["not_chosen"]] == ["Bruno Costa"]
    assert detail["counts"] == {"guests": 2, "seated": 1, "chosen_by_self": 1}


def test_other_organisers_cannot_see_the_event(
    client: TestClient, organiser: Organiser, session: Session
) -> None:
    setup = make_event(client, organiser, GUESTS)
    stranger = make_user(session, "someone.else@example.com")
    assert client.get(f"/api/events/{setup.eid}", headers=auth_header(stranger)).status_code == 404
    assert client.get(f"/api/events/{setup.eid}").status_code == 401
    listed = client.get("/api/events", headers=auth_header(stranger)).json()
    assert listed == []


def test_patch_event_and_guest(client: TestClient, organiser: Organiser) -> None:
    setup = make_event(client, organiser, GUESTS)
    patched = client.patch(
        f"/api/events/{setup.eid}",
        headers=setup.headers,
        json={"name": "Renamed", "privacy_mode": "full_name"},
    )
    assert patched.json()["name"] == "Renamed"
    gid = setup.guests["Bruno Costa"]
    guest = client.patch(
        f"/api/events/{setup.eid}/guests/{gid}",
        headers=setup.headers,
        json={"group": "Friends", "needs_accessible": True},
    )
    assert guest.json()["group"] == "Friends" and guest.json()["needs_accessible"] is True
    duplicate = client.post(
        f"/api/events/{setup.eid}/guests",
        headers=setup.headers,
        json={"name": "Copy", "email": "ana.silva@example.com"},
    )
    assert duplicate.status_code == 409


def test_organiser_assign_moves_and_unassigns(client: TestClient, organiser: Organiser) -> None:
    setup = make_event(client, organiser, GUESTS)
    gid = setup.guests["Bruno Costa"]
    url = f"/api/events/{setup.eid}/assignments/{gid}"
    assert (
        client.put(url, headers=setup.headers, json={"seat_id": setup.seats[0][0]}).status_code
        == 200
    )
    choose(client, setup, "Ana Silva", setup.seats[0][1])
    clash = client.put(url, headers=setup.headers, json={"seat_id": setup.seats[0][1]})
    assert clash.status_code == 409 and clash.json()["error"]["code"] == "seat_taken"
    assert client.delete(url, headers=setup.headers).status_code == 200
    assert seat_state(setup.page(client, "Ana Silva"), setup.seats[0][0]) == "free"


def test_csv_import_reports_every_bad_row_and_imports_nothing(
    client: TestClient, organiser: Organiser
) -> None:
    setup = make_event(client, organiser, GUESTS)
    csv_text = (
        "name,email,group,needs_accessible,reserved_tag\n"
        "Clara Nunes,clara@example.com,Friends,no,\n"
        ",nobody@example.com,,,\n"
        "Dario Reis,not-an-email,,,\n"
        "Eva Lopes,eva@example.com,,maybe,\n"
        "Fred Pinto,ana.silva@example.com,,,\n"
        "Gil Rocha,gil@example.com,,,king\n"
    )
    response = client.post(
        f"/api/events/{setup.eid}/guests/import",
        headers={**setup.headers, "Content-Type": "text/csv"},
        content=csv_text.encode(),
    )
    body = response.json()
    assert response.status_code == 200 and body["imported"] == 0
    assert [error["line"] for error in body["errors"]] == [3, 4, 5, 6, 7]
    names = [
        g["name"]
        for g in client.get(f"/api/events/{setup.eid}/guests", headers=setup.headers).json()
    ]
    assert names == ["Ana Silva", "Bruno Costa"]


def test_csv_import_refuses_bad_files(client: TestClient, organiser: Organiser) -> None:
    setup = make_event(client, organiser, GUESTS)
    url = f"/api/events/{setup.eid}/guests/import"
    for content in (
        b"name,password\nAna,secret\n",  # unknown column
        b"email\nana@example.com\n",  # no name column
        "name\nJosé\n".encode("latin-1"),  # not UTF-8
        b"name\n" + b"A" * 300_000,  # too large
    ):
        response = client.post(
            url, headers={**setup.headers, "Content-Type": "text/csv"}, content=content
        )
        assert response.status_code == 422, content[:30]
        assert response.json()["error"]["code"] == "validation"


def test_csv_import_then_export(client: TestClient, organiser: Organiser) -> None:
    setup = make_event(client, organiser, GUESTS)
    csv_text = (
        "name,email,group,wants_anonymous\nClara Nunes,clara@example.com,Friends,yes\n=cmd(),,,\n"
    )
    imported = client.post(
        f"/api/events/{setup.eid}/guests/import",
        headers={**setup.headers, "Content-Type": "text/csv"},
        content=csv_text.encode(),
    )
    body = imported.json()
    assert body["imported"] == 2 and body["errors"] == []
    assert all(guest["link"].startswith("/e/") for guest in body["guests"])
    exported = client.get(f"/api/events/{setup.eid}/export.csv", headers=setup.headers)
    assert exported.headers["content-type"].startswith("text/csv")
    lines = exported.text.splitlines()
    assert lines[0].startswith("name,email,group,rsvp")
    assert any(line.startswith("Clara Nunes,clara@example.com,Friends") for line in lines)
    # A cell that Excel would run as a formula is neutralised.
    assert any(line.startswith("'=cmd()") for line in lines)


def test_gdpr_delete_erases_personal_data_and_frees_the_seat(
    client: TestClient, organiser: Organiser, session: Session
) -> None:
    setup = make_event(client, organiser, GUESTS)
    ana_id, bruno = setup.guests["Ana Silva"], setup.tokens["Bruno Costa"]
    choose(client, setup, "Ana Silva", setup.seats[0][0])
    client.post(f"/api/a/{bruno}/knows", json={"guest_ids": [ana_id]})
    response = client.delete(f"/api/events/{setup.eid}/guests/{ana_id}", headers=setup.headers)
    assert response.status_code == 200

    session.expire_all()
    row = session.get(Guest, ana_id)
    assert row is not None and row.name == "Deleted guest"
    assert row.email is None and row.dietary_note is None and row.token_revoked_at is not None
    assert (
        session.scalars(select(SeatAssignment).where(SeatAssignment.guest_id == ana_id)).first()
        is None
    )
    links = session.scalars(select(Acquaintance).where(Acquaintance.knows_guest_id == ana_id))
    assert links.first() is None
    assert seat_state(setup.page(client, "Bruno Costa"), setup.seats[0][0]) == "free"
    assert client.get(f"/api/a/{setup.tokens['Ana Silva']}").status_code == 404
    listed = client.get(f"/api/events/{setup.eid}/guests", headers=setup.headers).json()
    assert [g["name"] for g in listed] == ["Bruno Costa"]
    exported = client.get(f"/api/events/{setup.eid}/export.csv", headers=setup.headers).text
    assert "Ana" not in exported and "Vegan" not in exported
    # No audit row may keep the erased name or address.
    for entry in session.scalars(select(AuditLog)):
        assert "Ana Silva" not in str(entry.detail) and "ana.silva" not in str(entry.detail)
    # Erased guests cannot be deleted twice or get a new link.
    again = client.post(f"/api/events/{setup.eid}/guests/{ana_id}/new-link", headers=setup.headers)
    assert again.status_code == 404


def test_gdpr_delete_scrubs_the_outbox_and_queues_nothing(
    client: TestClient, organiser: Organiser, session: Session
) -> None:
    setup = make_event(client, organiser, GUESTS)
    ana_id = setup.guests["Ana Silva"]
    choose(client, setup, "Ana Silva", setup.seats[0][0])  # queues "seat confirmed"
    choose(client, setup, "Bruno Costa", setup.seats[1][0])
    session.expire_all()
    before = session.scalars(select(EmailOutbox)).all()
    assert any(row.to_email == "ana.silva@example.com" for row in before)

    response = client.delete(f"/api/events/{setup.eid}/guests/{ana_id}", headers=setup.headers)
    assert response.status_code == 200
    session.expire_all()
    rows = session.scalars(select(EmailOutbox)).all()
    assert len(rows) == len(before)  # no "your seat was released" email to her
    for row in rows:
        stored = " ".join(
            str(value)
            for value in (row.to_email, row.subject, row.body_text, row.body_html, row.ics)
        )
        assert "ana.silva" not in stored and "Ana" not in stored
    ana_rows = [row for row in rows if row.idempotency_key.split(":")[1:2] == [str(ana_id)]]
    reminder = [row for row in rows if row.idempotency_key.endswith(f"-{ana_id}")]
    assert ana_rows and len(reminder) == 1
    assert all(row.status == "skipped" for row in ana_rows + reminder)
    # Bruno's email is not touched.
    assert any(row.to_email == "bruno.costa@example.com" and row.status == "queued" for row in rows)


def test_text_with_control_characters_is_refused(client: TestClient, organiser: Organiser) -> None:
    # Postgres cannot store NUL in text, so it would turn into a 500 there.
    setup = make_event(client, organiser, GUESTS)
    guests_url = f"/api/events/{setup.eid}/guests"
    added = client.post(guests_url, headers=setup.headers, json={"name": "x\x00y"})
    assert added.status_code == 422
    patched = client.patch(
        f"{guests_url}/{setup.guests['Bruno Costa']}",
        headers=setup.headers,
        json={"dietary_note": "no\x00nuts"},
    )
    assert patched.status_code == 422
    renamed = client.patch(
        f"/api/events/{setup.eid}", headers=setup.headers, json={"name": "Party\x07"}
    )
    assert renamed.status_code == 422
    imported = client.post(
        f"{guests_url}/import",
        headers={**setup.headers, "Content-Type": "text/csv"},
        content=b"name,email\nCl\x00ara,clara@example.com\n",
    )
    assert imported.status_code == 200 and imported.json()["imported"] == 0
    # Ordinary text, including a line break in a note, is still fine.
    fine = client.post(
        guests_url, headers=setup.headers, json={"name": "Dora", "dietary_note": "No nuts\nNo fish"}
    )
    assert fine.status_code == 201


def test_chart_has_tables_and_place_cards(client: TestClient, organiser: Organiser) -> None:
    setup = make_event(client, organiser, GUESTS, privacy_mode="anonymous")
    choose(client, setup, "Ana Silva", setup.seats[1][2])
    chart = client.get(f"/api/events/{setup.eid}/chart", headers=setup.headers).json()
    assert chart["place_cards"] == [{"name": "Ana Silva", "table": "T2", "seat": "3"}]
    assert chart["unseated"] == ["Bruno Costa"]
    assert [table["label"] for table in chart["tables"]] == ["T1", "T2"]
