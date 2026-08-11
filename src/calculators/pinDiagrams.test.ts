import { describe, it, expect } from "vitest";
import { modeFigures, figuresHTML } from "./pinDiagrams";
import { defaults, solve, PIN_MATS, PLATE_MATS, type PinInput } from "./pinMath";

const figs = (over: Partial<PinInput> = {}, forPrint = false) => {
  const inp = { ...defaults(), ...over };
  return modeFigures(inp, solve(inp), forPrint);
};

describe("one figure per failure mode", () => {
  it("covers every mode the clevis is checked for", () => {
    expect(figs().map((f) => f.key)).toEqual(["shear", "bend", "bear", "net", "tear"]);
  });

  it("drops the bending figure in single shear, where there is no clean span", () => {
    expect(figs({ config: 2 }).map((f) => f.key)).toEqual(["shear", "bear", "net", "tear"]);
  });

  it("captions each one with the joint's own number", () => {
    const inp = { ...defaults() };
    const res = solve(inp);
    const byKey = Object.fromEntries(modeFigures(inp, res).map((f) => [f.key, f.caption]));
    expect(byKey.shear).toContain("τ = ");
    expect(byKey.bend).toContain("σ = ");
    expect(byKey.bear).toContain("p = ");
    expect(byKey.net).toContain("w − d = ");
    expect(byKey.tear).toContain("a − d/2 = ");
  });

  it("says how many shear planes there are", () => {
    expect(figs({ config: 3 })[0].caption).toMatch(/two planes/i);
    expect(figs({ config: 2 })[0].caption).toMatch(/one plane/i);
  });
});

describe("the drawings themselves", () => {
  it("are self-contained svg with no external reference", () => {
    for (const fg of figs()) {
      expect(fg.svg.startsWith("<svg")).toBe(true);
      expect(fg.svg).toContain("viewBox");
      expect(fg.svg).not.toMatch(/<image|xlink:href|url\(/);
      expect(fg.svg).not.toContain("NaN");
    }
  });

  it("bake their colours into attributes, so a print stylesheet cannot reach them", () => {
    // The clamp calculator exported a page of black by relying on CSS here.
    const screen = figs()[2].svg, paper = figs({}, true)[2].svg;
    expect(screen).not.toBe(paper);
    expect(paper).toContain("#e8e8e8"); // paper fill
    expect(screen).toContain("#1b242c"); // screen fill
    expect(paper).not.toContain("class=");
  });

  it("scale to the joint's own geometry, not a fixed cartoon", () => {
    const small = figs({ d: 4 })[2].svg, big = figs({ d: 20 })[2].svg;
    expect(small).not.toBe(big);
  });

  it("survive degenerate geometry without NaN", () => {
    for (const over of [{ d: 0 }, { w: 1, d: 8 }, { a: 0.2, d: 8 }, { t1: 0, t2: 0 },
      { clr: 0 }, { hollow: true, wall: 0 }] as Partial<PinInput>[]) {
      for (const fg of figs(over)) expect(fg.svg).not.toContain("NaN");
    }
  });

  it("render for every material without throwing", () => {
    for (const pinMat of Object.keys(PIN_MATS)) expect(figs({ pinMat }).length).toBeGreaterThan(0);
    for (const mat2 of Object.keys(PLATE_MATS)) expect(figs({ mat2 }).length).toBeGreaterThan(0);
  });
});

describe("the report block", () => {
  it("wraps every figure with its caption", () => {
    const html = figuresHTML(defaults(), solve(defaults()));
    expect((html.match(/<figure/g) ?? []).length).toBe(5);
    expect((html.match(/<figcaption/g) ?? []).length).toBe(5);
    expect(html).toContain('class="pinfigs"');
  });
});
