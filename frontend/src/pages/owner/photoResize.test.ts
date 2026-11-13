import { expect, it } from "vitest";
import { fitPhoto } from "./photoResize";

it("fits landscape and portrait without enlarging or changing proportions", () => {
  expect(fitPhoto(4000, 3000)).toEqual({ width: 1600, height: 1200 });
  expect(fitPhoto(3000, 4000)).toEqual({ width: 1200, height: 1600 });
  expect(fitPhoto(600, 800)).toEqual({ width: 600, height: 800 });
  expect(fitPhoto(4000, 3000, 1200)).toEqual({ width: 1200, height: 900 });
  expect(() => fitPhoto(0, 100)).toThrow();
  expect(() => fitPhoto(Infinity, 100)).toThrow();
});
