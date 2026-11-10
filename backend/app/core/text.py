"""Free text typed by people (names, notes, labels), safe to store.

Postgres refuses a NUL character (0x00) in a text column. Without this check
a name like "a\\x00b" passes Pydantic, reaches the database and comes back as
a 500 error. Other invisible control characters have no place in a name or a
note either, so we refuse every one of them except tab and line breaks, and
the request gets a normal 422 "validation" answer.

One type for the whole backend (events, restaurants, venues), so the rule
is written once. Use it in a request model like this:
    name: PlainText = Field(min_length=1, max_length=120)
"""

from typing import Annotated

from pydantic import AfterValidator

# Tab, line feed and carriage return are normal in a multi-line note.
ALLOWED_CONTROL = {"\t", "\n", "\r"}


def no_control_characters(text: str) -> str:
    for character in text:
        is_control = ord(character) < 0x20 or ord(character) == 0x7F
        if is_control and character not in ALLOWED_CONTROL:
            raise ValueError("Remove invisible control characters (such as NUL) from this text.")
    return text


PlainText = Annotated[str, AfterValidator(no_control_characters)]
