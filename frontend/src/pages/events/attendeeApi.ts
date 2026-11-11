// One shape for "the attendee's calls", whoever the attendee is.
//
// An invited guest proves who they are with the personal link (/a/{token}).
// A guest account holder proves it with their session (/guest/events/{eid}).
// The server answers both in exactly the same way, so the attendee screens
// take an AttendeeApi and never need to know which kind of guest is using them.
import * as eventsApi from "../../api/events";
import type { AttendeeView, HoldResponse, SeatRecommendation, VisiblePerson } from "../../api/events";
import * as guestApi from "../../api/guest";

export interface AttendeeApi {
  view(): Promise<AttendeeView>;
  recommendations(): Promise<SeatRecommendation[]>;
  people(q: string): Promise<VisiblePerson[]>;
  rsvp(answer: "yes" | "no"): Promise<unknown>;
  knows(ids: number[]): Promise<unknown>;
  privacy(wantsAnonymous: boolean): Promise<unknown>;
  hold(seatId: number): Promise<HoldResponse>;
  confirm(seatId: number): Promise<unknown>;
  release(): Promise<unknown>;
}

/** Today's calls with a personal link: /a/{token}/... */
export function linkApi(token: string): AttendeeApi {
  return {
    view: () => eventsApi.getAttendeeView(token),
    recommendations: () => eventsApi.getRecommendations(token),
    people: (q) => eventsApi.getPeople(token, q),
    rsvp: (answer) => eventsApi.sendRsvp(token, answer),
    knows: (ids) => eventsApi.sendKnows(token, ids),
    privacy: (value) => eventsApi.sendPrivacy(token, value),
    hold: (seatId) => eventsApi.holdSeat(token, seatId),
    confirm: (seatId) => eventsApi.confirmSeat(token, seatId),
    release: () => eventsApi.releaseSeat(token),
  };
}

/** A guest account holder's calls: /guest/events/{eid}/..., with the guest session. */
export function accountApi(eventId: string): AttendeeApi {
  return {
    view: () => guestApi.getAccountView(eventId),
    recommendations: () => guestApi.getAccountRecommendations(eventId),
    people: (q) => guestApi.getAccountPeople(eventId, q),
    rsvp: (answer) => guestApi.sendAccountRsvp(eventId, answer),
    knows: (ids) => guestApi.sendAccountKnows(eventId, ids),
    privacy: (value) => guestApi.sendAccountPrivacy(eventId, value),
    hold: (seatId) => guestApi.holdAccountSeat(eventId, seatId),
    confirm: (seatId) => guestApi.confirmAccountSeat(eventId, seatId),
    release: () => guestApi.releaseAccountSeat(eventId),
  };
}
