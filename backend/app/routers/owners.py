"""Restaurant owner account endpoints."""

from typing import Any, Literal

from fastapi import APIRouter, Request
from pydantic import BaseModel, ConfigDict, EmailStr, Field
from sqlalchemy.exc import IntegrityError

from app import db
from app.core.errors import ApiError
from app.core.text import PlainText
from app.events_service import accounts
from app.restaurant_service import owner_accounts, owner_view
from app.security import CurrentOrganiser

router = APIRouter(prefix="/owner", tags=["owners"])


@router.get("/restaurants")
def restaurants(user: CurrentOrganiser, session: db.SessionDep) -> list[dict[str, Any]]:
    return owner_view.restaurants(session, user)


class RegisterIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: PlainText = Field(min_length=1, max_length=120)
    email: EmailStr = Field(max_length=254)
    password: str = Field(min_length=1, max_length=200)
    consent: Literal[True]


class VerifyIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    email: EmailStr = Field(max_length=254)
    code: str = Field(pattern=r"^\d{6}$")
    signup_id: str = Field(min_length=10, max_length=100)


@router.post("/register", status_code=202)
def register(body: RegisterIn, request: Request, session: db.SessionDep) -> dict[str, Any]:
    email = accounts.normalise_email(str(body.email))
    accounts.check_new_password(body.password, email)
    accounts.count_code_send(session, request, email, "owner")
    accounts.count_app_send(session)
    try:
        return owner_accounts.register(session, body.name, email, body.password)
    except IntegrityError:
        session.rollback()
        raise ApiError(409, "conflict", "Please try again.") from None


@router.post("/verify", status_code=201)
def verify(body: VerifyIn, request: Request, session: db.SessionDep) -> dict[str, Any]:
    accounts.count_code_check(session, request)
    return owner_accounts.verify(
        session, accounts.normalise_email(str(body.email)), body.code, body.signup_id
    )
