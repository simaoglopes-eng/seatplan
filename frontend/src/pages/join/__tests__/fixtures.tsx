// Shared test data for the shared-link and guest account pages. Shapes copy
// docs/guest-accounts.md section 6; every person is invented (example.com).
import { useLocation } from "react-router-dom";
import type { AttendeeView } from "../../../api/events";
import type { VisitorView } from "../../../api/guest";
import type { MapSeat, SeatState } from "../../../api/types";

export function seat(id: number, state: SeatState, occupant: string | null = null): MapSeat {
  return { id, table_id: 1, label: String(id - 10), x: 40 * (id - 10), y: 50, state, accessible: false, occupant };
}

const EVENT = {
  name: "Spring Gala",
  starts_at: "2027-03-14T19:30:00Z",
  ends_at: "2027-03-14T23:30:00Z",
  privacy_mode: "first_initial" as const,
  change_deadline: null,
  deadline_passed: false,
  live_scope: "event-spring",
};

const MAP = {
  width: 300,
  height: 120,
  zones: [],
  tables: [{ id: 1, label: "T1", shape: "rect" as const, x: 20, y: 30, w: 180, h: 40, rotation: 0 }],
};

/** Seat 11 and 15 are free, 12 is taken by Maya, 13 is held, 14 is not available. */
export function visitorView(join: VisitorView["join"] = { open: true, places_left: 3, reason: null }): VisitorView {
  return {
    event: { ...EVENT },
    venue: { name: "Quinta da Luz" },
    map: { ...MAP, seats: [seat(11, "free"), seat(12, "taken", "Maya R."), seat(13, "held"), seat(14, "blocked"), seat(15, "free")] },
    join,
  };
}

/** What /guest/events/{eid} answers for a self-registered guest with no seat yet. */
export function accountView(): AttendeeView {
  return {
    venue: { name: "Quinta da Luz" },
    event: { ...EVENT },
    me: {
      id: 7,
      name: "Nina Lopes",
      shown_to_others_as: "Nina L.",
      rsvp: "yes",
      wants_anonymous: false,
      needs_accessible: false,
      seat_id: null,
      held_seat_id: null,
      held_until: null,
      knows: [],
    },
    map: { ...MAP, seats: [seat(11, "free"), seat(12, "taken", "Maya R."), seat(15, "free")] },
    people: [],
  };
}

/** Shows where the router went, and the notice it carried, so tests can read both. */
export function WhereAmI() {
  const location = useLocation();
  const notice = (location.state as { notice?: string } | null)?.notice ?? "";
  return (
    <p data-testid="where">
      {location.pathname}
      {location.search}
      {notice ? ` | ${notice}` : ""}
    </p>
  );
}
