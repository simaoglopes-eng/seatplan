// The organiser's map: the real plan, or a scenario preview drawn over it.
// Guests can be dropped on a seat (mouse), or placed with "Place" then a
// seat (keyboard and touch). During a preview the map is look-only, so a
// stray click cannot mix the preview with real moves. Seats the preview
// changes get a square outline (`marked`), not the attendee's round
// "recommended" halo, and real names are written under the seats.
import { useMemo } from "react";
import type { DragEvent } from "react";
import type { OrganiserEvent } from "../../api/events";
import { Legend } from "../../design/components";
import { SeatMap } from "../../seatmap/SeatMap";
import { changedSeats, previewSeats, seatIdFromElement } from "./planPreview";
import { pickSeat } from "./seatPick";
import type { OrganiserState } from "./useOrganiser";

const NO_MARKS: ReadonlySet<number> = new Set();
const CHANGED_LABEL = "changed by preview";

export function OrganiserMap({ org, data }: { org: OrganiserState; data: OrganiserEvent }) {
  const { map } = data;
  const preview = org.preview;
  const seats = useMemo(() => (preview ? previewSeats(map.seats, data.guests, preview) : map.seats), [preview, map.seats, data.guests]);
  const changed = useMemo(() => (preview ? changedSeats(preview, data.guests) : NO_MARKS), [preview, data.guests]);
  const blocked = useMemo(() => new Set(map.seats.filter((s) => s.state === "blocked").map((s) => s.id)), [map.seats]);
  const selectedSeat = data.guests.find((g) => g.id === org.selectedGuest)?.seat_id ?? null;

  const selectable = (seatId: number): boolean => preview === null && !blocked.has(seatId);
  const onSelect = (seatId: number): void => void pickSeat(org, data, seatId, org.selectedGuest);

  const onDrop = (event: DragEvent<HTMLDivElement>): void => {
    event.preventDefault();
    const guestId = Number(event.dataTransfer.getData("text/plain"));
    const seatId = seatIdFromElement(document.elementFromPoint(event.clientX, event.clientY));
    if (!guestId || seatId === null || !selectable(seatId)) {
      org.announce("Drop the guest exactly on a seat. You can also press Place, then choose a seat.");
      return;
    }
    org.setSelectedGuest(guestId);
    void pickSeat(org, data, seatId, guestId);
  };

  return (
    <div className="ev-org-map" ref={org.mapRef}>
      {preview && (
        <p className="ev-preview-banner">
          <strong>Preview, not applied.</strong> Seats with a square outline are new or changed. Apply or discard it in
          the Optimise tab.
        </p>
      )}
      <div className="ev-map" onDragOver={(e) => e.preventDefault()} onDrop={onDrop}>
        <SeatMap
          label={`Seating plan, ${data.event.name}`}
          zones={map.zones}
          tables={map.tables}
          seats={seats}
          selectable={selectable}
          selectedId={selectedSeat}
          marked={changed}
          markedLabel={CHANGED_LABEL}
          showOccupants
          onSelect={onSelect}
        />
      </div>
      <Legend states={["free", "taken", "held", "blocked"]} showAccessible showRecommended={false} markedLabel={preview ? "Changed by this preview" : undefined} />
    </div>
  );
}
