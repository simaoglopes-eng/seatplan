import AxeBuilder from "@axe-core/playwright";
import { STAFF, demoLinks, expect, signIn, test } from "./fixtures";
const TAGS=["wcag2a","wcag2aa","wcag21a","wcag21aa"];

test("staff inspect an outside-service time and preview a walk-in without creating it",async({page,request})=>{
 const links=await demoLinks(request);
 await signIn(page,STAFF,links.restaurant_staff);
 await page.getByRole("button",{name:"Change floor time"}).click();
 const slider=page.getByRole("slider",{name:"View floor time"});
 await slider.fill("165");
 await expect(page.getByRole("status").filter({hasText:"Viewing 02:45"})).toHaveCount(1);
 let writes=0;
 page.on("request",r=>{if(r.method()==="POST" && /\/walkins$/.test(new URL(r.url()).pathname)) writes++;});
 await page.getByRole("button",{name:"New walk-in"}).click();
 const dialog=page.getByRole("dialog",{name:"New walk-in"});
 await expect(dialog.getByText(/Effective booking time/)).toContainText("02:45");
 await expect(dialog.getByRole("status")).toContainText("outside service hours");
 await dialog.getByRole("button",{name:"Find a table"}).click();
 await expect(dialog.getByText(/Best place:|No table can take/).first()).toBeVisible();
 expect(writes).toBe(0);
 const scanned=await new AxeBuilder({page}).withTags(TAGS).analyze();
 expect(scanned.violations.map(v=>`${v.id}: ${v.help}`)).toEqual([]);
 await page.keyboard.press("Escape");
 await expect(page.getByRole("button",{name:"New walk-in"})).toBeFocused();
});

test("weekly staff schedule has usable mobile sections and keeps a draft across tabs",async({page,request})=>{
 const links=await demoLinks(request);
 await page.setViewportSize({width:390,height:844});
 await signIn(page,STAFF,links.restaurant_staff);
 await page.getByRole("tab",{name:"Schedule"}).click();
 await expect(page.getByRole("heading",{name:"Weekly schedule"})).toBeVisible();
 const name=page.getByLabel("Name, Lunch",{exact:true}).first();
 await name.fill("Brunch");
 await page.getByRole("tab",{name:"Floor",exact:true}).click();
 await page.getByRole("tab",{name:"Schedule"}).click();
 await expect(page.getByLabel("Name, Brunch",{exact:true}).first()).toHaveValue("Brunch");
 await expect(page.getByRole("status").filter({hasText:"Unsaved changes"})).toBeVisible();
 await page.getByRole("link",{name:"Closed days",exact:true}).click();
 await expect(page.getByRole("heading",{name:"Closed days",exact:true})).toBeVisible();
 expect(await page.evaluate(()=>Array.from(document.querySelectorAll(".st-page *")).filter(el=>el.getBoundingClientRect().right>window.innerWidth+1 && el.getBoundingClientRect().width>0).map(el=>({tag:el.tagName,classes:el.className,right:el.getBoundingClientRect().right})))).toEqual([]);
 const scanned=await new AxeBuilder({page}).withTags(TAGS).analyze();
 expect(scanned.violations.map(v=>`${v.id}: ${v.help}`)).toEqual([]);
 await page.getByRole("button",{name:"Undo my changes"}).click();
});
