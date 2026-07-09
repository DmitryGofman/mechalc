import { describe, it, expect } from "vitest";
import { boltResults, memberStiffness, jointResults, THREADS, CLASSES, PLATE_MATERIALS } from "./boltMath";

const M6 = THREADS.M6;
const C88 = CLASSES["8.8 (medium-carbon, Q&T)"];
const STEEL = PLATE_MATERIALS["Mild steel (S235)"];
const ALU = PLATE_MATERIALS["Aluminum 6061-T6"];
const POM = PLATE_MATERIALS["POM / Delrin"];

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

describe("memberStiffness (Shigley 30° pressure cone)", () => {
  it("matches the hand-computed frustum value for symmetric steel plates", () => {
    // M6, two 10 mm steel plates: two identical frusta in series.
    // Hand calc: km ≈ 1.08e9 N/m.
    const km = memberStiffness(6, 10, 200, 10, 200);
    expect(km / 1e9).toBeGreaterThan(0.95);
    expect(km / 1e9).toBeLessThan(1.2);
  });

  it("scales with plate modulus", () => {
    const steel = memberStiffness(6, 10, 200, 10, 200);
    const pom = memberStiffness(6, 10, 3.1, 10, 3.1);
    expect(steel / pom).toBeCloseTo(200 / 3.1, 1);
  });

  it("is symmetric in plate order", () => {
    const a = memberStiffness(8, 6, 68.9, 14, 200);
    const b = memberStiffness(8, 14, 200, 6, 68.9);
    expect(a / b).toBeCloseTo(1, 6);
  });
});

describe("jointResults (clamped sandwich)", () => {
  it("gives the textbook stiffness ratio for a steel/steel joint", () => {
    // Steel bolt in steel plates: C typically 0.1–0.25 (members carry most
    // of the external load).
    const r = jointResults(M6, C88, 0.2, 6, 10, STEEL, 10, STEEL, 0);
    expect(r.C).toBeGreaterThan(0.1);
    expect(r.C).toBeLessThan(0.25);
  });

  it("pushes C toward 1 for very soft plates", () => {
    const r = jointResults(M6, C88, 0.2, 6, 10, POM, 10, POM, 0);
    expect(r.C).toBeGreaterThan(0.8);
  });

  it("conserves the external load between bolt and members", () => {
    const P = 1200;
    const r = jointResults(M6, C88, 0.2, 6, 8, ALU, 12, STEEL, P);
    const boltShare = r.Fb - r.F;
    const memberShare = r.F - r.Fm;
    expect(boltShare + memberShare).toBeCloseTo(P, 6);
  });

  it("loses all clamp exactly at the separation load", () => {
    const r0 = jointResults(M6, C88, 0.2, 6, 10, STEEL, 10, STEEL, 0);
    const rSep = jointResults(M6, C88, 0.2, 6, 10, STEEL, 10, STEEL, r0.Psep);
    expect(rSep.Fm).toBeCloseTo(0, 4);
    expect(rSep.nSep).toBeCloseTo(1, 6);
  });

  it("flags bearing overload on soft plastic plates", () => {
    // M6 8.8 at recommended torque crushes POM under the head (needs washers).
    const r = jointResults(M6, C88, 0.2, 9, 10, POM, 10, STEEL, 0);
    expect(r.nBear1).toBeLessThan(1);
    expect(r.nBear2).toBeGreaterThan(1);
  });

  it("keeps working stress below the tightening von Mises stress", () => {
    // Torsion relaxes after the wrench is released, so the working check is
    // milder than the tightening check (with no external load).
    const r = jointResults(M6, C88, 0.2, 6, 10, STEEL, 10, STEEL, 0);
    expect(r.sigmaWork).toBeLessThan(r.vm);
    expect(r.sigmaWork).toBeCloseTo(r.sigma, 6);
  });
});
