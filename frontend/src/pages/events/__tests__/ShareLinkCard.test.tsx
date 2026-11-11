import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { OrganiserEvent, OrganiserGuest, ShareSettings } from "../../../api/events";
import { GuestRow } from "../GuestRow";
import { ShareLinkCard, parseCap, shareCounts } from "../ShareLinkCard";
import type { OrganiserState } from "../useOrganiser";
import { callsTo, startFakeServer } from "./mockServer";
import type { FakeServer } from "./mockServer";

function settings(changes: Partial<ShareSettings> = {}): ShareSettings {
  return { enabled: true, link: "/j/abc123", needs_new_link: false, cap: null, joined: 2, capacity: 40, guests: 30, places_left: 10, ...changes };
}

/** Just enough of useOrganiser for the card: run() calls the action and reports success. */
function fakeOrg(): OrganiserState {
  const run = async (_name: string, _done: string, action: () => Promise<void>): Promise<boolean> => {
    await action();
    return true;
  };
  return { eventId: "ev1", busy: null, run } as unknown as OrganiserState;
}

/** A stateful fake: PATCH and regenerate change what GET answers next. */
function shareServer(initial: ShareSettings): FakeServer {
  let current = initial;
  const server = startFakeServer();
  server.routes.set("GET /events/ev1/share", () => ({ body: current }));
  server.routes.set("PATCH /events/ev1/share", (body) => {
    const patch = body as Partial<ShareSettings>;
    current = { ...current, ...patch, link: patch.enabled ? (current.link ?? "/j/first") : current.link };
    return { body: current };
  });
  server.routes.set("POST /events/ev1/share/regenerate", () => {
    current = { ...current, link: "/j/second", needs_new_link: false };
    return { body: current };
  });
  return server;
}

function renderCard(): void {
  render(<ShareLinkCard org={fakeOrg()} data={{} as OrganiserEvent} />);
}

afterEach(() => {
  vi.unstubAllGlobals();
  Reflect.deleteProperty(navigator, "clipboard");
});

describe("ShareLinkCard", () => {
  it("switches the link on through PATCH and then shows it with the page's origin", async () => {
    const server = shareServer(settings({ enabled: false, link: null }));
    renderCard();
    expect(await screen.findByText(/The link is off. Nobody new can join with it./)).toBeTruthy();
    fireEvent.click(screen.getByRole("checkbox", { name: /^Allow people to join with the shared link/ }));
    await waitFor(() => expect(callsTo(server, "PATCH", "/events/ev1/share")).toEqual([{ enabled: true }]));
    const field = (await screen.findByLabelText("Link to share")) as HTMLInputElement;
    expect(field.value).toBe(`${window.location.origin}/j/first`);
    expect(field.readOnly).toBe(true);
  });

  it("copies the link and says so in a polite status line", async () => {
    shareServer(settings());
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    renderCard();
    fireEvent.click(await screen.findByRole("button", { name: "Copy link" }));
    expect(await screen.findByText("Link copied")).toBeTruthy();
    expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/j/abc123`);
  });

  it("selects the link when the clipboard is blocked", async () => {
    shareServer(settings());
    renderCard();
    fireEvent.click(await screen.findByRole("button", { name: "Copy link" }));
    expect(await screen.findByText("Press Ctrl+C or Cmd+C to copy.")).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByLabelText("Link to share"));
  });

  it("asks before making a new link, and only then calls the server", async () => {
    const server = shareServer(settings());
    renderCard();
    fireEvent.click(await screen.findByRole("button", { name: "Make a new link" }));
    const dialog = screen.getByRole("dialog", { name: "Make a new link?" });
    expect(within(dialog).getByText(/The current link stops working at once/)).toBeTruthy();
    expect(callsTo(server, "POST", "/events/ev1/share/regenerate")).toEqual([]);

    fireEvent.click(within(dialog).getByRole("button", { name: "Make a new link" }));
    await waitFor(() => expect(callsTo(server, "POST", "/events/ev1/share/regenerate")).toHaveLength(1));
    expect(((await screen.findByLabelText("Link to share")) as HTMLInputElement).value).toBe(`${window.location.origin}/j/second`);
  });

  it("explains a link that had to be reset for security", async () => {
    shareServer(settings({ link: null, needs_new_link: true }));
    renderCard();
    expect(await screen.findByText("The link had to be reset for security. Make a new link to share.")).toBeTruthy();
    expect(screen.queryByLabelText("Link to share")).toBeNull();
  });

  it("shows the counts in words", async () => {
    shareServer(settings());
    renderCard();
    expect(await screen.findByText("2 joined with the link. 10 places left (30 guests for 40 seats).")).toBeTruthy();
  });

  it("checks the limit, and saves an empty one as no limit", async () => {
    const server = shareServer(settings({ cap: 5 }));
    renderCard();
    const cap = (await screen.findByLabelText("Most people who may join with this link")) as HTMLInputElement;
    expect(cap.value).toBe("5");
    fireEvent.change(cap, { target: { value: "0" } });
    fireEvent.click(screen.getByRole("button", { name: "Save limit" }));
    expect(screen.getByText("Enter a whole number from 1 to 5000, or leave it empty.")).toBeTruthy();
    expect(callsTo(server, "PATCH", "/events/ev1/share")).toEqual([]);

    fireEvent.change(cap, { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Save limit" }));
    await waitFor(() => expect(callsTo(server, "PATCH", "/events/ev1/share")).toEqual([{ cap: null }]));
  });

  it("parseCap accepts 1 to 5000 whole numbers only", () => {
    expect(parseCap("12")).toEqual({ cap: 12 });
    expect(parseCap(" ")).toEqual({ cap: null });
    expect("error" in parseCap("5001")).toBe(true);
    expect("error" in parseCap("2.5")).toBe(true);
  });
});

describe("GuestRow badges", () => {
  function guest(changes: Partial<OrganiserGuest>): OrganiserGuest {
    return {
      id: 9,
      name: "Nina Lopes",
      email: "nina@example.com",
      group: null,
      rsvp: "yes",
      wants_anonymous: false,
      needs_accessible: false,
      dietary_note: null,
      reserved_tag: null,
      seat_id: null,
      source: "invited",
      has_account: false,
      ...changes,
    };
  }

  function renderRow(g: OrganiserGuest): void {
    const noop = async () => true;
    render(
      <ul>
        <GuestRow guest={g} seatLabel={null} selected={false} link={undefined} busy={null} onPlace={() => undefined} onCopyLink={() => undefined} onNewLink={noop} onDelete={noop} />
      </ul>,
    );
  }

  it("marks a guest who joined with the link and has an account", () => {
    renderRow(guest({ source: "self_registered", has_account: true }));
    expect(screen.getByText("Joined with link")).toBeTruthy();
    expect(screen.getByText("Has an account")).toBeTruthy();
    // Removing them works as for anyone else.
    expect(screen.getByRole("button", { name: "Delete data of Nina Lopes" })).toBeTruthy();
  });

  it("shows neither badge for an invited guest without an account", () => {
    renderRow(guest({}));
    expect(screen.queryByText("Joined with link")).toBeNull();
    expect(screen.queryByText("Has an account")).toBeNull();
  });
});

describe("shareCounts", () => {
  it("says place, not places, for one", () => {
    const base = { enabled: true, link: "/j/x", needs_new_link: false, cap: null, joined: 2, capacity: 8, guests: 7 };
    expect(shareCounts({ ...base, places_left: 1 })).toBe("2 joined with the link. 1 place left (7 guests for 8 seats).");
    expect(shareCounts({ ...base, places_left: 0 })).toBe("2 joined with the link. 0 places left (7 guests for 8 seats).");
  });
});
