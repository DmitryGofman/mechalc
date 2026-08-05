import { describe, expect, it } from "vitest";
import {
  CLASSES,
  CLASS_EQUIVALENT,
  NUT_FACTORS,
  SAE_CLASSES,
  THREADS,
  UNIFIED_THREADS,
  fastenerSpec,
  isInchThread,
  nearestThread,
  threadLabel,
} from "./fasteners";
import { UNITS, q } from "./units";

const IN2 = 25.4 * 25.4; // mm² per in²
const I = UNITS.imperial;

describe("unified inch threads", () => {
  it("stores inch hardware in the module's own mm / mm²", () => {
    const q14 = UNIFIED_THREADS['1/4"-20 UNC'];
    expect(q14.d).toBeCloseTo(6.35, 6); // 0.250 in
    expect(q14.As).toBeCloseTo(0.0318 * IN2, 6); // 20.5 mm²
    expect(q14.p).toBeCloseTo(25.4 / 20, 6); // 20 TPI → 1.27 mm pitch
    expect(q14.tpi).toBe(20);
  });

  it("reads back as the handbook value in imperial", () => {
    expect(q(I.area, UNIFIED_THREADS['1/2"-13 UNC'].As)).toBe("0.1419");
    expect(q(I.length, UNIFIED_THREADS['1/2"-13 UNC'].d)).toBe("0.500");
    expect(q(I.length, UNIFIED_THREADS["#10-24 UNC"].d)).toBe("0.190");
  });

  it("keeps UNF stronger in tension than UNC at the same nominal Ø", () => {
    for (const [unc, unf] of [
      ['1/4"-20 UNC', '1/4"-28 UNF'],
      ['3/8"-16 UNC', '3/8"-24 UNF'],
      ['1/2"-13 UNC', '1/2"-20 UNF'],
    ]) {
      expect(UNIFIED_THREADS[unc].d).toBeCloseTo(UNIFIED_THREADS[unf].d, 9);
      expect(UNIFIED_THREADS[unf].As).toBeGreaterThan(UNIFIED_THREADS[unc].As);
    }
  });

  it("labels each series the way its hardware is designated", () => {
    expect(threadLabel("M6", THREADS.M6)).toBe("M6 × 1");
    expect(threadLabel('1/4"-20 UNC', UNIFIED_THREADS['1/4"-20 UNC'])).toBe('1/4"-20 UNC — 20 TPI');
    expect(isInchThread(THREADS.M6)).toBe(false);
    expect(isInchThread(UNIFIED_THREADS['1/4"-20 UNC'])).toBe(true);
  });

  it("finds the nearest size in the other series by stress area", () => {
    // M6 (20.1 mm²) sits right on 1/4-20 UNC (20.5 mm²).
    expect(nearestThread(THREADS.M6.As, UNIFIED_THREADS)).toBe('1/4"-20 UNC');
    expect(nearestThread(UNIFIED_THREADS['1/4"-20 UNC'].As, THREADS)).toBe("M6");
    // …and a big one still lands on a big one.
    expect(nearestThread(THREADS.M16.As, UNIFIED_THREADS)).toBe('5/8"-11 UNC');
  });
});

describe("SAE J429 grades", () => {
  it("converts the tabulated ksi figures to MPa", () => {
    const g5 = SAE_CLASSES["SAE Grade 5 (medium-carbon, Q&T)"];
    expect(q(I.stress, g5.sp)).toBe("85.0");
    expect(q(I.stress, g5.sy)).toBe("92.0");
    expect(q(I.stress, g5.su)).toBe("120.0");
    expect(g5.sp).toBeCloseTo(586, 0); // MPa, for comparison with class 8.8
  });

  it("lands Grade 5 on class 8.8 and Grade 8 on 10.9", () => {
    // The two standards happen to line up closely here: 85 ksi vs 580 MPa and
    // 120 ksi vs 830 MPa are both within a percent. That is what makes the
    // equivalence map below defensible.
    const g5 = SAE_CLASSES["SAE Grade 5 (medium-carbon, Q&T)"];
    const g8 = SAE_CLASSES["SAE Grade 8 (alloy steel, Q&T)"];
    expect(g5.sp / CLASSES["8.8 (medium-carbon, Q&T)"].sp).toBeCloseTo(1, 1);
    expect(g8.sp / CLASSES["10.9 (alloy steel, Q&T)"].sp).toBeCloseTo(1, 1);
    expect(g8.sp).toBeLessThan(CLASSES["12.9 (alloy steel, Q&T)"].sp);
    expect(g8.sp).toBeGreaterThan(CLASSES["8.8 (medium-carbon, Q&T)"].sp);
  });

  it("maps every class to a grade in the other standard, both ways", () => {
    for (const k of Object.keys(CLASSES)) {
      const to = CLASS_EQUIVALENT[k];
      expect(to, `${k} has no inch equivalent`).toBeDefined();
      expect(to in SAE_CLASSES).toBe(true);
    }
    for (const k of Object.keys(SAE_CLASSES)) {
      const to = CLASS_EQUIVALENT[k];
      expect(to, `${k} has no metric equivalent`).toBeDefined();
      expect(to in CLASSES).toBe(true);
    }
  });
});

describe("torque for inch hardware", () => {
  it("reproduces the published dry-torque band for 1/4-20 Grade 5", () => {
    // Steel plates, so the bolt governs. Published tables give ~8 lbf·ft
    // (96 lbf·in) at a 75% preload target; this toolkit targets 65%, so the
    // number should sit a little under that.
    const spec = fastenerSpec({
      thread: UNIFIED_THREADS['1/4"-20 UNC'],
      cls: SAE_CLASSES["SAE Grade 5 (medium-carbon, Q&T)"],
      K: NUT_FACTORS["Dry steel, plain (K ≈ 0.20)"],
      pG: 490, // mild steel
      washer: false,
    });
    expect(spec.governs).toBe("bolt proof strength");
    const lbfIn = I.torque.from(spec.T);
    expect(lbfIn).toBeGreaterThan(80);
    expect(lbfIn).toBeLessThan(96);
  });

  it("agrees with the metric neighbour, because the hardware nearly matches", () => {
    const common = { K: 0.2, pG: 490, washer: false };
    const inch = fastenerSpec({
      thread: UNIFIED_THREADS['1/4"-20 UNC'],
      cls: SAE_CLASSES["SAE Grade 5 (medium-carbon, Q&T)"],
      ...common,
    });
    const metric = fastenerSpec({
      thread: THREADS.M6,
      cls: CLASSES["8.8 (medium-carbon, Q&T)"],
      ...common,
    });
    // 1/4-20 is a slightly bigger bolt than M6, so a little more torque —
    // but the two answers must stay within a few percent of each other.
    expect(inch.T / metric.T).toBeGreaterThan(1);
    expect(inch.T / metric.T).toBeLessThan(1.15);
  });

  it("still lets a soft plate take over from the bolt", () => {
    const spec = fastenerSpec({
      thread: UNIFIED_THREADS['1/4"-20 UNC'],
      cls: SAE_CLASSES["SAE Grade 8 (alloy steel, Q&T)"],
      K: 0.2,
      pG: 50, // PA12
      washer: false,
    });
    expect(spec.governs).toBe("bearing on the clamped material");
    expect(spec.T).toBeLessThan(spec.T65);
  });
});
