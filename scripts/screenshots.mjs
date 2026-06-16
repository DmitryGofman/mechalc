import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const BASE = process.env.BASE || "http://localhost:4399";
const OUT = "/tmp/shots";
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 470, height: 880 }, deviceScaleFactor: 2 });

async function openFormula(query, cardIndex = 0) {
  await page.goto(BASE);
  await page.locator(".search").fill(query);
  await page.locator(".formula-card").nth(cardIndex).click();
  await page.waitForSelector(".calc");
}

async function setField(symbol, value) {
  // each .field has a label with a .sym span; set the input within that field
  const field = page.locator(".field", { has: page.locator(`.sym:text-is("${symbol}")`) });
  await field.locator('input[type="number"]').fill(String(value));
}

async function shot(name, fullPage = false) {
  await page.waitForTimeout(250);
  if (fullPage) {
    // let the fixed tab bar flow at the end so it doesn't overlap results
    await page.addStyleTag({ content: ".tabbar{position:static!important;transform:none!important} .topbar{position:static!important} .content{padding-bottom:14px!important}" });
  }
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage });
  console.log("shot", name);
}

// 1. Home
await page.goto(BASE);
await page.waitForSelector(".formula-grid");
await shot("01-home");

// 2. G-Load calc — produces a force with a "use ->" chain button
await openFormula("G-Load");
await setField("m", 2);
await setField("n", 10);
await shot("02-gload", true);

// 3. Cantilever bending — diagram + material picker + SF badge
await openFormula("cantilever", 0);
await setField("P", 196.2);
await setField("L", 50);
await setField("Z", 83.33);
await page.locator(".material-bar select").selectOption({ label: "Al 6061-T6" });
await shot("03-bending", true);

// 4. Bolt preload / torque
await openFormula("preload");
await setField("F", 15000);
await setField("d", 8);
await setField("At", 36.6);
await setField("Sp", 580);
await shot("04-bolt", true);

// 5. Imperial mode — von Mises fully in ksi (set system before opening)
await page.goto(BASE);
await page.locator(".unit-toggle button", { hasText: "Imperial" }).click();
await openFormula("von mises");
await setField("sigma", 20);
await setField("tau", 8);
await page.locator(".material-bar select").selectOption({ label: "Steel 1018" });
await shot("05-imperial-vonmises", true);
// reset back to metric for any later shots
await page.locator(".unit-toggle button", { hasText: "Metric" }).click();

// 6. Unit Converter
await page.goto(BASE);
await page.locator(".tabbar button", { hasText: "Convert" }).click();
await page.locator(".conv-controls input").fill("30");
await page.locator(".conv-controls select").nth(1).selectOption({ label: "ksi" });
await shot("06-converter");

// 7. Library
await page.goto(BASE);
await page.locator(".tabbar button", { hasText: "Library" }).click();
await page.waitForSelector(".lib-card");
await shot("07-library");

await browser.close();
console.log("done");
