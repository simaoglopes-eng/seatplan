"""enqueue() writes exactly one row per idempotency key."""

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.mail.outbox import enqueue
from app.models import EmailOutbox


def _enqueue(session: Session, subject: str) -> None:
    enqueue(
        session,
        idempotency_key="booking-confirmed-abc",
        to_email="ana@example.com",
        kind="booking_confirmed",
        subject=subject,
        body_text="Hello",
        body_html="<p>Hello</p>",
    )


def test_enqueue_twice_keeps_one_row(session: Session) -> None:
    _enqueue(session, "First")
    _enqueue(session, "Second")
    session.commit()
    rows = session.scalars(select(EmailOutbox)).all()
    assert len(rows) == 1
    assert rows[0].subject == "First"
    assert rows[0].status == "queued"
    assert rows[0].attempts == 0
    assert rows[0].next_attempt_at.tzinfo is not None
