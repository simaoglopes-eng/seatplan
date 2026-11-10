"""Auto-fill, re-plan, scenarios, apply, undo and redo, what-if and exact-check."""

from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session
from test_events_setup import (
    EventSetup,
    add_guest,
    choose,
    make_event,
    recorded_writes,
    seat_state,
)

from app.events_service import exact_check
from app.events_service.optimise import organiser_problem
from app.events_service.plans import load_scenario, state_of
from app.models import Event, Organiser, SeatAssignment
from app.optimiser.events_model import SolveResult, check_hard

# Table 1: a VIP seat and a blocked seat. Table 2: two accessible seats.
EXTRAS = {
    (0, 0): {"reserved_tag": "vip"},
    (0, 1): {"is_blocked": True},
    (1, 0): {"is_accessible": True},
    (1, 1): {"is_accessible": True},
}
GUESTS = [
    {"name": "Vip Valente", "reserved_tag": "vip"},
    {"name": "Aida Access", "needs_accessible": True},
    {"name": "Ana Silva", "group": "Silva", "keep_adjacent": True},
    {"name": "Rui Silva", "group": "Silva"},
    {"name": "Sara Silva", "group": "Silva"},
    {"name": "Tom Reis", "group": "Reis", "keep_adjacent": True},
    {"name": "Uma Reis", "group": "Reis"},
    {"name": "Paulo Lima"},
    {"name": "Quinta Lobo"},
]


def _event(session: Session, setup: EventSetup) -> Event:
    session.expire_all()
    found = session.scalars(select(Event).where(Event.public_id == setup.eid)).first()
    assert found is not None
    return found


def _rows(session: Session) -> dict[int, tuple[int, str]]:
    session.expire_all()
    return {
        row.guest_id: (row.seat_id, row.source) for row in session.scalars(select(SeatAssignment))
    }


def _post(client: TestClient, setup: EventSetup, path: str, body: Any = None) -> dict[str, Any]:
    response = client.post(f"/api/events/{setup.eid}{path}", headers=setup.headers, json=body)
    assert response.status_code == 200, response.text
    return response.json()


def _setup(client: TestClient, organiser: Organiser) -> EventSetup:
    setup = make_event(client, organiser, GUESTS, tables=3, per_table=4, extras=EXTRAS)
    choose(client, setup, "Paulo Lima", setup.seats[2][3])
    choose(client, setup, "Ana Silva", setup.seats[2][0])
    return setup


def test_autofill_is_only_a_proposal_and_keeps_every_rule(
    client: TestClient, organiser: Organiser, session: Session
) -> None:
    setup = _setup(client, organiser)
    before = _rows(session)
    scenario = _post(client, setup, "/optimise/autofill", {"seed": 3, "max_iterations": 2000})
    assert scenario["unseated"] == [] and scenario["seated"] == len(GUESTS)
    assert _rows(session) == before  # nothing applied yet

    event = _event(session, setup)
    plan = {
        g: seat
        for g, (seat, _src) in state_of(load_scenario(session, event, scenario["id"])).items()
    }
    problem, _rows_now = organiser_problem(session, event)
    assert check_hard(problem, plan) == []
    for guest_id, (seat_id, _source) in before.items():
        assert plan[guest_id] == seat_id  # self-chosen seats never move

    applied = _post(client, setup, f"/scenarios/{scenario['id']}/apply")
    assert applied["conflicts"] == [] and applied["applied"] == len(GUESTS) - len(before)
    after = _rows(session)
    for guest_id, row in before.items():
        assert after[guest_id] == row  # same seat, still "self"
    assert after[setup.guests["Vip Valente"]][0] == setup.seats[0][0]
    assert after[setup.guests["Aida Access"]][0] in setup.seats[1][:2]


def test_apply_keeps_a_seat_chosen_after_the_scenario(
    client: TestClient, organiser: Organiser, session: Session
) -> None:
    setup = _setup(client, organiser)
    scenario = _post(client, setup, "/optimise/autofill", {"seed": 1, "max_iterations": 1000})
    plan = state_of(load_scenario(session, _event(session, setup), scenario["id"]))
    tom, uma = setup.guests["Tom Reis"], setup.guests["Uma Reis"]
    wanted_seat = plan[tom][0]
    assert plan[uma][0] != wanted_seat
    # Uma picks the seat the scenario had given to Tom, before the organiser applies.
    choose(client, setup, "Uma Reis", wanted_seat)

    applied = _post(client, setup, f"/scenarios/{scenario['id']}/apply")
    rows = _rows(session)
    assert rows[uma] == (wanted_seat, "self")
    assert tom not in rows
    conflict_guests = {conflict["guest_id"] for conflict in applied["conflicts"]}
    assert conflict_guests == {tom, uma}


def test_replan_after_a_cancellation_moves_few_guests(
    client: TestClient, organiser: Organiser, session: Session
) -> None:
    setup = _setup(client, organiser)
    first = _post(client, setup, "/optimise/autofill", {"seed": 5, "max_iterations": 2000})
    _post(client, setup, f"/scenarios/{first['id']}/apply")
    cancelled = client.post(f"/api/a/{setup.tokens['Sara Silva']}/rsvp", json={"rsvp": "no"})
    assert cancelled.status_code == 200
    newcomer = add_guest(client, setup, {"name": "Nadia Nova"})

    replanned = _post(client, setup, "/optimise/replan")
    plan = state_of(load_scenario(session, _event(session, setup), replanned["id"]))
    assert setup.guests["Sara Silva"] not in plan
    assert newcomer in plan and replanned["unseated"] == []
    assert len(replanned["moved"]) <= 1
    assert replanned["score"]["changes"] == -8 * len(replanned["moved"])


def test_undo_and_redo_never_touch_guest_choices(
    client: TestClient, organiser: Organiser, session: Session
) -> None:
    setup = make_event(client, organiser, GUESTS[2:6])
    ana, rui = setup.guests["Ana Silva"], setup.guests["Rui Silva"]
    put = f"/api/events/{setup.eid}/assignments"
    assert (
        client.put(
            f"{put}/{ana}", headers=setup.headers, json={"seat_id": setup.seats[0][0]}
        ).status_code
        == 200
    )
    assert (
        client.put(
            f"{put}/{rui}", headers=setup.headers, json={"seat_id": setup.seats[0][1]}
        ).status_code
        == 200
    )
    choose(client, setup, "Sara Silva", setup.seats[1][0])

    _post(client, setup, "/undo")
    rows = _rows(session)
    assert rui not in rows and rows[ana] == (setup.seats[0][0], "organiser")
    _post(client, setup, "/redo")
    assert _rows(session)[rui] == (setup.seats[0][1], "organiser")
    _post(client, setup, "/undo")
    _post(client, setup, "/undo")
    rows = _rows(session)
    assert ana not in rows and rui not in rows
    assert rows[setup.guests["Sara Silva"]] == (setup.seats[1][0], "self")
    nothing = client.post(f"/api/events/{setup.eid}/undo", headers=setup.headers)
    assert nothing.status_code == 409


def _organiser_move(client: TestClient, setup: EventSetup, name: str, seat_id: int) -> None:
    path = f"/api/events/{setup.eid}/assignments/{setup.guests[name]}"
    response = client.put(path, headers=setup.headers, json={"seat_id": seat_id})
    assert response.status_code == 200, response.text


def test_undo_gives_a_guest_back_the_seat_they_chose(
    client: TestClient, organiser: Organiser, session: Session
) -> None:
    # Review finding: undoing the organiser's move used to leave Ana with no seat.
    setup = make_event(client, organiser, GUESTS[2:4])
    ana = setup.guests["Ana Silva"]
    choose(client, setup, "Ana Silva", setup.seats[0][0])
    _organiser_move(client, setup, "Ana Silva", setup.seats[0][1])

    undone = _post(client, setup, "/undo")
    assert _rows(session)[ana] == (setup.seats[0][0], "self")
    assert undone["conflicts"] == []


def test_undo_never_unseats_a_guest_when_their_old_seat_is_gone(
    client: TestClient, organiser: Organiser, session: Session
) -> None:
    setup = make_event(client, organiser, GUESTS[2:4])
    ana, rui = setup.guests["Ana Silva"], setup.guests["Rui Silva"]
    choose(client, setup, "Ana Silva", setup.seats[0][0])
    _organiser_move(client, setup, "Ana Silva", setup.seats[0][1])
    choose(client, setup, "Rui Silva", setup.seats[0][0])  # takes Ana's old seat

    undone = _post(client, setup, "/undo")
    rows = _rows(session)
    assert rows[rui] == (setup.seats[0][0], "self")
    assert rows[ana] == (setup.seats[0][1], "organiser")  # kept, not deleted
    assert [conflict["guest_id"] for conflict in undone["conflicts"]] == [ana]


def test_saving_a_scenario_locks_the_event_first(client: TestClient, organiser: Organiser) -> None:
    """Two auto-fills at once must not both read the same highest seq.

    Taking the event's live_versions row first makes the second one wait
    until the first has committed, so it reads the new highest seq.
    """
    setup = _setup(client, organiser)
    with recorded_writes() as writes:
        _post(client, setup, "/optimise/autofill", {"seed": 0, "max_iterations": 100})
    assert "live_versions" in writes[0]


def test_whatif_scores_moves_without_saving(
    client: TestClient, organiser: Organiser, session: Session
) -> None:
    setup = _setup(client, organiser)
    tom, uma = setup.guests["Tom Reis"], setup.guests["Uma Reis"]
    before = _rows(session)
    answer = _post(
        client,
        setup,
        "/whatif",
        {
            "moves": [
                {"guest_id": tom, "seat_id": setup.seats[1][2]},
                {"guest_id": uma, "seat_id": setup.seats[1][3]},
            ]
        },
    )
    assert answer["after"]["group_adjacent"] > answer["before"]["group_adjacent"]
    assert answer["delta"]["total"] == answer["after"]["total"] - answer["before"]["total"]
    assert answer["hard_rule_problems"] == []
    risky = _post(
        client, setup, "/whatif", {"moves": [{"guest_id": tom, "seat_id": setup.seats[0][0]}]}
    )
    assert risky["hard_rule_problems"]  # a VIP seat for a non-VIP guest
    assert _rows(session) == before


def test_scenarios_list_and_compare(client: TestClient, organiser: Organiser) -> None:
    setup = _setup(client, organiser)
    a = _post(client, setup, "/optimise/autofill", {"seed": 1, "max_iterations": 500})
    b = _post(client, setup, "/optimise/autofill", {"seed": 2, "max_iterations": 500})
    listed = client.get(f"/api/events/{setup.eid}/scenarios", headers=setup.headers).json()
    assert [s["id"] for s in listed] == [a["id"], b["id"]]
    compared = client.get(
        f"/api/events/{setup.eid}/scenarios/compare",
        headers=setup.headers,
        params={"a": a["id"], "b": b["id"]},
    ).json()
    assert compared["delta"]["total"] == b["score"]["total"] - a["score"]["total"]
    assert compared["guests_seated_differently"] == len(compared["guest_ids"])
    missing = client.get(
        f"/api/events/{setup.eid}/scenarios/compare",
        headers=setup.headers,
        params={"a": a["id"], "b": 999},
    )
    assert missing.status_code == 404


def test_exact_check_on_one_table(client: TestClient, organiser: Organiser) -> None:
    setup = _setup(client, organiser)
    scenario = _post(client, setup, "/optimise/autofill", {"seed": 0, "max_iterations": 2000})
    _post(client, setup, f"/scenarios/{scenario['id']}/apply")
    detail = client.get(f"/api/events/{setup.eid}", headers=setup.headers).json()
    table_ids = [table["id"] for table in detail["map"]["tables"]]
    check = _post(client, setup, "/optimise/exact-check", {"table_ids": table_ids[1:3]})
    assert check["seats"] == 8 and check["guests"] > 0
    assert check["proven_optimal"] is True
    assert check["optimal_score"] >= check["heuristic_score"] - 1e-9
    assert check["gap_percent"] >= 0 and check["exact_ms"] >= 0
    default = _post(client, setup, "/optimise/exact-check")
    assert len(default["table_ids"]) == 1
    too_many = client.post(
        f"/api/events/{setup.eid}/optimise/exact-check",
        headers=setup.headers,
        json={"table_ids": table_ids},
    )
    assert too_many.status_code == 422


def test_exact_check_gives_no_gap_when_the_heuristic_seats_fewer_guests(
    client: TestClient, organiser: Organiser, monkeypatch: pytest.MonkeyPatch
) -> None:
    """The exact solver seats as many guests as possible FIRST, then scores.

    A heuristic plan that drops a guest can score as high or higher, so a gap
    in points alone would call it optimal. The counts are compared first.
    """
    setup = _setup(client, organiser)
    real_solve = exact_check.solve

    def drops_a_guest(problem: Any, **options: Any) -> SolveResult:
        result = real_solve(problem, **options)
        dropped = max(g for g in result.assignment if g not in problem.fixed)
        kept = {g: s for g, s in result.assignment.items() if g != dropped}
        return SolveResult(kept, result.score, result.iterations, result.seed, (dropped,))

    monkeypatch.setattr(exact_check, "solve", drops_a_guest)
    detail = client.get(f"/api/events/{setup.eid}", headers=setup.headers).json()
    table_ids = [table["id"] for table in detail["map"]["tables"]]
    scenario = _post(client, setup, "/optimise/autofill", {"seed": 0, "max_iterations": 500})
    _post(client, setup, f"/scenarios/{scenario['id']}/apply")
    check = _post(client, setup, "/optimise/exact-check", {"table_ids": table_ids[2:3]})
    assert check["heuristic_seated"] == check["exact_seated"] - 1
    assert check["gap_percent"] is None
    assert "1 guest" in check["note"]


def test_held_seat_shows_for_the_organiser(client: TestClient, organiser: Organiser) -> None:
    setup = _setup(client, organiser)
    seat = setup.seats[2][1]
    assert (
        client.post(f"/api/a/{setup.tokens['Tom Reis']}/hold", json={"seat_id": seat}).status_code
        == 200
    )
    detail = client.get(f"/api/events/{setup.eid}", headers=setup.headers).json()
    assert next(s["state"] for s in detail["map"]["seats"] if s["id"] == seat) == "held"
    assert seat_state(setup.page(client, "Uma Reis"), seat) == "held"
