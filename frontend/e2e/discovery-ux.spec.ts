import { expect, isoDaysFromToday, test } from "./fixtures";

test("mobile search context is separate from filters and survives a visit to a restaurant", async ({page}) => {
  await page.setViewportSize({width:390,height:844});
  await page.goto("/");
  await page.getByRole("button",{name:/When and where/}).click();
  const context=page.getByRole("dialog",{name:"When and where"});
  await context.getByLabel("Choose a city").selectOption("Lisboa");
  await context.getByLabel("Date",{exact:true}).fill(isoDaysFromToday(9));
  await context.getByLabel("People",{exact:true}).selectOption("4");
  await context.getByRole("button",{name:"Show restaurants"}).click();
  await page.getByRole("button",{name:/^Filters/}).click();
  const filters=page.getByRole("dialog",{name:"Filters"});
  await expect(filters.getByLabel("Date",{exact:true})).toHaveCount(0);
  await filters.getByRole("button",{name:"More cuisines"}).click();
  await filters.getByRole("button",{name:"Korean",exact:true}).click();
  await filters.getByRole("button",{name:"Fewer cuisines"}).click();
  await expect(filters.getByRole("button",{name:"Korean",exact:true})).toHaveAttribute("aria-pressed","true");
  await filters.getByRole("button",{name:"Clear filters",exact:true}).click();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button",{name:/^Filters/})).toBeFocused();
  await page.getByRole("article").first().getByRole("heading").getByRole("link").click();
  await expect(page).toHaveURL(/\/restaurants\//);
  await page.goBack();
  await expect(page.getByRole("button",{name:/When and where/})).toContainText("4 people");
  await expect(page.getByRole("button",{name:/When and where/})).toContainText("Lisboa");
});

test("filters fit a narrow phone, and each nearby time has its own link", async ({page}) => {
  await page.goto("/");
  await page.getByLabel("Date",{exact:true}).fill(isoDaysFromToday(9));
  const restaurant=page.getByRole("article").filter({hasText:"Tasca do Bairro"});
  const times=restaurant.getByRole("link",{name:/^\d{2}:\d{2}$/});
  await expect(times.first()).toBeVisible();
  for (const link of await times.all()) {
    const time=await link.innerText();
    expect(new URL((await link.getAttribute("href"))!,"http://localhost").searchParams.get("time")).toBe(time);
  }
  await page.setViewportSize({width:320,height:844});
  await page.getByRole("button",{name:/^Filters/}).click();
  const drawer=page.getByRole("dialog",{name:"Filters"});
  await drawer.getByRole("button",{name:"More cuisines"}).click();
  const done=drawer.getByRole("button",{name:/^Show \d+ restaurants?/});
  await done.scrollIntoViewIfNeeded();
  await expect(done).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
  await done.click();
});
