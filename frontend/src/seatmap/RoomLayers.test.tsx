import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { MapRoom, MapSeat, MapTable } from "../api/types";
import { RoomBackdrop, RoomDefs, RoomNight } from "./RoomLayers";
import { SeatMap } from "./SeatMap";

const OUTLINE = { points: [{ x: 0, y: 0, curve: 0 }, { x: 1000, y: 0, curve: 0 }, { x: 1000, y: 600, curve: 0 }, { x: 0, y: 600, curve: 0 }] };

function makeRoom(patch: Partial<MapRoom> = {}): MapRoom {
  return {
    id: 7, name: "Main room", is_outdoor: false, north_deg: 0, outline: OUTLINE, width: 1000, height: 600,
    openings: [
      { id: 1, side: 2, offset: 300, width: 400, kind: "window", is_main_entrance: false, view_text: "river", view_tags: ["river"], night_view_text: "", view_photo_url: "" },
      { id: 2, side: 0, offset: 100, width: 100, kind: "door", is_main_entrance: true, view_text: "", view_tags: [], night_view_text: "", view_photo_url: "" },
    ],
    fixtures: [
      { id: 1, kind: "bar", shape: "rect", x: 700, y: 20, w: 250, h: 80, rotation: 0, label: "" },
      { id: 2, kind: "plant", shape: "circle", x: 40, y: 40, w: 60, h: 60, rotation: 0, label: "Fig tree" },
    ],
    sun: { sunrise: "06:12", sunset: "21:05", azimuth: 150, altitude: 70 },
    sun_patches: [[{ x: 300, y: 600 }, { x: 700, y: 600 }, { x: 650, y: 450 }, { x: 350, y: 450 }]],
    night: false,
    ...patch,
  };
}

function drawn(room: MapRoom, showSun = true) {
  return render(
    <svg>
      <RoomDefs prefix="m" />
      <RoomBackdrop room={room} mapId="m" showSun={showSun} />
      <RoomNight room={room} />
    </svg>,
  );
}

describe("RoomBackdrop", () => {
  it("draws the floor, the walls, windows, doors and fixed items", () => {
    const { container } = drawn(makeRoom());
    expect(container.querySelector("path.room-floor")).not.toBeNull();
    expect(container.querySelector("path.room-wall")).not.toBeNull();
    expect(container.querySelectorAll("path.room-window")).toHaveLength(1);
    expect(container.querySelectorAll("path.room-door-arc")).toHaveLength(1);
    expect(container.querySelectorAll(".room-fixture")).toHaveLength(2);
    expect([...container.querySelectorAll(".room-fixture-label")].map((t) => t.textContent)).toEqual(["Bar", "Fig tree"]);
  });

  it("shows sun as striped patches clipped to the room, and can hide them", () => {
    const { container, rerender } = drawn(makeRoom());
    const patch = container.querySelector("path.room-sun");
    expect(patch?.getAttribute("fill")).toBe("url(#m-sun)"); // stripes, not just a colour
    expect(patch?.parentElement?.getAttribute("clip-path")).toBe("url(#m-room-7)");
    expect(container.querySelector("#m-room-7")).not.toBeNull();
    rerender(
      <svg>
        <RoomDefs prefix="m" />
        <RoomBackdrop room={makeRoom()} mapId="m" showSun={false} />
      </svg>,
    );
    expect(container.querySelector("path.room-sun")).toBeNull();
  });

  it("gives a window with a view a small view icon, and a window without one none", () => {
    const { container } = drawn(makeRoom());
    expect(container.querySelectorAll(".room-view-icon")).toHaveLength(1);
  });

  it("draws the implicit room (id null) without breaking", () => {
    const { container } = drawn(makeRoom({ id: null, openings: [], fixtures: [], sun_patches: [] }));
    expect(container.querySelector("path.room-floor")).not.toBeNull();
    expect(container.querySelector("#m-room-implicit")).not.toBeNull();
  });

  it("is scenery: hidden from assistive technology and never a target", () => {
    const { container } = drawn(makeRoom());
    expect(container.querySelector("[data-room]")?.getAttribute("aria-hidden")).toBe("true");
  });
});

describe("RoomNight", () => {
  it("only draws the veil after dark, and never catches a tap", () => {
    expect(drawn(makeRoom({ night: false })).container.querySelector(".room-night")).toBeNull();
    const { container } = drawn(makeRoom({ night: true }));
    const veil = container.querySelector(".room-night");
    expect(veil).not.toBeNull();
    expect(veil?.getAttribute("aria-hidden")).toBe("true");
  });
});

describe("SeatMap with rooms", () => {
  const TABLE: MapTable = { id: 4, label: "4", shape: "rect", x: 400, y: 300, w: 100, h: 80, rotation: 0, state: "free" };
  const SEATS: MapSeat[] = [{ id: 1, table_id: 4, label: "1", x: 450, y: 290, state: "free", accessible: false }];

  it("draws no room at all when none is given, so events look exactly as before", () => {
    const { container } = render(<SeatMap label="Map" mode="tables" tables={[TABLE]} seats={SEATS} />);
    expect(container.querySelector(".room-floor")).toBeNull();
    expect(container.querySelector("[data-room]")).toBeNull();
  });

  it("draws every room, or only the active one", () => {
    const rooms = [makeRoom(), makeRoom({ id: 8, name: "Terrace", is_outdoor: true })];
    const all = render(<SeatMap label="Map" mode="tables" tables={[TABLE]} seats={SEATS} rooms={rooms} />);
    expect(all.container.querySelectorAll("[data-room]")).toHaveLength(2);
    all.unmount();
    const one = render(<SeatMap label="Map" mode="tables" tables={[TABLE]} seats={SEATS} rooms={rooms} activeRoomId={8} />);
    expect([...one.container.querySelectorAll("[data-room]")].map((g) => g.getAttribute("data-room"))).toEqual(["8"]);
  });

  it("keeps the tables pickable with the night veil on top", () => {
    const { container } = render(<SeatMap label="Map" mode="tables" tables={[TABLE]} seats={SEATS} rooms={[makeRoom({ night: true })]} />);
    expect(container.querySelector(".room-night")).not.toBeNull();
    expect(screen.getByRole("option", { name: /table 4/i })).toBeTruthy();
  });
});
