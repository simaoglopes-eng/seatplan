# Guest accounts: READ ME FIRST

## Purpose

The signed-in area for guests who made an account through a shared link
(`docs/guest-accounts.md`, sections 7, 10 and 11). One account can belong to
several events. Guests with only a personal link (`/e/:token`) never need it.

| Route | Page |
|---|---|
| `/my` | `MyEventsPage.tsx`: one card per event, the seat in words |
| `/my/sign-in` | `GuestSignInPage.tsx`: signs in, then follows `?next=` (only `/my/` pages) |
| `/my/forgot`, `/my/reset` | `ForgotPage.tsx`, `ResetPage.tsx`: reset code by email, new password |
| `/my/account` | `AccountPage.tsx`: details, privacy text, delete the account |
| `/my/:eventId` | `MySeatPage.tsx`: the attendee journey through `accountApi` |

`App.tsx` lists `/my/account`, `/my/sign-in`, `/my/forgot` and `/my/reset`
before `/my/:eventId`, so "account" is never read as an event id.

## Key files

| File | Job |
|---|---|
| `useGuestSession.ts` | `useRequireGuest` (no token: go to sign-in and come back), `useSessionExpired` (401: the same), `useSignOut`, `useMyAccount` (`GET /guest/me`) |
| `safeNext.ts` | `safeNext()` refuses anything that is not a plain `/my/` page (`//`, `:`, `\`), so `?next=` cannot send people to another site |
| `MySeatPage.tsx` | Reuses `AttendeeJourney` from `pages/events/AttendeePage.tsx` with `accountApi(eventId)`; adds the account bar, the seat picked as a visitor, and the email sentence on the Done step |
| `SignInForm.tsx` | One sign-in form for `/my/sign-in` and `/j/:token/sign-in`; one message for every failure ("Email or password is not correct.") |
| `FormProblem.tsx` | The focused problem box, `splitFieldMessage` (puts "password: ..." next to the password field), small checks |
| `AccountBar.tsx`, `PasswordToggle.tsx`, `PrivacyText.tsx` | Small shared parts; `PrivacyText` is the one copy of the privacy text (section 11.2) |
| `account.css` | One-column layout, 44 px targets, the problem box and the account bar |

## Data flow

```
sessionStorage["seatplan.guest-session"] <-- guestLogin / verifyCode / resetPassword (api/guest.ts)
        |
        v  auth "guest" on every /guest/... call (api/client.ts)
/my/:eventId -> accountApi(eventId) -> useAttendee -> the same steps as /e/:token
        |
        401 anywhere -> client.ts forgets the token -> useSessionExpired -> /my/sign-in?next=/my/:eventId
```

## Three likely walkthrough questions

**Why is the guest token stored apart from the organiser token?**
They are different kinds of session with different rights. A separate key
(`seatplan.guest-session`) and an explicit `auth` argument on every call mean
a guest page can never send the organiser's token, and the other way round.

**What happens when someone deletes their account?**
`POST /guest/me/delete` with the password. The server frees their seats and
wipes their emails; the page forgets the token and shows "Your account is
deleted." A wrong password answers 422 `validation` ("password: That
password is not correct."), shown under the password field; the session
stays. Only a 401 means the session itself is over.

**How does the seat page know which seat the visitor wanted?**
The shared-link page wrote its id to sessionStorage (`pages/join/wantedSeat.ts`).
After the first load the seat page reads it once, forgets it, and selects it
only if it is still free and the person has no seat or hold yet.
