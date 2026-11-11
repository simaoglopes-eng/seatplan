"""Fair caps on diner bookings, so one client cannot fill a restaurant (finding S8).

Booking needs no login and no email check, and a booking ends its hold, so the
hold caps in holding.py do not stop someone who holds, books and repeats. Two
caps sit in front of POST /r/{vid}/bookings; both answer 429 `rate_limited`:

- one mailbox may have at most MAX_UPCOMING_PER_EMAIL upcoming diner
  bookings at one restaurant (counted from the bookings table, so a change or
  a cancellation frees room at once). Capitals and a "+tag" do not make a new
  mailbox; dots do, because only some providers ignore them;
- one client address may make at most MAX_BOOKINGS_PER_ADDRESS_PER_DAY booking
  attempts at one restaurant per UTC day (security.rate_limit, so it works
  across serverless instances and stores only a keyed hash of the address).
  An IPv6 address counts as its /64 network, because one home connection
  gets a whole /64 and could take a new address for every request.

The email is never checked, so anyone can type a new one: the email cap only
stops an honest diner from over-booking. The address cap is the real brake.

A real diner never meets either. Staff bookings and walk-ins do not count:
they are written by staff routes, never through this one, and only
source="diner" rows are counted. Like the hold caps these are soft limits:
two requests at the very same moment may both pass.

mailbox() and network_of() live in security.py, because guest accounts count
the same way; they are imported from there.
"""

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.errors import ApiError
from app.models import Booking, Venue, utc_now
from app.restaurant_service.occupancy import ACTIVE_STATUSES
from app.security import mailbox, network_of, rate_limit

MAX_UPCOMING_PER_EMAIL = 4
# A busy household books a few nights; 10 a day only matters to a script.
# A whole classroom behind one Wi-Fi address shares this, so a demo with more
# than 10 diners on one network will see the 429 (see docs/security.md, S8).
MAX_BOOKINGS_PER_ADDRESS_PER_DAY = 10
DAY_SECONDS = 24 * 60 * 60


def _upcoming_for_email(session: Session, venue: Venue, email: str) -> int:
    """Diner bookings for this mailbox at this venue that have not ended yet."""
    key = mailbox(email)
    domain = key.rpartition("@")[2]
    query = select(Booking.email).where(
        (Booking.venue_id == venue.id)
        & (Booking.source == "diner")
        & Booking.status.in_(ACTIVE_STATUSES)
        & (Booking.end_at > utc_now())
        # The database narrows the rows to this domain; mailbox() decides, in
        # Python, because SQLite's lower() only knows A to Z.
        & func.lower(Booking.email).endswith(f"@{domain}", autoescape=True)
    )
    return sum(1 for stored_email in session.scalars(query) if mailbox(stored_email) == key)


def check_booking_caps(session: Session, venue: Venue, email: str, address: str) -> None:
    """429 when this mailbox or this client address has booked too much here.

    The email cap is checked first and counts nothing, so a refused email does
    not use up the address's daily allowance. The address count commits at
    once (see rate_limit), so call this before any other write.
    """
    if _upcoming_for_email(session, venue, email) >= MAX_UPCOMING_PER_EMAIL:
        raise ApiError(
            429,
            "rate_limited",
            f"This email already has {MAX_UPCOMING_PER_EMAIL} upcoming bookings here. "
            "Please change or cancel one of them first.",
        )
    try:
        key = f"r-book-day:{venue.public_id}|{network_of(address)}"
        rate_limit(session, key, limit=MAX_BOOKINGS_PER_ADDRESS_PER_DAY, window_s=DAY_SECONDS)
    except ApiError:
        raise ApiError(
            429,
            "rate_limited",
            "Too many bookings from this connection today. "
            "Please try again tomorrow or call the restaurant.",
        ) from None
