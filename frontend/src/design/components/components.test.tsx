import { act, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { Button } from "./Button";
import { Dialog } from "./Dialog";
import { Legend } from "./Legend";

describe("Button", () => {
  it("stays focusable while busy, so focus is not dropped to the page", () => {
    // A natively disabled button loses focus in real browsers; aria-disabled does not.
    const onClick = vi.fn();
    render(<Button busy onClick={onClick}>Find a table</Button>);
    const button = screen.getByRole("button", { name: "Find a table" });
    expect(button.hasAttribute("disabled")).toBe(false);
    expect(button.getAttribute("aria-disabled")).toBe("true");
    fireEvent.click(button);
    expect(onClick).not.toHaveBeenCalled(); // still blocks the double submit
  });

  it("does not submit its form while busy", () => {
    const onSubmit = vi.fn((event: React.FormEvent) => event.preventDefault());
    render(
      <form onSubmit={onSubmit}>
        <Button type="submit" busy>Save</Button>
      </form>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("is still natively disabled when disabled on purpose", () => {
    render(<Button disabled>Save</Button>);
    expect(screen.getByRole("button", { name: "Save" }).hasAttribute("disabled")).toBe(true);
  });
});

/** A dialog whose only button is replaced by other content, like the walk-in "Find a table". */
function ChangingDialog({ onClose }: { onClose: () => void }) {
  const [found, setFound] = useState(false);
  return (
    <Dialog open title="New walk-in" onClose={onClose}>
      {found ? (
        <>
          <p>Table W1 is free.</p>
          <button type="button">Seat at Table W1</button>
          <button type="button">Cancel</button>
        </>
      ) : (
        <button type="button" onClick={() => setFound(true)}>Find a table</button>
      )}
    </Dialog>
  );
}

describe("Dialog", () => {
  it("still closes with Escape after focus fell out of it", () => {
    const onClose = vi.fn();
    render(<ChangingDialog onClose={onClose} />);
    act(() => (document.activeElement as HTMLElement).blur()); // what a vanished control does
    expect(document.activeElement).toBe(document.body);
    fireEvent.keyDown(document.body, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("brings Tab back inside when focus is outside, and wraps over the new content", () => {
    render(
      <>
        <button type="button">Behind the dialog</button>
        <ChangingDialog onClose={() => undefined} />
      </>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Find a table" }));
    act(() => (document.activeElement as HTMLElement).blur());
    fireEvent.keyDown(document.body, { key: "Tab" });
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Seat at Table W1" }));
    // The list of controls is read again on every Tab, so the new buttons count.
    act(() => screen.getByRole("button", { name: "Cancel" }).focus());
    fireEvent.keyDown(document.activeElement as HTMLElement, { key: "Tab" });
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Seat at Table W1" }));
  });
});

describe("Legend", () => {
  it("explains the map's second highlight with the same square shape", () => {
    render(<Legend states={["free"]} markedLabel="Changed by this preview" />);
    expect(screen.getByText("Changed by this preview")).toBeTruthy();
    expect(document.querySelector("rect.ring-marked")).not.toBeNull();
  });
});
