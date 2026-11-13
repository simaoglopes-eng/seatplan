"""Known geometric cases at the pure room-validation boundary."""

from copy import deepcopy

from app.ambience.validation import validate_rooms


def room() -> dict:
    return {
        "key": "r1",
        "north_deg": None,
        "outline": {
            "points": [
                {"x": 0, "y": 0, "curve": 0},
                {"x": 1000, "y": 0, "curve": 0},
                {"x": 1000, "y": 700, "curve": 0},
                {"x": 0, "y": 700, "curve": 0},
            ]
        },
        "tables": [],
        "fixtures": [],
        "openings": [],
    }


def table(key: str, x: float, y: float, w: float = 100, h: float = 100, **values: object) -> dict:
    return {
        "key": key,
        "label": key,
        "x": x,
        "y": y,
        "w": w,
        "h": h,
        "rotation": 0,
        "shape": "rect",
        "is_active": True,
        "combine_group": None,
        **values,
    }


def codes(value: dict, publish: bool = False) -> list[str]:
    return sorted(p["code"] for p in validate_rooms([value], for_publication=publish))


def test_room_area_is_between_four_and_five_thousand_square_metres() -> None:
    value = room()
    for width, height, allowed in (
        (199, 200, False),
        (200, 200, True),
        (10000, 5000, True),
        (10000, 5001, False),
    ):
        value["outline"]["points"] = [
            {"x": 0, "y": 0},
            {"x": width, "y": 0},
            {"x": width, "y": height},
            {"x": 0, "y": height},
        ]
        assert ("outline_invalid" not in codes(value)) is allowed


def test_validation_accounts_for_rotated_tables_and_circle_containment() -> None:
    value = room()
    value["tables"] = [table("1", 0, 0, rotation=45)]
    assert codes(value) == ["table_outside"]
    value["outline"]["points"] = value["outline"]["points"][:3]
    value["outline"]["points"][2] = {"x": 0, "y": 1000, "curve": 0}
    value["tables"] = [table("1", 320, 320, 200, 200, shape="round")]
    assert codes(value) == []
    value["tables"][0]["shape"] = "rect"
    assert codes(value) == ["table_outside"]


def test_validation_has_exact_join_tolerance_and_does_not_mutate_inputs() -> None:
    value = room()
    value["tables"] = [
        table("1", 100, 100, combine_group="A"),
        table("2", 198, 100, combine_group="A"),
    ]
    before = deepcopy(value)
    assert codes(value) == ["tight_passage"]
    assert value == before
    value["tables"][1]["x"] = 197
    assert codes(value) == ["tables_overlap", "tight_passage"]
    value["tables"][1]["is_active"] = False
    assert codes(value) == ["tight_passage"]


def test_validation_rejects_crossed_degenerate_and_overcurved_walls() -> None:
    value = room()
    value["outline"]["points"] = [value["outline"]["points"][i] for i in [0, 2, 1, 3]]
    assert codes(value) == ["outline_invalid"]
    value = room()
    value["outline"]["points"][0]["curve"] = 501
    assert codes(value) == ["outline_invalid"]
    value["outline"]["points"] = value["outline"]["points"][:2]
    assert codes(value) == ["outline_invalid"]


def test_validation_detects_a_table_bridging_a_concave_notch() -> None:
    value = room()
    value["outline"]["points"] = [
        {"x": x, "y": y, "curve": 0}
        for x, y in [
            (0, 0),
            (600, 0),
            (600, 600),
            (400, 600),
            (400, 200),
            (200, 200),
            (200, 600),
            (0, 600),
        ]
    ]
    value["tables"] = [table("1", 100, 100, 400, 200)]
    assert codes(value) == ["table_outside"]


def test_curved_outline_and_circle_rectangle_fixture_contact() -> None:
    value = room()
    value["outline"]["points"][0]["curve"] = 200
    value["tables"] = [table("1", 450, -100, 100, 50)]
    assert codes(value) == []
    value = room()
    value["tables"] = [table("1", 100, 100, shape="round")]
    value["fixtures"] = [
        {
            "key": "f1",
            "kind": "bar",
            "label": "",
            "shape": "rect",
            "x": 190,
            "y": 190,
            "w": 100,
            "h": 100,
            "rotation": 0,
        }
    ]
    assert codes(value) == []
    value["fixtures"][0]["x"] = value["fixtures"][0]["y"] = 180
    assert codes(value) == ["fixture_overlap"]


def test_publication_only_requirements_and_window_information() -> None:
    value = room()
    value["openings"] = [{"key": "o1", "kind": "window", "view_text": ""}]
    assert codes(value) == ["window_no_view"]
    assert codes(value, True) == ["no_north", "no_tables", "window_no_view"]
    value["openings"][0]["view_text"] = "Garden"
    value["north_deg"] = 0
    value["tables"] = [table("1", 100, 100)]
    assert codes(value, True) == []
