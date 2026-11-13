"""Discovery stays quick with 100 restaurants (spec 12: under 500 ms), with and without free times.

The best of seven runs is compared, and the limit is scaled by how slow the machine is at that moment (perf_calibration.py), so a busy machine does not fail the test.
"""

import time

from fastapi.testclient import TestClient
from perf_calibration import limit
from sqlalchemy.orm import Session
from test_discovery import LISBON, venue
from test_restaurant_helpers import add_schedule, future_day

from app.models import Organiser, VenuePhoto, VenueTable

LIMIT_SECONDS = 0.500
COUNT = 100


def hundred(session: Session, owner: Organiser) -> None:
    for index in range(COUNT):
        row = venue(
            session,
            owner,
            f"Casa {index:03d}",
            f"casa-{index:03d}",
            cuisines=["portuguese", "seafood"] if index % 2 else ["sushi"],
            price=index % 4 + 1,
            at=(LISBON[0] + index / 1000, LISBON[1] - index / 1000),
            features={
                "sun": index % 3 == 0,
                "view": index % 5 == 0,
                "accessible": True,
                "terrace": False,
            },
        )
        session.add(
            VenuePhoto(
                venue_id=row.id,
                kind="gallery",
                content_type="image/png",
                data=b"x",
                width=1,
                height=1,
                alt_text="Room",
                position=0,
                is_cover=True,
            )
        )
    session.commit()


def best_of(client: TestClient, params: dict) -> float:
    best = float("inf")
    for _ in range(7):
        began = time.perf_counter()
        answer = client.get("/api/restaurants", params=params)
        assert answer.status_code == 200, answer.text
        best = min(best, time.perf_counter() - began)
    return best


def test_a_search_over_a_hundred_restaurants_with_filters_and_distance(
    client: TestClient, session: Session, organiser: Organiser
) -> None:
    hundred(session, organiser)
    params = {
        "q": "casa",
        "cuisine": ["seafood", "sushi"],
        "price": [1, 2, 3],
        "features": ["accessible"],
        "lat": LISBON[0],
        "lng": LISBON[1],
    }
    body = client.get("/api/restaurants", params=params).json()
    assert body["total"] > 20 and len(body["items"]) == 20
    assert best_of(client, params) < limit(LIMIT_SECONDS)


def test_free_times_for_the_twenty_on_the_page_stay_under_the_limit(
    client: TestClient, session: Session, organiser: Organiser
) -> None:
    hundred(session, organiser)
    # Give every restaurant tables and hours, so each card really works out its free times.
    from sqlalchemy import select

    from app.models import Venue

    for row in session.scalars(select(Venue)):
        for number in range(6):
            session.add(
                VenueTable(
                    venue_id=row.id,
                    label=f"T{number}",
                    shape="rect",
                    x=10 + number * 90,
                    y=10,
                    w=60,
                    h=60,
                    min_party=1,
                    max_party=4,
                )
            )
        add_schedule(session, row.id, 40)
    session.commit()
    params = {"date": future_day(3).isoformat(), "time": "20:00", "party": 2}
    body = client.get("/api/restaurants", params=params).json()
    assert len(body["items"]) == 20 and all(len(item["next_times"]) == 3 for item in body["items"])
    assert best_of(client, params) < limit(LIMIT_SECONDS)
