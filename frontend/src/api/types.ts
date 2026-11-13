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
  | "stale_layout" // HTTP 409: the room layout was saved elsewhere since it was opened
  | "event_full" // HTTP 409: no place left for one more guest (docs/guest-accounts.md)
  | "link_closed" // HTTP 403: the shared link is valid but switched off
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
  /** Restaurant map only (room editor): which room, whether it is on, and what it is like. */
  room_id?: number | null;
  is_active?: boolean;
  ambience?: MapTableAmbience | null;
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

// ---------- Rooms and ambience (restaurant map, spec 7.6 and 9.3) ----------

export type RoomLight = "night" | "sun" | "sunset" | "shade" | "daylight" | "interior";

export interface MapOutlinePoint {
  x: number;
  y: number;
  /** Sagitta of the side that starts at this point, in cm; 0 is straight. */
  curve: number;
}

export interface MapRoomOpening {
  id: number;
  side: number;
  offset: number;
  width: number;
  kind: "window" | "door" | "glass_wall";
  is_main_entrance: boolean;
  view_text: string;
  view_tags: string[];
  night_view_text: string;
  view_photo_url: string;
}

export interface MapRoomFixture {
  id: number;
  kind: string;
  shape: "rect" | "circle";
  x: number;
  y: number;
  w: number;
  h: number;
  rotation: number;
  label: string;
}

export interface MapRoomSun {
  sunrise: string | null;
  sunset: string | null;
  azimuth: number;
  altitude: number;
}

/** One room as a diner sees it. `id` is null for the implicit room of a restaurant that never saved one. */
export interface MapRoom {
  id: number | null;
  name: string;
  is_outdoor: boolean;
  north_deg: number | null;
  outline: { points: MapOutlinePoint[] };
  width: number;
  height: number;
  openings: MapRoomOpening[];
  fixtures: MapRoomFixture[];
  sun: MapRoomSun | null;
  /** Floor areas in direct sun, in cm; the map clips them to the outline. */
  sun_patches: { x: number; y: number }[][];
  night: boolean;
}

export interface MapTableView {
  text: string;
  tags: string[];
  night_text: string;
  photo_url: string;
  distance_cm: number;
}

/** What a table is like for the stay (spec 7.5). Times are "HH:MM". */
export interface MapTableAmbience {
  light: RoomLight;
  phrases: string[];
  sun_minutes: number;
  sun_until: string | null;
  sun_from: string | null;
  sunset_at: string | null;
  dark_at: string | null;
  view: MapTableView | null;
  near: string[];
  quiet: boolean;
  features: string[];
}

/** What any map endpoint returns: enough to draw the floor. */
export interface SeatMapPayload {
  width: number;
  height: number;
  zones: MapZone[];
  tables: MapTable[];
  seats: MapSeat[];
  /** Restaurant map only: the rooms with their walls, windows, sun and night. */
  rooms?: MapRoom[];
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
