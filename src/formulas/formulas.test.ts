import { describe, it, expect } from "vitest";
import { FORMULAS, FORMULA_BY_ID, searchFormulas } from "./index";
import { UNITS } from "../units/registry";

describe("formula calculators (hand-calcs, all SI)", () => {
  it("g-load: 2 kg @ 10g ≈ 196.2 N", () => {
    expect(FORMULA_BY_ID["g-load"].calculate({ m: 2, n: 10, g: 9.81 }).F).toBeCloseTo(196.2, 1);
  });

  it("axial stress + SF", () => {
    // 196.2 N over 10 mm² = 1.962e7 Pa; Sy 276 MPa -> SF 14.07
    const r = FORMULA_BY_ID["axial-stress"].calculate({ F: 196.2, A: 10e-6, Sy: 276e6 });
    expect(r.sigma).toBeCloseTo(1.962e7, 0);
    expect(r.SF).toBeCloseTo(14.07, 1);
  });

  it("single vs double shear halve", () => {
    const single = FORMULA_BY_ID["shear-single"].calculate({ F: 1000, A: 20e-6, Sy: 300e6 });
    const double = FORMULA_BY_ID["shear-double"].calculate({ F: 1000, A: 20e-6, Sy: 300e6 });
    expect(double.tau).toBeCloseTo(single.tau / 2, 6);
  });

  it("cantilever bending: the 10g bracket example", () => {
    // F=196.2 N, L=50 mm, rect 20x5 -> Z = 20*25/6 = 83.33 mm^3
    const Z = (20 * 5 ** 2) / 6 / 1e9; // m^3
    const r = FORMULA_BY_ID["bending-cantilever"].calculate({ P: 196.2, L: 0.05, Z, Sy: 276e6 });
    expect(r.M).toBeCloseTo(9.81, 2);
    expect(r.sigma_b / 1e6).toBeCloseTo(117.7, 0); // MPa
    expect(r.SF).toBeCloseTo(2.34, 1);
  });

  it("simply supported bending uses PL/4", () => {
    const r = FORMULA_BY_ID["bending-simply-supported"].calculate({ P: 1000, L: 2, Z: 1e-5, Sy: 250e6 });
    expect(r.M).toBeCloseTo(500, 6);
  });

  it("torsion: τ = T r / J", () => {
    const r = FORMULA_BY_ID["torsion"].calculate({ T: 100, r: 0.01, J: 1.5708e-8, Sy: 300e6 });
    expect(r.tau).toBeCloseTo(6.366e7, -4);
  });

  it("von Mises pure shear: σvm = √3·τ", () => {
    const r = FORMULA_BY_ID["von-mises"].calculate({ sigma: 0, tau: 100e6, Sy: 300e6 });
    expect(r.sigma_vm).toBeCloseTo(Math.sqrt(3) * 100e6, 0);
  });

  it("cantilever deflection PL^3/3EI", () => {
    // P=100, L=1, E=200e9, I=1e-8 -> 100/(3*200e9*1e-8)=0.01667 m
    const r = FORMULA_BY_ID["cantilever-deflection"].calculate({ P: 100, L: 1, E: 200e9, I: 1e-8 });
    expect(r.delta).toBeCloseTo(0.016667, 5);
  });

  it("rectangle section properties", () => {
    const r = FORMULA_BY_ID["section-rectangle"].calculate({ b: 0.02, h: 0.005 });
    expect(r.A).toBeCloseTo(1e-4, 9);
    expect(r.I).toBeCloseTo((0.02 * 0.005 ** 3) / 12, 15);
    expect(r.Z).toBeCloseTo((0.02 * 0.005 ** 2) / 6, 12);
  });

  it("round section: J = 2I", () => {
    const r = FORMULA_BY_ID["section-round"].calculate({ d: 0.01 });
    expect(r.J).toBeCloseTo(2 * r.I, 15);
  });

  it("tube section: J = 2I and area is annulus", () => {
    const r = FORMULA_BY_ID["section-tube"].calculate({ do: 0.02, di: 0.016 });
    expect(r.J).toBeCloseTo(2 * r.I, 15);
    expect(r.A).toBeGreaterThan(0);
  });
});

describe("new calculators (engineer review fixes)", () => {
  it("bolt preload: T = K·F·d and σ = F/At", () => {
    // M8 At=36.6mm², preload 0.75·580MPa·36.6mm² ≈ 15.92 kN, K=0.2, d=8mm
    const At = 36.6e-6;
    const F = 0.75 * 580e6 * At;
    const r = FORMULA_BY_ID["bolt-preload"].calculate({ F, d: 0.008, K: 0.2, At, Sp: 580e6 });
    expect(r.T).toBeCloseTo(0.2 * F * 0.008, 6); // N·m
    expect(r.sigma).toBeCloseTo(F / At, 0);
    expect(r.SF).toBeCloseTo(580e6 / (F / At), 3); // = 1/0.75 ≈ 1.333
    expect(r.SF).toBeCloseTo(1.3333, 3);
  });

  it("bearing stress: σ = F/(d·t)", () => {
    const r = FORMULA_BY_ID["bearing-stress"].calculate({ F: 5000, d: 0.00635, t: 0.003, Sy: 370e6 });
    expect(r.sigma_bearing).toBeCloseTo(5000 / (0.00635 * 0.003), 0);
  });

  it("axial flags compression with a buckling warning", () => {
    const issues = FORMULA_BY_ID["axial-stress"].validate!({ F: -1000, A: 1e-4, Sy: 276e6 });
    expect(issues.some((i) => i.field === "F" && i.level === "warning")).toBe(true);
  });
});

describe("validation", () => {
  it("axial flags zero area", () => {
    const issues = FORMULA_BY_ID["axial-stress"].validate!({ F: 100, A: 0, Sy: 276e6 });
    expect(issues.some((i) => i.field === "A" && i.level === "error")).toBe(true);
  });

  it("tube flags inner >= outer", () => {
    const issues = FORMULA_BY_ID["section-tube"].validate!({ do: 0.01, di: 0.012 });
    expect(issues.some((i) => i.level === "error")).toBe(true);
  });
});

describe("dimensional guards (no unit can ship mismatched)", () => {
  it.each(FORMULAS.map((f) => [f.id, f] as const))("%s inputs declare valid units", (_id, f) => {
    for (const inp of f.inputs) {
      const u = UNITS[inp.defaultUnit];
      expect(u, `unknown unit ${inp.defaultUnit}`).toBeTruthy();
      expect(u.dimension).toBe(inp.dimension);
    }
  });

  it.each(FORMULAS.map((f) => [f.id, f] as const))("%s outputs declare valid units", (_id, f) => {
    for (const out of f.outputs) {
      const u = UNITS[out.preferredUnit];
      expect(u, `unknown unit ${out.preferredUnit}`).toBeTruthy();
      expect(u.dimension).toBe(out.dimension);
    }
  });
});

describe("search", () => {
  it("finds axial stress by synonym", () => {
    expect(searchFormulas("tension").some((f) => f.id === "axial-stress")).toBe(true);
  });
  it("finds by symbol", () => {
    expect(searchFormulas("von mises").some((f) => f.id === "von-mises")).toBe(true);
  });
});
