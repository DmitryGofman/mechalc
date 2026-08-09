import { describe, it, expect } from "vitest";
import { reportHTML, summaryHTML } from "./pinReport";
import { defaults, solve, fmt, PIN_MATS, PLATE_MATS, type PinInput } from "./pinMath";

const build = (over: Partial<PinInput> = {}) => {
  const inp = { ...defaults(), ...over };
  return { inp, html: reportHTML(inp, solve(inp)), brief: summaryHTML(inp, solve(inp)) };
};

describe("the worked report", () => {
  it("works every failure mode through, by name", () => {
    const { html } = build();
    for (const s of ["Shear stress in the pin", "Allowable shear", "Bending moment on the pin",
      "Bending stress", "Bearing on the pin's own surface", "Bearing on the hole wall",
      "Tension across the net section", "Edge tear-out"]) {
      expect(html).toContain(s);
    }
  });

  it("cites the source of each formula", () => {
    const { html } = build();
    for (const ref of ["Fig. 8-23c", "Fig. 8-23b", "Eq. 8-55", "Eq. 8-54", "Fig. 8-25"])
      expect(html).toContain(ref);
  });

  it("substitutes the actual numbers, not just symbols", () => {
    const { html } = build({ d: 8, t2: 8, w: 32, a: 12, F: 6000 });
    expect(html).toContain("6,000");        // the load, substituted
    expect(html).toContain("50.3 mm²");     // πd²/4 for Ø8
    expect(html).toContain("0.577 × 655");  // shear yield, worked
  });

  it("reports the same governing mode and capacity as the solver", () => {
    const inp = defaults();
    const res = solve(inp);
    const html = reportHTML(inp, res);
    expect(html).toContain(res.governing.label);
    expect(html).toContain(`${fmt(res.Fcap / 1000, 2)} kN`);
  });

  it("shows the hollow-section formulas only for a hollow pin", () => {
    expect(build({ hollow: true, wall: 1.5 }).html).toContain("the annulus");
    expect(build({ hollow: false }).html).not.toContain("the annulus");
  });

  it("drops the bending step in single shear and says why", () => {
    const { html } = build({ config: 2 });
    expect(html).not.toContain("Bending moment on the pin");
    expect(html).toContain("No bending check in single shear");
  });

  it("flags a reduced shear area when threads sit in the plane", () => {
    const { html } = build({ shank: "Bolt — threads in shear plane" });
    expect(html).toContain("What actually crosses the shear plane");
    expect(html).not.toContain("undefined");
  });

  it("names the member that presses hardest on the pin", () => {
    const { html } = build({ config: 3, t1: 6, t2: 3 });
    // The thinner middle plate carries all of F over less width, so it governs.
    expect(html).toContain("which presses hardest");
  });
});

describe("the bench sheet", () => {
  it("leads with capacity, the governing mode and the target working load", () => {
    const inp = defaults();
    const res = solve(inp);
    const brief = summaryHTML(inp, res);
    expect(brief).toContain("joint capacity");
    expect(brief).toContain(res.governing.label.toLowerCase());
    expect(brief).toContain((res.Fcap / inp.SFt / 1000).toFixed(2)); // working load at target SF
  });

  it("carries the non-info warnings so paper cannot hide them", () => {
    const inp = { ...defaults(), a: 6 }; // tight edge distance
    const brief = summaryHTML(inp, solve(inp));
    expect(brief).toContain("Warnings");
    expect(brief).toContain("edge distance");
  });

  it("omits the warnings block when there is nothing but scope notes", () => {
    const inp = { ...defaults(), F: 1000, a: 20, w: 40 };
    const res = solve(inp);
    expect(res.warns.every((w) => w.level === "info")).toBe(true);
    expect(summaryHTML(inp, res)).not.toContain("<h2>Warnings</h2>");
  });
});

describe("robustness", () => {
  it("renders at zero load without dividing by it", () => {
    const { html, brief } = build({ F: 0 });
    for (const s of [html, brief]) {
      expect(s).not.toContain("NaN");
      expect(s).not.toContain("undefined");
    }
    expect(html).toContain("No load has been applied");
  });

  it("renders for every pin and flange material", () => {
    for (const pinMat of Object.keys(PIN_MATS)) {
      const { html } = build({ pinMat });
      expect(html).not.toContain("NaN");
      expect(html).not.toContain("undefined");
    }
    for (const mat2 of Object.keys(PLATE_MATS)) {
      const { html } = build({ mat2 });
      expect(html).not.toContain("NaN");
      expect(html).not.toContain("undefined");
    }
  });

  it("renders for degenerate geometry without NaN", () => {
    for (const over of [{ d: 0 }, { w: 1, d: 8 }, { a: 0.5, d: 8 }, { t1: 0, t2: 0 },
      { hollow: true, wall: 0 }, { hollow: true, wall: 99 }] as Partial<PinInput>[]) {
      const { html, brief } = build(over);
      expect(html).not.toContain("NaN");
      expect(brief).not.toContain("NaN");
    }
  });

  it("covers both configurations and both pin sections", () => {
    for (const config of [2, 3] as const)
      for (const hollow of [false, true]) {
        const { html } = build({ config, hollow });
        expect(html).toContain("VERDICT");
        expect(html).not.toContain("NaN");
      }
  });
});
