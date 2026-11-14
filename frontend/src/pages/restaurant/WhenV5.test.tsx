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
  expect(await screen.findByText("20:00 is not available.")).toBeTruthy();
  expect(screen.getByRole("link",{name:"19:45 15 min earlier"})).toBeTruthy();
  fireEvent.click(screen.getByRole("link",{name:"20:15 15 min later"}));
  expect(pick).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button",{name:"Choose a table at 20:15"}));
  expect(pick).toHaveBeenCalledWith("20:15");
});
it("blocks the previous day's choice while new availability is loading",async()=>{
 let complete!:(answer:typeof SLOTS)=>void;
 const pending=new Promise<typeof SLOTS>(resolve=>{complete=resolve;});
 mockApi({[`GET /api/r/${VENUE}/slots`]:()=>SLOTS});
 const originalFetch=globalThis.fetch;
 vi.stubGlobal("fetch",(input:RequestInfo|URL,init?:RequestInit)=>String(input).includes("2030-05-02") ? pending.then(answer=>new Response(JSON.stringify(answer),{status:200,headers:{"Content-Type":"application/json"}})) : originalFetch(input,init));
 const pick=vi.fn();const needs={date:"2030-05-01",party:2,needs_accessible:false,high_chairs:0};
 const view=render(<StepTime venueId={VENUE} needs={needs} onPick={pick} onBack={()=>{}}/>);
 fireEvent.click(await screen.findByRole("button",{name:/19:30/}));
 expect(screen.getByRole("button",{name:"Choose a table at 19:30"})).toBeTruthy();
 view.rerender(<StepTime venueId={VENUE} needs={{...needs,date:"2030-05-02"}} onPick={pick} onBack={()=>{}}/>);
 expect(screen.queryByRole("button",{name:"Choose a table at 19:30"})).toBeNull();
 expect(screen.queryByRole("button",{name:/19:30/})).toBeNull();
 complete({...SLOTS,slots:[{time:"19:30",service:"Dinner",status:"full",reason:"no_table"}]});
 fireEvent.click(await screen.findByRole("button",{name:/19:30/}));
 expect(await screen.findByRole("dialog",{name:"19:30 is full"})).toBeTruthy();
 expect(pick).not.toHaveBeenCalled();
});
