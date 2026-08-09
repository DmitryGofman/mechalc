import { describe, expect, it } from "vitest";
import {
  convexHull,
  DESIGN_CASES,
  defaultThreshold,
  fmtVal,
  guidelineLogY,
  guidelineSlope,
  indexFromPoint,
  indexValue,
  logEllipse,
  logMid,
  rankQualifiers,
} from "./materialsMapMath";
import { MATERIALS } from "./materialsMapData";
import type { MapMaterial } from "./materialsMapData";

describe("logMid", () => {
  it("is the geometric mean of the range", () => {
    expect(logMid([4, 9])).toBeCloseTo(6, 12);
    expect(logMid([10, 1000])).toBeCloseTo(100, 9);
  });

  it("sits at the midpoint on a log axis", () => {
    const [lo, hi] = [0.3, 70];
    const mid = logMid([lo, hi]);
    expect(Math.log10(mid) - Math.log10(lo)).toBeCloseTo(Math.log10(hi) - Math.log10(mid), 12);
  });
});

describe("logEllipse", () => {
  it("centers on the geometric mean and spans half the log range", () => {
    const e = logEllipse([1, 100], [10, 1000]);
    expect(e.cx).toBeCloseTo(1, 12); // log10 √(1·100) = 1
    expect(e.cy).toBeCloseTo(2, 12);
    expect(e.rx).toBeCloseTo(1, 12); // (log 100 − log 1)/2
    expect(e.ry).toBeCloseTo(1, 12);
  });

  it("clamps degenerate ranges to the minimum radius", () => {
    const e = logEllipse([5, 5], [7, 7], 0.02);
    expect(e.rx).toBe(0.02);
    expect(e.ry).toBe(0.02);
  });
});

describe("performance indices", () => {
  it("matches the closed form for the stiff beam, M = √E/ρ", () => {
    // Aluminum-ish: E = 70 GPa, ρ = 2.7 Mg/m³ → √70/2.7
    expect(indexValue(70, 2.7, 1 / 2)).toBeCloseTo(Math.sqrt(70) / 2.7, 12);
  });

  it("matches the closed form for the strong panel, M = √σ/ρ", () => {
    expect(indexValue(400, 7.8, 1 / 2)).toBeCloseTo(Math.sqrt(400) / 7.8, 12);
  });

  it("guideline slope on log-log axes is 1/a", () => {
    for (const c of DESIGN_CASES) {
      const dy = guidelineLogY(1, c.a, 3) - guidelineLogY(0, c.a, 3);
      expect(dy).toBeCloseTo(guidelineSlope(c.a), 12);
    }
  });

  it("dragging the line through a point recovers that point (round trip)", () => {
    const [logX, logY, a] = [0.43, 1.85, 2 / 3];
    const M = indexFromPoint(logX, logY, a);
    expect(guidelineLogY(logX, a, M)).toBeCloseTo(logY, 12);
  });

  it("a material sitting exactly on the line has index exactly M", () => {
    const a = 1 / 2;
    const M = 3;
    const logX = 0.7;
    const logY = guidelineLogY(logX, a, M);
    expect(indexValue(10 ** logY, 10 ** logX, a)).toBeCloseTo(M, 10);
  });
});

describe("rankQualifiers", () => {
  const mat = (name: string, E: [number, number], rho: [number, number]): MapMaterial => ({
    name,
    fam: "metal",
    rho,
    E,
    sig: [1, 1],
    hv: null,
    k: [1, 1],
    cte: [1, 1],
    maxT: [1, 1],
    kic: null,
  });

  it("keeps only materials at or above the threshold, best first", () => {
    // E/ρ indices: light 100/1 = 100, heavy 100/10 = 10, weak 1/1 = 1
    const list = [mat("weak", [1, 1], [1, 1]), mat("light", [100, 100], [1, 1]), mat("heavy", [100, 100], [10, 10])];
    const ranked = rankQualifiers(list, "E", 1, 10);
    expect(ranked.map((r) => r.m.name)).toEqual(["light", "heavy"]);
    expect(ranked[0].idx).toBeCloseTo(100, 9);
    expect(ranked[1].idx).toBeCloseTo(10, 9);
  });

  it("skips materials that lack the y property", () => {
    const noKic = rankQualifiers(MATERIALS, "kic", 1, 0);
    expect(noKic.length).toBe(MATERIALS.filter((m) => m.kic).length);
  });

  it("on the real dataset, the stiff-beam shortlist puts CFRP above steel", () => {
    const ranked = rankQualifiers(MATERIALS, "E", 1 / 2, 0);
    const at = (n: string) => ranked.findIndex((r) => r.m.name.startsWith(n));
    expect(at("CFRP")).toBeGreaterThanOrEqual(0);
    expect(at("CFRP")).toBeLessThan(at("Low-carbon steel"));
  });
});

describe("defaultThreshold", () => {
  it("lets roughly the top third qualify", () => {
    const values = [9, 8, 7, 6, 5, 4, 3, 2, 1];
    const M = defaultThreshold(values);
    expect(values.filter((v) => v >= M).length).toBe(4); // floor(9/3) + 1
  });

  it("handles an empty list", () => {
    expect(defaultThreshold([])).toBe(1);
  });
});

describe("convexHull", () => {
  it("drops interior points and keeps the corners", () => {
    const hullPts = convexHull([
      [0, 0],
      [4, 0],
      [4, 4],
      [0, 4],
      [2, 2], // interior
    ]);
    expect(hullPts).toHaveLength(4);
    const set = new Set(hullPts.map((p) => p.join(",")));
    expect(set.has("2,2")).toBe(false);
    for (const c of ["0,0", "4,0", "4,4", "0,4"]) expect(set.has(c)).toBe(true);
  });

  it("returns short inputs unchanged", () => {
    expect(convexHull([[1, 2]])).toEqual([[1, 2]]);
  });
});

describe("fmtVal", () => {
  it("rounds by magnitude", () => {
    expect(fmtVal(12345)).toBe("12,345");
    expect(fmtVal(3.14159)).toBe("3.14");
    expect(fmtVal(0.01234)).toBe("0.012");
  });
});
