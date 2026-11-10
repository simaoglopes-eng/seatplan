"""How an attendee's name is shown to the other attendees.

The organiser picks a mode per event; each guest may additionally ask to be
anonymous. Every name that leaves the server for another attendee goes
through display_name(), so the rule lives in exactly one place.
"""

PRIVACY_MODES = ("full_name", "first_initial", "anonymous")
ANONYMOUS_LABEL = "Guest"


def display_name(name: str, mode: str, wants_anonymous: bool) -> str:
    """Return the name another attendee is allowed to see.

    full_name      "Ana Silva" -> "Ana Silva"
    first_initial  "Ana Silva" -> "Ana S."   (first name plus last initial)
    anonymous      anything    -> "Guest"
    A guest who asked to be anonymous is always "Guest", whatever the mode.
    """
    if mode not in PRIVACY_MODES:
        raise ValueError(f"Unknown privacy mode: {mode}")
    parts = name.split()
    if wants_anonymous or mode == "anonymous" or not parts:
        return ANONYMOUS_LABEL
    if mode == "full_name":
        return " ".join(parts)
    if len(parts) == 1:
        return parts[0]
    return f"{parts[0]} {parts[-1][0]}."


def mask_email(address: str) -> str:
    """Hide most of an address: ana.silva@example.com becomes an***@example.com.

    Used wherever an address is shown or logged only so a person can recognise
    it (the email log, the console provider's log line), never to contact it.
    """
    local, _, domain = address.partition("@")
    visible = local[:2] if len(local) > 2 else local[:1]
    return f"{visible}***@{domain}"
