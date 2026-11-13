"""NOAA fractional-year solar approximation, using only the standard library.

Equations: https://gml.noaa.gov/grad/solcalc/solareqns.PDF
Azimuth is clockwise from true north. Altitude excludes refraction, while
rise/set use the NOAA 90.833 degree zenith for the apparent solar disc.
"""

import calendar
import math
from dataclasses import dataclass
from datetime import UTC, date, datetime, time, timedelta, tzinfo
from zoneinfo import ZoneInfo


@dataclass(frozen=True)
class SunPosition:
    azimuth_deg: float
    altitude_deg: float


@dataclass(frozen=True)
class SunTimes:
    sunrise: datetime | None
    sunset: datetime | None
    solar_noon: datetime


def _coordinates(lat: float, lng: float) -> None:
    if not (math.isfinite(lat) and math.isfinite(lng) and -90 <= lat <= 90 and -180 <= lng <= 180):
        raise ValueError("Latitude and longitude are outside their finite ranges")


def _terms(moment: datetime) -> tuple[float, float]:
    """Equation of time in minutes and declination in radians."""
    hour = moment.hour + moment.minute / 60 + moment.second / 3600
    days = 366 if calendar.isleap(moment.year) else 365
    gamma = 2 * math.pi / days * (moment.timetuple().tm_yday - 1 + (hour - 12) / 24)
    equation = 229.18 * (
        0.000075
        + 0.001868 * math.cos(gamma)
        - 0.032077 * math.sin(gamma)
        - 0.014615 * math.cos(2 * gamma)
        - 0.040849 * math.sin(2 * gamma)
    )
    declination = (
        0.006918
        - 0.399912 * math.cos(gamma)
        + 0.070257 * math.sin(gamma)
        - 0.006758 * math.cos(2 * gamma)
        + 0.000907 * math.sin(2 * gamma)
        - 0.002697 * math.cos(3 * gamma)
        + 0.00148 * math.sin(3 * gamma)
    )
    return equation, declination


def sun_position(lat: float, lng: float, when_utc: datetime) -> SunPosition:
    """Position at an aware instant, accepting any input timezone."""
    _coordinates(lat, lng)
    if when_utc.tzinfo is None or when_utc.utcoffset() is None:
        raise ValueError("Solar position requires a timezone-aware instant")
    moment = when_utc.astimezone(UTC)
    equation, decl = _terms(moment)
    minutes = moment.hour * 60 + moment.minute + moment.second / 60 + moment.microsecond / 60000000
    solar_minutes = (minutes + equation + 4 * lng) % 1440
    ha = math.radians(solar_minutes / 4 - 180)
    latitude = math.radians(lat)
    zenith_cos = math.sin(latitude) * math.sin(decl) + math.cos(latitude) * math.cos(
        decl
    ) * math.cos(ha)
    altitude = 90 - math.degrees(math.acos(max(-1, min(1, zenith_cos))))
    azimuth = (
        math.degrees(
            math.atan2(
                math.sin(ha),
                math.cos(ha) * math.sin(latitude) - math.tan(decl) * math.cos(latitude),
            )
        )
        + 180
    )
    return SunPosition(azimuth % 360, altitude)


def sun_times(lat: float, lng: float, day: date, tz: tzinfo | str) -> SunTimes:
    """Local rise/set and solar noon for a calendar day, including polar days."""
    _coordinates(lat, lng)
    zone = ZoneInfo(tz) if isinstance(tz, str) else tz
    midnight = datetime.combine(day, time(), UTC)
    noon = midnight + timedelta(hours=12)
    for _ in range(3):
        equation, _decl = _terms(noon)
        noon = midnight + timedelta(minutes=720 - 4 * lng - equation)
    equation, decl = _terms(noon)
    latitude = math.radians(lat)
    denominator = math.cos(latitude) * math.cos(decl)
    # The poles have no daily crossing. Treat them like the other polar cases.
    if abs(denominator) < 1e-12:
        return SunTimes(None, None, noon.astimezone(zone))
    hour_cos = (math.cos(math.radians(90.833)) - math.sin(latitude) * math.sin(decl)) / denominator
    if not -1 <= hour_cos <= 1:
        return SunTimes(None, None, noon.astimezone(zone))
    half_day = 4 * math.degrees(math.acos(hour_cos))
    rise = noon - timedelta(minutes=half_day)
    setting = noon + timedelta(minutes=half_day)
    return SunTimes(rise.astimezone(zone), setting.astimezone(zone), noon.astimezone(zone))
