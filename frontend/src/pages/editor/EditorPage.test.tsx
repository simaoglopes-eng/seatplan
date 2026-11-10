import { act, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { VenueDetail } from "../../api/types";
import EditorPage from "./EditorPage";

// A venue exactly as GET /venues/{id} returns it (backend/app/routers/venues.py).
const DETAIL: VenueDetail = {
  public_id: "v1",
  kind: "restaurant",
  name: "Test bistro",
  timezone: "Europe/Lisbon",
  width: 800,
  height: 600,
  zones: [],
  tables: [
    { id: 7, key: "7", zone_id: null, label: "1", shape: "round", x: 50, y: 50, w: 60, h: 60, rotation: 0,
      min_party: 2, max_party: 4, is_accessible: false, high_chair_ok: true, combine_group: null },
  ],
  seats: [
    { id: 70, key: "70", table_id: 7, label: "1", x: 80, y: 34, is_accessible: false, is_blocked: false, reserved_tag: null },
    { id: 71, key: "71", table_id: 7, label: "2", x: 80, y: 126, is_accessible: false, is_blocked: false, reserved_tag: null },
  ],
};

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(DETAIL), { status: 200 })));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

async function openEditor(): Promise<void> {
  render(
    <MemoryRouter initialEntries={["/editor/v1"]}>
      <Routes>
        <Route path="/editor/:venueId" element={<EditorPage />} />
        <Route path="/" element={<p>Home page</p>} />
      </Routes>
    </MemoryRouter>,
  );
  await screen.findByRole("heading", { name: "Items on the floor" });
}

/** What a keyboard user does: focus the item in the list and press Enter (which clicks it). */
function selectWithKeyboard(name: RegExp): void {
  const item = screen.getByRole("button", { name });
  act(() => item.focus());
  fireEvent.click(item);
}

describe("Editor keyboard", () => {
  it("moves the selected table with the arrow keys after choosing it from the list", async () => {
    await openEditor();
    selectWithKeyboard(/Table 1/);
    // The list was replaced by the table's panel; focus must land inside the editor, not on <body>.
    expect(document.activeElement).toBe(screen.getByRole("heading", { name: "Table 1" }));
    fireEvent.keyDown(document.activeElement as HTMLElement, { key: "ArrowRight" });
    expect(screen.getByText("Unsaved changes")).toBeTruthy();
  });
});

describe("Editor unsaved changes", () => {
  async function makeAChange(): Promise<void> {
    await openEditor();
    fireEvent.click(screen.getByRole("button", { name: "+ Round table" }));
    expect(screen.getByText("Unsaved changes")).toBeTruthy();
  }

  it("asks before an in-app link throws the changes away", async () => {
    await makeAChange();
    const confirm = vi.fn(() => false);
    vi.stubGlobal("confirm", confirm);
    fireEvent.click(screen.getByRole("link", { name: "SeatPlan, home" }));
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("Home page")).toBeNull(); // stayed in the editor
    confirm.mockReturnValue(true);
    fireEvent.click(screen.getByRole("link", { name: "SeatPlan, home" }));
    expect(screen.getByText("Home page")).toBeTruthy();
  });

  it("asks the browser to warn on reload or close", async () => {
    await makeAChange();
    const event = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
  });

  it("does not ask when everything is saved", async () => {
    await openEditor();
    const confirm = vi.fn(() => false);
    vi.stubGlobal("confirm", confirm);
    fireEvent.click(screen.getByRole("link", { name: "SeatPlan, home" }));
    expect(confirm).not.toHaveBeenCalled();
    expect(screen.getByText("Home page")).toBeTruthy();
  });
});
