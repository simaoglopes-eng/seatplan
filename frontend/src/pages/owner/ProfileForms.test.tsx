import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { EMPTY_PROFILE, LocationForm } from "./ProfileForms";

it("requests geolocation only after the owner clicks and keeps coordinate fields usable", () => {
  const locate = vi.fn((success: (value: { coords: { latitude: number; longitude: number } }) => void) => success({ coords: { latitude: 38.7, longitude: -9.1 } }));
  Object.defineProperty(navigator, "geolocation", { configurable: true, value: { getCurrentPosition: locate } });
  render(<LocationForm profile={EMPTY_PROFILE} label="Save" onSave={vi.fn()} />);
  expect(locate).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Use my current location" }));
  expect(locate).toHaveBeenCalledTimes(1);
  expect(screen.getByLabelText<HTMLInputElement>("Latitude").value).toBe("38.700000");
  expect(screen.getByLabelText<HTMLInputElement>("Longitude").value).toBe("-9.100000");
  fireEvent.change(screen.getByLabelText("Latitude"), { target: { value: "39" } });
  expect(screen.getByLabelText<HTMLInputElement>("Latitude").value).toBe("39");
  Reflect.deleteProperty(navigator, "geolocation");
});
