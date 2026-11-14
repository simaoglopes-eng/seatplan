import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, expect, it, vi } from "vitest";
import { clearSessionToken, getSessionToken } from "../../api/client";
import OwnerSignUpPage from "./OwnerSignUpPage";

afterEach(() => { vi.unstubAllGlobals(); clearSessionToken(); });

it("verifies an owner code before entering My restaurants", async () => {
  vi.stubGlobal("fetch", vi.fn(async (url: string) => new Response(JSON.stringify(
    url.endsWith("/register") ? { signup_id: "browser-signup", code_shown: "123456" } : { token: "owner-session", user: { name: "Owner", email: "owner@example.com" } }
  ), { status: url.endsWith("/register") ? 202 : 201 })));
  render(<MemoryRouter initialEntries={["/owner/sign-up"]}><Routes>
    <Route path="/owner/sign-up" element={<OwnerSignUpPage />} />
    <Route path="/owner" element={<h1>My restaurants</h1>} />
  </Routes></MemoryRouter>);
  fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Owner" } });
  fireEvent.change(screen.getByLabelText("Email"), { target: { value: "owner@example.com" } });
  fireEvent.change(screen.getByLabelText("Password"), { target: { value: "a long safe password" } });
  fireEvent.click(screen.getByRole("checkbox"));
  fireEvent.click(screen.getByRole("button", { name: "Send verification code" }));
  await screen.findByLabelText("Verification code");
  expect(getSessionToken()).toBeNull();
  fireEvent.change(screen.getByLabelText("Verification code"), { target: { value: "123456" } });
  fireEvent.click(screen.getByRole("button", { name: "Verify and continue" }));
  await screen.findByRole("heading", { name: "My restaurants" });
  expect(getSessionToken()).toBe("owner-session");
});

it("says what is wrong beside each field, summarises it, and keeps the rest when one is fixed", async () => {
  const fetcher = vi.fn();
  vi.stubGlobal("fetch", fetcher);
  render(<MemoryRouter initialEntries={["/owner/sign-up"]}><Routes><Route path="/owner/sign-up" element={<OwnerSignUpPage />} /></Routes></MemoryRouter>);
  fireEvent.click(screen.getByRole("button", { name: "Send verification code" }));
  expect(fetcher).not.toHaveBeenCalled();
  // Each problem is said twice: beside its field, and as a link in the summary above the form.
  expect((await screen.findAllByText("Enter your name.")).length).toBe(2);
  expect(screen.getAllByText("Enter a valid email address.").length).toBe(2);
  expect(screen.getByText("Please fix 4 things:")).toBeTruthy();
  // Focus goes to the first field with a problem.
  expect(document.activeElement).toBe(screen.getByLabelText("Name"));
  // Fixing one field keeps what was typed elsewhere.
  fireEvent.change(screen.getByLabelText("Email"), { target: { value: "owner@example.com" } });
  fireEvent.click(screen.getByRole("button", { name: "Send verification code" }));
  expect((screen.getByLabelText("Email") as HTMLInputElement).value).toBe("owner@example.com");
  expect(screen.queryAllByText("Enter a valid email address.")).toHaveLength(0);
});
