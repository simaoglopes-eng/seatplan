"""Typed errors that become the uniform JSON error shape of the API.

Any module can raise ApiError (or a subclass) without importing FastAPI's
response classes; main.py turns it into
{"error": {"code": ..., "message": ...}} with the right HTTP status.
"""


class ApiError(Exception):
    def __init__(self, status: int, code: str, message: str) -> None:
        super().__init__(message)
        self.status = status
        self.code = code
        self.message = message


class SeatTaken(ApiError):
    """Someone else already holds or owns this seat or table."""

    def __init__(self, message: str = "Sorry, someone else just took this spot.") -> None:
        super().__init__(409, "seat_taken", message)


class HoldExpired(ApiError):
    """The five-minute hold ran out (or never existed) before confirming."""

    def __init__(self, message: str = "Your hold expired. Please pick the spot again.") -> None:
        super().__init__(409, "hold_expired", message)
