// Friendly messages for the moments when a seat slips away: someone else took
// it, the 5-minute hold ran out, the deadline passed, or a request failed.
// Each one says what happened, that it is not the person's fault, and what to
// do next, with the next step as a button.
import type { ReactNode } from "react";
import type { MapSeat, MapTable } from "../../api/types";
import { Button } from "../../design/components";
import { seatName } from "./format";
import type { Notice } from "./useAttendee";

interface SeatNoticeProps {
  notice: Notice;
  seats: MapSeat[];
  tables: MapTable[];
  busy: boolean;
  onHold: (seatId: number) => void;
  onDismiss: () => void;
}

export function SeatNotice({ notice, seats, tables, busy, onHold, onDismiss }: SeatNoticeProps) {
  const name = (id: number) => seatName(id, seats, tables);
  if (notice.kind === "conflict") {
    const next = notice.suggestion;
    return (
      <NoticeBox title="That seat was just taken" onDismiss={onDismiss}>
        <p>Someone else chose {name(notice.seatId)} a moment before you. Sorry about that.</p>
        {next ? (
          <>
            <p>
              The next best seat for you is <strong>{name(next.seat_id)}</strong>
              {next.reasons.length > 0 && <>: {next.reasons.join(", ")}</>}.
            </p>
            <Button busy={busy} onClick={() => onHold(next.seat_id)}>
              Hold {name(next.seat_id)}
            </Button>
          </>
        ) : (
          <p>Pick any free seat on the map below.</p>
        )}
      </NoticeBox>
    );
  }
  if (notice.kind === "expired") {
    return (
      <NoticeBox title="Your 5 minutes ran out" onDismiss={onDismiss}>
        <p>We kept {name(notice.seatId)} for you for 5 minutes, then let others choose it again. It may still be free.</p>
        <Button busy={busy} onClick={() => onHold(notice.seatId)}>
          Hold it again
        </Button>
      </NoticeBox>
    );
  }
  if (notice.kind === "deadline") {
    return (
      <NoticeBox title="Seat changes are closed" onDismiss={onDismiss}>
        <p>The organiser's deadline has passed, so seats can no longer be changed. Reply to your invitation email if you need help.</p>
      </NoticeBox>
    );
  }
  return (
    <NoticeBox title="That did not work" onDismiss={onDismiss}>
      <p>{notice.message}</p>
    </NoticeBox>
  );
}

function NoticeBox({ title, children, onDismiss }: { title: string; children: ReactNode; onDismiss: () => void }) {
  return (
    <div className="ev-notice" role="alert">
      <svg className="ev-notice-icon" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 3L22 20H2Z" />
        <path d="M12 10v4M12 17v.5" />
      </svg>
      <div className="ev-notice-body">
        <h3 className="ev-notice-title">{title}</h3>
        {children}
      </div>
      <button type="button" className="ev-notice-close" onClick={onDismiss} aria-label="Dismiss message">
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <path d="M4 4l8 8M12 4l-8 8" />
        </svg>
      </button>
    </div>
  );
}
