import { describe, expect, it } from "vitest";
import { safeNext, signInPath } from "./safeNext";

describe("safeNext: only /my/ pages, never another site", () => {
  it("accepts a page of the guest area", () => {
    expect(safeNext("/my/abc")).toBe("/my/abc");
    expect(safeNext("/my/account")).toBe("/my/account");
  });

  it.each([
    ["//evil.example.com"],
    ["https://evil.example.com"],
    ["/my//evil.example.com"],
    ["/my/a:b"],
    ["/my/\\evil.example.com"],
    ["/e/abc"],
    ["/my"],
    [""],
  ])("refuses %j", (next) => {
    expect(safeNext(next)).toBeNull();
  });

  it("refuses a missing value", () => {
    expect(safeNext(null)).toBeNull();
    expect(safeNext(undefined)).toBeNull();
  });

  it("builds the sign-in path, keeping only a safe next page", () => {
    expect(signInPath("/my/spring")).toBe("/my/sign-in?next=%2Fmy%2Fspring");
    expect(signInPath("/organiser/x")).toBe("/my/sign-in");
  });
});
