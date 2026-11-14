import {fireEvent,render,screen,waitFor,within} from "@testing-library/react";
import {MemoryRouter} from "react-router-dom";
import {beforeEach,afterEach,it,expect,vi} from "vitest";
import DiscoverPage from "./DiscoverPage";
vi.mock("../../maps/ResultsMap",()=>({default:()=> <div>Restaurant map</div>}));
beforeEach(()=>{sessionStorage.clear();vi.stubGlobal("matchMedia",()=>({matches:false,addEventListener:()=>{},removeEventListener:()=>{}}));vi.stubGlobal("fetch",vi.fn(async()=>new Response(JSON.stringify({items:[],total:0}))));});
afterEach(()=>vi.unstubAllGlobals());
it("cancels filter edits without changing applied context and returns focus to the opener",async()=>{
 render(<MemoryRouter><DiscoverPage/></MemoryRouter>);
 const opener=screen.getByRole("button",{name:/^Filters/});opener.focus();fireEvent.click(opener);
 const dialog=screen.getByRole("dialog",{name:"Filters"});
 fireEvent.change(within(dialog).getByLabelText("Date"),{target:{value:"2030-05-01"}});
 fireEvent.click(within(dialog).getByRole("button",{name:/Cancel filters/}));
 expect(screen.getByRole("button",{name:/When and where/}).textContent).toContain("Any date");
 expect(document.activeElement).toBe(opener);
 fireEvent.click(opener);
 expect((within(screen.getByRole("dialog")).getByLabelText("Date") as HTMLInputElement).value).toBe("");
 await waitFor(()=>expect(screen.getByRole("heading",{name:"No restaurants match"})).toBeTruthy());
});

it("clears only the search term, retaining the applied booking and access context",async()=>{
 const asked:URLSearchParams[]=[];
 vi.stubGlobal("fetch",vi.fn(async(input:RequestInfo|URL)=>{asked.push(new URL(String(input),"http://localhost").searchParams);return new Response(JSON.stringify({items:[],total:0}));}));
 render(<MemoryRouter><DiscoverPage/></MemoryRouter>);
 fireEvent.click(screen.getByRole("button",{name:/^Filters/}));
 const panel=screen.getByRole("dialog",{name:"Filters"});
 fireEvent.change(within(panel).getByLabelText("Choose a city"),{target:{value:"Lisboa"}});
 fireEvent.change(within(panel).getByLabelText("Date"),{target:{value:"2030-05-01"}});
 fireEvent.change(within(panel).getByLabelText("People"),{target:{value:"4"}});
 fireEvent.click(within(panel).getByRole("button",{name:"Wheelchair-accessible table"}));
 fireEvent.click(within(panel).getByRole("button",{name:/^Apply/}));
 fireEvent.change(screen.getByLabelText("Restaurant or cuisine"),{target:{value:"Sushi Palace"}});
 await screen.findByRole("heading",{name:/No restaurants match.*Sushi Palace/});
 await waitFor(()=>expect(asked.at(-1)?.get("q")).toBe("Sushi Palace"));
 fireEvent.click(screen.getByRole("button",{name:"Clear search term"}));
 await waitFor(()=>expect(asked.at(-1)?.has("q")).toBe(false));
 const request=asked.at(-1)!;
 expect([request.get("date"),request.get("time"),request.get("party"),request.get("lat")]).toEqual(["2030-05-01","20:00","4","38.7223"]);
 expect(request.getAll("features")).toEqual(["accessible"]);
});
it("finds the results from the desktop context bar and moves keyboard focus there",async()=>{
 vi.stubGlobal("matchMedia",()=>({matches:true,addEventListener:()=>{},removeEventListener:()=>{}}));
 render(<MemoryRouter><DiscoverPage/></MemoryRouter>);
 fireEvent.change(screen.getByLabelText("Date"),{target:{value:"2030-05-01"}});
 fireEvent.click(screen.getByRole("button",{name:/^Find a table/}));
 expect(document.activeElement?.id).toBe("discover-results-title");
});
