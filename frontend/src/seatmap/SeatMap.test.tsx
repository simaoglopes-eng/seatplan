import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { MapSeat, MapTable, SeatState } from "../api/types";
import { findSeat } from "./describe";
import { SeatMap } from "./SeatMap";

// A tiny in-file floor: table 4 with a row of six seats, one per state.
// Seats sit 30 units apart on one line, so "right" and "left" are unambiguous.
const TABLE: MapTable = { id: 4, label: "4", shape: "rect", x: 105, y: 60, w: 200, h: 40, rotation: 0 };
const STATES: SeatState[] = ["free", "held", "taken", "mine", "friend", "blocked"];

function makeSeats(overrides: Partial<Record<number, Partial<MapSeat>>> = {}): MapSeat[] {
  return STATES.map((state, i) => ({
    id: i + 1,
    table_id: 4,
    label: String(i + 1),
    x: 30 + i * 30,
    y: 100,
    state,
    accessible: false,
    occupant: null,
    ...overrides[i + 1],
  }));
}

function option(name: RegExp | string): HTMLElement {
  return screen.getByRole("option", { name });
}

describe("SeatMap glyphs and labels", () => {
  it("gives every state its own glyph, not just its own colour", () => {
    render(<SeatMap label="Test map" tables={[TABLE]} seats={makeSeats()} />);
    // Each state draws a different mark or shape, which a CSS colour change cannot fake.
    expect(option(/seat 1, free/).querySelector(".mark")).toBeNull();
    expect(option(/seat 2, on hold/).querySelector(".glyph-body")?.getAttribute("fill")).toMatch(/-held\)$/);
    expect(option(/seat 3, taken/).querySelector(".mark-taken")).not.toBeNull();
    expect(option(/seat 4, your seat/).querySelector(".mark-mine")).not.toBeNull();
    expect(option(/seat 5, friend/).querySelector("rect.glyph-body")).not.toBeNull();
    expect(option(/seat 6, not available/).querySelector(".mark-blocked")).not.toBeNull();
    // And no two states share the same drawing.
    const drawings = STATES.map((_, i) => option(new RegExp(`seat ${i + 1},`)).querySelector(".glyph")?.innerHTML);
    expect(new Set(drawings).size).toBe(STATES.length);
  });

  it("reads seats out as a full sentence, including the accessible flag", () => {
    render(<SeatMap label="Test map" tables={[TABLE]} seats={makeSeats({ 3: { state: "free", accessible: true } })} />);
    const seat = option("Table 4, seat 3, free, accessible");
    expect(seat.querySelector(".badge-accessible")).not.toBeNull();
    expect(option(/seat 1,/).querySelector(".badge-accessible")).toBeNull();
  });

  it("names the occupant when the privacy rules allow it", () => {
    render(<SeatMap label="Test map" tables={[TABLE]} seats={makeSeats({ 5: { occupant: "Maya R." } })} />);
    expect(option("Table 4, seat 5, friend, Maya R.")).toBeTruthy();
  });

  it("marks recommended seats in the label and with a halo", () => {
    render(<SeatMap label="Test map" tables={[TABLE]} seats={makeSeats()} highlight={new Set([1])} />);
    expect(option("Table 4, seat 1, free, recommended").querySelector(".ring-highlight")).not.toBeNull();
  });
});

describe("SeatMap keyboard", () => {
  it("is a single tab stop that starts on the first free seat", () => {
    render(<SeatMap label="Test map" tables={[TABLE]} seats={makeSeats()} />);
    const map = screen.getByRole("listbox", { name: "Test map" });
    expect(map.getAttribute("tabindex")).toBe("0");
    expect(screen.getAllByRole("option").every((o) => o.getAttribute("tabindex") === null)).toBe(true);
    act(() => map.focus());
    expect(map.getAttribute("aria-activedescendant")).toMatch(/-t1$/);
  });

  it("moves with the arrow keys to the nearest seat and selects with Enter and Space", () => {
    const onSelect = vi.fn();
    const seats = makeSeats({ 2: { state: "free" } });
    render(<SeatMap label="Test map" tables={[TABLE]} seats={seats} onSelect={onSelect} />);
    const map = screen.getByRole("listbox");
    act(() => map.focus());
    fireEvent.keyDown(map, { key: "ArrowRight" });
    expect(map.getAttribute("aria-activedescendant")).toMatch(/-t2$/);
    fireEvent.keyDown(map, { key: "Enter" });
    expect(onSelect).toHaveBeenLastCalledWith(2);
    fireEvent.keyDown(map, { key: "ArrowLeft" });
    fireEvent.keyDown(map, { key: " " });
    expect(onSelect).toHaveBeenLastCalledWith(1);
    // At the left edge there is nothing further left: the cursor stays put.
    fireEvent.keyDown(map, { key: "ArrowLeft" });
    expect(map.getAttribute("aria-activedescendant")).toMatch(/-t1$/);
  });

  it("leaves the map with Escape, moving focus to the zoom controls", () => {
    render(<SeatMap label="Test map" tables={[TABLE]} seats={makeSeats()} />);
    const map = screen.getByRole("listbox");
    act(() => map.focus());
    fireEvent.keyDown(map, { key: "Escape" });
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Zoom in" }));
  });
});

describe("SeatMap selection rules", () => {
  it("never selects a seat the predicate refuses, by click or by keyboard", () => {
    const onSelect = vi.fn();
    // Only seat 1 may be chosen, even though seat 3 is "free" in this variant.
    const seats = makeSeats({ 3: { state: "free" } });
    render(<SeatMap label="Test map" tables={[TABLE]} seats={seats} selectable={(id) => id === 1} onSelect={onSelect} />);
    fireEvent.click(option(/seat 3,/));
    expect(onSelect).not.toHaveBeenCalled();
    expect(option(/seat 3,/).getAttribute("aria-disabled")).toBe("true");
    expect(screen.getByRole("status").textContent).toContain("is not available");
    fireEvent.click(option(/seat 1,/));
    expect(onSelect).toHaveBeenCalledWith(1);
  });

  it("by default only free seats can be selected", () => {
    const onSelect = vi.fn();
    render(<SeatMap label="Test map" tables={[TABLE]} seats={makeSeats()} onSelect={onSelect} />);
    fireEvent.click(option(/seat 3, taken/));
    fireEvent.click(option(/seat 6, not available/));
    expect(onSelect).not.toHaveBeenCalled();
    fireEvent.click(option(/seat 1, free/));
    expect(onSelect).toHaveBeenCalledWith(1);
  });

  it("in tables mode the whole table is the target", () => {
    const onSelect = vi.fn();
    const tables: MapTable[] = [
      { ...TABLE, id: 4, state: "free" },
      { ...TABLE, id: 5, label: "5", x: 400, state: "taken" },
    ];
    render(<SeatMap label="Tables" mode="tables" tables={tables} seats={makeSeats()} onSelect={onSelect} />);
    expect(screen.getAllByRole("option")).toHaveLength(2);
    fireEvent.click(option("Table 5, 0 seats, taken"));
    expect(onSelect).not.toHaveBeenCalled();
    fireEvent.click(option("Table 4, 6 seats, free"));
    expect(onSelect).toHaveBeenCalledWith(4);
  });
});

describe("SeatMap live changes", () => {
  it("announces a seat that was just taken, and a conflict on the selected seat", () => {
    const { rerender } = render(<SeatMap label="Test map" tables={[TABLE]} seats={makeSeats()} selectedId={1} />);
    rerender(<SeatMap label="Test map" tables={[TABLE]} seats={makeSeats({ 2: { state: "taken" } })} selectedId={1} />);
    expect(screen.getByRole("status").textContent).toBe("Table 4, seat 2 was just taken.");
    rerender(<SeatMap label="Test map" tables={[TABLE]} seats={makeSeats({ 1: { state: "taken" }, 2: { state: "taken" } })} selectedId={1} />);
    expect(screen.getByRole("status").textContent).toContain("seat 1 was just taken by someone else");
    expect(option(/seat 1,/).querySelector('[data-motion="conflict"]')).not.toBeNull();
  });

  it("draws 400 seats as 400 options", () => {
    const seats: MapSeat[] = Array.from({ length: 400 }, (_, i) => ({
      id: i + 1,
      table_id: 4,
      label: String(i + 1),
      x: (i % 20) * 30,
      y: Math.floor(i / 20) * 30,
      state: STATES[i % STATES.length],
      accessible: i % 25 === 0,
    }));
    render(<SeatMap label="Big room" tables={[TABLE]} seats={seats} />);
    expect(screen.getAllByRole("option")).toHaveLength(400);
  });
});

describe("SeatMap own actions are not someone else's", () => {
  it("does not call the seat you just held a conflict", () => {
    const { rerender } = render(<SeatMap label="Test map" tables={[TABLE]} seats={makeSeats()} selectedId={null} />);
    fireEvent.click(option(/seat 1, free/));
    // The page holds it; the server now reports the person's own hold as "held".
    rerender(<SeatMap label="Test map" tables={[TABLE]} seats={makeSeats({ 1: { state: "held" } })} selectedId={1} />);
    expect(screen.getByRole("status").textContent).not.toContain("someone else");
    expect(option(/seat 1,/).querySelector('[data-motion="conflict"]')).toBeNull();
    expect(option(/seat 1,/).querySelector('[data-motion="hold"]')).not.toBeNull();
  });

  it("trusts ownId from the page, even without a click on the map", () => {
    const { rerender } = render(<SeatMap label="Test map" tables={[TABLE]} seats={makeSeats()} selectedId={1} />);
    rerender(<SeatMap label="Test map" tables={[TABLE]} seats={makeSeats({ 1: { state: "held" } })} selectedId={1} ownId={1} />);
    expect(screen.getByRole("status").textContent).not.toContain("someone else");
  });

  it("stays quiet about a table the person's own action just filled, then speaks again", () => {
    // Staff seat a walk-in at table B3: the page says so itself, so the map must
    // not add "was just taken", nor call it someone else's doing.
    const free: MapTable[] = [{ ...TABLE, id: 4, label: "B3", state: "free" }];
    const taken: MapTable[] = [{ ...free[0], state: "taken" }];
    const acted = [4];
    const { rerender } = render(<SeatMap label="Floor" mode="tables" tables={free} seats={[]} selectedId={4} actedOn={acted} />);
    rerender(<SeatMap label="Floor" mode="tables" tables={taken} seats={[]} selectedId={4} actedOn={acted} />);
    expect(screen.getByRole("status").textContent).toBe("");
    expect(option(/B3/).querySelector('[data-motion="confirm"]')).not.toBeNull();
    // The next change of that table is not this person's doing any more.
    rerender(<SeatMap label="Floor" mode="tables" tables={free} seats={[]} selectedId={4} actedOn={acted} />);
    expect(screen.getByRole("status").textContent).toContain("Table B3 is free again.");
  });

  it("still warns when a seat you only looked at is held by someone else", () => {
    const { rerender } = render(<SeatMap label="Test map" tables={[TABLE]} seats={makeSeats()} selectedId={1} />);
    rerender(<SeatMap label="Test map" tables={[TABLE]} seats={makeSeats({ 1: { state: "held" } })} selectedId={1} />);
    expect(screen.getByRole("status").textContent).toContain("put on hold by someone else. Please choose another seat.");
  });
});

describe("SeatMap tables mode wording", () => {
  const tables: MapTable[] = [
    { ...TABLE, id: 4, label: "B3", state: "free" },
    { ...TABLE, id: 5, label: "B4", x: 400, state: "free" },
  ];

  it("talks about tables, not seats, in the caption and the announcements", () => {
    const { rerender } = render(<SeatMap label="Tables" mode="tables" tables={tables} seats={[]} selectedId={4} />);
    expect(screen.getByText(/Select a table to see its details/)).toBeTruthy();
    // The diner's own hold is drawn as "mine": the page already says "held for you".
    rerender(<SeatMap label="Tables" mode="tables" tables={[{ ...tables[0], state: "mine" }, { ...tables[1], state: "held" }]} seats={[]} selectedId={4} />);
    const status = screen.getByRole("status").textContent ?? "";
    expect(status).not.toContain("your seat");
    expect(status).not.toContain("Table B3");
    expect(status).toContain("Table B4 is now on hold.");
  });

  it("asks for another table, not another seat, on a conflict", () => {
    const { rerender } = render(<SeatMap label="Tables" mode="tables" tables={tables} seats={[]} selectedId={4} />);
    rerender(<SeatMap label="Tables" mode="tables" tables={[{ ...tables[0], state: "taken" }, tables[1]]} seats={[]} selectedId={4} />);
    expect(screen.getByRole("status").textContent).toContain("Please choose another table.");
  });
});

describe("SeatMap extras for page owners", () => {
  it("draws a second, non-colour highlight with its own words", () => {
    render(<SeatMap label="Test map" tables={[TABLE]} seats={makeSeats()} marked={new Set([3])} markedLabel="changed by preview" />);
    const seat = option("Table 4, seat 3, taken, changed by preview");
    // A square, unlike the round recommendation halo, so it differs in shape, not only colour.
    expect(seat.querySelector("rect.ring-marked")).not.toBeNull();
    expect(seat.querySelector(".ring-highlight")).toBeNull();
  });

  it("lets the page override the accessible name, and keeps the flags", () => {
    const describeItem = (item: Parameters<NonNullable<React.ComponentProps<typeof SeatMap>["describe"]>>[0]) =>
      item.kind === "seat" && item.seat.id === 1 ? "Seat by the window" : null;
    render(<SeatMap label="Test map" tables={[TABLE]} seats={makeSeats()} highlight={new Set([1])} describe={describeItem} />);
    expect(option("Seat by the window, recommended")).toBeTruthy();
    expect(option("Table 4, seat 2, on hold")).toBeTruthy(); // null falls back to the default
  });

  it("shows occupant names only once zoomed in far enough to read them", () => {
    const seats = makeSeats({ 3: { occupant: "Maya R." } });
    render(<SeatMap label="Test map" tables={[TABLE]} seats={seats} showOccupants />);
    expect(screen.queryByText("Maya R.")).toBeNull();
    const zoomIn = screen.getByRole("button", { name: "Zoom in" });
    fireEvent.click(zoomIn);
    fireEvent.click(zoomIn);
    expect(screen.getByText("Maya R.")).toBeTruthy();
  });

  it("finds a seat and its table by id", () => {
    const seats = makeSeats();
    expect(findSeat(seats, [TABLE], 2)).toEqual({ seat: seats[1], table: TABLE });
    expect(findSeat(seats, [TABLE], 99)).toBeNull();
  });
});

// ---------- Camera on a phone ----------
// jsdom has no layout, so these tests give the viewport the size a 390 px
// phone gives it (358 x 590 after the page margins).

const realWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "clientWidth");
const realHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "clientHeight");

function pretendViewport(width: number, height: number): void {
  Object.defineProperty(HTMLElement.prototype, "clientWidth", { configurable: true, get: () => width });
  Object.defineProperty(HTMLElement.prototype, "clientHeight", { configurable: true, get: () => height });
}

afterEach(() => {
  if (realWidth) Object.defineProperty(HTMLElement.prototype, "clientWidth", realWidth);
  if (realHeight) Object.defineProperty(HTMLElement.prototype, "clientHeight", realHeight);
});

/** The demo wedding (backend/app/seed/demo_events.py): 10 round tables of 8, two rows of five. */
function weddingFloor(): { tables: MapTable[]; seats: MapSeat[] } {
  const tables: MapTable[] = [];
  const seats: MapSeat[] = [];
  for (let index = 0; index < 10; index++) {
    const cx = 160 + (index % 5) * 220;
    const cy = 300 + Math.floor(index / 5) * 280;
    tables.push({ id: index + 1, label: `T${index + 1}`, shape: "round", x: cx - 50, y: cy - 50, w: 100, h: 100, rotation: 0 });
    for (let s = 0; s < 8; s++) {
      const angle = -Math.PI / 2 + (s * 2 * Math.PI) / 8;
      seats.push({ id: index * 8 + s + 1, table_id: index + 1, label: String(s + 1), x: cx + 75 * Math.cos(angle), y: cy + 75 * Math.sin(angle), state: "free", accessible: false });
    }
  }
  return { tables, seats };
}

function camera(): { x: number; y: number; k: number } {
  const transform = document.querySelector(".seatmap-svg > g")?.getAttribute("transform") ?? "";
  const [x, y, k] = (transform.match(/-?[\d.]+/g) ?? []).map(Number);
  return { x, y, k };
}

function screenTargetPx(seatId: number): number {
  const hit = document.querySelector(`[id$="-t${seatId}"] .hit-area`);
  return 2 * Number(hit?.getAttribute("r")) * camera().k;
}

describe("SeatMap camera on a phone", () => {
  it("fits the wedding so every seat is at least a 24 px target, centred on the recommended seat", () => {
    pretendViewport(358, 590);
    const { tables, seats } = weddingFloor();
    render(<SeatMap label="Wedding" tables={tables} seats={seats} highlight={new Set([79])} />);
    for (const seat of seats) expect(screenTargetPx(seat.id)).toBeGreaterThanOrEqual(24);
    // The recommended seat (table 10, far right) is on screen.
    const seat = seats[78];
    const { x, k } = camera();
    expect(seat.x * k + x).toBeGreaterThan(0);
    expect(seat.x * k + x).toBeLessThan(358);
  });

  it("zooms to a seat the page asks to focus, big enough to tap comfortably", () => {
    pretendViewport(358, 590);
    const { tables, seats } = weddingFloor();
    const { rerender } = render(<SeatMap label="Wedding" tables={tables} seats={seats} />);
    rerender(<SeatMap label="Wedding" tables={tables} seats={seats} focusId={42} />);
    expect(screenTargetPx(42)).toBeGreaterThanOrEqual(44);
    const { x, y, k } = camera();
    expect(seats[41].x * k + x).toBeCloseTo(179, 0);
    expect(seats[41].y * k + y).toBeCloseTo(295, 0);
  });

  it("does not slide the map away when a tap gives it focus, so the tap still lands", () => {
    pretendViewport(358, 590);
    // A restaurant floor whose recommended table is at the far left edge of the
    // fitted view, inside the margin that keyboard focus keeps clear.
    const tables: MapTable[] = Array.from({ length: 6 }, (_, i) => ({ ...TABLE, id: i + 1, label: `W${i + 1}`, x: i * 200, y: 0, w: 60, h: 40, state: "free" as const }));
    render(<SeatMap label="Floor" mode="tables" tables={tables} seats={[]} highlight={new Set([1])} />);
    const before = camera();
    const map = screen.getByRole("listbox", { name: "Floor" });
    // A finger: the browser sends pointerdown and pointerup first, and only then
    // the mouse events that move the focus, before the click.
    fireEvent.pointerDown(map, { pointerId: 1, clientX: 20, clientY: 20 });
    fireEvent.pointerUp(map, { pointerId: 1, clientX: 20, clientY: 20 });
    fireEvent.focus(map);
    expect(camera()).toEqual(before);
  });

  it("still brings the cursor into view when the map gets keyboard focus", () => {
    pretendViewport(358, 590);
    const { tables, seats } = weddingFloor();
    render(<SeatMap label="Wedding" tables={tables} seats={seats} />);
    fireEvent.click(screen.getByRole("button", { name: "Zoom in" }));
    fireEvent.click(screen.getByRole("button", { name: "Zoom in" }));
    const zoomed = camera();
    fireEvent.focus(screen.getByRole("listbox", { name: "Wedding" }));
    expect(camera()).not.toEqual(zoomed);
  });

  it("has a button that zooms to the recommended seat", () => {
    pretendViewport(358, 590);
    const { tables, seats } = weddingFloor();
    render(<SeatMap label="Wedding" tables={tables} seats={seats} highlight={new Set([3])} />);
    fireEvent.click(screen.getByRole("button", { name: "Fit map to screen" }));
    fireEvent.click(screen.getByRole("button", { name: "Zoom to the recommended seat" }));
    expect(screenTargetPx(3)).toBeGreaterThanOrEqual(44);
  });
});
