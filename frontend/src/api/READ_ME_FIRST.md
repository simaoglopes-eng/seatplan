# frontend/src/api: read me first

## Purpose

Everything that talks to the backend. Pages never call `fetch` themselves:
they call a typed function from this folder, so the address, the session
header and the error handling live in one place.

## Key files

| File | What it holds |
|---|---|
| `types.ts` | Shapes shared by every page (error codes, seat states, map, venue, layout), copied from `docs/CONTRACT.md` with the backend's snake_case names |
| `client.ts` | `request()` and `api.get/post/put/patch/delete`; `ApiError` (status, `code`, message); the session token in `sessionStorage`; `API_BASE` (`/api`) |
| `events.ts` | Typed calls for the attendee (`/a/{token}`) and organiser (`/events/...`) endpoints, plus CSV import and export (`csvFetch`, which keeps the server's error code like `request()` does) |
| `restaurant.ts` | Typed calls for diners, manage links and staff. `Server...` types copy the backend; `to...()` functions turn them into the shapes the screens use |
| `useLive.ts` | Live updates for one scope: the server-sent event stream first, polling `GET /live/{scope}/version` every 2 s when the stream fails or is refused |

## Data flow

```
page -> getSlots(vid, date, party)            (restaurant.ts)
     -> api.get("/r/{vid}/slots?...")          (client.ts: adds the session, parses JSON)
     -> 200: typed data, converted by toSlots()
     -> 4xx/5xx: throws ApiError(status, code, message) from the server's {"error": {...}}
     -> no answer: throws ApiError(0, "network", ...)
```

## Three likely walkthrough questions

**Why is there one `ApiError` instead of checking `response.ok` on every page?**
A page only has to catch one type and read `error.code` (`seat_taken`,
`hold_expired`, `rate_limited`, ...). The codes are the list in contract
section 5, plus `network` and `unknown`, which only the browser creates.

**Why is the login token in `sessionStorage` and not `localStorage`?**
It disappears when the tab closes, so a shared computer does not stay signed
in. It is sent as `Authorization: Bearer <token>`, never as a cookie, so other
sites cannot make the browser send it for them.

**How does a page learn that someone else took a seat?**
`useLive(scope, reload)` listens for a new version number of the scope (one
event, or one restaurant day). The number carries no data: on a change the
page fetches the map again, so it always shows what the database says.
