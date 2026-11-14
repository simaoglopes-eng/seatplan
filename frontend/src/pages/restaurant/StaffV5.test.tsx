import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, expect, it, vi } from "vitest";
import StaffPage from "./StaffPage";
import { FLOOR, VENUE } from "./__tests__/fixtures";
import { mockApi } from "./__tests__/mockApi";
afterEach(()=>vi.unstubAllGlobals());
it("keeps Seat now primary and discloses uncommon booking actions",async()=>{
 mockApi({[`GET /api/staff/${VENUE}/floor`]:()=>FLOOR});
 render(<MemoryRouter initialEntries={[`/staff/${VENUE}`]}><Routes><Route path="/staff/:venueId" element={<StaffPage/>}/></Routes></MemoryRouter>);
 const arrivals=await screen.findByRole("list",{name:"Upcoming arrivals"});
 fireEvent.click(within(arrivals).getByRole("button",{name:/Rui Costa/}));
 expect(screen.getByRole("button",{name:"Seat now"})).toBeTruthy();
 expect(screen.queryByRole("button",{name:"Move or combine"})).toBeNull();
 fireEvent.click(screen.getByRole("button",{name:"More actions"}));
 expect(screen.getByRole("button",{name:"Move or combine"})).toBeTruthy();
 expect(screen.getByRole("option",{name:/Table 2,.*Rui Costa/}).getAttribute("aria-selected")).toBe("true");
});
