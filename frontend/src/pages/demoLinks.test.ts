import { describe, expect, it } from "vitest";
import { demoEntries } from "./demoLinks";

describe("demoEntries", () => {
  it("puts the shared link and the guest account pages on the events card", () => {
    const entries = demoEntries({ wedding_share: "/j/abc", my_events: "/my", attendee_ana: "/a/tok", staff: "/staff/v1", docs: "/api/docs" });
    const group = (name: string) => entries.find((e) => e.name === name)?.group;
    expect(group("wedding_share")).toBe("events");
    expect(group("my_events")).toBe("events");
    expect(group("attendee_ana")).toBe("events");
    expect(group("staff")).toBe("restaurant");
    expect(group("docs")).toBe("tools");
    expect(demoEntries({ showcase_tagus_terrace: "/restaurants/tagus-terrace" })[0].group).toBe("restaurant");
    expect(entries.find((e) => e.name === "wedding_share")?.label).toBe("Wedding Share");
  });
});
