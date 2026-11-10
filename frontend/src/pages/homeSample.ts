// A small, fixed sample floor for the home page, so visitors can try the
// map before opening the demo. It never talks to the server.
import type { MapSeat, MapTable, SeatState, TableShape } from "../api/types";
import { seatPositions, sizeFor } from "../seatmap/seatPositions";

interface SampleTable {
  id: number;
  label: string;
  shape: TableShape;
  /** Centre of the table; converted to the top-left corner below. */
  cx: number;
  cy: number;
  rotation: number;
  /** One state per seat, in seat order. */
  states: SeatState[];
  /** Seat numbers (1-based) with the accessible flag. */
  accessible: number[];
}

const SAMPLE: SampleTable[] = [
  { id: 1, label: "1", shape: "round", cx: 110, cy: 110, rotation: 0, states: ["taken", "free", "friend", "taken", "free", "held", "free", "taken"], accessible: [5] },
  { id: 2, label: "2", shape: "round", cx: 300, cy: 110, rotation: 0, states: ["free", "free", "taken", "taken", "free", "free"], accessible: [] },
  { id: 3, label: "3", shape: "rect", cx: 205, cy: 270, rotation: 0, states: ["blocked", "free", "free", "taken", "free", "friend", "free", "free"], accessible: [8] },
];

/** Seat ids are table id * 100 + seat number, which keeps them readable and unique. */
export function buildSampleFloor(): { tables: MapTable[]; seats: MapSeat[] } {
  const tables: MapTable[] = [];
  const seats: MapSeat[] = [];
  for (const t of SAMPLE) {
    const size = sizeFor(t.shape, t.states.length);
    const x = t.cx - size.w / 2;
    const y = t.cy - size.h / 2;
    const table: MapTable = { id: t.id, label: t.label, shape: t.shape, x, y, rotation: t.rotation, ...size };
    tables.push(table);
    seatPositions(table, t.states.length).forEach((p, i) => {
      seats.push({
        id: t.id * 100 + i + 1,
        table_id: t.id,
        label: String(i + 1),
        x: p.x,
        y: p.y,
        state: t.states[i],
        accessible: t.accessible.includes(i + 1),
        occupant: t.states[i] === "friend" ? "Maya R." : null,
      });
    });
  }
  return { tables, seats };
}

/** The sample's "recommended" seats: next to the friends. */
export const SAMPLE_RECOMMENDED: ReadonlySet<number> = new Set([102, 307]);
