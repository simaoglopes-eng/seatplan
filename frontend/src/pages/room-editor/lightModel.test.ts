import { describe, expect, it } from "vitest";
import { compassWord, lightSteps, presetTimes, sunDirection, sunSentence } from "./lightModel";

const SUN = { sunrise: "06:12", sunset: "21:05", azimuth: 180, altitude: 74 };

describe("compassWord", () => {
  it("names the eight directions", () => {
    expect([0, 45, 90, 135, 180, 225, 270, 315].map(compassWord)).toEqual(["north", "north-east", "east", "south-east", "south", "south-west", "west", "north-west"]);
  });

  it("rounds to the nearest direction and wraps round", () => {
    expect(compassWord(359)).toBe("north");
    expect(compassWord(22)).toBe("north");
    expect(compassWord(23)).toBe("north-east");
    expect(compassWord(-10)).toBe("north");
  });
});

describe("sunSentence", () => {
  it("says where the sun is, how high, and when it sets", () => {
    expect(sunSentence("2026-06-21", "13:00", SUN)).toBe("On 21 June at 13:00 the sun is in the south (180°), 74° high. Sunset at 21:05.");
  });

  it("rounds the angles to whole degrees", () => {
    expect(sunSentence("2026-12-01", "09:15", { ...SUN, azimuth: 132.6, altitude: 15.4 })).toContain("south-east (133°), 15° high");
  });

  it("says so when the sun is below the horizon", () => {
    const text = sunSentence("2026-06-21", "23:00", { ...SUN, azimuth: 330, altitude: -9 });
    expect(text).toBe("On 21 June at 23:00 the sun is below the horizon. Sunset was at 21:05.");
  });

  it("copes with days without a sunset (polar) and with no sun answer at all", () => {
    expect(sunSentence("2026-06-21", "13:00", { ...SUN, sunset: null })).toBe("On 21 June at 13:00 the sun is in the south (180°), 74° high.");
    expect(sunSentence("2026-06-21", "13:00", null)).toBe("");
  });
});

describe("lightSteps and presetTimes", () => {
  it("runs from 06:00 to 23:45 in 15-minute steps", () => {
    const steps = lightSteps();
    expect([steps[0], steps[1], steps.at(-1), steps.length]).toEqual(["06:00", "06:15", "23:45", 72]);
  });

  it("offers sunrise, lunch, sunset and dinner, with sunrise and sunset on the 15-minute grid", () => {
    expect(presetTimes(SUN)).toEqual([
      { name: "Sunrise", time: "06:15" },
      { name: "Lunch 13:00", time: "13:00" },
      { name: "Sunset", time: "21:00" },
      { name: "Dinner 20:30", time: "20:30" },
    ]);
  });

  it("keeps lunch and dinner when the sun times are unknown, and never leaves the slider", () => {
    expect(presetTimes(null).map((p) => p.name)).toEqual(["Lunch 13:00", "Dinner 20:30"]);
    expect(presetTimes({ ...SUN, sunrise: "05:10", sunset: "23:58" }).map((p) => p.time)).toEqual(["06:00", "13:00", "23:45", "20:30"]);
  });
});

describe("sunDirection", () => {
  it("turns the sun's compass bearing into a screen direction using the room's north", () => {
    // North is straight up on screen (0): a sun in the south shines from below, so it is at the bottom.
    expect(sunDirection(180, 0)).toEqual({ x: 0, y: 1 });
    // The room is turned so that true north points to the screen's right (90): the sun in the east is at the bottom.
    const east = sunDirection(90, 90);
    expect(east.x).toBeCloseTo(0, 10);
    expect(east.y).toBeCloseTo(1, 10);
  });

  it("is a unit vector", () => {
    const d = sunDirection(250, 35);
    expect(Math.hypot(d.x, d.y)).toBeCloseTo(1, 10);
  });
});
