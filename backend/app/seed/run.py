"""Create the tables and the demo data: python -m app.seed.run

Run it from the backend/ folder. It creates a demo organiser and a demo staff
user, then asks both verticals to seed their own demo data, and prints the
links to open.

Demo passwords come from DEMO_ORGANISER_PASSWORD and DEMO_STAFF_PASSWORD. Only
on a local SQLite database with DEMO_MODE=1 do we fall back to the documented
defaults below. Any Postgres database is a deployment that others can reach, so
there the variables are required, demo mode or not.
"""

import os

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app import db
from app.config import Settings, get_settings
from app.core import audit
from app.models import DemoLink, Organiser
from app.security import hash_password
from app.seed import demo_events, demo_restaurant

DEMO_ORGANISER_EMAIL = "organiser@example.com"
DEMO_STAFF_EMAIL = "staff@example.com"
# Public on purpose: these only work locally (see demo_password below).
DEFAULT_DEMO_PASSWORDS = {
    "DEMO_ORGANISER_PASSWORD": "demo-organiser-2026",
    "DEMO_STAFF_PASSWORD": "demo-staff-2026",
}


def demo_password(env_name: str, settings: Settings) -> str:
    value = os.environ.get(env_name, "")
    if value:
        return value
    if settings.demo_mode and not settings.is_postgres:
        return DEFAULT_DEMO_PASSWORDS[env_name]
    raise RuntimeError(f"{env_name} must be set on Postgres or when DEMO_MODE is off.")


def _ensure_user(session: Session, email: str, name: str, role: str, password: str) -> None:
    """Create the user, or reset their password and role if they exist."""
    user = session.scalars(select(Organiser).where(Organiser.email == email)).first()
    if user is None:
        user = Organiser(email=email)
        session.add(user)
    user.name = name
    user.role = role
    user.password_hash = hash_password(password)


def ensure_demo_users(session: Session, settings: Settings) -> None:
    """Make sure the demo organiser and staff accounts exist. Does not commit."""
    _ensure_user(
        session,
        DEMO_ORGANISER_EMAIL,
        "Olivia Organiser",
        "organiser",
        demo_password("DEMO_ORGANISER_PASSWORD", settings),
    )
    _ensure_user(
        session,
        DEMO_STAFF_EMAIL,
        "Sam Staff",
        "staff",
        demo_password("DEMO_STAFF_PASSWORD", settings),
    )
    session.flush()


def seed_all(session: Session, settings: Settings, actor: str) -> dict[str, str]:
    """Demo users plus both verticals. Commits, and returns the entry links.

    The links are saved in demo_links for GET /demo/links. The audit row only
    counts them: a link holds a raw token, and tokens never go into the audit
    log (core/audit.py).
    """
    ensure_demo_users(session, settings)
    links = {**demo_events.seed(session), **demo_restaurant.seed(session)}
    session.execute(delete(DemoLink))
    session.add_all(DemoLink(name=name, path=path) for name, path in links.items())
    audit.record(
        session,
        actor=actor,
        action="demo.seed",
        entity="demo",
        entity_id="all",
        detail={"count": len(links)},
    )
    session.commit()
    return links


def main() -> None:
    settings = get_settings()
    db.init_engine(settings.database_url)
    db.create_all()
    with db.new_session() as session:
        links = seed_all(session, settings, actor="seed-command")
    print("Demo data ready.")
    for name, link in sorted(links.items()):
        print(f"  {name}: {link}")


if __name__ == "__main__":
    main()
