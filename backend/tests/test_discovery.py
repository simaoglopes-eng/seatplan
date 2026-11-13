"""Finding restaurants (spec 9.1) and the public restaurant page (spec 9.2).

Search ignores accents and capitals, filters by cuisine, price and features,
sorts by distance when a location is given, pages its results and shows the
next free times when the diner says when. Only published restaurants exist for
the public; a draft is visible only to its owner, who gets a preview flag.
"""

from datetime import date, timedelta
from typing import Any

from conftest import auth_header, make_user
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session
from test_restaurant_helpers import make_restaurant

from app.models import Organiser, Room, Venue, VenuePhoto, VenueTable

LISBON = (38.7223, -9.1393)  # Praça do Comércio
PORTO = (41.1496, -8.6110)


def venue(
    session: Session,
    owner: Organiser,
    name: str,
    slug: str,
    *,
    cuisines: list[str] | None = None,
    price: int | None = 2,
    at: tuple[float, float] | None = LISBON,
    features: dict[str, bool] | None = None,
    status: str = "published",
    address: str = "Rua Augusta 1, Lisboa",
) -> Venue:
    row = Venue(
        organiser_id=owner.id,
        kind="restaurant",
        name=name,
        slug=slug,
        status=status,
        cuisines=cuisines or ["portuguese"],
        price_level=price,
        address=address,
        lat=at[0] if at else None,
        lng=at[1] if at else None,
        features=features or {},
        width=1000,
        height=700,
    )
    session.add(row)
    session.commit()
    return row


def search(client: TestClient, **params: Any):
    answer = client.get("/api/restaurants", params=params)
    assert answer.status_code == 200, answer.text
    return answer.json()


def names(body: dict) -> list[str]:
    return [item["name"] for item in body["items"]]


# ---------------------------------------------------------------- what is listed


def test_only_published_restaurants_are_listed_and_private_data_stays_private(
    client: TestClient, session: Session, organiser: Organiser
) -> None:
    venue(session, organiser, "Tagus Terrace", "tagus-terrace")
    venue(session, organiser, "Hidden Draft", "hidden-draft", status="draft")
    body = search(client)
    assert names(body) == ["Tagus Terrace"] and body["total"] == 1
    item = body["items"][0]
    assert set(item) == {
        "slug",
        "public_id",
        "name",
        "cuisines",
        "price_level",
        "cover_url",
        "cover_alt",
        "address",
        "lat",
        "lng",
        "distance_m",
        "features",
        "next_times",
    }
    assert (
        item["slug"] == "tagus-terrace" and item["distance_m"] is None and item["next_times"] == []
    )
    assert "organiser" not in str(body) and "@" not in str(body)


def test_the_cover_photo_comes_with_its_alt_text(
    client: TestClient, session: Session, organiser: Organiser
) -> None:
    row = venue(session, organiser, "Cover House", "cover-house")
    for position, cover in ((0, False), (1, True)):
        session.add(
            VenuePhoto(
                venue_id=row.id,
                kind="gallery",
                content_type="image/png",
                data=b"x",
                width=1,
                height=1,
                alt_text=f"photo {position}",
                position=position,
                is_cover=cover,
            )
        )
    session.commit()
    item = search(client)["items"][0]
    assert item["cover_alt"] == "photo 1" and item["cover_url"].startswith("/api/photos/")


# ---------------------------------------------------------------- text search


def test_search_ignores_accents_and_capitals_in_names_and_cuisines(
    client: TestClient, session: Session, organiser: Organiser
) -> None:
    venue(session, organiser, "Tagus Terrace", "tagus-terrace", cuisines=["seafood"])
    venue(session, organiser, "Café Lumen", "cafe-lumen", cuisines=["brunch"])
    assert names(search(client, q="tagus")) == ["Tagus Terrace"]
    assert names(search(client, q="TAGUS terr")) == ["Tagus Terrace"]
    assert names(search(client, q="cafe")) == ["Café Lumen"]
    assert names(search(client, q="Café")) == ["Café Lumen"]
    assert names(search(client, q="seafood")) == ["Tagus Terrace"]  # a cuisine word finds it too
    assert names(search(client, q="zzz")) == []


def test_search_text_is_not_a_pattern(
    client: TestClient, session: Session, organiser: Organiser
) -> None:
    venue(session, organiser, "Plain Place", "plain-place")
    assert names(search(client, q="%")) == [] and names(search(client, q="_")) == []
    assert client.get("/api/restaurants", params={"q": "x" * 81}).status_code == 422


# ---------------------------------------------------------------- filters


def test_filters_by_cuisine_price_and_features(
    client: TestClient, session: Session, organiser: Organiser
) -> None:
    venue(
        session,
        organiser,
        "Sunny Sushi",
        "sunny-sushi",
        cuisines=["sushi", "japanese"],
        price=3,
        features={"sun": True, "view": False, "accessible": True, "terrace": False},
    )
    venue(
        session,
        organiser,
        "Shady Pizza",
        "shady-pizza",
        cuisines=["pizza"],
        price=1,
        features={"sun": False, "view": True, "accessible": False, "terrace": True},
    )
    assert names(search(client, cuisine="sushi")) == ["Sunny Sushi"]
    assert sorted(names(search(client, cuisine=["sushi", "pizza"]))) == [
        "Shady Pizza",
        "Sunny Sushi",
    ]
    assert names(search(client, price=1)) == ["Shady Pizza"]
    assert sorted(names(search(client, price=[1, 3]))) == ["Shady Pizza", "Sunny Sushi"]
    assert names(search(client, features="sun")) == ["Sunny Sushi"]
    assert names(search(client, features=["view", "terrace"])) == ["Shady Pizza"]
    assert (
        names(search(client, features=["sun", "view"])) == []
    )  # every feature asked for must be there
    for bad in ({"cuisine": "martian"}, {"price": 9}, {"features": "wifi"}):
        assert client.get("/api/restaurants", params=bad).status_code == 422


# ---------------------------------------------------------------- distance


def test_with_a_location_results_are_nearest_first_with_distances(
    client: TestClient, session: Session, organiser: Organiser
) -> None:
    venue(session, organiser, "Porto Place", "porto-place", at=PORTO)
    venue(session, organiser, "Lisbon Place", "lisbon-place", at=(38.7100, -9.1400))
    venue(session, organiser, "Unlocated Place", "unlocated-place", at=None)
    body = search(client, lat=LISBON[0], lng=LISBON[1])
    assert names(body) == ["Lisbon Place", "Porto Place", "Unlocated Place"]  # no pin: last
    lisbon, porto, unlocated = body["items"]
    assert 1_200 < lisbon["distance_m"] < 1_600  # about 1.4 km
    assert 270_000 < porto["distance_m"] < 280_000  # Lisbon to Porto is about 274 km
    assert unlocated["distance_m"] is None


def test_without_a_location_results_are_by_name(
    client: TestClient, session: Session, organiser: Organiser
) -> None:
    for name in ("Zebra", "Álamo", "Bento"):
        venue(session, organiser, name, name.lower().replace("á", "a"))
    assert names(search(client)) == ["Álamo", "Bento", "Zebra"]


def test_a_location_needs_both_coordinates(client: TestClient) -> None:
    assert client.get("/api/restaurants", params={"lat": 38.7}).status_code == 422
    assert client.get("/api/restaurants", params={"lng": -9.1}).status_code == 422
    assert client.get("/api/restaurants", params={"lat": 123, "lng": -9.1}).status_code == 422


# ---------------------------------------------------------------- paging


def test_results_are_paged_with_a_total(
    client: TestClient, session: Session, organiser: Organiser
) -> None:
    for index in range(25):
        venue(session, organiser, f"Place {index:02d}", f"place-{index:02d}")
    first = search(client)
    assert len(first["items"]) == 20 and first["total"] == 25
    rest = search(client, offset=20)
    assert names(rest) == [f"Place {i:02d}" for i in range(20, 25)]
    assert len(search(client, limit=5)["items"]) == 5
    for bad in ({"limit": 0}, {"limit": 51}, {"offset": -1}):
        assert client.get("/api/restaurants", params=bad).status_code == 422


# ---------------------------------------------------------------- availability


def open_restaurant(session: Session, owner: Organiser, slug: str) -> Venue:
    place = make_restaurant(session, owner)
    row = session.get(Venue, place.venue_id)
    assert row is not None
    row.slug, row.name, row.is_demo = slug, slug.title(), False
    row.address = "Rua Augusta 1, Lisboa"
    row.lat, row.lng, row.cuisines, row.price_level = LISBON[0], LISBON[1], ["portuguese"], 2
    session.commit()
    return row


def day_ahead() -> str:
    return (date.today() + timedelta(days=3)).isoformat()


def test_with_a_date_time_and_party_each_card_gets_the_nearest_free_times(
    client: TestClient, session: Session, organiser: Organiser
) -> None:
    open_restaurant(session, organiser, "open-house")
    body = search(client, date=day_ahead(), time="20:00", party=2)
    times = body["items"][0]["next_times"]
    assert len(times) == 3 and "20:00" in times
    assert all(t[2] == ":" for t in times)
    # The three closest to 20:00, nearest first.
    gaps = [abs(int(t[:2]) * 60 + int(t[3:]) - 20 * 60) for t in times]
    assert gaps == sorted(gaps)


def test_when_is_all_or_nothing(client: TestClient) -> None:
    for params in (
        {"date": day_ahead()},
        {"date": day_ahead(), "time": "20:00"},
        {"time": "20:00", "party": 2},
    ):
        assert client.get("/api/restaurants", params=params).status_code == 422
    assert (
        client.get(
            "/api/restaurants", params={"date": "not-a-date", "time": "20:00", "party": 2}
        ).status_code
        == 422
    )
    assert (
        client.get(
            "/api/restaurants", params={"date": day_ahead(), "time": "20:00", "party": 99}
        ).status_code
        == 422
    )


def test_the_available_filter_drops_restaurants_without_a_free_table_then(
    client: TestClient, session: Session, organiser: Organiser
) -> None:
    open_restaurant(session, organiser, "open-house")
    closed = open_restaurant(session, organiser, "closed-house")
    session.query(VenueTable).filter_by(venue_id=closed.id).update(
        {"is_active": False}
    )  # nothing to book
    session.commit()
    both = search(client, date=day_ahead(), time="20:00", party=2)
    assert sorted(names(both)) == ["Closed-House", "Open-House"]
    assert both["items"][1]["next_times"] == [] or both["items"][0]["next_times"] == []
    only = search(client, date=day_ahead(), time="20:00", party=2, available="true")
    assert names(only) == ["Open-House"] and only["total"] == 1


def test_available_without_when_is_ignored(
    client: TestClient, session: Session, organiser: Organiser
) -> None:
    venue(session, organiser, "Any Place", "any-place")
    assert names(search(client, available="true")) == ["Any Place"]


# ---------------------------------------------------------------- limits


def test_the_read_limit_applies(client: TestClient) -> None:
    from app.routers.restaurants import READ_LIMIT

    for _ in range(2 * READ_LIMIT + 1):
        if client.get("/api/restaurants").status_code == 429:
            return
    raise AssertionError("the read limit never answered 429")


# ---------------------------------------------------------------- the restaurant page


def test_the_public_page_of_a_published_restaurant(
    client: TestClient, session: Session, organiser: Organiser
) -> None:
    row = open_restaurant(session, organiser, "page-house")
    row.description, row.phone, row.website = (
        "A calm place by the river.",
        "+351 210 000 000",
        "https://example.com",
    )
    row.features = {"sun": True, "view": True, "accessible": False, "terrace": False}
    session.add(Room(venue_id=row.id, name="Main room", outline={"points": []}, position=0))
    session.add(
        VenuePhoto(
            venue_id=row.id,
            kind="gallery",
            content_type="image/png",
            data=b"x",
            width=1,
            height=1,
            alt_text="The dining room",
            position=0,
            is_cover=True,
        )
    )
    session.commit()
    body = client.get("/api/restaurants/page-house").json()
    assert (
        body["name"] == "Page-House"
        and body["public_id"] == row.public_id
        and body["preview"] is False
    )
    assert body["description"] == "A calm place by the river."
    assert body["address"] == "Rua Augusta 1, Lisboa" and body["phone"] == "+351 210 000 000"
    assert body["rooms_summary"] == ["Main room"]
    assert body["photos"][0]["alt"] == "The dining room" and body["photos"][0]["url"].startswith(
        "/api/photos/"
    )
    assert body["photos"][0]["is_cover"] is True
    assert body["max_party"] >= 2 and body["features"]["sun"] is True
    assert len(body["schedule"]["service_periods"]) == 14
    assert "organiser" not in str(body) and "email" not in str(body).lower().replace("website", "")


def test_a_draft_is_hidden_from_everyone_but_its_owner(
    client: TestClient, session: Session, organiser: Organiser
) -> None:
    venue(session, organiser, "Secret Draft", "secret-draft", status="draft")
    assert client.get("/api/restaurants/secret-draft").status_code == 404
    stranger = auth_header(make_user(session, "page.stranger@example.com"))
    assert client.get("/api/restaurants/secret-draft", headers=stranger).status_code == 404
    mine = client.get("/api/restaurants/secret-draft", headers=auth_header(organiser))
    assert mine.status_code == 200 and mine.json()["preview"] is True
    assert client.get("/api/restaurants/no-such-place").status_code == 404


def test_the_page_names_the_slug_not_the_internal_id_in_its_url_fields(
    client: TestClient, session: Session, organiser: Organiser
) -> None:
    venue(session, organiser, "Link House", "link-house")
    body = client.get("/api/restaurants/link-house").json()
    assert body["slug"] == "link-house" and body["book_url"] == f"/r/{body['public_id']}"
    assert body["maps_url"].startswith("https://www.google.com/maps/search/")


def test_a_published_restaurant_without_a_slug_has_no_public_page_so_it_is_not_listed(
    client: TestClient, session: Session, organiser: Organiser
) -> None:
    # Old demo data was published before slugs existed; a card with no link would be a dead end.
    row = venue(session, organiser, "No Slug", "temp")
    row.slug = None
    session.commit()
    assert names(search(client)) == []
