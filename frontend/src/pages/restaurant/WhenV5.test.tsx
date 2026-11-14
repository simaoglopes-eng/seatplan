import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { StepTime } from "./StepTime";
import { SLOTS, VENUE } from "./__tests__/fixtures";
import { mockApi } from "./__tests__/mockApi";

afterEach(() => vi.unstubAllGlobals());
it("selects an exact usable time before explicitly continuing to tables", async () => {
  mockApi({ [`GET /api/r/${VENUE}/slots`]: () => SLOTS });
  const pick = vi.fn();
  render(<StepTime venueId={VENUE} needs={{date:"2030-05-01",party:2,needs_accessible:true,high_chairs:1}} onPick={pick} onBack={() => {}} />);
  fireEvent.click(await screen.findByRole("button", {name:/19:30/}));
  expect(pick).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", {name:"Choose a table at 19:30"}));
  expect(pick).toHaveBeenCalledWith("19:30");
});
it("recovers a lost 20:00 with concrete alternatives and keeps requirements", async () => {
  mockApi({ [`GET /api/r/${VENUE}/slots`]: () => ({...SLOTS,slots:[{time:"19:45",service:"Dinner",status:"available",reason:null},{time:"20:00",service:"Dinner",status:"full",reason:"no_table"},{time:"20:15",service:"Dinner",status:"limited",reason:null}]}) });
  const pick=vi.fn();
  render(<StepTime venueId={VENUE} wanted="20:00" needs={{date:"2030-05-01",party:4,needs_accessible:true,high_chairs:1}} onPick={pick} onBack={()=>{}}/>);
  expect(await screen.findByRole("heading",{name:"20:00 is not available"})).toBeTruthy();
  expect(screen.getByRole("link",{name:"19:45 15 min earlier"})).toBeTruthy();
  fireEvent.click(screen.getByRole("link",{name:"20:15 15 min later"}));
  expect(pick).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button",{name:"Choose a table at 20:15"}));
  expect(pick).toHaveBeenCalledWith("20:15");
});
