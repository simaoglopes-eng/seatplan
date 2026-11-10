import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { VenueDetail } from "../../api/types";
import { createTable, nudge, replaceSeat, setSeatCount } from "./layoutModel";
import type { VenueLayout } from "./layoutModel";
import { layoutFromVenue, payloadFromLayout } from "./layoutWire";
import { useHistory } from "./useHistory";

const EMPTY: VenueLayout = { zones: [], tables: [] };

describe("layoutModel", () => {
  it("creates a round table centred where asked, with its default chairs around it", () => {
    const table = createTable(EMPTY, "round", { x: 200, y: 200 });
    // Stored like the backend: (x, y) is the top-left corner.
    expect(Math.abs(table.x + table.w / 2 - 200)).toBeLessThanOrEqual(1); // rounded to whole units
    expect(table.label).toBe("1");
    expect(table.seats).toHaveLength(8);
    // Every chair is outside the table top.
    for (const seat of table.seats) {
      expect(Math.hypot(seat.x - 200, seat.y - 200)).toBeGreaterThan(table.w / 2);
    }
  });

  it("keeps seat flags when the seat count changes", () => {
    const table = createTable(EMPTY, "rect", { x: 0, y: 0 });
    const layout = replaceSeat({ zones: [], tables: [table] }, table.seats[0].key, { is_accessible: true });
    const grown = setSeatCount(layout.tables[0], 10);
    expect(grown.seats).toHaveLength(10);
    expect(grown.seats[0].is_accessible).toBe(true);
    expect(grown.seats[0].key).toBe(table.seats[0].key);
  });

  it("moves the chairs together with a nudged table", () => {
    const table = createTable(EMPTY, "row", { x: 100, y: 100 });
    const moved = nudge({ zones: [], tables: [table] }, { kind: "table", key: table.key }, 25, 0).tables[0];
    expect(moved.x).toBe(table.x + 25);
    expect(moved.seats[0].x).toBe(table.seats[0].x + 25);
  });

  it("names theatre rows with letters", () => {
    const first = createTable(EMPTY, "row", { x: 0, y: 0 });
    const second = createTable({ zones: [], tables: [first] }, "row", { x: 0, y: 40 });
    expect([first.label, second.label]).toEqual(["A", "B"]);
  });
});

// A venue exactly as GET /venues/{id} returns it (backend/app/routers/venues.py).
const DETAIL: VenueDetail = {
  public_id: "v1",
  kind: "restaurant",
  name: "Test bistro",
  timezone: "Europe/Lisbon",
  width: 800,
  height: 600,
  zones: [{ id: 3, key: "3", name: "Terrace", kind: "terrace", x: 0, y: 0, w: 300, h: 200 }],
  tables: [
    { id: 7, key: "7", zone_id: 3, label: "1", shape: "round", x: 50, y: 50, w: 60, h: 60, rotation: 0,
      min_party: 2, max_party: 4, is_accessible: false, high_chair_ok: true, combine_group: null },
  ],
  seats: [
    { id: 70, key: "70", table_id: 7, label: "1", x: 80, y: 34, is_accessible: true, is_blocked: false, reserved_tag: null },
    { id: 71, key: "71", table_id: 7, label: "2", x: 80, y: 126, is_accessible: false, is_blocked: true, reserved_tag: "vip" },
  ],
};

describe("layoutWire", () => {
  it("nests seats on load and flattens them again for the PUT body", () => {
    const layout = layoutFromVenue(DETAIL);
    expect(layout.tables[0].zone_key).toBe("3");
    expect(layout.tables[0].seats.map((s) => s.id)).toEqual([70, 71]);
    const payload = payloadFromLayout(layout);
    expect(payload.tables[0]).not.toHaveProperty("seats");
    expect(payload.tables[0]).not.toHaveProperty("zone_id");
    expect(payload.seats.map((s) => [s.key, s.table_key])).toEqual([["70", "7"], ["71", "7"]]);
    expect(payload.seats[1]).toMatchObject({ is_blocked: true, reserved_tag: "vip" });
  });
});

describe("useHistory", () => {
  it("undoes and redoes, and a drag counts as one step", () => {
    const { result } = renderHook(() => useHistory(0));
    act(() => result.current.commit(1));
    act(() => result.current.checkpoint()); // drag starts at 1
    act(() => result.current.replace(2));
    act(() => result.current.replace(3)); // drag ends at 3
    act(() => result.current.undo());
    expect(result.current.present).toBe(1);
    act(() => result.current.undo());
    expect(result.current.present).toBe(0);
    expect(result.current.canUndo).toBe(false);
    act(() => result.current.redo());
    act(() => result.current.redo());
    expect(result.current.present).toBe(3);
    expect(result.current.canRedo).toBe(false);
  });
});
