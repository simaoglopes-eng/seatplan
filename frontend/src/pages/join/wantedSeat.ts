// The seat a visitor picked on the shared link before they had an account.
// We keep its id for this tab only (sessionStorage), keyed by the event's
// live scope, so the seat page can offer it again after sign-up. It is only
// a wish: nothing is held, and the seat page checks it is still free.

function keyFor(scope: string): string {
  return `seatplan.wanted-seat.${scope}`;
}

export function rememberWantedSeat(scope: string, seatId: number): void {
  try {
    window.sessionStorage.setItem(keyFor(scope), String(seatId));
  } catch {
    // Storage blocked: the person simply picks the seat again later.
  }
}

/** The kept seat id, or null. */
export function readWantedSeat(scope: string): number | null {
  try {
    const raw = window.sessionStorage.getItem(keyFor(scope));
    const id = raw === null ? NaN : Number(raw);
    return Number.isInteger(id) ? id : null;
  } catch {
    return null;
  }
}

export function forgetWantedSeat(scope: string): void {
  try {
    window.sessionStorage.removeItem(keyFor(scope));
  } catch {
    // Nothing stored, nothing to forget.
  }
}
