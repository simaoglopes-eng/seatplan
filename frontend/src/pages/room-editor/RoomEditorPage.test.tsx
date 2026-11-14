import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, expect, it, vi } from "vitest";
import RoomEditorPage from "./RoomEditorPage";

afterEach(() => vi.unstubAllGlobals());

it("creates a second room and restores the previous layout with undo", async () => {
  const room = {
    id: null, key: "implicit-main", name: "Main room", is_outdoor: false, north_deg: null, position: 0,
    outline: { points: [{ x: 0, y: 0, curve: 0 }, { x: 1000, y: 0, curve: 0 }, { x: 1000, y: 700, curve: 0 }, { x: 0, y: 700, curve: 0 }] },
    openings: [], fixtures: [], zones: [], tables: [],
  };
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => new Response(JSON.stringify(String(input).endsWith("/rooms")
    ? { version: 0, base_version: 0, problems: [], rooms: [room] }
    : { public_id: "restaurant", kind: "restaurant", name: "Test Restaurant", timezone: "Europe/Lisbon", width: 1000, height: 700, zones: [], tables: [], seats: [] }))));
  render(<MemoryRouter initialEntries={["/owner/restaurant/rooms"]}><Routes>
    <Route path="/owner/:venueId/rooms" element={<RoomEditorPage />} />
  </Routes></MemoryRouter>);
  await screen.findByRole("heading", { name: "Room editor" });
  fireEvent.click(screen.getByRole("button", { name: "Add room" }));
  fireEvent.change(screen.getByLabelText("Room name"), { target: { value: "Terrace" } });
  fireEvent.click(screen.getByRole("button", { name: "Create room" }));
  expect(screen.getByRole("option", { name: "Terrace" })).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Undo" }));
  expect(screen.queryByRole("option", { name: "Terrace" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Redo" }));
  expect(screen.getByRole("option", { name: "Terrace" })).toBeTruthy();
});
