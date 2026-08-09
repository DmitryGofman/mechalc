// Write the derived views of the material library to disk.
//
// The library in src/materials/library.ts is the source of truth, but two
// consumers cannot import TypeScript:
//
//   · the standalone HTML design prototypes in public/designs/, which are
//     plain browser scripts with no build step;
//   · a human wanting to read the whole table at a glance.
//
// So this script emits:
//   public/designs/shared/materials.js   window.MECHMAT for the prototypes
//   docs/materials.md                    the browsable table
//
//   npm run gen:materials
//
// The rendering itself lives in src/materials/render.ts so the test suite can
// call it directly and fail when the committed copies drift — see
// src/materials/generated.test.ts. This script is only the filesystem half.

import { build } from "esbuild";
import { writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// Transpile + evaluate the TS renderer so we emit from the real library data.
const result = await build({
  entryPoints: [resolve(ROOT, "src/materials/render.ts")],
  bundle: true,
  format: "esm",
  write: false,
  platform: "neutral",
});
const { GENERATED_FILES } = await import(
  `data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString("base64")}`
);

for (const [relPath, content] of GENERATED_FILES()) {
  const path = resolve(ROOT, relPath);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, content);
  console.log(`wrote ${relPath}`);
}
