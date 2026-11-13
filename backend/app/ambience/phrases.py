"""The short English sentences diners read next to a table (spec 7.5).

At most three, in the order light, then view, then what is close by. Every
sentence is built only from facts table.py already worked out, so a sentence
can never promise more than the numbers behind it.
"""

from datetime import time

LIGHT_ONLY = {
    "night": "Evening: it will be dark outside",
    "daylight": "Bright, by a window",
    "shade": "In the shade",
}
NEAR_WORDS = {
    "bar": "Next to the bar",
    "wc": "Near the toilets",
    "kitchen": "By the open kitchen",
    "fireplace": "By the fireplace",
    "stage": "Close to the live music",
    "tv": "Near the TV",
    "host_stand": "Near the host stand",
    "entrance": "Near the entrance",
}
TAG_WORDS = {
    "river": "River view",
    "sea": "Sea view",
    "street": "Street view",
    "garden": "Garden view",
    "courtyard": "Courtyard view",
    "monument": "Monument view",
    "city": "City view",
    "hills": "View of the hills",
    "pool": "Pool view",
    "square": "View of the square",
}
QUIET = "In a quiet corner"


def hhmm(moment: time) -> str:
    return moment.strftime("%H:%M")


def light_phrase(
    light: str,
    *,
    outdoor: bool,
    whole_meal_sun: bool,
    sun_until: time | None,
    sun_from: time | None,
    sunset_at: time | None,
    dark_at: time | None,
) -> str | None:
    """One sentence about the light, the most specific fact first."""
    if whole_meal_sun:
        return "Direct sun for your whole meal"
    if sun_until is not None:
        return f"Direct sun until {hhmm(sun_until)}"
    if sun_from is not None:
        return f"Sun reaches this table at {hhmm(sun_from)}"
    if sunset_at is not None:
        return f"Sunset at {hhmm(sunset_at)} from your seat"
    if dark_at is not None:
        return f"It gets dark at {hhmm(dark_at)}"
    if light == "night" and outdoor:
        return "Under the stars"
    return LIGHT_ONLY.get(light)


def view_phrase(text: str, tags: tuple[str, ...]) -> str | None:
    """'View of the Tagus river'; with only tags, 'River view'."""
    text = text.strip()
    if text:
        if text.lower().startswith("the "):
            text = text[4:]
        return f"View of the {text}"
    for tag in tags:
        if tag in TAG_WORDS:
            return TAG_WORDS[tag]
    return None


def near_phrase(near: tuple[str, ...], quiet: bool) -> str | None:
    """What is closest, or 'In a quiet corner' when nothing busy is around."""
    for kind in near:
        if kind in NEAR_WORDS:
            return NEAR_WORDS[kind]
    return QUIET if quiet else None


def seat_phrase(angle_deg: float) -> str:
    """From the angle between 'where the chair looks' and 'where the window is'."""
    if angle_deg <= 60:
        return "Facing the window"
    if angle_deg >= 120:
        return "Back to the window"
    return "Side-on to the window"
