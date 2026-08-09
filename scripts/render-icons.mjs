// Rasterize the brand SVGs into the PNG sizes home screens need, then copy
// the ACTIVE_DESIGN (from src/brand.tsx) to the site root as favicon.svg,
// apple-touch-icon.png, icon-192.png and icon-512.png. iOS ignores SVG for
// apple-touch-icon, so the PNGs are generated, committed artifacts. Re-run
// after editing any public/brand/*/icon.svg or switching ACTIVE_DESIGN:
//   node scripts/render-icons.mjs
import { chromium } from "playwright";
import { copyFile, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const DESIGNS = ["blueprint", "beam", "hexm", "gauge"];
const SIZES = [
  { px: 180, name: "apple-touch-icon.png" },
  { px: 192, name: "icon-192.png" },
  { px: 512, name: "icon-512.png" },
];

const browser = await chromium.launch();
const page = await browser.newPage({ deviceScaleFactor: 1 });

for (const design of DESIGNS) {
  const dir = path.join(root, "public", "brand", design);
  const svg = await readFile(path.join(dir, "icon.svg"), "utf8");
  for (const { px, name } of SIZES) {
    await page.setViewportSize({ width: px, height: px });
    await page.setContent(
      `<!doctype html><style>*{margin:0}svg{display:block;width:${px}px;height:${px}px}</style>${svg}`,
    );
    const png = await page.screenshot({ clip: { x: 0, y: 0, width: px, height: px } });
    await writeFile(path.join(dir, name), png);
    console.log(`${design}/${name}`);
  }
}

await browser.close();

const brandSrc = await readFile(path.join(root, "src", "brand.tsx"), "utf8");
const active = brandSrc.match(/ACTIVE_DESIGN: BrandDesign = "(\w+)"/)?.[1];
if (!DESIGNS.includes(active)) throw new Error(`ACTIVE_DESIGN not found or unknown: ${active}`);

const activeDir = path.join(root, "public", "brand", active);
const pub = path.join(root, "public");
await copyFile(path.join(activeDir, "icon.svg"), path.join(pub, "favicon.svg"));
for (const { name } of SIZES) await copyFile(path.join(activeDir, name), path.join(pub, name));
console.log(`active design "${active}" copied to public/ root`);
