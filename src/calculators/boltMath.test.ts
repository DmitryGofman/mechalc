import { describe, it, expect } from "vitest";
import {
  boltResults,
  memberStiffness,
  jointResults,
  recommendedTorque,
  coneRadiusAtDepth,
  conePressureAtDepth,
  flowLineStateAtDepth,
  coneVisibility,
  THREADS,
  CLASSES,
  PLATE_MATERIALS,
} from "./boltMath";

const M6 = THREADS.M6;
const C88 = CLASSES["8.8 (medium-carbon, Q&T)"];
const STEEL = PLATE_MATERIALS["Mild steel (S235)"];
const ALU = PLATE_MATERIALS["Aluminum 6061-T6"];
const POM = PLATE_MATERIALS["POM / Delrin"];
const PA12 = PLATE_MATERIALS["Nylon 12 (PA12)"];
const FR4 = PLATE_MATERIALS["FR-4 PCB (glass-epoxy)"];

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

describe("pressure-cone load distribution", () => {
  const GRIP = 20; // 8 + 12 mm

  it("widens at 30° from each bearing face to mid-grip", () => {
    const r0 = coneRadiusAtDepth(6, 0, GRIP);
    const rMid = coneRadiusAtDepth(6, GRIP / 2, GRIP);
    expect(r0).toBeCloseTo(1.5 * 6 * 0.5, 9); // starts at the washer face, dw/2
    expect(rMid - r0).toBeCloseTo((GRIP / 2) * Math.tan(Math.PI / 6), 9);
  });

  it("is symmetric top-to-bottom — the cone converges back to the nut", () => {
    for (const z of [0, 3, 7, 10, 14, 20]) {
      expect(coneRadiusAtDepth(6, z, GRIP)).toBeCloseTo(coneRadiusAtDepth(6, GRIP - z, GRIP), 9);
    }
  });

  it("peaks at the bearing faces and decays to a minimum at mid-grip", () => {
    const F = 8000;
    const samples = Array.from({ length: 21 }, (_, i) => conePressureAtDepth(6, F, (i / 20) * GRIP, GRIP));
    const mid = samples[10];
    expect(samples[0]).toBeGreaterThan(mid);
    expect(samples[20]).toBeGreaterThan(mid);
    expect(Math.min(...samples)).toBeCloseTo(mid, 9);
    // monotonic decay over the top half
    for (let i = 1; i <= 10; i++) expect(samples[i]).toBeLessThanOrEqual(samples[i - 1] + 1e-9);
  });

  it("matches the head bearing pressure at the surface", () => {
    const j = jointResults(M6, C88, 0.2, 9, 10, STEEL, 10, STEEL, 0);
    expect(conePressureAtDepth(6, j.F, 0, 20)).toBeCloseTo(j.pHead, 3);
  });

  it("matches the reported interface pressure at the plate boundary", () => {
    const j = jointResults(M6, C88, 0.2, 9, 8, STEEL, 12, STEEL, 400);
    // interface sits 8 mm down in a 20 mm grip; clamp force there is Fm
    expect(conePressureAtDepth(6, j.Fm, 8, 20)).toBeCloseTo(j.pInt, 3);
  });

  it("scales linearly with clamp force", () => {
    const a = conePressureAtDepth(6, 1000, 5, GRIP);
    const b = conePressureAtDepth(6, 3000, 5, GRIP);
    expect(b / a).toBeCloseTo(3, 9);
    expect(conePressureAtDepth(6, 0, 5, GRIP)).toBe(0);
  });

  it("spreads load better in a thicker stack — lower mid-grip pressure", () => {
    const thin = conePressureAtDepth(6, 8000, 5, 10);
    const thick = conePressureAtDepth(6, 8000, 15, 30);
    expect(thick).toBeLessThan(thin);
  });
});

describe("flow-line coloring inside the clamped materials", () => {
  const T1 = 8;
  const T2 = 12;
  const F = 5000;
  const st = (z: number, m1 = PA12, m2 = STEEL) => flowLineStateAtDepth(8, F, z, T1, m1, T2, m2);

  it("reads each depth against the material actually there", () => {
    // Same pressure either side of the interface, but very different margins:
    // the soft plate is near its limit while the steel one is nowhere near.
    const soft = st(7.9);
    const hard = st(8.1);
    // Pressure is continuous across the interface (differs only by the cone
    // widening over that 0.2 mm) …
    expect(Math.abs(soft.pressure / hard.pressure - 1)).toBeLessThan(0.05);
    expect(soft.ratio).toBeGreaterThan(hard.ratio * 5); // margin is not
    expect(hard.ratio).toBeLessThan(0.3);
  });

  it("flags the soft plate as over its limit while steel stays safe", () => {
    expect(st(0).ratio).toBeGreaterThan(1); // PA12 under the head: crushing
    expect(st(T1 + T2).ratio).toBeLessThan(1); // steel at the nut: fine
  });

  it("swaps which half is hot when the materials swap", () => {
    const softTop = st(1, PA12, STEEL);
    const softBottom = st(T1 + T2 - 1, PA12, STEEL);
    const flippedTop = st(1, STEEL, PA12);
    const flippedBottom = st(T1 + T2 - 1, STEEL, PA12);
    expect(softTop.ratio).toBeGreaterThan(flippedTop.ratio);
    expect(flippedBottom.ratio).toBeGreaterThan(softBottom.ratio);
  });

  it("brightness peaks at both bearing faces and dips at mid-grip", () => {
    expect(st(0).bright).toBeCloseTo(1, 9);
    expect(st(T1 + T2).bright).toBeCloseTo(1, 9);
    const mid = st((T1 + T2) / 2).bright;
    expect(mid).toBeLessThan(0.6); // load is genuinely diluted in the middle
    expect(mid).toBeGreaterThan(0);
  });

  it("dims everything to zero when the joint separates", () => {
    const s = flowLineStateAtDepth(8, 0, 4, T1, PA12, T2, STEEL);
    expect(s.pressure).toBe(0);
    expect(s.ratio).toBe(0);
    expect(s.bright).toBe(0);
  });

  it("shows a thicker stack spreading load further — dimmer middle", () => {
    const thin = flowLineStateAtDepth(8, F, 5, 5, STEEL, 5, STEEL).bright;
    const thick = flowLineStateAtDepth(8, F, 20, 20, STEEL, 20, STEEL).bright;
    expect(thick).toBeLessThan(thin);
  });
});

describe("coneVisibility (the cone fades in with the clamp load)", () => {
  it("is completely absent at zero clamp", () => {
    expect(coneVisibility(0, 8000)).toBe(0);
  });

  it("ramps proportionally and saturates at the recommended preload", () => {
    expect(coneVisibility(2000, 8000)).toBeCloseTo(0.25, 9);
    expect(coneVisibility(4000, 8000)).toBeCloseTo(0.5, 9);
    expect(coneVisibility(8000, 8000)).toBeCloseTo(1, 9);
    expect(coneVisibility(20000, 8000)).toBe(1); // clamped, never over-bright
  });

  it("never goes negative when an external load has separated the joint", () => {
    expect(coneVisibility(-500, 8000)).toBe(0);
  });

  it("reaches full presence at each material's own working torque", () => {
    // A plastic joint runs at a fraction of the steel torque — keyed to clamp
    // force, both still saturate at their own recommendation.
    const steel = recommendedTorque(M6, C88, 0.2, STEEL, STEEL);
    const nylon = recommendedTorque(M6, C88, 0.2, PA12, PA12);
    expect(nylon.F).toBeLessThan(steel.F / 3); // very different preloads …
    expect(coneVisibility(steel.F, steel.F)).toBeCloseTo(1, 9); // … same full cone
    expect(coneVisibility(nylon.F, nylon.F)).toBeCloseTo(1, 9);
  });

  it("degrades safely if there is no recommendation to scale against", () => {
    expect(coneVisibility(5000, 0)).toBe(0);
  });
});

describe("recommendedTorque (depends on the clamped materials)", () => {
  it("is bolt-limited for steel plates and matches published M6 8.8 values", () => {
    const r = recommendedTorque(M6, C88, 0.2, STEEL, STEEL);
    expect(r.governedBy).toBe("bolt");
    expect(r.T).toBeGreaterThan(8); // handbook dry M6 8.8 ≈ 9–11 N·m
    expect(r.T).toBeLessThan(11);
  });

  it("stays bolt-limited for aluminum — same as the steel recommendation", () => {
    const alu = recommendedTorque(M6, C88, 0.2, ALU, STEEL);
    const steel = recommendedTorque(M6, C88, 0.2, STEEL, STEEL);
    expect(alu.governedBy).toBe("bolt");
    expect(alu.T).toBeCloseTo(steel.T, 9);
  });

  it("drops to a plate-limited value for nylon and PCB", () => {
    const steel = recommendedTorque(M6, C88, 0.2, STEEL, STEEL);
    const pa12 = recommendedTorque(M6, C88, 0.2, PA12, STEEL);
    const fr4 = recommendedTorque(M6, C88, 0.2, FR4, STEEL);
    expect(pa12.governedBy).toBe("plate");
    expect(fr4.governedBy).toBe("plate");
    expect(pa12.T).toBeLessThan(steel.T / 3);
    expect(fr4.T).toBeGreaterThan(pa12.T); // FR-4 takes more pressure than PA12
    expect(fr4.T).toBeLessThan(steel.T);
  });

  it("is governed by the SOFTER of the two plates", () => {
    const a = recommendedTorque(M6, C88, 0.2, PA12, STEEL);
    const b = recommendedTorque(M6, C88, 0.2, STEEL, PA12);
    const both = recommendedTorque(M6, C88, 0.2, PA12, PA12);
    expect(a.T).toBeCloseTo(b.T, 9);
    expect(a.T).toBeCloseTo(both.T, 9);
  });

  it("recommends an M5-into-nylon torque in the practical ~1 N·m range", () => {
    const r = recommendedTorque(THREADS.M5, C88, 0.2, PA12, PA12);
    expect(r.T).toBeGreaterThan(0.5);
    expect(r.T).toBeLessThan(1.5);
  });

  it("never recommends a torque that its own bearing check would flag", () => {
    for (const m of [PA12, FR4, POM, ALU, STEEL]) {
      const rec = recommendedTorque(M6, C88, 0.2, m, m);
      const j = jointResults(M6, C88, 0.2, rec.T, 10, m, 10, m, 0);
      expect(Math.min(j.nBear1, j.nBear2), `${m.pG} MPa plate`).toBeGreaterThanOrEqual(1);
    }
  });

  it("scales with the nut factor, like any torque spec", () => {
    const dry = recommendedTorque(M6, C88, 0.2, STEEL, STEEL);
    const lubed = recommendedTorque(M6, C88, 0.15, STEEL, STEEL);
    expect(lubed.T / dry.T).toBeCloseTo(0.75, 6);
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

  it("recommends a torque that survives its own bearing check in service", () => {
    // A polymer plate makes the members squishy (C near 0.9), so the nut
    // hands most of the external load straight to the plate on top of the
    // preload. The recommendation must deduct that share — otherwise the
    // suggested torque is flagged as crushing the moment P is applied.
    const P = 500;
    const rec = jointResults(M6, C88, 0.2, 6, 8, STEEL, 12, PA12, P).TrecJoint;
    const at = jointResults(M6, C88, 0.2, rec, 8, STEEL, 12, PA12, P);
    // The full 10% bearing margin is preserved at service load…
    expect(Math.min(at.nBear1, at.nBear2)).toBeGreaterThanOrEqual(1.1);
    // …because the bearing side gave up exactly C·P of preload allowance.
    const noP = jointResults(M6, C88, 0.2, 6, 8, STEEL, 12, PA12, 0);
    expect(rec).toBeLessThan(noP.TrecJoint);
  });

  it("reduces to the fastener-side recommendation when P = 0", () => {
    const fastenerSide = recommendedTorque(M6, C88, 0.2, STEEL, PA12);
    const joint = jointResults(M6, C88, 0.2, 6, 8, STEEL, 12, PA12, 0);
    expect(joint.TrecJoint).toBeCloseTo(fastenerSide.T, 9);
    expect(joint.TrecGovernedBy).toBe("plate");
  });

  it("keeps stiff-plate joints on the bolt-governed handbook value", () => {
    // Steel plates: C·P is real but the bolt, not bearing, is the limit, so
    // the external load must not move the recommendation at all.
    const loaded = jointResults(M6, C88, 0.2, 6, 10, STEEL, 10, STEEL, 2000);
    const unloaded = jointResults(M6, C88, 0.2, 6, 10, STEEL, 10, STEEL, 0);
    expect(loaded.TrecJoint).toBeCloseTo(unloaded.TrecJoint, 9);
    expect(loaded.TrecGovernedBy).toBe("bolt");
  });
});
