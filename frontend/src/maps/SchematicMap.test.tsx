import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SchematicMap } from "./SchematicMap";

const PINS = [
  { id: "a", name: "Casa A", lat: 38.7223, lng: -9.1393 },
  { id: "b", name: "Casa B", lat: 38.7323, lng: -9.1293 },
];

describe("SchematicMap", () => {
  it("shows numbered pins, says why it is a diagram, and is not a grey box", () => {
    render(<SchematicMap pins={PINS} highlightedId={null} onSelect={() => undefined} />);
    expect(screen.getByRole("region", { name: "Diagram of where the restaurants are" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "1. Casa A" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "2. Casa B" })).toBeTruthy();
    expect(screen.getByRole("status").textContent).toMatch(/tiles are not available.*Numbers match the list/);
  });

  it("selects a restaurant with a click, Enter or Space, like the real map's pins", () => {
    const onSelect = vi.fn();
    render(<SchematicMap pins={PINS} highlightedId={null} onSelect={onSelect} />);
    const pin = screen.getByRole("button", { name: "2. Casa B" });
    fireEvent.click(pin);
    fireEvent.keyDown(pin, { key: "Enter" });
    fireEvent.keyDown(pin, { key: " " });
    fireEvent.keyDown(pin, { key: "a" });
    expect(onSelect.mock.calls).toEqual([["b"], ["b"], ["b"]]);
  });

  it("marks the highlighted pin and the searcher's own place", () => {
    const { container } = render(<SchematicMap pins={PINS} highlightedId="a" onSelect={() => undefined} centre={{ lat: 38.73, lng: -9.14 }} />);
    expect(container.querySelector(".schematic-pin.is-active")?.getAttribute("aria-label")).toBe("1. Casa A");
    expect(container.querySelector(".schematic-centre")).not.toBeNull();
  });
});
