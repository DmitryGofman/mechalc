import { describe, expect, it } from "vitest";
import {
  wireI,
  kiFactor,
  sideCompliance,
  wireGateResults,
  spreadMagnification,
  spreadShape,
  momentFraction,
} from "./wireGateMath";

// A realistic clasp, straight off the CAD it was drawn from: 2 mm spring
// wire, 30/26 mm legs, 8 mm U-bend, pins 20 mm apart, 1 mm assembly preload,
// nose opens 5 mm.
const E = 207e9; // music wire
const SY = 1590e6;
const base = () =>
  wireGateResults(E, SY, 0.002, 0.03, 0.026, 0.008, 0.02, 0.001, 0.005);

describe("section and loop stiffness", () => {
  it("I = πd⁴/64", () => {
    expect(wireI(0.002)).toBeCloseTo((Math.PI * Math.pow(0.002, 4)) / 64, 20);
  });

  it("side compliance matches an independent numerical Castigliano integral", () => {
    // δ/F = ∫ M(s)·(∂M/∂F) ds / EI over leg + quarter bend, M = F·x then
    // F·(L + R·sinθ). Simpson's rule, fine grid — the closed form must agree.
    const I = wireI(0.002);
    const L = 0.03;
    const R = 0.004;
    const N = 4000;
    let integral = 0;
    for (let i = 0; i <= N; i++) {
      const wgt = i === 0 || i === N ? 1 : i % 2 ? 4 : 2;
      const x = (i / N) * L;
      integral += wgt * x * x;
    }
    integral *= L / N / 3;
    let arc = 0;
    for (let i = 0; i <= N; i++) {
      const wgt = i === 0 || i === N ? 1 : i % 2 ? 4 : 2;
      const th = (i / N) * (Math.PI / 2);
      const m = L + R * Math.sin(th);
      arc += wgt * m * m;
    }
    arc *= (Math.PI / 2 / N / 3) * R;
    const numeric = (integral + arc) / (E * I);
    expect(sideCompliance(E, I, L, R)).toBeCloseTo(numeric, 12);
  });

  it("the two half-loops flex in series: k = 1/(cs1 + cs2)", () => {
    const r = base();
    expect(r.k).toBeCloseTo(1 / (r.cs1 + r.cs2), 6);
  });

  it("a zero-radius U-bend degenerates to the bare-legs hairpin", () => {
    const I = wireI(0.002);
    expect(sideCompliance(E, I, 0.03, 0)).toBeCloseTo(Math.pow(0.03, 3) / (3 * E * I), 15);
  });
});

describe("swing → spread kinematics", () => {
  it("φ = g / (Lmax + R) and s = 2a·sin(φ/2)", () => {
    const r = base();
    expect(r.phiMax).toBeCloseTo(0.005 / (0.03 + 0.004), 10);
    expect(r.s).toBeCloseTo(2 * 0.02 * Math.sin(r.phiMax / 2), 12);
    expect(r.delta).toBeCloseTo(0.001 + r.s, 12);
  });

  it("a wider pin separation imposes more spread for the same opening", () => {
    const near = wireGateResults(E, SY, 0.002, 0.03, 0.026, 0.008, 0.01, 0.001, 0.005);
    const far = wireGateResults(E, SY, 0.002, 0.03, 0.026, 0.008, 0.03, 0.001, 0.005);
    expect(far.s).toBeGreaterThan(near.s);
    expect(far.s / near.s).toBeCloseTo(3, 1); // sin ≈ linear at these angles
  });

  it("closing torque at rest is k·δ0·a, felt at the nose over the arm", () => {
    const r = base();
    expect(r.T0).toBeCloseTo(r.k * 0.001 * 0.02, 8);
    expect(r.Fnose0).toBeCloseTo(r.T0 / r.armNose, 8);
  });
});

describe("stress at the U-bend, not the pins", () => {
  it("peak stress goes through the apex arm: σ = F·(L+R)·c/I, times Ki", () => {
    const r = base();
    expect(r.sigma1).toBeCloseTo((r.FpinOpen * (0.03 + r.R) * r.c) / r.I, 4);
    expect(r.sigmaPeak).toBeCloseTo(r.Ki * Math.max(r.sigma1, r.sigma2), 4);
  });

  it("the longer side carries the bigger arm and is the hot one", () => {
    const r = base();
    expect(r.hotSide).toBe(1);
    expect(r.sigma1 / r.sigma2).toBeCloseTo((0.03 + r.R) / (0.026 + r.R), 8);
  });

  it("moment is zero at the pins and full at the apex", () => {
    expect(momentFraction(0, 0.034)).toBe(0);
    expect(momentFraction(0.034, 0.034)).toBe(1);
    expect(momentFraction(0.017, 0.034)).toBeCloseTo(0.5, 12);
  });
});

describe("Ki at the U-bend", () => {
  it("matches the Shigley 10-43 value at C = 4 (w = 8, d = 2)", () => {
    const r = base();
    expect(r.C).toBeCloseTo(4, 10);
    expect(r.Ki).toBeCloseTo(59 / 48, 12);
    expect(kiFactor(4)).toBeCloseTo(59 / 48, 12);
  });

  it("decays toward 1 as the bend opens, never diverges on tight input", () => {
    expect(kiFactor(20)).toBeLessThan(1.05);
    const tight = wireGateResults(E, SY, 0.002, 0.03, 0.026, 0.001, 0.02, 0.001, 0.005);
    expect(isFinite(tight.Ki)).toBe(true);
  });
});

describe("the spread budget", () => {
  it("SF = 1 exactly when the spread reaches δ_yield", () => {
    const r = base();
    // Impose δ_yield entirely as preload, no opening.
    const atY = wireGateResults(E, SY, 0.002, 0.03, 0.026, 0.008, 0.02, r.deltaYield, 0);
    expect(atY.SF).toBeCloseTo(1, 6);
    expect(atY.sigmaPeak).toBeCloseTo(SY, -2);
  });

  it("gYield inverts the kinematics: opening to gYield spends the budget", () => {
    const r = base();
    const atG = wireGateResults(E, SY, 0.002, 0.03, 0.026, 0.008, 0.02, 0.001, r.gYield);
    expect(atG.SF).toBeCloseTo(1, 5);
  });

  it("preload past the budget → gYield 0; unreachable budget → Infinity", () => {
    const r = base();
    const spent = wireGateResults(E, SY, 0.002, 0.03, 0.026, 0.008, 0.02, r.deltaYield * 1.1, 0.005);
    expect(spent.gYield).toBe(0);
    // Tiny crank: 2a smaller than the remaining budget can never impose it.
    const tinyCrank = wireGateResults(E, SY, 0.002, 0.03, 0.026, 0.008, 0.0005, 0.0001, 0.005);
    expect(tinyCrank.gYield).toBe(Infinity);
  });

  it("stored energy is ½kδ²", () => {
    const r = base();
    expect(r.energyOpen).toBeCloseTo(0.5 * r.k * r.delta * r.delta, 8);
  });
});

describe("degenerate inputs stay sane", () => {
  it("zero preload and zero opening → no force, infinite SF", () => {
    const r = wireGateResults(E, SY, 0.002, 0.03, 0.026, 0.008, 0.02, 0, 0);
    expect(r.Fpin0).toBe(0);
    expect(r.FpinOpen).toBe(0);
    expect(r.SF).toBe(Infinity);
  });

  it("negative inputs are clamped rather than propagated", () => {
    const r = wireGateResults(E, SY, 0.002, 0.03, 0.026, 0.008, 0.02, -1, -1);
    expect(r.delta).toBe(0);
    expect(r.FpinOpen).toBe(0);
  });

  it("vanishing legs or width cannot divide by zero", () => {
    const r = wireGateResults(E, SY, 0.002, 0, 0.026, 0, 0.02, 0.001, 0.005);
    expect(isFinite(r.k)).toBe(true);
    expect(isFinite(r.sigmaPeak)).toBe(true);
  });
});

describe("view helpers", () => {
  it("magnification is an honest ×1 when the budget is already visible", () => {
    expect(spreadMagnification(0.005, 0.008)).toBe(1); // 5 mm bow on an 8 mm loop
    expect(spreadMagnification(0.0001, 0.008)).toBeCloseTo(36, 0);
    expect(spreadMagnification(0, 0.008)).toBe(1);
  });

  it("spread shape: 0 at the apex, 1 at the pin, smooth", () => {
    expect(spreadShape(0)).toBe(0);
    expect(spreadShape(1)).toBeCloseTo(1, 12);
    expect(spreadShape(0.5)).toBeGreaterThan(0);
    expect(spreadShape(0.5)).toBeLessThan(1);
  });
});

describe("worked numbers stay in the realm of real hardware", () => {
  it("the default clasp opens with a realistic thumb force", () => {
    const r = base();
    expect(r.FnoseOpen).toBeGreaterThan(3);
    expect(r.FnoseOpen).toBeLessThan(25);
  });

  it("its loop rate is a few N/mm — soft, the whole wire is working", () => {
    expect(r0().k / 1000).toBeGreaterThan(1);
    expect(r0().k / 1000).toBeLessThan(20);
  });

  it("and the design survives its own opening with margin under 2", () => {
    const r = base();
    expect(r.SF).toBeGreaterThan(1);
    expect(r.SF).toBeLessThan(2);
  });

  function r0() {
    return base();
  }
});
