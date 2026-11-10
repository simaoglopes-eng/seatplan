"""POST /auth/login and GET /auth/me for organisers and staff."""

from fastapi import APIRouter, Request
from pydantic import BaseModel, ConfigDict, EmailStr, Field
from sqlalchemy import select

from app import db
from app.core.errors import ApiError
from app.models import Organiser
from app.security import (
    CurrentUser,
    client_ip,
    create_session_token,
    hash_password,
    rate_limit,
    verify_password,
)

router = APIRouter(prefix="/auth", tags=["auth"])

# Checked when the email is unknown, so a wrong email takes as long as a wrong
# password and the response time does not reveal which accounts exist.
_DUMMY_HASH = hash_password("not-a-real-password")


class LoginIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    email: EmailStr = Field(max_length=254)
    password: str = Field(min_length=1, max_length=200)


class UserOut(BaseModel):
    email: str
    name: str
    role: str


class LoginOut(BaseModel):
    token: str
    user: UserOut


def _user_out(user: Organiser) -> UserOut:
    return UserOut(email=user.email, name=user.name, role=user.role)


@router.post("/login")
def login(body: LoginIn, request: Request, session: db.SessionDep) -> LoginOut:
    rate_limit(session, f"login:{client_ip(request)}", limit=10, window_s=60)
    user = session.scalars(select(Organiser).where(Organiser.email == body.email.lower())).first()
    stored_hash = user.password_hash if user else _DUMMY_HASH
    password_ok = verify_password(body.password, stored_hash)
    if user is None or not password_ok:
        # Same message for both cases: never confirm that an email exists.
        raise ApiError(401, "unauthorised", "Email or password is not correct.")
    return LoginOut(token=create_session_token(user.id), user=_user_out(user))


@router.get("/me")
def me(user: CurrentUser) -> UserOut:
    return _user_out(user)
