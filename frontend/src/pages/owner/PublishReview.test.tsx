import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import PublishReview from "./PublishReview";
import { checklist } from "./publishChecklist";

const VID = "rest01";

const PROBLEMS = [
  { code: "location", message: "Add the address and place the pin on the map.", fix_url: `/owner/${VID}/profile` },
  { code: "hours", message: "Add at least one service to the opening hours.", fix_url: `/owner/${VID}/hours` },
  { code: "table_outside", message: "Table T1 is outside the walls.", fix_url: `/owner/${VID}/rooms` },
];
const TIPS = [{ code: "photos", message: "A photo of the restaurant helps diners choose you.", fix_url: `/owner/${VID}/photos` }];

function check(patch: object = {}) {
  return { name: "Casa Teste", slug: "casa-teste", status: "draft", ready: false, problems: PROBLEMS, tips: TIPS, ...patch };
}

interface Calls { posts: string[] }

function server(answers: { check: () => unknown; publish?: () => Response; unpublish?: () => unknown }): Calls {
  const calls: Calls = { posts: [] };
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = new URL(String(input), "http://localhost").pathname;
    const method = init?.method ?? "GET";
    if (path.endsWith("/publish-check")) return new Response(JSON.stringify(answers.check()));
    if (path.endsWith("/publish") && method === "POST") {
      calls.posts.push("publish");
      return answers.publish?.() ?? new Response(JSON.stringify({ status: "published", url: "/restaurants/casa-teste" }));
    }
    if (path.endsWith("/unpublish") && method === "POST") {
      calls.posts.push("unpublish");
      return new Response(JSON.stringify(answers.unpublish?.() ?? { status: "draft" }));
    }
    if (path === `/api/owner/restaurants/${VID}`) return new Response(JSON.stringify({ public_id: VID, name: "Casa Teste", slug: "casa-teste", status: "draft" }));
    return new Response(JSON.stringify({ error: { code: "not_found", message: "No mock" } }), { status: 404 });
  }));
  return calls;
}

function open(): void {
  render(
    <MemoryRouter initialEntries={[`/owner/${VID}/review`]}>
      <Routes>
        <Route path="/owner/:venueId/review" element={<PublishReview />} />
      </Routes>
    </MemoryRouter>,
  );
}

afterEach(() => vi.unstubAllGlobals());

describe("checklist", () => {
  it("turns the server's problems into the seven rows of the review", () => {
    const rows = checklist(PROBLEMS, TIPS);
    expect(rows.map((r) => [r.label, r.done])).toEqual([
      ["Name, cuisines and price", true],
      ["Address and pin on the map", false],
      ["At least one photo (recommended)", false],
      ["Opening hours with at least one service", false],
      ["A room with at least one table", true],
      ["No problems in the room plan", false],
      ["North set in rooms with windows", true],
    ]);
    expect(rows.find((r) => r.label.startsWith("Address"))?.fix).toBe(`/owner/${VID}/profile`);
  });

  it("marks everything done when nothing is reported", () => {
    expect(checklist([], []).every((r) => r.done)).toBe(true);
  });

  it("only the recommended photo is not required", () => {
    const rows = checklist([], TIPS);
    expect(rows.filter((r) => !r.done).map((r) => [r.label, r.required])).toEqual([["At least one photo (recommended)", false]]);
  });
});

describe("Review and publish", () => {
  it("shows each item with a mark and a word, links to fix what is missing, and keeps Publish off", async () => {
    server({ check: () => check() });
    open();
    const list = await screen.findByRole("list", { name: "Before you publish" });
    const hours = within(list).getByText("Opening hours with at least one service").closest("li") as HTMLElement;
    expect(within(hours).getByText("To do")).toBeTruthy(); // a word, not just a colour
    expect(within(hours).getByRole("link", { name: /Fix opening hours/ }).getAttribute("href")).toBe(`/owner/${VID}/hours`);
    // What is already right is folded away in its own group, under what needs fixing.
    expect(screen.getByText(/^Draft · \d+ blockers?$/)).toBeTruthy();
    const doneList = screen.getByRole("list", { name: "Checks already done" });
    const identity = within(doneList).getByText("Name, cuisines and price").closest("li") as HTMLElement;
    expect(within(identity).getByText("Done")).toBeTruthy();
    expect((screen.getByRole("button", { name: "Publish restaurant" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText("Table T1 is outside the walls.")).toBeTruthy();
  });

  it("publishes when everything is ready and shows the public page", async () => {
    const calls = server({ check: () => check({ ready: true, problems: [] }) });
    open();
    const publish = await screen.findByRole("button", { name: "Publish restaurant" });
    expect(screen.getByText("Ready to publish")).toBeTruthy();
    expect((publish as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(publish);
    expect(await screen.findByText(/is live and open for bookings/i)).toBeTruthy();
    expect(calls.posts).toEqual(["publish"]);
    expect(screen.getByRole("link", { name: /View public page/ }).getAttribute("href")).toBe("/restaurants/casa-teste");
    expect(screen.getByRole("button", { name: "Unpublish" })).toBeTruthy();
    expect(screen.getByText("Published", { selector: ".badge, span" })).toBeTruthy();
  });

  it("lists the problems if the server refuses at the last moment", async () => {
    server({
      check: () => check({ ready: true, problems: [] }),
      publish: () => new Response(JSON.stringify({ error: { code: "validation", message: "This restaurant cannot be published yet.", problems: PROBLEMS }, problems: PROBLEMS }), { status: 422 }),
    });
    open();
    fireEvent.click(await screen.findByRole("button", { name: "Publish restaurant" }));
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.getByText("Add at least one service to the opening hours.")).toBeTruthy();
    expect(screen.queryByText(/is live and open for bookings/i)).toBeNull();
  });

  it("can take a published restaurant back to a draft", async () => {
    const calls = server({ check: () => check({ status: "published", ready: true, problems: [] }) });
    open();
    expect(await screen.findByText(/is live and open for bookings/i)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Unpublish" }));
    // Taking a restaurant off search asks first; nothing is sent until the diner-facing consequence has been read.
    const dialog = await screen.findByRole("dialog", { name: "Remove from search?" });
    expect(calls.posts).toEqual([]);
    expect(within(dialog).getByText(/Bookings already made stay/)).toBeTruthy();
    fireEvent.click(within(dialog).getByRole("button", { name: "Unpublish" }));
    expect(await screen.findByText(/^Draft ·|^Ready to publish$/)).toBeTruthy();
    expect(calls.posts).toEqual(["unpublish"]);
    expect(screen.getByRole("button", { name: "Publish restaurant" })).toBeTruthy();
  });
});
