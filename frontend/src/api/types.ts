// TypeScript mirror of the shapes in docs/CONTRACT.md.
// Colleagues import from here instead of writing their own copies, so a
// change to the contract is a change in one file.
//
// Field names stay snake_case, exactly as the Python backend sends them,
// so nothing needs converting and a walkthrough can compare both sides 1:1.
// Venue, layout and demo shapes copy backend/app/routers. The seat map shapes
// (MapSeat, MapTable) are a frontend proposal recorded in docs/decisions-log.md.

// ---------- Errors (contract section 5) ----------

/** Error codes the backend may send, plus two that only the client creates. */
export type ErrorCode =
  | "not_found"
  | "validation"
  | "unauthorised"
  | "forbidden"
  | "seat_taken"
  | "hold_expired"
  | "deadline_passed"
  | "rate_limited"
  | "conflict"
  | "method_not_allowed" // HTTP 405
  | "internal" // HTTP 500, or a status the API never plans to send
  | "network" // client only: the request never reached the server
  | "unknown"; // client only: the server answered in an unexpected shape

export interface ApiErrorBody {
  error: { code: ErrorCode; message: string };
}

// ---------- Seat map ----------

/** States the server returns for each seat (contract section 5). */
export type SeatState = "free" | "held" | "taken" | "mine" | "friend" | "blocked";

export const SEAT_STATES: readonly SeatState[] = ["free", "held", "taken", "mine", "friend", "blocked"];

export type TableShape = "round" | "rect" | "row";

export type ZoneKind = "general" | "window" | "terrace" | "bar" | "quiet" | "vip" | "accessible" | "stage";

export type ReservedTag = "vip" | "family" | "speaker";

/**
 * A table as drawn on a map. Same geometry as the backend (models.py): (x, y)
 * is the TOP-LEFT corner of the unrotated box, and rotation (degrees) turns the
 * box around its centre. Coordinates are venue units (about 1 px at 100% zoom).
 * In restaurant maps `state` describes the whole table for the chosen slot.
 */
export interface MapTable {
  id: number;
  label: string;
  shape: TableShape;
  x: number;
  y: number;
  w: number;
  h: number;
  rotation: number;
  zone_id?: number | null;
  state?: SeatState;
  accessible?: boolean;
}

/** A seat as drawn on a map. (x, y) is the seat centre in venue coordinates. */
export interface MapSeat {
  id: number;
  table_id: number;
  label: string;
  x: number;
  y: number;
  state: SeatState;
  accessible: boolean;
  /** Display name already filtered by core/privacy.py, for example "Ana P.". */
  occupant?: string | null;
}

export interface MapZone {
  id: number;
  name: string;
  kind: ZoneKind;
  x: number;
  y: number;
  w: number;
  h: number;
}

/** What any map endpoint returns: enough to draw the floor. */
export interface SeatMapPayload {
  width: number;
  height: number;
  zones: MapZone[];
  tables: MapTable[];
  seats: MapSeat[];
}

// ---------- Core endpoints ----------

export interface HealthResponse {
  status: string;
  database: string;
  version: string;
  time: string;
}

export type UserRole = "organiser" | "staff";

export interface User {
  email: string;
  name: string;
  role: UserRole;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  token: string;
  user: User;
}

export type VenueKind = "event" | "restaurant";

export interface Venue {
  public_id: string;
  kind: VenueKind;
  name: string;
  timezone: string;
  width: number;
  height: number;
}

export interface CreateVenueRequest {
  kind: VenueKind;
  name: string;
  timezone: string;
  width: number;
  height: number;
}

// ---------- Venue detail and layout ----------
// Mirrors backend/app/routers/venues.py exactly. GET returns every column of
// each row plus `key` (the id as text). PUT takes flat lists that link by key:
// a table points at its zone with `zone_key`, a seat at its table with
// `table_key`. New items have `id: null`; the backend rejects unknown fields.

export interface ZoneRow {
  id: number;
  key: string;
  name: string;
  kind: ZoneKind;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface TableRow {
  id: number;
  key: string;
  zone_id: number | null;
  label: string;
  shape: TableShape;
  /** Top-left corner of the unrotated box; rotation turns it around its centre. */
  x: number;
  y: number;
  w: number;
  h: number;
  rotation: number;
  min_party: number;
  max_party: number;
  is_accessible: boolean;
  high_chair_ok: boolean;
  combine_group: string | null;
}

export interface SeatRow {
  id: number;
  key: string;
  table_id: number;
  label: string;
  x: number;
  y: number;
  is_accessible: boolean;
  is_blocked: boolean;
  reserved_tag: ReservedTag | null;
}

/** GET /venues/{venue_public_id} and the answer to PUT .../layout. */
export interface VenueDetail extends Venue {
  zones: ZoneRow[];
  tables: TableRow[];
  seats: SeatRow[];
}

export interface ZoneIn {
  id: number | null;
  key: string;
  name: string;
  kind: ZoneKind;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface TableIn extends Omit<TableRow, "id" | "zone_id"> {
  id: number | null;
  zone_key: string | null;
}

export interface SeatIn extends Omit<SeatRow, "id" | "table_id"> {
  id: number | null;
  table_key: string;
}

/** Body of PUT /venues/{venue_public_id}/layout. */
export interface LayoutPayload {
  zones: ZoneIn[];
  tables: TableIn[];
  seats: SeatIn[];
}

// ---------- Demo and live ----------

/**
 * GET /demo/links and POST /demo/reset: entry points by name, for example
 * {"attendee_ana": "/e/<token>", "staff": "/staff/<venue>"}.
 */
export interface DemoLinksResponse {
  links: Record<string, string>;
}

export interface LiveVersion {
  version: number;
}
