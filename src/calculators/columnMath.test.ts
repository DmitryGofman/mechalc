import { describe, it, expect } from "vitest";
import { columnResults, bowAmplitude, END_CONDITIONS } from "./columnMath";

// Steel strut 150 mm × 10 mm × 2 mm.
const E = 200e9;
const SY = 350e6;
const L = 0.15;
const T = 0.002;
const W = 0.01;

const K = (name: string) => END_CONDITIONS[name].K;

describe("columnResults", () => {
  it("matches the Euler load for a pinned-pinned steel strut", () => {
    // Pcr = π²EI/L², I = wt³/12 = 6.667e-12 → ≈ 585 N
    const r = columnResults(E, SY, L, T, W, 1.0, 0);
    expect(r.regime).toBe("euler");
    expect(r.Pcr).toBeGreaterThan(560);
    expect(r.Pcr).toBeLessThan(610);
  });

  it("scales with the classical effective-length factors", () => {
    const pcr = (k: number) => columnResults(E, SY, L, T, W, k, 0).PcrEuler;
    expect(pcr(0.5) / pcr(1.0)).toBeCloseTo(4, 6); // fixed-fixed
    expect(pcr(2.0) / pcr(1.0)).toBeCloseTo(0.25, 6); // flagpole
    expect(pcr(K("Fixed – pinned (K = 0.7)")) / pcr(1.0)).toBeCloseTo(2.046, 2);
  });

  it("buckles about the weak axis regardless of input order", () => {
    const a = columnResults(E, SY, L, T, W, 1.0, 0);
    const b = columnResults(E, SY, L, W, T, 1.0, 0);
    expect(a.Pcr / b.Pcr).toBeCloseTo(1, 9);
  });

  it("switches to the Johnson parabola for a short column", () => {
    const r = columnResults(E, SY, 0.02, T, W, 0.5, 0); // stubby, fixed-fixed
    expect(r.lambda).toBeLessThan(r.lambdaT);
    expect(r.regime).toBe("johnson");
    expect(r.Pcr).toBeLessThan(r.PcrEuler); // Johnson caps below Euler here
    expect(r.Pcr).toBeLessThan(r.A * SY); // and below pure crushing
    expect(r.Pcr).toBeGreaterThan(0.5 * r.A * SY); // Johnson floor at λt
  });

  it("reports the load safety factor against the governing Pcr", () => {
    const r = columnResults(E, SY, L, T, W, 1.0, 200);
    expect(r.SF).toBeCloseTo(r.Pcr / 200, 9);
  });
});

describe("mode shapes", () => {
  it("anchor at the base and respect the top condition", () => {
    for (const [name, ec] of Object.entries(END_CONDITIONS)) {
      expect(ec.shape(0), name).toBeCloseTo(0, 9);
      if (ec.top === "free") {
        expect(ec.shape(1), name).toBeCloseTo(1, 9); // flagpole sways at the tip
      } else {
        expect(ec.shape(1), name).toBeCloseTo(0, 6); // held ends stay on axis
      }
    }
  });

  it("clamp the slope only at fixed ends", () => {
    const h = 1e-5;
    for (const [name, ec] of Object.entries(END_CONDITIONS)) {
      const baseSlope = (ec.shape(h) - ec.shape(0)) / h;
      if (ec.base === "fixed") expect(Math.abs(baseSlope), name).toBeLessThan(1e-2);
      else expect(Math.abs(baseSlope), name).toBeGreaterThan(1);
    }
  });

  it("peak at 1 somewhere along the span", () => {
    for (const [name, ec] of Object.entries(END_CONDITIONS)) {
      let max = 0;
      for (let i = 0; i <= 100; i++) max = Math.max(max, Math.abs(ec.shape(i / 100)));
      expect(max, name).toBeCloseTo(1, 3);
    }
  });
});

describe("bowAmplitude", () => {
  it("amplifies the initial imperfection hyperbolically toward Pcr", () => {
    const Pcr = 585;
    const a0 = bowAmplitude(0, Pcr, L);
    expect(a0).toBeCloseTo(L / 300, 9);
    expect(bowAmplitude(Pcr / 2, Pcr, L)).toBeCloseTo(2 * a0, 6); // 1/(1−0.5)
    expect(bowAmplitude(0.9 * Pcr, Pcr, L)).toBeCloseTo(10 * a0, 5);
  });

  it("keeps growing past Pcr but stays capped for display", () => {
    const Pcr = 585;
    const post = bowAmplitude(1.5 * Pcr, Pcr, L);
    expect(post).toBeGreaterThan(bowAmplitude(Pcr, Pcr, L) - 1e-12);
    expect(post).toBeLessThanOrEqual(0.22 * L);
  });
});
