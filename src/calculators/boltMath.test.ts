import { describe, it, expect } from "vitest";
import { boltResults, THREADS, CLASSES } from "./boltMath";

const M6 = THREADS.M6;
const C88 = CLASSES["8.8 (medium-carbon, Q&T)"];

describe("boltResults", () => {
  it("computes preload from torque via the nut factor", () => {
    // F = T / (K·d) = 10 / (0.2 · 0.006) = 8333 N
    const r = boltResults(M6, C88, 0.2, 10, 20);
    expect(r.F).toBeCloseTo(8333.3, 0);
  });

  it("computes direct tensile stress on the stress area", () => {
    // σ = F / As = 8333 N / 20.1 mm² ≈ 414.6 MPa
    const r = boltResults(M6, C88, 0.2, 10, 20);
    expect(r.sigma / 1e6).toBeCloseTo(414.6, 0);
  });

  it("combines tension and torsion into von Mises below simple addition", () => {
    const r = boltResults(M6, C88, 0.2, 10, 20);
    expect(r.vm).toBeGreaterThan(r.sigma);
    expect(r.vm).toBeLessThan(r.sigma + 3 * r.tau);
    // For M6 / 8.8 / K=0.2 / 10 N·m the joint sits just at the proof margin.
    expect(r.SF).toBeGreaterThan(1.0);
    expect(r.SF).toBeLessThan(1.2);
  });

  it("recommends a torque in the familiar handbook range for M6 8.8", () => {
    // Handbook dry-torque specs for M6 8.8 cluster around 9–11 N·m.
    const r = boltResults(M6, C88, 0.2, 0, 20);
    expect(r.Trec).toBeGreaterThan(8);
    expect(r.Trec).toBeLessThan(11);
  });

  it("handles zero torque without dividing by zero", () => {
    const r = boltResults(M6, C88, 0.2, 0, 20);
    expect(r.F).toBe(0);
    expect(r.vm).toBe(0);
    expect(r.SF).toBe(Infinity);
  });

  it("scales bolt stretch with grip length", () => {
    const short = boltResults(M6, C88, 0.2, 10, 10);
    const long = boltResults(M6, C88, 0.2, 10, 30);
    expect(long.dL / short.dL).toBeCloseTo(3, 5);
  });
});
