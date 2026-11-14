// The memory of the booking flow: the answers so far and which step is on
// screen. Kept apart from BookingPage so the page only draws, and this file
// only decides.
import { useCallback, useState } from "react";
import { releaseHold } from "../../api/restaurant";
import type { BookingConfirmation, ContactDetails, PartyNeeds, RestaurantInfo } from "../../api/restaurant";
import { todayIso } from "./format";
import { useSecondsLeft } from "./HoldCountdown";
import type { Hold } from "./StepTable";

/** Step numbers, in order. */
export const STEP = { party: 0, time: 1, table: 2, details: 3, done: 4 } as const;

const NO_CONTACT: ContactDetails = { name: "", email: "", phone: "", notes: "" };

/** Answers carried in the link, as in a waitlist offer email: /r/<id>?date=...&party=... */
export interface LinkAnswers {
  date: string | null;
  party: string | null;
  /** From the discovery page: a free time the diner already picked, "20:15". */
  time?: string | null;
}

/** The first answers: from the link when they make sense, otherwise today and 2 people. */
export function startNeeds(info: RestaurantInfo, link: LinkAnswers, today: string = todayIso()): PartyNeeds {
  // ISO dates compare correctly as text, so a past date in an old link is ignored.
  const date = link.date && /^\d{4}-\d{2}-\d{2}$/.test(link.date) && link.date >= today ? link.date : today;
  const asked = Number(link.party);
  const party = Number.isInteger(asked) && asked >= 1 && asked <= info.max_party ? asked : Math.min(2, info.max_party);
  return { date, party, needs_accessible: false, high_chairs: 0 };
}

/**
 * Gives a hold back so the table is free for other diners at once, instead of
 * blocking it for the rest of its 5 minutes. A failure is harmless (the hold
 * may already have ended, and it ends by itself anyway), so it is ignored and
 * this promise never rejects.
 */
export async function releaseQuietly(venueId: string, hold: Hold | null): Promise<void> {
  if (!hold) return;
  try {
    await releaseHold(venueId, hold.holdId);
  } catch {
    // Nothing to do: the server lets the hold expire on its own.
  }
}

export function useBookingFlow(info: RestaurantInfo, link: LinkAnswers = { date: null, party: null }) {
  const [step, setStep] = useState<number>(STEP.party);
  const [needs, setNeeds] = useState<PartyNeeds>(() => startNeeds(info, link));
  const [time, setTime] = useState<string | null>(null);
  const [hold, setHoldState] = useState<Hold | null>(null);
  const [contact, setContact] = useState<ContactDetails>(NO_CONTACT);
  const [confirmation, setConfirmation] = useState<BookingConfirmation | null>(null);
  const [carriedNotice, setCarriedNotice] = useState<string | null>(null);
  // The optional chair (spec 9.4) is asked inside the Table step, once a table is held.
  const [choosingSeat, setChoosingSeat] = useState(false);
  const [seatId, setSeatId] = useState<number | null>(null);
  const [seatLabel, setSeatLabel] = useState<string | null>(null);
  // Stable function: StepTable calls it from inside an effect. A new hold is a new table: the old chair no longer applies.
  const setHold = useCallback((next: Hold | null) => {
    setHoldState(next);
    setSeatId(null);
    setSeatLabel(null);
  }, []);
  const secondsLeft = useSecondsLeft(hold?.expiresAt ?? null);

  const go = (next: number): void => {
    if (next < STEP.table) {
      // A new time or party needs a new table: give the old one back now.
      void releaseQuietly(info.public_id, hold);
      setHold(null);
    }
    if (next !== STEP.table) setCarriedNotice(null);
    setChoosingSeat(false);
    setStep(next);
  };
  const askSeat = (): void => setChoosingSeat(true);
  const backToMap = (): void => setChoosingSeat(false);
  /** The chair step is over, with a chair or without: on to the details. */
  const chooseSeat = (chosen: number | null, label: string | null = null): void => {
    setSeatId(chosen);
    setSeatLabel(chosen === null ? null : label);
    // The chair is asked from the form beside the map: go back to it, so the diner can confirm there.
    setChoosingSeat(false);
  };
  /** The diner takes the chair request back: the booking stays on the table alone. */
  const clearSeat = (): void => {
    setSeatId(null);
    setSeatLabel(null);
  };
  const pickTime = (picked: string): void => {
    setTime(picked);
    go(STEP.table);
  };
  /** The hold ended while the diner typed: back to the map, with a message saying so. */
  const holdLost = (message: string): void => {
    setHold(null);
    setCarriedNotice(message);
    setChoosingSeat(false);
    setStep(STEP.table);
  };
  const booked = (result: BookingConfirmation): void => {
    setConfirmation(result);
    setHold(null);
    setStep(STEP.done);
  };

  return {
    step,
    needs,
    setNeeds,
    time,
    hold,
    setHold,
    secondsLeft,
    contact,
    setContact,
    confirmation,
    carriedNotice,
    choosingSeat,
    seatId,
    seatLabel,
    clearSeat,
    go,
    pickTime,
    holdLost,
    booked,
    askSeat,
    backToMap,
    chooseSeat,
  };
}
