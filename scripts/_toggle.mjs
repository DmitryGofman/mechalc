import { chromium } from "playwright";
const BASE = "http://localhost:4399";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 470, height: 880 }, deviceScaleFactor: 2 });

async function setField(symbol, value) {
  const field = page.locator(".field", { has: page.locator(`.sym:text-is("${symbol}")`) });
  await field.locator('input[type="number"]').fill(String(value));
}
async function shot(name) {
  await page.waitForTimeout(250);
  await page.addStyleTag({ content: ".tabbar{position:static!important;transform:none!important}.topbar{position:static!important}.content{padding-bottom:14px!important}" });
  await page.screenshot({ path: `/tmp/shots/${name}.png`, fullPage: true });
  console.log("shot", name);
}

await page.goto(BASE);
// ensure metric
await page.locator(".unit-toggle button", { hasText: "Metric" }).click();
await page.locator(".search").fill("axial");
await page.locator(".formula-card").first().click();
await page.waitForSelector(".calc");
await setField("F", 2500);
await setField("A", 50);
await page.locator(".material-bar select").selectOption({ label: "Steel 1018" });
await shot("08-toggle-metric");
await page.locator(".unit-toggle button", { hasText: "Imperial" }).click();
await shot("09-toggle-imperial");
await browser.close();
console.log("done");
