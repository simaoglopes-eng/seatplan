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
