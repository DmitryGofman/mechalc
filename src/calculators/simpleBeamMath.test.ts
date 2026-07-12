import { describe, it, expect } from "vitest";
import { beamStiffness, beamSigma, beamShape, beamMoment } from "./simpleBeamMath";

// Steel bar 100 × 10 × 2 mm: I = wt³/12 = 6.667e-12 m⁴.
const E = 200e9;
const I = (0.01 * Math.pow(0.002, 3)) / 12;
const L = 0.1;

describe("beamStiffness / beamSigma", () => {
  it("matches the closed form for a simply supported center load", () => {
    // k = 48EI/L³ = 64 000 N/m; σ at δ=1mm: 6Etδ/L² = 240 MPa
    expect(beamStiffness(E, I, L, "simple")).toBeCloseTo(64000, 0);
    expect(beamSigma(E, 0.002, L, 0.001, "simple") / 1e6).toBeCloseTo(240, 3);
  });

  it("is exactly 4× stiffer and 2× more stressed with fixed ends", () => {
    expect(beamStiffness(E, I, L, "fixed") / beamStiffness(E, I, L, "simple")).toBeCloseTo(4, 9);
    expect(beamSigma(E, 0.002, L, 0.001, "fixed") / beamSigma(E, 0.002, L, 0.001, "simple")).toBeCloseTo(2, 9);
  });
});

describe("beamShape", () => {
  it("is pinned at the supports and unity at mid-span", () => {
    for (const s of ["simple", "fixed"] as const) {
      expect(beamShape(0, s)).toBe(0);
      expect(beamShape(0.5, s)).toBeCloseTo(1, 9);
    }
  });

  it("has zero end slope only for fixed ends", () => {
    const h = 1e-5;
    const slopeSimple = (beamShape(h, "simple") - beamShape(0, "simple")) / h;
    const slopeFixed = (beamShape(h, "fixed") - beamShape(0, "fixed")) / h;
    expect(slopeSimple).toBeGreaterThan(1); // pins rotate: slope 3 at the support
    expect(Math.abs(slopeFixed)).toBeLessThan(1e-3); // built-in: clamped level
  });
});

describe("beamMoment", () => {
  it("peaks at mid-span and vanishes at the pins for simple supports", () => {
    expect(beamMoment(0, "simple")).toBe(0);
    expect(beamMoment(0.5, "simple")).toBeCloseTo(1, 9);
  });

  it("flips sign along a fixed-fixed span: wall moment = −center moment", () => {
    expect(beamMoment(0, "fixed")).toBeCloseTo(-1, 9);
    expect(beamMoment(0.25, "fixed")).toBeCloseTo(0, 9); // inflection point
    expect(beamMoment(0.5, "fixed")).toBeCloseTo(1, 9);
  });
});
