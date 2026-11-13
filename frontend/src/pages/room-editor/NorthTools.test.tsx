import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { createRoom } from "./roomModel";
import { NorthTools } from "./NorthTools";

it("lets the owner confirm zero degrees when north has not been set", () => {
  const onChange = vi.fn();
  render(<NorthTools room={createRoom("Main", 1000, 700)} onChange={onChange} />);
  fireEvent.change(screen.getByLabelText("North is at (degrees)"), { target: { value: "0" } });
  fireEvent.blur(screen.getByLabelText("North is at (degrees)"));
  expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ north_deg: 0 }));
});
