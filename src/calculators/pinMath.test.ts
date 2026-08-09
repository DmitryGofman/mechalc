import { describe, it, expect } from "vitest";
import {
  defaults, solve, bearingAllow, utilRGB,
  PIN_MATS, PLATE_MATS, SHANKS, SHEAR_YIELD, BEARING_FACTOR, MIN_EDGE_RATIO,
  type PinInput,
} from "./pinMath";
import { CLASSES } from "./fasteners";

const at = (over: Partial<PinInput> = {}) => solve({ ...defaults(), ...over });

describe("pin shear — the headline check", () => {
  it("matches the hand calculation on the default joint", () => {
    // Ø8 → A = π/4·64 = 50.265 mm²; two planes; F = 6000 N ⇒ τ = 59.7 MPa
    const r = at();
    expect(r.Apin).toBeCloseTo(50.265, 3);
    expect(r.nPlanes).toBe(2);
    expect(r.tau).toBeCloseTo(6000 / (2 * (Math.PI / 4) * 64), 9);
    expect(r.tau).toBeCloseTo(59.68, 2);
  });

  it("uses the distortion-energy shear yield, not the tensile one", () => {
    const r = at({ pinMat: "Mild steel pin (S235 / A36)" });
    expect(r.Ssy).toBeCloseTo(SHEAR_YIELD * 235, 6);
    expect(r.SFshear).toBeCloseTo(r.Ssy / r.tau, 6);
  });

  it("halves the shear stress going from a lap joint to a clevis", () => {
    const lap = at({ config: 2 }), clevis = at({ config: 3 });
    expect(lap.nPlanes).toBe(1);
    expect(clevis.tau).toBeCloseTo(lap.tau / 2, 9);
  });

  it("drops to the minor-diameter core when threads sit in the shear plane", () => {
    const shank = at({ shank: "Bolt — shank in shear plane" });
    const threads = at({ shank: "Bolt — threads in shear plane" });
    expect(threads.Ashear / shank.Ashear).toBeCloseTo(0.75, 9);
    expect(threads.tau).toBeCloseTo(shank.tau / 0.75, 6);
  });
});

describe("pin bending — the clevis beam", () => {
  it("uses M = F/2·(t2/4 + clearance + t1/2) and σ = 32M/πd³", () => {
    const inp = { ...defaults(), F: 6000, t1: 6, t2: 8, clr: 0.2, d: 8 };
    const r = solve(inp);
    const M = (6000 / 2) * (8 / 4 + 0.2 + 6 / 2);
    expect(r.Mpin).toBeCloseTo(M, 6);
    expect(r.sigmaBend).toBeCloseTo((32 * M) / (Math.PI * 8 ** 3), 6);
  });

  it("is not checked at all in single shear — the joint tilts instead", () => {
    const r = at({ config: 2 });
    expect(r.sigmaBend).toBe(0);
    expect(r.SFbend).toBe(Infinity);
    expect(r.modes.some((m) => m.key === "bend")).toBe(false);
    expect(r.warns.some((w) => /tilt/i.test(w.text))).toBe(true);
  });

  it("grows with the clevis clearance — the arm the pin bends over", () => {
    expect(at({ clr: 2 }).sigmaBend).toBeGreaterThan(at({ clr: 0 }).sigmaBend);
  });

  it("governs the default joint, which is why the mode sweep matters", () => {
    const r = at();
    expect(r.governing.key).toBe("bend");
    expect(r.SFbend).toBeLessThan(r.SFshear);
  });
});

describe("hollow pin — the same formulas with the bore taken out", () => {
  it("reduces to the solid pin when the wall reaches the axis", () => {
    const solid = at({ hollow: false });
    const full = at({ hollow: true, wall: defaults().d / 2 });
    expect(full.Apin).toBeCloseTo(solid.Apin, 9);
    expect(full.Ipin).toBeCloseTo(solid.Ipin, 9);
    expect(full.tau).toBeCloseTo(solid.tau, 9);
    expect(full.sigmaBend).toBeCloseTo(solid.sigmaBend, 9);
  });

  it("clamps an over-thick wall instead of producing a negative bore", () => {
    const r = at({ hollow: true, wall: 50, d: 8 });
    expect(r.di).toBe(0);
    expect(r.wall).toBeCloseTo(4, 9);
    expect(r.Apin).toBeCloseTo((Math.PI / 4) * 64, 9);
  });

  it("takes the annulus for shear area and the hollow section for bending", () => {
    const d = 10, wall = 2;
    const r = at({ d, hollow: true, wall });
    const di = d - 2 * wall;
    expect(r.di).toBeCloseTo(di, 9);
    expect(r.Apin).toBeCloseTo((Math.PI / 4) * (d * d - di * di), 9);
    expect(r.Ipin).toBeCloseTo((Math.PI / 64) * (d ** 4 - di ** 4), 9);
    expect(r.Zpin).toBeCloseTo(r.Ipin / (d / 2), 9);
    expect(r.sigmaBend).toBeCloseTo(r.Mpin / r.Zpin, 6);
  });

  it("keeps the solid-pin bending formula as the special case σ = 32M/πd³", () => {
    const r = at({ d: 8, hollow: false });
    expect(r.sigmaBend).toBeCloseTo((32 * r.Mpin) / (Math.PI * 8 ** 3), 6);
  });

  it("loses far less bending stiffness than material — the point of a tube", () => {
    const d = 10, wall = 2;
    const solid = at({ d, hollow: false });
    const tube = at({ d, hollow: true, wall });
    const areaKept = tube.Apin / solid.Apin;
    const stiffKept = tube.Ipin / solid.Ipin;
    expect(areaKept).toBeLessThan(0.7);   // 64% of the material
    expect(stiffKept).toBeGreaterThan(0.8); // but 87% of the stiffness
    expect(stiffKept).toBeGreaterThan(areaKept);
  });

  it("bears on the projected area of the OUTSIDE diameter, hollow or not", () => {
    const solid = at({ hollow: false });
    const tube = at({ hollow: true, wall: 1 });
    const pick = (r: typeof solid) => r.members.find((m) => m.key === "middle")!.pBear;
    expect(pick(tube)).toBeCloseTo(pick(solid), 9);
  });

  it("warns that a thin wall crushes locally before the bearing allowable", () => {
    const thin = at({ d: 10, hollow: true, wall: 0.8 });
    expect(thin.warns.some((w) => w.level === "warn" && /thin wall/i.test(w.text))).toBe(true);
    const stout = at({ d: 10, hollow: true, wall: 2.5 });
    expect(stout.warns.some((w) => /thin wall/i.test(w.text))).toBe(false);
  });

  it("says nothing about hollow sections when the pin is solid", () => {
    expect(at({ hollow: false }).warns.some((w) => /hollow pin/i.test(w.text))).toBe(false);
    expect(at({ hollow: false }).di).toBe(0);
  });

  it("stays finite at a zero wall", () => {
    const r = at({ hollow: true, wall: 0 });
    expect(Number.isNaN(r.Fcap)).toBe(false);
    expect(r.Apin).toBeGreaterThan(0);
  });
});

describe("printed pins", () => {
  const printed = "PLA (FDM)";

  it("offers the toolkit's printed materials for the pin, not just the flanges", () => {
    for (const k of ["PLA (FDM)", "PETG (FDM)", "ABS (FDM)", "ASA (FDM)", "PC-ABS (FDM)",
      "Polycarbonate (FDM)", "Nylon 12 / PA12 (FDM)", "Nylon 12 CF (FDM)", "PA12 (MJF)"]) {
      expect(PIN_MATS[k]).toBeDefined();
      expect(PIN_MATS[k].printed).toBe(true);
      expect(PLATE_MATS[k]).toBeDefined();
    }
  });

  it("keeps printed bearing on its creep-limited figure, not 1.5·Sy", () => {
    const m = PIN_MATS[printed];
    expect(m.pb).toBeDefined();
    expect(bearingAllow(m)).toBeLessThan(BEARING_FACTOR * m.Sy);
  });

  it("warns about the layer orientation in the shear plane", () => {
    const r = at({ pinMat: printed });
    expect(r.warns.some((w) => w.level === "warn" && /layer boundaries/i.test(w.text))).toBe(true);
    expect(r.warns.some((w) => /0\.577/.test(w.text))).toBe(true);
  });

  it("does not warn about layers for a steel pin", () => {
    expect(at({ pinMat: "Alloy steel Q&T (4140)" }).warns.some((w) => /layer boundaries/i.test(w.text))).toBe(false);
  });

  it("makes the pin the governing part, as a printed pin should be", () => {
    const r = at({ pinMat: printed });
    expect(r.governing.part).toBe("pin");
    expect(r.Fcap).toBeLessThan(at({ pinMat: "Alloy steel Q&T (4140)" }).Fcap);
  });
});

describe("load sharing between the flanges", () => {
  it("gives each outer plate half the load and the middle plate all of it", () => {
    const r = at({ config: 3 });
    const outer = r.members.find((m) => m.key === "outer")!;
    const middle = r.members.find((m) => m.key === "middle")!;
    expect(outer.share).toBe(0.5);
    expect(middle.share).toBe(1);
    expect(outer.Fi).toBeCloseTo(3000, 9);
    expect(middle.Fi).toBeCloseTo(6000, 9);
  });

  it("puts the full load through both plates of a lap joint", () => {
    const r = at({ config: 2 });
    expect(r.members.map((m) => m.share)).toEqual([1, 1]);
    expect(r.members.every((m) => m.Fi === 6000)).toBe(true);
  });
});

describe("member checks — bearing, net section, tear-out", () => {
  it("bears over the projected area t·d (Eq 8-55)", () => {
    const r = at({ config: 3, t2: 8, d: 8 });
    const middle = r.members.find((m) => m.key === "middle")!;
    expect(middle.pBear).toBeCloseTo(6000 / (8 * 8), 6);
  });

  it("tensions the net section across (w − d)·t (Eq 8-54)", () => {
    const r = at({ config: 3, w: 32, t2: 8, d: 8 });
    const middle = r.members.find((m) => m.key === "middle")!;
    expect(middle.sigmaNet).toBeCloseTo(6000 / ((32 - 8) * 8), 6);
  });

  it("tears out on two ligaments of a − d/2, not on a", () => {
    const r = at({ config: 3, a: 12, t2: 8, d: 8 });
    const middle = r.members.find((m) => m.key === "middle")!;
    expect(middle.lig).toBeCloseTo(12 - 4, 9);
    expect(middle.tauTear).toBeCloseTo(6000 / (2 * 8 * 8), 6);
  });

  it("checks tear-out against shear yield, and net section against tensile yield", () => {
    const r = at();
    const tear = r.modes.find((m) => m.key === "tear-middle")!;
    const net = r.modes.find((m) => m.key === "net-middle")!;
    expect(tear.allow).toBeCloseTo(SHEAR_YIELD * PLATE_MATS[defaults().mat2].Sy, 6);
    expect(net.allow).toBeCloseTo(PLATE_MATS[defaults().mat2].Sy, 6);
  });

  it("checks bearing on both sides of the contact — plate and pin", () => {
    // A soft plate against a hard pin: the plate governs, never the pin.
    const r = at({ mat2: "PC-ABS (FDM)", pinMat: "Hardened dowel pin (DIN 6325)" });
    const middle = r.members.find((m) => m.key === "middle")!;
    expect(middle.SFbearPlate).toBeLessThan(middle.SFbearPin);
    expect(r.modes.some((m) => m.key === "bearpin")).toBe(true);
  });
});

describe("bearing allowables", () => {
  it("derives metals from their own yield, so the table cannot drift", () => {
    expect(bearingAllow(PLATE_MATS["Mild steel (S235 / A36)"])).toBeCloseTo(BEARING_FACTOR * 235, 9);
    expect(bearingAllow(PIN_MATS["Alloy steel Q&T (4140)"])).toBeCloseTo(BEARING_FACTOR * 655, 9);
  });

  it("keeps every polymer and laminate on its own creep-limited figure", () => {
    const soft = Object.entries(PLATE_MATS).filter(([k, m]) => m.printed || k.startsWith("FR-4"));
    expect(soft.length).toBeGreaterThan(5);
    for (const [, m] of soft) {
      expect(m.pb).toBeDefined();
      expect(bearingAllow(m)).toBeLessThan(BEARING_FACTOR * m.Sy);
    }
    // ...and every metal derived from its own yield, with nothing hand-typed.
    for (const [, m] of Object.entries(PLATE_MATS).filter(([k, v]) => !v.printed && !k.startsWith("FR-4")))
      expect(m.pb).toBeUndefined();
  });

  it("reads bolt-grade pins from the shared fastener table", () => {
    expect(PIN_MATS["Bolt, class 8.8"].Sy).toBe(CLASSES["8.8 (medium-carbon, Q&T)"].sy);
    expect(PIN_MATS["Bolt, class 10.9"].Sy).toBe(CLASSES["10.9 (alloy steel, Q&T)"].sy);
  });
});

describe("linearity — the property the whole ladder rests on", () => {
  it("keeps every mode's capacity independent of the applied load", () => {
    const a = solve({ ...defaults(), F: 1 });
    const b = solve({ ...defaults(), F: 90000 });
    expect(b.Fcap).toBeCloseTo(a.Fcap, 6);
    for (const m of a.modes) {
      const same = b.modes.find((x) => x.key === m.key)!;
      expect(same.Fcap).toBeCloseTo(m.Fcap, 6);
    }
  });

  it("scales every stress in proportion to the load", () => {
    const a = solve({ ...defaults(), F: 2000 });
    const b = solve({ ...defaults(), F: 6000 });
    expect(b.tau).toBeCloseTo(3 * a.tau, 9);
    expect(b.sigmaBend).toBeCloseTo(3 * a.sigmaBend, 9);
  });

  it("still reports a real capacity at zero load, where every SF is infinite", () => {
    const r = solve({ ...defaults(), F: 0 });
    expect(r.SFjoint).toBe(Infinity);
    expect(r.holds).toBe(true);
    expect(r.Fcap).toBeGreaterThan(0);
    expect(isFinite(r.Fcap)).toBe(true);
    expect(r.Fcap).toBeCloseTo(solve({ ...defaults(), F: 6000 }).Fcap, 6);
  });

  it("puts the joint SF exactly at capacity ÷ load", () => {
    const r = at({ F: 4000 });
    expect(r.SFjoint).toBeCloseTo(r.Fcap / 4000, 9);
  });
});

describe("the verdict", () => {
  it("holds right up to capacity and fails past it", () => {
    const cap = at().Fcap;
    expect(solve({ ...defaults(), F: cap * 0.999 }).holds).toBe(true);
    expect(solve({ ...defaults(), F: cap * 1.001 }).holds).toBe(false);
  });

  it("names the weakest mode, and it is the first rung of the ladder", () => {
    const r = at();
    expect(r.governing).toBe(r.ladder[0]);
    expect(r.governing.Fcap).toBe(Math.min(...r.modes.map((m) => m.Fcap)));
  });

  it("separates 'holds' from 'meets your target SF'", () => {
    const cap = at().Fcap;
    const r = solve({ ...defaults(), F: cap / 1.5, SFt: 2 });
    expect(r.holds).toBe(true);
    expect(r.meetsTarget).toBe(false);
    expect(r.warns.some((w) => w.level === "warn" && /target/i.test(w.text))).toBe(true);
  });

  it("orders the ladder by capacity", () => {
    const caps = at().ladder.map((m) => m.Fcap);
    expect(caps).toEqual([...caps].sort((x, y) => x - y));
  });
});

describe("warnings", () => {
  it("flags an edge distance under 1.5·d", () => {
    const tight = at({ a: 1.2 * defaults().d });
    expect(tight.warns.some((w) => /edge distance/i.test(w.text))).toBe(true);
    const roomy = at({ a: 2 * defaults().d });
    expect(roomy.warns.some((w) => /edge distance/i.test(w.text))).toBe(false);
    expect(MIN_EDGE_RATIO).toBe(1.5);
  });

  it("flags a tight net section", () => {
    expect(at({ w: 2 * defaults().d }).warns.some((w) => /net section is only/i.test(w.text))).toBe(true);
  });

  it("warns about printed plates and their creep", () => {
    expect(at({ mat1: "PLA (FDM)" }).warns.some((w) => /printed/i.test(w.text))).toBe(true);
  });

  it("always states the model's scope", () => {
    expect(at().warns.some((w) => /stress concentration/i.test(w.text))).toBe(true);
  });

  it("says the joint failed, with the capacity, when it has", () => {
    const r = solve({ ...defaults(), F: 10 * at().Fcap });
    expect(r.warns[0].level).toBe("bad");
    expect(r.warns[0].text).toMatch(/FAILS/);
  });
});

describe("guards", () => {
  it("survives a hole wider than the plate instead of going negative", () => {
    const r = at({ w: 4, d: 8 });
    expect(isFinite(r.Fcap)).toBe(true);
    expect(r.Fcap).toBeGreaterThan(0);
    for (const m of r.modes) expect(m.stress).toBeGreaterThanOrEqual(0);
  });

  it("survives a hole that runs past the edge", () => {
    const r = at({ a: 1, d: 8 });
    expect(isFinite(r.Fcap)).toBe(true);
    expect(r.members.every((m) => m.lig > 0)).toBe(true);
  });

  it("survives zero and negative geometry without NaN", () => {
    const r = at({ d: 0, t1: 0, t2: 0, w: 0, a: 0, clr: -1 });
    expect(Number.isNaN(r.Fcap)).toBe(false);
    for (const m of r.modes) expect(Number.isNaN(m.Fcap)).toBe(false);
  });

  it("covers every shank option", () => {
    for (const k of Object.keys(SHANKS)) expect(at({ shank: k }).Ashear).toBeGreaterThan(0);
  });

  it("solves for every pin and plate material in the tables", () => {
    for (const p of Object.keys(PIN_MATS)) expect(at({ pinMat: p }).Fcap).toBeGreaterThan(0);
    for (const m of Object.keys(PLATE_MATS)) {
      expect(at({ mat1: m }).Fcap).toBeGreaterThan(0);
      expect(at({ mat2: m }).Fcap).toBeGreaterThan(0);
    }
  });
});

describe("colour ramp", () => {
  it("starts at the toolkit's neutral green and heats with utilization", () => {
    const [r0, g0] = utilRGB(0);
    expect(g0).toBeGreaterThan(r0); // green dominant when idle
    const [r1, g1] = utilRGB(1);
    expect(r1).toBeGreaterThan(g1); // red dominant at the limit
  });

  it("clamps a negative utilization to the neutral end", () => {
    expect(utilRGB(-5)).toEqual(utilRGB(0));
  });
});
