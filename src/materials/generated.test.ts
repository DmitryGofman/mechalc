// The generated views of the library must not drift from it.
//
// public/designs/shared/materials.js is a real second copy of the data — it has
// to be, because the design prototypes are plain browser scripts with no build
// step. A copy that can go stale is exactly the problem the library was built
// to solve, so these tests make staleness a build failure rather than a
// surprise the next time a prototype is opened.

import { describe, expect, it } from "vitest";
import materialsSource from "../../public/designs/shared/materials.js?raw";
import docsSource from "../../docs/materials.md?raw";
import clampEngineSource from "../../public/designs/cylinderclamp/clamp-engine.js?raw";
import { MATERIALS } from "./index";
import { renderJS, renderMD } from "./render";
import { CLAMP_MATS, CYL_MATS } from "../calculators/clampMath";

/** Evaluate the shared library the way a browser page does. */
function loadMechmat() {
  const globals: Record<string, any> = {};
  new Function("window", materialsSource)(globals);
  return globals;
}

const STALE = "does not match the library — run `npm run gen:materials` and commit the result";

describe("generated files", () => {
  it(`shared/materials.js ${STALE}`, () => {
    expect(materialsSource).toBe(renderJS());
  });

  it(`docs/materials.md ${STALE}`, () => {
    expect(docsSource).toBe(renderMD());
  });

  it("carry every material, with the same numbers", () => {
    const { MECHMAT } = loadMechmat();
    expect(Object.keys(MECHMAT.MATERIALS)).toEqual(Object.keys(MATERIALS));
    for (const [id, m] of Object.entries(MATERIALS)) {
      expect(MECHMAT.MATERIALS[id], id).toEqual(m);
    }
  });

  it("converts moduli to the MPa the engines work in", () => {
    const { MECHMAT } = loadMechmat();
    expect(MECHMAT.E_MPa("al6061t6")).toBe(68900);
    expect(MECHMAT.Es_MPa("pla_fdm")).toBe(3100);
    // A material with no secant figure reports that, rather than guessing.
    expect(MECHMAT.Es_MPa("s235")).toBeNull();
    expect(MECHMAT.isPrinted("pa12_mjf")).toBe(true);
    expect(MECHMAT.isPrinted("al6061t6")).toBe(false);
  });

  it("refuses an unknown id and a missing property instead of returning junk", () => {
    const { MECHMAT } = loadMechmat();
    expect(() => MECHMAT.material("unobtainium")).toThrow(/Unknown material id/);
    expect(() => MECHMAT.requireProps(MECHMAT.material("spring1095"), ["pG"], "a test")).toThrow(
      /missing pG/,
    );
  });
});

describe("prototype ↔ production parity", () => {
  // The cylinder-clamp prototypes and the shipped React calculator are two
  // implementations of one model. Now that both read the same library, their
  // material tables should be identical — if they ever diverge, one of them
  // was edited in isolation.
  it("gives the clamp prototype engine the same materials as the React calculator", () => {
    const globals = loadMechmat();
    new Function("window", clampEngineSource)(globals);
    const CLAMP = globals.CLAMP;

    expect(Object.keys(CLAMP.CLAMP_MATS)).toEqual(Object.keys(CLAMP_MATS));
    for (const label of Object.keys(CLAMP_MATS)) {
      expect(CLAMP.CLAMP_MATS[label], label).toEqual(CLAMP_MATS[label]);
    }
    expect(Object.keys(CLAMP.CYL_MATS)).toEqual(Object.keys(CYL_MATS));
    for (const label of Object.keys(CYL_MATS)) {
      expect(CLAMP.CYL_MATS[label], label).toEqual(CYL_MATS[label]);
    }
  });
});
