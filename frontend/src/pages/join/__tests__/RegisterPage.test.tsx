import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getGuestToken } from "../../../api/client";
import type { JoinStatus } from "../../../api/guest";
import { ToastProvider } from "../../../design/components";
import { callsTo, errorReply, startFakeServer } from "../../events/__tests__/mockServer";
import type { FakeServer } from "../../events/__tests__/mockServer";
import RegisterPage, { validateRegister } from "../RegisterPage";
import { WhereAmI } from "./fixtures";

const SENT = { status: "code_sent", sent_to: "ni***@example.com", expires_in_seconds: 900, signup_id: "this-browser-only" };
const ACCOUNT = { name: "Nina Lopes", email: "nina@example.com", created_at: "2026-11-10T10:00:00Z" };

function renderPage(): void {
  render(
    <MemoryRouter initialEntries={["/j/tok/register"]}>
      <ToastProvider>
        <Routes>
          <Route path="/j/:token/register" element={<RegisterPage />} />
          <Route path="*" element={<WhereAmI />} />
        </Routes>
      </ToastProvider>
    </MemoryRouter>,
  );
}

function type(label: string | RegExp, value: string): void {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

function fillForm(password = "a long password"): void {
  type("Your name", "Nina Lopes");
  type("Email", "nina@example.com");
  type("Password", password);
  fireEvent.click(screen.getByLabelText(/I agree that SeatPlan stores my details/));
}

/** Fills the form, sends it, and waits for the code step. */
async function reachCodeStep(server: FakeServer, sent: object = SENT): Promise<void> {
  server.routes.set("POST /j/tok/register", () => ({ status: 202, body: sent }));
  renderPage();
  fillForm();
  fireEvent.click(screen.getByRole("button", { name: "Send my code" }));
  await screen.findByRole("heading", { level: 1, name: "Check your email" });
}

beforeEach(() => {
  window.sessionStorage.clear();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  window.sessionStorage.clear();
});

describe("validateRegister", () => {
  const good = { name: "Nina", email: "nina@example.com", password: "0123456789", needsAccessible: false, consent: true };

  it("accepts a complete form with a 10-character password", () => {
    expect(Object.values(validateRegister(good)).filter(Boolean)).toEqual([]);
  });

  it("refuses 9 characters, a password equal to the email, and no consent", () => {
    expect(validateRegister({ ...good, password: "012345678" }).password).toBe("Use at least 10 characters.");
    expect(validateRegister({ ...good, password: "Nina@Example.com" }).password).toBe("Choose a password that is not your email address.");
    expect(validateRegister({ ...good, consent: false }).consent).toMatch(/Tick the box/);
  });
});

describe("RegisterPage", () => {
  it("lists every missing field in a focused alert and sends nothing", async () => {
    const server = startFakeServer();
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Send my code" }));

    const alert = screen.getByRole("alert");
    expect(document.activeElement).toBe(alert);
    expect(within(alert).getByText("There are 4 problems")).toBeTruthy();
    expect(within(alert).getByText("Enter your name.")).toBeTruthy();
    expect(within(alert).getByText(/Tick the box to agree/)).toBeTruthy();
    // Each error also sits next to its field and is tied to it.
    const name = screen.getByLabelText("Your name");
    expect(name.getAttribute("aria-invalid")).toBe("true");
    expect(name.getAttribute("aria-describedby")).toContain("-error");
    expect(screen.getByLabelText(/I agree that SeatPlan/).getAttribute("aria-describedby")).toBe("reg-consent-error");
    expect(callsTo(server, "POST", "/j/tok/register")).toEqual([]);
  });

  it("refuses a 9-character password before sending", () => {
    const server = startFakeServer();
    renderPage();
    fillForm("012345678");
    fireEvent.click(screen.getByRole("button", { name: "Send my code" }));
    expect(within(screen.getByRole("alert")).getByText("Use at least 10 characters.")).toBeTruthy();
    expect(callsTo(server, "POST", "/j/tok/register")).toEqual([]);
  });

  it("shows the password on request without moving focus", () => {
    startFakeServer();
    renderPage();
    const toggle = screen.getByRole("button", { name: "Show password" });
    toggle.focus();
    fireEvent.click(toggle);
    expect(screen.getByLabelText("Password").getAttribute("type")).toBe("text");
    expect(toggle.getAttribute("aria-pressed")).toBe("true");
    expect(toggle.textContent).toBe("Hide password");
    expect(document.activeElement).toBe(toggle);
  });

  it("puts a server validation message next to the field it names", async () => {
    const server = startFakeServer();
    server.routes.set("POST /j/tok/register", () => errorReply(422, "validation", "password: Use at least 10 characters."));
    renderPage();
    fillForm();
    fireEvent.click(screen.getByRole("button", { name: "Send my code" }));
    await screen.findByRole("alert");
    expect(screen.getByLabelText("Password").getAttribute("aria-invalid")).toBe("true");
  });

  it("sends the form, then moves to the code step with its heading focused", async () => {
    const server = startFakeServer();
    await reachCodeStep(server);
    expect(callsTo(server, "POST", "/j/tok/register")).toEqual([
      { name: "Nina Lopes", email: "nina@example.com", password: "a long password", needs_accessible: false, consent: true },
    ]);
    expect(document.activeElement).toBe(screen.getByRole("heading", { level: 1, name: "Check your email" }));
    expect(screen.getByText("ni***@example.com")).toBeTruthy();
    expect(screen.queryByText(/Demo only/)).toBeNull();
    const code = screen.getByLabelText("Code");
    expect(code.getAttribute("autocomplete")).toBe("one-time-code");
    expect(code.getAttribute("inputmode")).toBe("numeric");
    // "Send a new code" waits 30 seconds.
    expect((screen.getByRole("button", { name: /Send a new code/ }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("shows the demo code only when the server sent one", async () => {
    const server = startFakeServer();
    await reachCodeStep(server, { ...SENT, demo_code: "123456" });
    expect(screen.getByText("Demo only: your code is 123456")).toBeTruthy();
  });

  it("goes back to the form with the password emptied for a different email", async () => {
    const server = startFakeServer();
    await reachCodeStep(server);
    fireEvent.click(screen.getByRole("button", { name: "Use a different email" }));
    expect((screen.getByLabelText("Password") as HTMLInputElement).value).toBe("");
    expect((screen.getByLabelText("Email") as HTMLInputElement).value).toBe("nina@example.com");
    expect(document.activeElement).toBe(screen.getByRole("heading", { level: 1, name: "Create your account" }));
  });

  it("shows a wrong code next to the code field", async () => {
    const server = startFakeServer();
    server.routes.set("POST /guest/verify", () => errorReply(422, "validation", "That code is not right. You have 4 tries left."));
    await reachCodeStep(server);
    type("Code", "000000");
    fireEvent.click(screen.getByRole("button", { name: "Create my account" }));
    expect(await screen.findAllByText("That code is not right. You have 4 tries left.")).toHaveLength(2); // summary and field
    expect(screen.getByLabelText("Code").getAttribute("aria-invalid")).toBe("true");
  });

  it("asks for 6 digits before calling the server", async () => {
    const server = startFakeServer();
    await reachCodeStep(server);
    type("Code", "12ab");
    fireEvent.click(screen.getByRole("button", { name: "Create my account" }));
    expect(screen.getAllByText("Enter the 6 digits from the email.").length).toBeGreaterThan(0);
    expect(callsTo(server, "POST", "/guest/verify")).toEqual([]);
  });

  const ROUTES: [JoinStatus, string | null, string][] = [
    ["joined", "spring", "/my/spring"],
    ["already_member", "spring", "/my/spring"],
    ["linked", "spring", "/my/spring"],
    ["event_full", null, "/my | Your account is ready, but this event filled up while you were signing up."],
    ["link_closed", null, "/my | Your account is ready, but the organiser has closed sign-ups for this event."],
    ["deadline_passed", null, "/my | Your account is ready, but seat choices for this event have closed."],
  ];

  it.each(ROUTES)("after verify, %s goes to the right page", async (status, eventId, where) => {
    const server = startFakeServer();
    server.routes.set("POST /guest/verify", () => ({ status: 201, body: { token: "g.7.0.9999999999.sig", account: ACCOUNT, join: { status, event_id: eventId } } }));
    await reachCodeStep(server);
    type("Code", "123456");
    fireEvent.click(screen.getByRole("button", { name: "Create my account" }));
    expect((await screen.findByTestId("where")).textContent).toBe(where);
    // The sign-up id from the register answer goes back with the code.
    expect(callsTo(server, "POST", "/guest/verify")).toEqual([{ email: "nina@example.com", code: "123456", signup_id: "this-browser-only" }]);
    expect(getGuestToken()).toBe("g.7.0.9999999999.sig");
  });

  it("says which toast a linked invitation gets", async () => {
    const server = startFakeServer();
    server.routes.set("POST /guest/verify", () => ({ status: 201, body: { token: "t", account: ACCOUNT, join: { status: "linked", event_id: "spring" } } }));
    await reachCodeStep(server);
    type("Code", "123456");
    fireEvent.click(screen.getByRole("button", { name: "Create my account" }));
    expect(await screen.findByText("Your account is ready. We found your invitation, so your details are already here.")).toBeTruthy();
  });

  it("allows a new code after 30 seconds and says so once", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const server = startFakeServer();
    await reachCodeStep(server);
    const resend = screen.getByRole("button", { name: /Send a new code/ }) as HTMLButtonElement;
    expect(resend.disabled).toBe(true);
    for (let i = 0; i < 30; i += 1) {
      await act(async () => {
        vi.advanceTimersByTime(1000);
      });
    }
    expect(resend.disabled).toBe(false);
    expect(screen.getByText("You can ask for a new code now.")).toBeTruthy();
    fireEvent.click(resend);
    expect(await screen.findByText("We sent a new code.")).toBeTruthy();
    expect(callsTo(server, "POST", "/j/tok/register")).toHaveLength(2);
  });
});
