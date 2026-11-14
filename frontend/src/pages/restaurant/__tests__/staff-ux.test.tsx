import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, expect, it, vi } from "vitest";
import StaffPage from "../StaffPage";
import { FLOOR, INFO, SERVICE_PLAN, VENUE, WHATIF_TABLE_3 } from "./fixtures";
import { callsTo, mockApi } from "./mockApi";
const API=`/api/staff/${VENUE}`;
function show(){render(<MemoryRouter initialEntries={[`/staff/${VENUE}`]}><Routes><Route path="/staff/:venueId" element={<StaffPage/>}/></Routes></MemoryRouter>)}
afterEach(()=>vi.unstubAllGlobals());

it("uses the inspected time outside service in both walk-in preview and confirmation context",async()=>{
 const calls=mockApi({[`GET ${API}/floor`]:call=>({...FLOOR,time:call.query.get("time")}),[`POST ${API}/whatif`]:()=>WHATIF_TABLE_3});
 show();
 const slider=await screen.findByRole("slider",{name:"View floor time"});
 fireEvent.change(slider,{target:{value:"165"}});
 await screen.findByText("Viewing 02:45 · Outside service");
 fireEvent.click(screen.getByRole("button",{name:"New walk-in"}));
 const dialog=screen.getByRole("dialog",{name:"Walk-in at 02:45"});
 expect(within(dialog).getByText(/Effective booking time/).textContent).toContain("02:45");
 fireEvent.click(within(dialog).getByRole("button",{name:"Find a table"}));
 await within(dialog).findByText("Only free table for 5");
 expect(callsTo(calls,"POST",`${API}/whatif`)[0]?.body).toMatchObject({time:"02:45"});
 expect(callsTo(calls,"POST",`${API}/walkins`)).toHaveLength(0);
});

it("never applies optimiser moves without the final explicit confirmation",async()=>{
 const calls=mockApi({[`GET ${API}/schedule`]:()=>INFO.schedule,[`POST ${API}/optimise/service`]:()=>SERVICE_PLAN});
 show();fireEvent.click(screen.getByRole("tab",{name:"Optimise"}));
 fireEvent.click(await screen.findByRole("button",{name:"Preview moves"}));
 fireEvent.click(await screen.findByRole("button",{name:"Apply 1 move"}));
 const dialog=screen.getByRole("dialog",{name:/Apply 1 move/});
 expect(callsTo(calls,"POST",`${API}/optimise/service`)).toHaveLength(1);
 fireEvent.click(within(dialog).getByRole("button",{name:"Keep current tables"}));
 expect(callsTo(calls,"POST",`${API}/optimise/service`)).toHaveLength(1);
 fireEvent.click(screen.getByRole("button",{name:"Apply 1 move"}));
 fireEvent.click(within(screen.getByRole("dialog")).getByRole("button",{name:"Confirm 1 move"}));
 await screen.findByText("Done: 1 booking moved.");
 expect(callsTo(calls,"POST",`${API}/optimise/service`)[1]?.body).toMatchObject({apply:true,plan_id:SERVICE_PLAN.plan_id});
});

it("requires a fresh walk-in proposal after the chosen table conflicts",async()=>{
 const calls=mockApi({[`GET ${API}/floor`]:()=>FLOOR,[`POST ${API}/whatif`]:()=>WHATIF_TABLE_3,[`POST ${API}/walkins`]:()=>new Response(JSON.stringify({error:{code:"seat_taken",message:"That table was just taken."}}),{status:409})});
 show();fireEvent.click(await screen.findByRole("button",{name:"New walk-in"}));
 const dialog=screen.getByRole("dialog",{name:/Walk-in at/});
 fireEvent.click(within(dialog).getByRole("button",{name:"Find a table"}));
 fireEvent.click(await within(dialog).findByRole("button",{name:"Seat at Table 3"}));
 await within(dialog).findByRole("alert");
 expect(within(dialog).queryByRole("button",{name:"Seat at Table 3"})).toBeNull();
 expect(within(dialog).getByRole("button",{name:"Find a table"})).toBeTruthy();
 expect(callsTo(calls,"POST",`${API}/walkins`)).toHaveLength(1);
});

it("keeps an unsaved weekly schedule when changing the viewed day or visiting another staff tab",async()=>{
 const calls=mockApi({[`GET ${API}/schedule`]:()=>INFO.schedule,[`GET ${API}/floor`]:()=>FLOOR});
 show();fireEvent.click(screen.getByRole("tab",{name:"Schedule"}));
 const input=(await screen.findAllByLabelText("Name, Lunch"))[0] as HTMLInputElement;
 fireEvent.change(input,{target:{value:"Brunch"}});
 expect(screen.getByText("Unsaved changes")).toBeTruthy();
 fireEvent.change(screen.getByLabelText("Day"),{target:{value:"2030-05-01"}});
 fireEvent.click(screen.getByRole("tab",{name:"Floor"}));
 await screen.findByText("Rui Costa");
 fireEvent.click(screen.getByRole("tab",{name:"Schedule"}));
 expect((screen.getByLabelText("Name, Brunch") as HTMLInputElement).value).toBe("Brunch");
 expect(screen.getByText("Unsaved changes")).toBeTruthy();
 expect(callsTo(calls,"PUT",`${API}/schedule`)).toHaveLength(0);
});

it("discards an optimiser preview and its confirmation when the day changes",async()=>{
 const calls=mockApi({[`GET ${API}/schedule`]:()=>INFO.schedule,[`POST ${API}/optimise/service`]:()=>SERVICE_PLAN});
 show();fireEvent.click(screen.getByRole("tab",{name:"Optimise"}));
 fireEvent.click(await screen.findByRole("button",{name:"Preview moves"}));
 fireEvent.click(await screen.findByRole("button",{name:"Apply 1 move"}));
 fireEvent.change(screen.getByLabelText("Day"),{target:{value:"2030-05-01"}});
 expect(screen.queryByRole("dialog")).toBeNull();
 expect(screen.queryByRole("button",{name:"Apply 1 move"})).toBeNull();
 expect(callsTo(calls,"POST",`${API}/optimise/service`)).toHaveLength(1);
});

it("does not report an observed zero percent without a historical sample",async()=>{
 mockApi({[`GET ${API}/dashboard`]:()=>({date:"2030-05-01",covers:{expected:0,seated:0,no_show:0,cancelled:0},bookings:0,seats:10,no_show_rate:0,no_show_based_on:0,services:[]})});
 show();fireEvent.click(screen.getByRole("tab",{name:"Dashboard"}));
 const historical=await screen.findByText("Historical no-show rate");
 expect(historical.parentElement?.textContent).toContain("No data");
 expect(screen.getByText("Covers booked").parentElement?.textContent).toContain("0");
 expect(screen.getByText("No service data for this date")).toBeTruthy();
});

it("labels the device clock when restaurant timezone metadata is unavailable",async()=>{
 mockApi({[`GET ${API}/floor`]:()=>FLOOR});show();
 expect(await screen.findByText(/Using the device clock/)).toBeTruthy();
});
