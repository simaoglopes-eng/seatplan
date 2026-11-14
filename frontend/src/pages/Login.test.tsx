// The sign-in page speaks to restaurant owners only on their own entry; organisers and staff keep their words.
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { ToastProvider } from "../design/components";
import Login from "./Login";

function open(path: string, defaultNext?: string): void {
  render(
    <ToastProvider>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/owner/sign-in" element={<Login defaultNext={defaultNext} />} />
        </Routes>
      </MemoryRouter>
    </ToastProvider>,
  );
}

describe("Sign in", () => {
  it("tells owners what they are signing in to, offers to show the password, and links to creating an account", () => {
    open("/owner/sign-in", "/owner");
    expect(screen.getByRole("heading", { name: "Sign in to manage your restaurant" })).toBeTruthy();
    const password = screen.getByLabelText("Password") as HTMLInputElement;
    expect(password.type).toBe("password");
    fireEvent.click(screen.getByRole("button", { name: "Show password" }));
    expect(password.type).toBe("text");
    expect(screen.getByRole("button", { name: "Hide password" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("link", { name: "Create a restaurant owner account" }).getAttribute("href")).toBe("/owner/sign-up");
  });

  it("tells staff they are opening the service floor, with no owner-only buttons", () => {
    open("/login?next=/staff/abc");
    expect(screen.getByRole("heading", { name: "Sign in to open the service floor" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /password/i })).toBeNull();
    expect(screen.queryByRole("link", { name: /owner account/ })).toBeNull();
  });

  it("keeps the generic words for organisers", () => {
    open("/login?next=/organiser/abc");
    expect(screen.getByRole("heading", { name: "Sign in" })).toBeTruthy();
    expect(screen.getByText(/For organisers and restaurant staff/)).toBeTruthy();
  });

  it("asks for both fields before sending anything", () => {
    open("/owner/sign-in", "/owner");
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
    expect(screen.getByText("Enter your email and your password.")).toBeTruthy();
  });
});
