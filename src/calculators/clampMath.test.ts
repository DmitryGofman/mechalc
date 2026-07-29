import { describe, it, expect } from "vitest";
import {
  defaults, solve, recommend, boltSpec, curvedBeam, bodyStressRatio, stressRGB,
  CLAMP_MATS, CLASSES, THREADS, KFACT, ETA, TARGET_PRELOAD_FRACTION,
  type ClampInput,
} from "./clampMath";

const at = (T: number, over: Partial<ClampInput> = {}) => solve({ ...defaults(), ...over, T });

describe("geometry — one height dimension drives both sections", () => {
  it("derives the crown from H, the gap and the bore", () => {
    const inp = { ...defaults(), H: 26, gap: 2, D: 25 };
    const r = solve(inp);
    expect(r.tc).toBeCloseTo(2 / 2 + 26 - 12.5, 6); // gap/2 + H − D/2
    expect(r.tf).toBe(26); // the ear is the full block height
  });

  it("keeps the crown thinner than the ear — that is why it governs", () => {
    const r = at(1.26);
    expect(r.tc).toBeLessThan(r.tf);
    expect(r.sigmaCrown).toBeGreaterThan(r.sigmaF);
  });

  it("moves the crown by exactly half a gap change, never jumping", () => {
    const a = solve({ ...defaults(), gap: 1 });
    const b = solve({ ...defaults(), gap: 3 });
    expect(b.tc - a.tc).toBeCloseTo(1, 6);
  });

  it("guards a bore taller than the body instead of going negative", () => {
    const r = solve({ ...defaults(), H: 5, D: 50 });
    expect(r.tcRaw).toBeLessThan(0);
    expect(r.tc).toBeGreaterThan(0);
    expect(Number.isFinite(r.sigmaCrown)).toBe(true);
    expect(r.warns.some((w) => w.level === "bad")).toBe(true);
  });
});

describe("torque → preload → grip", () => {
  it("uses the nut-factor relation F = T/(K·d)", () => {
    const inp = { ...defaults(), T: 1.26 };
    const r = solve(inp);
    expect(r.Fb).toBeCloseTo((1000 * 1.26) / (KFACT[inp.Kname] * THREADS[inp.thread].d), 6);
    expect(r.Ftot).toBeCloseTo(r.Fb * inp.N, 6);
  });

  it("is linear in torque below gap closure", () => {
    const a = at(0.4), b = at(0.8);
    expect(b.Fb / a.Fb).toBeCloseTo(2, 6);
    expect(b.sigmaCrown / a.sigmaCrown).toBeCloseTo(2, 6);
    expect(b.Fax / a.Fax).toBeCloseTo(2, 6);
  });

  it("derives grip from friction and derates it for creep", () => {
    const r = at(1.26);
    expect(r.Fax).toBeCloseTo(ETA * r.mu * Math.PI * r.Fcl, 6);
    expect(r.Thold).toBeCloseTo((r.Fax * defaults().D) / 2 / 1000, 6);
    expect(r.FaxLT).toBeCloseTo(r.Fax * CLAMP_MATS[defaults().mat].creep, 6);
    expect(r.FaxLT).toBeLessThan(r.Fax); // printed body must lose preload
  });

  it("does not derate a metal body", () => {
    const r = solve({ ...defaults(), mat: "Mild steel (S235)", T: 1.26 });
    expect(r.FaxLT).toBeCloseTo(r.Fax, 6);
  });
});

describe("deflection — a varying-depth beam, not the ear cantilever", () => {
  // The bug this catches: fixing the span at e with the full-height section
  // understated the movement ~80x. The answer must sit between a uniform
  // thin-section cantilever and a uniform full-section one over span R+e.
  it("lands between the thin and full-section bounds", () => {
    const inp = { ...defaults(), T: 1.26 };
    const r = solve(inp);
    const E = CLAMP_MATS[inp.mat].E, a = r.aBolt;
    const dThin = (r.Fb * a ** 3) / (3 * E * ((r.b * r.tc ** 3) / 12));
    const dFull = (r.Fb * a ** 3) / (3 * E * ((r.b * r.H ** 3) / 12));
    expect(r.dFl).toBeGreaterThan(dFull);
    expect(r.dFl).toBeLessThan(dThin);
    expect(r.dFl).toBeGreaterThan(0.5 * dThin); // flexible part is at the root
  });

  it("scales linearly with load and softens with a softer body", () => {
    expect(at(0.8).dFl / at(0.4).dFl).toBeCloseTo(2, 6);
    const stiff = solve({ ...defaults(), mat: "Mild steel (S235)", T: 1.26 });
    const soft = solve({ ...defaults(), mat: "PC-ABS (FDM)", T: 1.26 });
    expect(soft.dFl).toBeGreaterThan(stiff.dFl);
  });

  it("gives a deflection shape that is zero at the bore centre and rises to the tip", () => {
    const r = at(1.26);
    expect(r.dfShape(0)).toBeCloseTo(0, 9);
    expect(r.dfShape(r.halfW)).toBeCloseTo(1, 6);
    // monotonic — the body bends progressively, it does not pivot rigidly
    let prev = -1;
    for (let i = 0; i <= 10; i++) {
      const v = r.dfShape((i / 10) * r.halfW);
      expect(v).toBeGreaterThanOrEqual(prev);
      prev = v;
    }
    // and it starts bending over the bore, not only past the bore wall
    expect(r.dfShape(defaults().D / 4)).toBeGreaterThan(0);
  });
});

describe("gap closure caps the grip", () => {
  it("stops clamp force growing once the faces meet", () => {
    const r = at(1.26);
    const past = at(r.Tclose * 3);
    expect(past.bottomed).toBe(true);
    expect(past.Fcl).toBeCloseTo(r.Fclose, 6);
    expect(past.gapRemain).toBe(0);
    // the bolt keeps loading up even though grip does not
    expect(past.Fb).toBeGreaterThan(r.Fb);
    expect(past.Fax).toBeCloseTo(ETA * r.mu * Math.PI * r.Fclose, 6);
  });

  it("consumes the gap through both ears plus the tube's ovalization", () => {
    const r = at(1.0);
    expect(r.closure).toBeCloseTo(2 * r.dFl + r.dOval, 6);
    expect(r.gapRemain).toBeCloseTo(defaults().gap - r.closure, 6);
  });

  it("has no ovalization term for a solid rod", () => {
    const r = solve({ ...defaults(), hollow: false, T: 1.26 });
    expect(r.dOval).toBe(0);
    expect(r.closure).toBeCloseTo(2 * r.dFl, 6);
  });
});

describe("recommended torque", () => {
  it("sits a design margin below the first thing to yield", () => {
    const inp = defaults();
    const rec = recommend(inp);
    const r = solve({ ...inp, T: rec.T });
    expect(r.SFstruct).toBeGreaterThanOrEqual(rec.margin - 1e-6);
    expect(rec.T).toBeLessThanOrEqual(rec.Tyield);
    expect(rec.T).toBeLessThanOrEqual(rec.Tclose + 1e-9);
  });

  it("names the check that governs it", () => {
    const rec = recommend(defaults());
    expect(rec.governing).toBe("crown bending");
    expect(rec.limits[0].key).toBe("crown bending");
  });

  it("rises when the body is made stronger", () => {
    const weak = recommend({ ...defaults(), mat: "PC-ABS (FDM)" });
    const strong = recommend({ ...defaults(), mat: "Mild steel (S235)" });
    expect(strong.T).toBeGreaterThan(weak.T);
  });

  it("reports not-ok when the duty cannot be met safely", () => {
    const rec = recommend({ ...defaults(), Freq: 40000, Treq: 500 });
    expect(rec.ok).toBe(false);
    expect(rec.Tneed).toBeGreaterThan(rec.T);
  });
});

describe("fastener-side spec", () => {
  it("takes 65% of proof on the stress area, capped by bearing", () => {
    const inp = defaults();
    const s = boltSpec(inp);
    const cl = CLASSES[inp.cls], th = THREADS[inp.thread];
    expect(s.F65).toBeCloseTo(TARGET_PRELOAD_FRACTION * cl.sp * th.As, 6);
    expect(s.T).toBeCloseTo(Math.min(s.T65, s.Tbear), 6);
  });

  it("is limited by the plastic on a printed body and by the bolt on steel", () => {
    expect(boltSpec({ ...defaults(), mat: "PC-ABS (FDM)" }).governs).toBe("bearing on the clamped material");
    expect(boltSpec({ ...defaults(), mat: "Mild steel (S235)" }).governs).toBe("bolt proof strength");
  });

  it("gives the bolt more headroom with a washer", () => {
    expect(boltSpec({ ...defaults(), washer: true }).Tbear)
      .toBeGreaterThan(boltSpec({ ...defaults(), washer: false }).Tbear);
  });

  it("leaves the fastener far stronger than a plastic body needs", () => {
    const inp = defaults();
    expect(boltSpec(inp).T).toBeGreaterThan(recommend(inp).T);
  });
});

describe("curved-beam cross-check", () => {
  it("shifts the neutral axis toward the bore and brackets the straight-beam value", () => {
    const inp = defaults();
    const cb = curvedBeam(inp, solve({ ...inp, T: 1.26 }))!;
    expect(cb).not.toBeNull();
    expect(cb.rn).toBeLessThan(cb.rc); // neutral axis moves toward the centre of curvature
    expect(cb.ecc).toBeGreaterThan(0);
    expect(cb.slenderness).toBeLessThan(5); // squarely in curved-beam territory
    expect(cb.ratioIn).toBeGreaterThan(1); // bore surface worse than straight theory says
    expect(cb.ratioOut).toBeLessThan(1); // outer surface better
    expect(cb.sigStraight).toBeGreaterThan(0);
  });
});

describe("stress field and colour ramp", () => {
  it("puts the crown's outer surface in tension and the bore in compression", () => {
    const inp = { ...defaults(), T: 1.26 };
    const r = solve(inp);
    const top = bodyStressRatio(inp, r, 0, r.H);
    const bore = bodyStressRatio(inp, r, 0, inp.D / 2 - r.g2);
    expect(top).toBeGreaterThan(0);
    expect(bore).toBeLessThan(0);
    expect(top).toBeCloseTo(-bore, 6); // linear about the neutral axis
  });

  it("carries no bending in the overhang past the bolt", () => {
    const inp = { ...defaults(), T: 1.26 };
    const r = solve(inp);
    expect(bodyStressRatio(inp, r, r.aBolt + 2, r.H)).toBe(0);
  });

  it("responds to torque — the field must not be scale-invariant", () => {
    const lo = { ...defaults(), T: 0.5 }, hi = { ...defaults(), T: 2.0 };
    const rl = solve(lo), rh = solve(hi);
    const a = bodyStressRatio(lo, rl, 0, rl.H), b = bodyStressRatio(hi, rh, 0, rh.H);
    expect(b).toBeCloseTo(4 * a, 6);
  });

  it("ramps tension red and compression blue, green at zero", () => {
    const [tr, tg, tb] = stressRGB(1);
    expect(tr).toBeGreaterThan(tb); // tension is red-dominant
    const [cr, cg, cb] = stressRGB(-1);
    expect(cb).toBeGreaterThan(cr); // compression is blue-dominant
    const [, ng] = stressRGB(0);
    expect(ng).toBeGreaterThan(tg); // neutral is the greenest
    expect(ng).toBeGreaterThan(cg);
  });
});

describe("robustness across the input space", () => {
  it("stays finite for every combination of geometry", () => {
    for (const H of [5, 13, 20, 26, 40])
      for (const gap of [0.1, 1, 3, 8])
        for (const D of [8, 25, 60])
          for (const e of [3, 9, 25])
            for (const hollow of [true, false]) {
              const r = solve({ ...defaults(), H, gap, D, e, hollow, T: 1.5 });
              for (const v of [r.Fb, r.sigmaCrown, r.sigmaF, r.Fcl, r.dFl, r.p, r.sigmaCyl, r.pHead, r.Fax, r.gapRemain])
                expect(Number.isNaN(v)).toBe(false);
              expect(r.tc).toBeGreaterThan(0);
              expect(r.SFstruct).toBeGreaterThan(0);
            }
  });

  it("handles zero torque and zero duty without dividing by zero", () => {
    const r = solve({ ...defaults(), T: 0, Freq: 0, Treq: 0 });
    expect(r.Fb).toBe(0);
    expect(r.Fax).toBe(0);
    expect(r.SFslipLT).toBe(Infinity); // nothing asked of it, nothing to fail
    expect(Number.isNaN(r.gapRemain)).toBe(false);
  });
});
