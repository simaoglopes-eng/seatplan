"""Publishing a restaurant (spec 5.3, step 6) and what stays private until then.

The server checks everything again: name, cuisine, price, location, opening
hours, a room with a table, no errors in the editor and north set where there
are windows. A draft takes no diner bookings; unpublishing keeps old bookings.
"""

from datetime import date, timedelta
from typing import Any

from conftest import auth_header, make_user
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session
from test_owner_rooms import furnished

from app.models import Organiser, Venue

PROFILE = {
    "cuisines": ["portuguese"],
    "price_level": 2,
    "address": "Rua Augusta 1, Lisboa",
    "lat": 38.7223,
    "lng": -9.1393,
    "timezone": "Europe/Lisbon",
}
SCHEDULE = {
    "service_periods": [
        {
            "name": "Dinner",
            "weekday": weekday,
            "start_time": "19:00",
            "end_time": "22:00",
            "slot_minutes": 30,
            "max_covers_per_slot": 20,
        }
        for weekday in range(7)
    ],
    "turn_times": [{"max_party": 4, "minutes": 90}],
    "blackout_dates": [],
}
SQUARE = {
    "points": [
        {"x": 0, "y": 0, "curve": 0},
        {"x": 1000, "y": 0, "curve": 0},
        {"x": 1000, "y": 700, "curve": 0},
        {"x": 0, "y": 700, "curve": 0},
    ]
}


class Owner:
    """One owner and one new draft restaurant, driven through the real API."""

    def __init__(self, client: TestClient, user: Organiser) -> None:
        self.client = client
        self.headers = auth_header(user)
        made = client.post(
            "/api/owner/restaurants", headers=self.headers, json={"name": "Casa Teste"}
        )
        assert made.status_code == 201, made.text
        self.vid = made.json()["public_id"]
        self.slug = made.json()["slug"]

    def url(self, path: str) -> str:
        return f"/api/owner/restaurants/{self.vid}/{path}"

    def profile(self, **fields: Any) -> None:
        answer = self.client.patch(self.url("profile"), headers=self.headers, json=fields)
        assert answer.status_code == 200, answer.text

    def hours(self) -> None:
        answer = self.client.put(
            f"/api/staff/{self.vid}/schedule", headers=self.headers, json=SCHEDULE
        )
        assert answer.status_code == 200, answer.text

    def rooms(self, edit=None) -> dict:
        draft = furnished(self.client, self.url("rooms"), self.headers)
        room = draft["rooms"][0]
        room["outline"] = SQUARE
        room["zones"], room["fixtures"], room["openings"] = [], [], []
        room["tables"] = [
            {
                "id": None,
                "key": "t",
                "zone_key": None,
                "label": "T1",
                "shape": "rect",
                "x": 100,
                "y": 100,
                "w": 80,
                "h": 80,
                "max_party": 2,
                "seats": [],
            }
        ]
        if edit:
            edit(room)
        saved = self.client.put(self.url("rooms"), headers=self.headers, json=draft)
        assert saved.status_code == 200, saved.text
        return saved.json()

    def complete(self) -> None:
        self.profile(**PROFILE)
        self.hours()
        self.rooms()

    def publish(self):
        return self.client.post(self.url("publish"), headers=self.headers)


def codes(answer) -> list[str]:
    return [p["code"] for p in answer.json()["problems"]]


# ---------------------------------------------------------------- what is missing


def test_a_new_restaurant_lists_everything_that_is_missing_with_links(
    client: TestClient, organiser: Organiser
) -> None:
    owner = Owner(client, organiser)
    answer = owner.publish()
    assert answer.status_code == 422, answer.text
    assert {"identity", "location", "hours", "no_tables"} <= set(codes(answer))
    by_code = {p["code"]: p for p in answer.json()["problems"]}
    assert by_code["identity"]["fix_url"] == f"/owner/{owner.vid}/profile"
    assert by_code["location"]["fix_url"] == f"/owner/{owner.vid}/profile"
    assert by_code["hours"]["fix_url"] == f"/owner/{owner.vid}/hours"
    assert by_code["no_tables"]["fix_url"] == f"/owner/{owner.vid}/rooms"
    assert all(p["message"] for p in answer.json()["problems"])
    # The error envelope carries the same list, for the client's error handling.
    assert answer.json()["error"]["problems"] == answer.json()["problems"]


def test_each_missing_piece_is_reported_on_its_own(
    client: TestClient, organiser: Organiser
) -> None:
    owner = Owner(client, organiser)
    owner.profile(**PROFILE)
    assert set(codes(owner.publish())) == {"hours", "no_tables"}
    owner.hours()
    assert set(codes(owner.publish())) == {"no_tables"}
    owner.rooms()
    assert owner.publish().status_code == 200


def test_windows_without_north_and_tables_outside_the_walls_block_publishing(
    client: TestClient, organiser: Organiser
) -> None:
    owner = Owner(client, organiser)
    owner.profile(**PROFILE)
    owner.hours()

    def window_no_north(room: dict) -> None:
        room["north_deg"] = None
        room["openings"] = [
            {"id": None, "key": "w", "side": 2, "offset": 300, "width": 400, "kind": "window"}
        ]

    owner.rooms(window_no_north)
    refused = owner.publish()
    assert refused.status_code == 422 and "no_north" in codes(refused)
    problem = next(p for p in refused.json()["problems"] if p["code"] == "no_north")
    assert problem["fix_url"] == f"/owner/{owner.vid}/rooms"

    def table_outside(room: dict) -> None:
        room["tables"][0].update(x=5000, y=5000)

    owner.rooms(table_outside)
    assert "table_outside" in codes(owner.publish())


# ---------------------------------------------------------------- publishing


def test_publishing_makes_the_restaurant_public_and_returns_its_page(
    client: TestClient, session: Session, organiser: Organiser
) -> None:
    owner = Owner(client, organiser)
    owner.complete()
    answer = owner.publish()
    assert answer.status_code == 200, answer.text
    assert answer.json() == {"status": "published", "url": f"/restaurants/{owner.slug}"}
    venue = session.query(Venue).filter_by(public_id=owner.vid).one()
    assert venue.status == "published" and venue.published_at is not None
    assert owner.publish().status_code == 200  # again: nothing changes
    session.refresh(venue)
    first = venue.published_at
    owner.publish()
    session.refresh(venue)
    assert venue.published_at == first


def test_the_slug_is_fixed_once_published(client: TestClient, organiser: Organiser) -> None:
    owner = Owner(client, organiser)
    owner.complete()
    assert owner.publish().status_code == 200
    changed = client.patch(
        owner.url("profile"), headers=owner.headers, json={"slug": "another-name"}
    )
    assert changed.status_code == 409


def test_unpublishing_goes_back_to_a_draft(
    client: TestClient, session: Session, organiser: Organiser
) -> None:
    owner = Owner(client, organiser)
    owner.complete()
    owner.publish()
    answer = client.post(owner.url("unpublish"), headers=owner.headers)
    assert answer.status_code == 200 and answer.json()["status"] == "draft"
    assert session.query(Venue).filter_by(public_id=owner.vid).one().status == "draft"
    assert client.post(owner.url("unpublish"), headers=owner.headers).status_code == 200


def test_only_the_owner_may_publish_or_unpublish(
    client: TestClient, session: Session, organiser: Organiser
) -> None:
    owner = Owner(client, organiser)
    owner.complete()
    for action in ("publish", "unpublish"):
        assert client.post(owner.url(action)).status_code == 401
        stranger = auth_header(make_user(session, f"stranger.{action}@example.com"))
        assert client.post(owner.url(action), headers=stranger).status_code == 404


# ---------------------------------------------------------------- features


def lit_room(room: dict) -> None:
    room["north_deg"] = 0
    room["openings"] = [
        {
            "id": None,
            "key": "w",
            "side": 2,
            "offset": 300,
            "width": 400,
            "kind": "window",
            "view_text": "River",
        }
    ]
    room["tables"][0]["is_accessible"] = True


def test_features_are_worked_out_when_rooms_are_saved_and_when_publishing(
    client: TestClient, session: Session, organiser: Organiser
) -> None:
    owner = Owner(client, organiser)
    owner.profile(**PROFILE)
    owner.hours()
    owner.rooms(lit_room)
    venue = session.query(Venue).filter_by(public_id=owner.vid).one()
    # A south window in a room with north: sunny, with a view, and an accessible table.
    assert venue.features == {"sun": True, "view": True, "accessible": True, "terrace": False}
    assert owner.publish().status_code == 200
    session.refresh(venue)
    assert venue.features["sun"] is True


def test_a_window_that_never_gets_sun_or_faces_north_is_not_sunny(
    client: TestClient, session: Session, organiser: Organiser
) -> None:
    owner = Owner(client, organiser)

    def never(room: dict) -> None:
        lit_room(room)
        room["openings"][0]["sun_rule"] = "never"

    owner.rooms(never)
    venue = session.query(Venue).filter_by(public_id=owner.vid).one()
    assert venue.features["sun"] is False and venue.features["view"] is True

    def faces_north(room: dict) -> None:
        lit_room(room)
        room["openings"][0]["side"] = 0  # the north wall of a room whose north is at the top

    owner.rooms(faces_north)
    session.refresh(venue)
    assert venue.features["sun"] is False


def test_an_outdoor_room_is_a_terrace_and_sunny(
    client: TestClient, session: Session, organiser: Organiser
) -> None:
    owner = Owner(client, organiser)
    owner.rooms(lambda room: room.update(is_outdoor=True))
    venue = session.query(Venue).filter_by(public_id=owner.vid).one()
    assert venue.features["terrace"] is True and venue.features["sun"] is True


# ---------------------------------------------------------------- drafts take no diner bookings


def test_a_draft_cannot_be_booked_but_a_published_restaurant_can(
    client: TestClient, organiser: Organiser
) -> None:
    owner = Owner(client, organiser)
    owner.complete()
    day = (date.today() + timedelta(days=3)).isoformat()
    params = {"date": day, "party": 2}
    assert client.get(f"/api/r/{owner.vid}", params=None).status_code == 404
    assert client.get(f"/api/r/{owner.vid}/slots", params=params).status_code == 404
    assert (
        client.post(
            f"/api/r/{owner.vid}/hold", json={"date": day, "time": "19:00", "party": 2}
        ).status_code
        == 404
    )
    owner.publish()
    assert client.get(f"/api/r/{owner.vid}").status_code == 200
    assert client.get(f"/api/r/{owner.vid}/slots", params=params).status_code == 200
    client.post(owner.url("unpublish"), headers=owner.headers)
    assert client.get(f"/api/r/{owner.vid}").status_code == 404


def test_the_owner_can_still_run_the_floor_of_a_draft(
    client: TestClient, organiser: Organiser
) -> None:
    owner = Owner(client, organiser)
    owner.complete()
    floor = client.get(
        f"/api/staff/{owner.vid}/floor",
        params={"date": date.today().isoformat(), "time": "20:00"},
        headers=owner.headers,
    )
    assert floor.status_code == 200


# ---------------------------------------------------------------- the read-only checklist


def test_the_checklist_says_what_is_missing_without_publishing(
    client: TestClient, session: Session, organiser: Organiser
) -> None:
    owner = Owner(client, organiser)
    check = client.get(owner.url("publish-check"), headers=owner.headers)
    assert check.status_code == 200, check.text
    body = check.json()
    assert body["ready"] is False and body["status"] == "draft"
    assert {"identity", "location", "hours", "no_tables"} <= {p["code"] for p in body["problems"]}
    assert [t["code"] for t in body["tips"]] == ["photos"]  # a photo is recommended, never required
    owner.complete()
    ready = client.get(owner.url("publish-check"), headers=owner.headers).json()
    assert ready["ready"] is True and ready["problems"] == []
    assert (
        session.query(Venue).filter_by(public_id=owner.vid).one().status == "draft"
    )  # only looked


def test_the_checklist_is_private_to_the_owner(
    client: TestClient, session: Session, organiser: Organiser
) -> None:
    owner = Owner(client, organiser)
    assert client.get(owner.url("publish-check")).status_code == 401
    stranger = auth_header(make_user(session, "check.stranger@example.com"))
    assert client.get(owner.url("publish-check"), headers=stranger).status_code == 404
