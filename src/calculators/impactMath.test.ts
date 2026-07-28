import { describe, it, expect } from "vitest";
import {
  IMPACT_MATERIALS,
  simulate,
  ballisticLimit,
  projectileMass,
  cavityResistance,
  flowStress,
  type SimParams,
} from "./impactMath";

const M = IMPACT_MATERIALS;
const mm = (v: number) => v / 1000;

const base = (over: Partial<SimParams> = {}): SimParams => ({
  shape: "sphere",
  size: mm(10),
  proj: M["Hardened steel (52100 ball)"],
  plate: M["Mild steel (A36 / can stock)"],
  h: mm(2),
  R: mm(50),
  v0: 200,
  ...over,
});

describe("material helpers", () => {
  it("cavity resistance is a few times the flow stress for metals", () => {
    const m = M["Mild steel (A36 / can stock)"];
    const ratio = cavityResistance(m) / flowStress(m);
    expect(ratio).toBeGreaterThan(2.5);
    expect(ratio).toBeLessThan(6);
  });

  it("projectile mass: 10 mm steel sphere ≈ 4.1 g", () => {
    expect(projectileMass(base())).toBeCloseTo(0.00409, 3);
  });
});

describe("steel ball on mild steel sheet", () => {
  it("ballistic limit is in a plausible range and monotonic in thickness", () => {
    const v1 = ballisticLimit(base({ h: mm(1) }));
    const v2 = ballisticLimit(base({ h: mm(2) }));
    const v4 = ballisticLimit(base({ h: mm(4) }));
    expect(v2).toBeGreaterThan(120);
    expect(v2).toBeLessThan(400);
    expect(v1).toBeLessThan(v2);
    expect(v2).toBeLessThan(v4);
  });

  it("slow impact bounces or dents; fast impact perforates with vr < v0", () => {
    const slow = simulate(base({ v0: 20 }));
    expect(slow.perforated).toBe(false);
    expect(["bounce", "dent"]).toContain(slow.outcome);
    expect(slow.vRebound).toBeLessThan(20);

    const fast = simulate(base({ v0: 500 }));
    expect(fast.perforated).toBe(true);
    expect(fast.vr).toBeGreaterThan(250);
    expect(fast.vr).toBeLessThan(500);
  });

  it("hypervelocity passes through nearly unslowed", () => {
    const r = simulate(base({ v0: 3000 }));
    expect(r.perforated).toBe(true);
    expect(r.vr / 3000).toBeGreaterThan(0.9);
  });

  it("blunt cube plugs at a lower limit than a sphere", () => {
    const vSphere = ballisticLimit(base());
    const vCube = ballisticLimit(base({ shape: "cube" }));
    expect(vCube).toBeLessThan(vSphere);
    const r = simulate(base({ shape: "cube", v0: 200 }));
    expect(r.outcome).toBe("perforate-plug");
    expect(r.plugMass).toBeGreaterThan(0);
  });

  it("contact times are microseconds-to-milliseconds", () => {
    for (const v0 of [20, 200, 500]) {
      const r = simulate(base({ v0 }));
      expect(r.tContact).toBeGreaterThan(1e-7);
      expect(r.tContact).toBeLessThan(4.1e-3);
    }
  });
});

describe("material pairings", () => {
  it("lead splats on armor steel without perforating", () => {
    const r = simulate(base({ proj: M["Lead (bullet core)"], plate: M["Armor steel (AR500)"], h: mm(6), v0: 300 }));
    expect(r.projSoft).toBe(true);
    expect(r.perforated).toBe(false);
  });

  it("tungsten perforates aluminum more easily than an aluminum ball does", () => {
    const p = base({ plate: M["Aluminum 6061-T6"], h: mm(3) });
    const vW = ballisticLimit({ ...p, proj: M["Tungsten heavy alloy"] });
    const vAl = ballisticLimit({ ...p, proj: M["Aluminum 6061-T6"] });
    expect(vW).toBeLessThan(vAl);
  });

  it("glass cracks at low speed and shatters through at high speed", () => {
    const p = base({ plate: M["Soda-lime glass"], h: mm(3) });
    const slow = simulate({ ...p, v0: 20 });
    expect(slow.fractured).toBe(true);
    expect(slow.perforated).toBe(false);
    expect(slow.outcome).toBe("crack-stop");

    const fast = simulate({ ...p, v0: 250 });
    expect(fast.outcome).toBe("shatter");
    expect(fast.perforated).toBe(true);
  });

  it("thin polycarbonate catches a slow ball on the membrane (no plugging)", () => {
    const r = simulate(base({ plate: M.Polycarbonate, h: mm(1), v0: 30 }));
    expect(r.perforated).toBe(false);
    expect(r.w0Peak).toBeGreaterThan(mm(2)); // big dish, not a local punch
  });

  it("thick armor cannot be perforated by lead at all", () => {
    const bl = ballisticLimit(base({ proj: M["Lead (bullet core)"], plate: M["Armor steel (AR500)"], h: mm(25) }));
    expect(Number.isNaN(bl)).toBe(true);
  });
});

describe("bookkeeping", () => {
  it("energy is conserved within tolerance", () => {
    for (const p of [
      base({ v0: 200 }),
      base({ v0: 500 }),
      base({ shape: "cube" as const, v0: 200 }),
      base({ proj: M["Tungsten heavy alloy"], plate: M["Aluminum 6061-T6"], h: mm(3), v0: 150 }),
    ]) {
      const r = simulate(p);
      const acc = r.Elocal + r.Eplate + r.Eresidual + r.Eplug + r.Erebound;
      expect(Math.abs(acc - r.E0) / r.E0).toBeLessThan(0.1);
    }
  });

  it("frames are time-ordered and end consistently with the outcome", () => {
    const r = simulate(base({ v0: 500 }));
    expect(r.frames.length).toBeGreaterThan(10);
    for (let i = 1; i < r.frames.length; i++) {
      expect(r.frames[i].t).toBeGreaterThanOrEqual(r.frames[i - 1].t);
    }
    expect(r.frames[r.frames.length - 1].phase).toBe("through");
  });

  it("residual velocity grows with impact velocity above the limit", () => {
    const vbl = ballisticLimit(base());
    const r1 = simulate(base({ v0: vbl * 1.2 }));
    const r2 = simulate(base({ v0: vbl * 2 }));
    expect(r2.vr).toBeGreaterThan(r1.vr);
  });
});
