// The owner's list: one main action for the state each restaurant is in, the rest one step further.
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { OwnerCard } from "../../api/owner";
import OwnerHomePage from "./OwnerHomePage";

const PUBLISHED: OwnerCard = { public_id: "pub1", slug: "casa-lumen", name: "Casa Lumen", status: "published", cover_url: null, setup: { done: 6, total: 6, missing: [] } };
const DRAFT: OwnerCard = { public_id: "dra1", slug: null, name: "Novo Sítio", status: "draft", cover_url: null, setup: { done: 2, total: 6, missing: ["hours"] } };

function open(cards: OwnerCard[]): void {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(cards), { status: 200 })));
  render(<MemoryRouter><OwnerHomePage /></MemoryRouter>);
}

afterEach(() => vi.unstubAllGlobals());

describe("My restaurants", () => {
  it("opens the service floor first for a published restaurant, with the public page beside it, and no progress bar for a finished setup", async () => {
    open([PUBLISHED]);
    const card = (await screen.findByRole("heading", { name: "Casa Lumen" })).closest("article") as HTMLElement;
    expect(within(card).getByRole("link", { name: /Open service floor/ }).getAttribute("href")).toBe("/owner/pub1/dashboard");
    expect(within(card).getByRole("link", { name: /View public page/ }).getAttribute("href")).toBe("/restaurants/casa-lumen");
    expect(within(card).queryByText(/Setup 6 of 6/)).toBeNull();
    expect(within(card).queryByRole("progressbar")).toBeNull();
  });

  it("continues the setup first for a draft, and shows how far it is", async () => {
    open([DRAFT]);
    const card = (await screen.findByRole("heading", { name: "Novo Sítio" })).closest("article") as HTMLElement;
    expect(within(card).getByRole("link", { name: /Continue setup/ }).getAttribute("href")).toBe("/owner/dra1/setup");
    expect(within(card).getByText("Setup 2 of 6 done")).toBeTruthy();
    expect(within(card).queryByRole("link", { name: /Open service floor/ })).toBeNull();
  });

  it("keeps profile, rooms, hours and publishing one step further, under a labelled summary", async () => {
    open([PUBLISHED]);
    const card = (await screen.findByRole("heading", { name: "Casa Lumen" })).closest("article") as HTMLElement;
    const more = within(card).getByRole("navigation", { name: "Manage Casa Lumen" });
    expect(within(more).getAllByRole("link").map((link) => link.textContent)).toEqual(["Edit profile", "Edit rooms", "Opening hours", "Publishing"]);
    expect(card.querySelector("details summary")?.textContent).toContain("Set-up and publishing");
  });
});
