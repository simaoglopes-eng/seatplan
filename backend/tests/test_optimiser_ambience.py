"""Ambience preferences in the restaurant optimiser (spec 8).

The diner may ask for a sunny table, shade, a view, a quiet spot or a table
away from the toilets. Preferences only ever break ties: hard rules, covers
seated and wasted seats keep their strict priority, and a couple who wants sun
does not get the table for eight.
"""

from app.optimiser.restaurant_assign import assign_service, recommend_table, whatif_walkin
from app.optimiser.restaurant_model import PartySpec, TableSpec, check_hard, score_plan

LUNCH = (52, 58)  # 13:00 to 14:30 in 15-minute slots


def table(tid: int, seats: int, features: frozenset[str] = frozenset(), group=None) -> TableSpec:
    return TableSpec(
        id=tid,
        min_party=1,
        max_party=seats,
        zone="general",
        accessible=True,
        high_chair_ok=True,
        combine_group=group,
        label=f"T{tid}",
        features=features,
    )


def party(pid: int, size: int, prefs: frozenset[str] = frozenset(), fixed=None) -> PartySpec:
    return PartySpec(
        id=pid,
        size=size,
        start_slot=LUNCH[0],
        end_slot=LUNCH[1],
        needs_accessible=False,
        high_chairs=0,
        zone_pref=None,
        fixed_tables=fixed,
        label=f"Guest {pid}",
        prefs=prefs,
    )


SUN = frozenset({"sun"})


# ---------------------------------------------------------------- recommend


def test_sun_breaks_the_tie_between_two_tables_for_four() -> None:
    tables = [table(1, 4), table(2, 4, SUN)]
    plain = recommend_table(tables, {}, party(10, 2))
    assert [c.table_ids for c in plain] == [(1,), (2,)]  # no wish: same order as before
    sunny = recommend_table(tables, {}, party(10, 2, SUN))
    assert sunny[0].table_ids == (2,)
    assert "Sunny, as you asked" in sunny[0].reasons
    assert "Not in the sun" in sunny[1].reasons


def test_a_couple_who_wants_sun_keeps_the_table_for_two() -> None:
    tables = [table(1, 2), table(2, 8, SUN)]
    choices = recommend_table(tables, {}, party(10, 2, SUN))
    assert choices[0].table_ids == (1,)


def test_a_little_extra_room_is_worth_a_wish() -> None:
    # Waste 0 without sun against waste 2 with sun: within the two-seat margin.
    tables = [table(1, 2), table(2, 4, SUN)]
    assert recommend_table(tables, {}, party(10, 2, SUN))[0].table_ids == (2,)


def test_no_sunny_table_free_says_so_with_the_time() -> None:
    tables = [table(1, 4), table(2, 4, SUN)]
    busy = {2: set(range(*LUNCH))}
    (choice,) = recommend_table(tables, busy, party(10, 2, SUN))
    assert choice.table_ids == (1,)
    assert "No sunny table is free at 13:00" in choice.reasons


def test_every_wish_has_a_reason() -> None:
    features = frozenset({"view", "quiet", "shade", "away_from_wc"})
    tables = [table(1, 4, features)]
    (choice,) = recommend_table(tables, {}, party(10, 4, features))
    for reason in (
        "Has a view, as you asked",
        "Quiet corner, as you asked",
        "In the shade, as you asked",
        "Away from the toilets, as you asked",
    ):
        assert reason in choice.reasons


def test_joined_tables_meet_a_wish_only_if_every_table_does() -> None:
    tables = [table(1, 4, SUN, group="g"), table(2, 4, group="g"), table(3, 4, SUN, group="g")]
    choices = recommend_table(tables, {}, party(10, 7, SUN))
    assert choices[0].table_ids == (1, 3)


def test_hard_rules_still_come_first() -> None:
    # The sunny table is not accessible; the party needs it.
    sunny = TableSpec(2, 1, 4, "general", False, True, None, "T2", features=SUN)
    tables = [table(1, 4), sunny]
    needs = PartySpec(10, 2, *LUNCH, True, 0, None, None, "Guest", prefs=SUN)
    assert [c.table_ids for c in recommend_table(tables, {}, needs)] == [(1,)]


def test_walkin_uses_the_wish_too() -> None:
    tables = [table(1, 4), table(2, 4, SUN)]
    plan = assign_service(tables, [], seed=0)
    answer = whatif_walkin(tables, [], plan, party(10, 2, SUN))
    assert answer.table_ids == (2,)


# ---------------------------------------------------------------- score and service


def test_score_counts_wishes_but_key_keeps_its_three_parts() -> None:
    tables = [table(1, 2, SUN), table(2, 2)]
    parties = [party(10, 2, SUN), party(11, 2, frozenset({"sun", "view"}))]
    score = score_plan(tables, parties, {10: (1,), 11: (2,)})
    assert (score.prefs_met, score.prefs_wanted) == (1, 3)
    assert score.key() == (4, 0, 0)
    assert score.ranking_key() == (4, 0, 0, 1)


def test_service_plan_puts_the_sun_seeker_in_the_sun_for_every_seed() -> None:
    tables = [table(1, 2), table(2, 2, SUN)]
    parties = [party(10, 2), party(11, 2, SUN)]
    for seed in range(10):
        plan = assign_service(tables, parties, seed=seed)
        assert plan.assignments[11] == (2,)
        assert plan.score.prefs_met == 1
        assert check_hard(tables, parties, dict(plan.assignments)) == []


def test_wishes_never_cost_a_seated_guest() -> None:
    # Only the sunny table fits the party of 4, so the couple who wants sun
    # must take the other one, and both parties are seated.
    tables = [table(1, 2), table(2, 4, SUN)]
    parties = [party(10, 2, SUN), party(11, 4)]
    plan = assign_service(tables, parties, seed=3)
    assert plan.unseated == ()
    assert plan.assignments == {10: (1,), 11: (2,)}


def test_fixed_party_stays_even_if_it_wanted_sun() -> None:
    tables = [table(1, 2), table(2, 2, SUN)]
    parties = [party(10, 2, SUN, fixed=(1,)), party(11, 2)]
    plan = assign_service(tables, parties, seed=0)
    assert plan.assignments[10] == (1,)


def test_same_seed_same_plan_with_wishes() -> None:
    tables = [table(i, 4, SUN if i % 2 else frozenset()) for i in range(1, 7)]
    parties = [party(i, 2 + i % 3, SUN if i % 2 else frozenset()) for i in range(10, 18)]
    first = assign_service(tables, parties, seed=7)
    again = assign_service(tables, list(reversed(parties)), seed=7)
    assert first.assignments == again.assignments
