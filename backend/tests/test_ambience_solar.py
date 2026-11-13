"""Solar reference cases from approved specification 7.2 and NOAA equations."""

from datetime import UTC, date, datetime
from zoneinfo import ZoneInfo

import pytest

from app.ambience.solar import sun_position, sun_times

LISBON = ZoneInfo("Europe/Lisbon")


@pytest.mark.parametrize(
    ("day", "rise", "setting", "altitude"),
    [(date(2026, 6, 21), 372, 1265, 74.7), (date(2026, 12, 21), 471, 1038, 27.9)],
)
def test_lisbon_seasonal_reference(day: date, rise: int, setting: int, altitude: float) -> None:
    times = sun_times(38.7223, -9.1393, day, LISBON)
    assert times.sunrise is not None and times.sunset is not None
    for moment, expected in ((times.sunrise, rise), (times.sunset, setting)):
        assert abs(moment.hour * 60 + moment.minute + moment.second / 60 - expected) <= 3
        assert moment.date() == day
    position = sun_position(38.7223, -9.1393, times.solar_noon)
    assert position.altitude_deg == pytest.approx(altitude, abs=1)
    assert position.azimuth_deg == pytest.approx(180, abs=1)


def test_lisbon_night_and_local_summer_noon() -> None:
    night = datetime(2026, 6, 21, 23, tzinfo=LISBON)
    assert sun_position(38.7223, -9.1393, night).altitude_deg < 0
    noon = sun_times(38.7223, -9.1393, night.date(), LISBON).solar_noon
    assert abs(noon.hour * 60 + noon.minute - 818) <= 3
    assert sun_position(38.7223, -9.1393, night) == sun_position(
        38.7223, -9.1393, night.astimezone(UTC)
    )


def test_polar_day_and_night() -> None:
    zone = ZoneInfo("Europe/Oslo")
    for day in (date(2026, 6, 21), date(2026, 12, 21)):
        times = sun_times(69.65, 18.96, day, zone)
        assert times.sunrise is None
        assert times.sunset is None


@pytest.mark.parametrize("lat,lng", [(91, 0), (0, -181), (float("nan"), 0)])
def test_invalid_coordinates_are_refused(lat: float, lng: float) -> None:
    with pytest.raises(ValueError):
        sun_position(lat, lng, datetime(2026, 6, 21, tzinfo=UTC))


def test_naive_instant_is_refused() -> None:
    with pytest.raises(ValueError):
        sun_position(38, -9, datetime(2026, 6, 21))
