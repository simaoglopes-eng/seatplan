// Step 3: the seat map. Order on a phone, top to bottom: any notice, the
// recommendations, the map, the seat you are looking at, the legend, your
// privacy switch, and a sticky bar with the countdown and Confirm.
import { useMemo, useRef } from "react";
import type { AttendeeView, SeatRecommendation } from "../../api/events";
import { Button, Legend } from "../../design/components";
import { SeatMap } from "../../seatmap/SeatMap";
import { AnonymousSwitch } from "./AnonymousSwitch";
import { seatName } from "./format";
import { seatsNextToFriends } from "./friendSeats";
import { HoldBar } from "./HoldBar";
import { RecommendationStrip } from "./RecommendationStrip";
import { SeatNotice } from "./SeatNotice";
import { StepTitle } from "./StepTitle";
import type { AttendeeState } from "./useAttendee";

interface SeatStepProps {
  state: AttendeeState;
  view: AttendeeView;
  moved: boolean;
}

export function SeatStep({ state, view, moved }: SeatStepProps) {
  const { map, me } = view;
  const { hold, lookingAt, notice, busy, actions } = state;
  const mapRef = useRef<HTMLDivElement>(null);
  const nearFriends = useMemo(() => seatsNextToFriends(map.seats), [map.seats]);
  // The brass halo marks every seat worth a look: the optimiser's picks near people
  // you know, and free seats next to friends. A pick with no match is not "good" for you.
  const highlight = useMemo(() => {
    const matches = (state.recs ?? []).filter((r) => r.match !== "none").map((r) => r.seat_id);
    return new Set([...matches, ...nearFriends]);
  }, [state.recs, nearFriends]);
  const name = (id: number) => seatName(id, map.seats, map.tables);

  const showOnMap = (seatId: number): void => {
    actions.focusSeat(seatId);
    // Optional call: older browsers and the test DOM have no scrollIntoView.
    mapRef.current?.scrollIntoView?.({ block: "center" });
  };

  return (
    <section className="ev-seat-step" aria-labelledby="ev-seat">
      <StepTitle id="ev-seat" focusOnMount={moved}>
        {state.changingSeat ? "Choose a new seat" : "Choose your seat"}
      </StepTitle>
      <p>Tap a free seat to hold it for 5 minutes, then confirm. Seats with a dashed halo are good matches for you.</p>
      {notice && (
        <SeatNotice notice={notice} seats={map.seats} tables={map.tables} busy={busy === "hold"} onHold={actions.hold} onDismiss={actions.dismissNotice} />
      )}
      <h3 className="ev-subtitle">Recommended for you</h3>
      <RecommendationStrip recs={state.recs} failed={state.recsFailed} seats={map.seats} tables={map.tables} focusedId={lookingAt} onFocus={showOnMap} />
      <div ref={mapRef} className="ev-map">
        <SeatMap
          label={`Seat map, ${view.event.name}`}
          zones={map.zones}
          tables={map.tables}
          seats={map.seats}
          selectedId={hold?.seat_id ?? lookingAt}
          highlight={highlight}
          // My own hold, also one restored after a reload, is never read out as someone else's.
          ownId={hold?.seat_id ?? null}
          // "Show on map" zooms in on the seat, so it is big enough to tap on a phone.
          focusId={lookingAt}
          onSelect={actions.hold}
        />
      </div>
      {lookingAt !== null && lookingAt !== hold?.seat_id && (
        <FocusedSeat label={name(lookingAt)} rec={state.recs?.find((r) => r.seat_id === lookingAt)} busy={busy === "hold"} onHold={() => actions.hold(lookingAt)} />
      )}
      <NearFriends ids={nearFriends} name={name} onShow={showOnMap} />
      <h3 className="ev-subtitle">What the symbols mean</h3>
      <Legend states={["free", "friend", "held", "taken", "mine", "blocked"]} showAccessible showRecommended />
      <AnonymousSwitch value={me.wants_anonymous} busy={busy === "privacy"} onChange={actions.setAnonymous} />
      {state.changingSeat && (
        <Button variant="ghost" onClick={actions.cancelChange}>
          Keep my current seat
        </Button>
      )}
      {hold && <HoldBar seatLabel={name(hold.seat_id)} secondsLeft={state.secondsLeft} busy={busy === "confirm"} onConfirm={actions.confirm} />}
    </section>
  );
}

interface FocusedSeatProps {
  label: string;
  rec: SeatRecommendation | undefined;
  busy: boolean;
  onHold: () => void;
}

/** The seat picked from the recommendations, with its reasons and a Hold button. */
function FocusedSeat({ label, rec, busy, onHold }: FocusedSeatProps) {
  return (
    <div className="ev-focused" aria-live="polite">
      <p className="ev-focused-name">
        <strong>{label}</strong>
      </p>
      {rec && rec.reasons.length > 0 && <p className="ev-muted">{rec.reasons.join(". ")}.</p>}
      <Button busy={busy} onClick={onHold}>
        Hold this seat for 5 minutes
      </Button>
    </div>
  );
}

interface NearFriendsProps {
  ids: Set<number>;
  name: (id: number) => string;
  onShow: (id: number) => void;
}

/** Words, not only a halo: the free seats next to people you know, as buttons. */
function NearFriends({ ids, name, onShow }: NearFriendsProps) {
  if (ids.size === 0) return null;
  return (
    <div className="ev-near">
      <h3 className="ev-subtitle">Free next to someone you know</h3>
      <ul className="ev-chips">
        {Array.from(ids).map((id) => (
          <li key={id}>
            <button type="button" className="ev-chip" onClick={() => onShow(id)}>
              {name(id)}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
