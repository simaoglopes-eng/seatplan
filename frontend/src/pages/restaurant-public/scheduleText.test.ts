import { describe, expect, it } from "vitest";
import { weeklyRows } from "./scheduleText";

const lunch = (weekday: number) => ({ weekday, start_time: "12:00", end_time: "15:00" });
const dinner = (weekday: number) => ({ weekday, start_time: "19:00", end_time: "23:00" });

describe("weeklyRows", () => {
  it("joins the days that share hours and names the closed day", () => {
    const periods = [1, 2, 3, 4, 5, 6].flatMap((d) => [dinner(d), lunch(d)]);
    expect(weeklyRows(periods)).toEqual([
      { days: "Mon", hours: "Closed" },
      { days: "Tue-Sun", hours: "12:00-15:00, 19:00-23:00" },
    ]);
  });

  it("splits when the hours differ and writes two days with a comma", () => {
    const periods = [lunch(0), lunch(1), lunch(2), dinner(3), dinner(4), lunch(5)];
    expect(weeklyRows(periods)).toEqual([
      { days: "Mon-Wed", hours: "12:00-15:00" },
      { days: "Thu, Fri", hours: "19:00-23:00" },
      { days: "Sat", hours: "12:00-15:00" },
      { days: "Sun", hours: "Closed" },
    ]);
  });

  it("gives nothing for a restaurant with no hours", () => {
    expect(weeklyRows([])).toEqual([]);
  });
});
