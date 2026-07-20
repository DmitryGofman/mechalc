import { describe, expect, it } from "vitest";
import engineSource from "../../public/designs/snapfit/snapfit-engine.js?raw";

// The engine is a plain browser script shared by the standalone design
// prototypes in public/designs/snapfit/. We evaluate its source with a
// CommonJS shim — the exact file that ships to the browser is what runs here.
const shim = { exports: {} as Record<string, never> };
new Function("module", engineSource)(shim);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const SnapFit = shim.exports as any;

const deg = (d: number) => (d * Math.PI) / 180;

const base = {
  profile: "uniform",
  L: 19, // mm
  b: 9.5,
  t: 2.4,
  y: 2.4,
  Es: 1800, // MPa
  eAllow: 0.06,
  mu: 0.3,
  alphaRad: deg(30),
  alphaPrimeRad: deg(45),
};

function values(overrides: Record<string, unknown> = {}) {
  const r = SnapFit.evaluate({ ...base, ...overrides });
  expect(r.status).not.toBe("invalid");
  return r.values;
}

describe("Level 1-2: closed-form identities", () => {
  it("uniform force matches P = Es·b·(t/L)³·y/4 and strain ε = 1.5·t·y/L²", () => {
    const v = values();
    const P = (base.Es * base.b * (base.t / base.L) ** 3 * base.y) / 4;
    expect(v.P).toBeCloseTo(P, 10);
    expect(v.eps).toBeCloseTo((1.5 * base.t * base.y) / base.L ** 2, 12);
    expect(v.k).toBeCloseTo(P / base.y, 10);
  });

  it("μ = 0 gives W = P·tanα, and α → 0 gives W = μ·P", () => {
    const v0 = values({ mu: 0 });
    expect(v0.W).toBeCloseTo(v0.P * Math.tan(base.alphaRad), 10);
    const vA = values({ alphaRad: deg(1e-6) });
    expect(vA.W).toBeCloseTo(vA.P * base.mu, 6);
  });

  it("energy integral equals P·y/2 for every profile", () => {
    for (const profile of Object.keys(SnapFit.PROFILES)) {
      const compliance = SnapFit.numericCompliance(profile, base.L, base.b, base.t, base.Es, 2000);
      const P = base.y / compliance;
      const U = SnapFit.numericStrainEnergy(profile, base.L, base.b, base.t, base.Es, P, 2000);
      expect(U).toBeCloseTo((P * base.y) / 2, 6);
    }
  });
});

describe("Level 3: scaling and monotonicity laws (uniform)", () => {
  it("doubling b doubles P, strain unchanged", () => {
    const a = values();
    const c = values({ b: base.b * 2 });
    expect(c.P / a.P).toBeCloseTo(2, 10);
    expect(c.eps).toBeCloseTo(a.eps, 12);
  });

  it("doubling Es doubles P, strain unchanged", () => {
    const a = values();
    const c = values({ Es: base.Es * 2 });
    expect(c.P / a.P).toBeCloseTo(2, 10);
    expect(c.eps).toBeCloseTo(a.eps, 12);
  });

  it("doubling t multiplies P by 8 and strain by 2", () => {
    const a = values();
    const c = values({ t: base.t * 2 });
    expect(c.P / a.P).toBeCloseTo(8, 10);
    expect(c.eps / a.eps).toBeCloseTo(2, 10);
  });

  it("doubling L divides P by 8 and strain by 4", () => {
    const a = values();
    const c = values({ L: base.L * 2 });
    expect(c.P / a.P).toBeCloseTo(1 / 8, 10);
    expect(c.eps / a.eps).toBeCloseTo(1 / 4, 10);
  });

  it("doubling y doubles both P and strain", () => {
    const a = values();
    const c = values({ y: base.y * 2 });
    expect(c.P / a.P).toBeCloseTo(2, 10);
    expect(c.eps / a.eps).toBeCloseTo(2, 10);
  });

  it("insertion force rises with μ and with α below self-locking", () => {
    const w = (mu: number, aDeg: number) => values({ mu, alphaRad: deg(aDeg) }).W!;
    expect(w(0.4, 30)).toBeGreaterThan(w(0.2, 30));
    expect(w(0.3, 45)).toBeGreaterThan(w(0.3, 25));
  });
});

describe("Level 5: independent numerical model reproduces handbook constants", () => {
  const cases: Array<[string, number, number, number]> = [
    // profile, divisor, divisor tol %, strain coef
    ["uniform", 4, 0.05, 1.5],
    ["taperThickness", 6.528, 1.0, 0.92],
    ["taperWidth", 5.136, 1.0, 1.17],
  ];

  it.each(cases)("%s: Castigliano integral matches the closed form", (profile, _div, tolPct) => {
    // Several geometries, not just one — catches accidental L/b/t coupling.
    for (const [L, b, t] of [
      [19, 9.5, 2.4],
      [30, 6, 2],
      [12, 10, 1.2],
    ]) {
      const { diffPct } = SnapFit.crossCheck({ profile, L, b, t, y: 1, Es: 2000 }, 4000);
      expect(Math.abs(diffPct)).toBeLessThan(tolPct);
    }
  });

  it.each(cases)("%s: root strain from the strain profile matches coef·t·y/L²", (profile, _div, _tol, coef) => {
    const inp = { ...base, profile };
    const r = SnapFit.evaluate(inp);
    const pts = SnapFit.strainProfile(inp, r.values.P, 50);
    const handbook = (coef * base.t * base.y) / base.L ** 2;
    // Handbook coefficients are rounded; 1.5% covers documented rounding.
    expect(Math.abs(pts[0].eps - handbook) / handbook).toBeLessThan(0.015);
    // Root is the maximum for all three supported profiles.
    const maxEps = Math.max(...pts.map((p: { eps: number }) => p.eps));
    expect(pts[0].eps).toBeCloseTo(maxEps, 12);
  });
});

describe("Arbitrary taper ratio (numerically integrated)", () => {
  it("reproduces the handbook divisors from the dynamic taper spec", () => {
    // thickness t → t/2 is N = 2; width b → b/4 is N = 4
    const th = SnapFit.makeTaper("thickness", 1 / 2);
    expect(th.forceDivisor).toBeCloseTo(6.528, 1);
    expect(th.strainCoef).toBeCloseTo(0.92, 1);
    const wd = SnapFit.makeTaper("width", 1 / 4);
    expect(wd.forceDivisor).toBeCloseTo(5.136, 1);
    expect(wd.strainCoef).toBeCloseTo(1.17, 1);
    const uni = SnapFit.makeTaper("thickness", 1); // N = 1 → uniform
    expect(uni.forceDivisor).toBeCloseTo(4, 3);
    expect(uni.strainCoef).toBeCloseTo(1.5, 3);
  });

  it("evaluate() honours {taperType, taperN} and stays cross-check consistent", () => {
    for (const [type, N] of [["thickness", 3], ["thickness", 2.5], ["width", 6], ["width", 3]] as const) {
      const inp = { ...base, profile: undefined, taperType: type, taperN: N };
      const r = SnapFit.evaluate(inp);
      expect(r.status).not.toBe("invalid");
      // closed form (using the dynamic divisor) agrees with the raw integral
      const xc = SnapFit.crossCheck(inp, 4000);
      expect(Math.abs(xc.diffPct)).toBeLessThan(0.2);
      // a deeper taper (bigger N) sheds root strain vs the uniform beam
      const uniform = SnapFit.evaluate({ ...base }).values;
      if (type === "thickness") expect(r.values.eps).toBeLessThan(uniform.eps);
    }
  });

  it("a stronger thickness taper allows more deflection for the same strain", () => {
    const t2 = SnapFit.evaluate({ ...base, profile: undefined, taperType: "thickness", taperN: 2 }).values;
    const t3 = SnapFit.evaluate({ ...base, profile: undefined, taperType: "thickness", taperN: 3 }).values;
    expect(t3.eps).toBeLessThan(t2.eps); // t/3 root strain < t/2 root strain
    expect(t3.P).toBeLessThan(t2.P); // and it's a softer spring
  });

  it("rejects a taper factor below 1", () => {
    const r = SnapFit.evaluate({ ...base, profile: undefined, taperType: "thickness", taperN: 0.5 });
    expect(r.status).toBe("invalid");
    expect(r.errors.some((e: { field: string }) => e.field === "taperN")).toBe(true);
  });
});

describe("Guards: self-locking, applicability, invalid input", () => {
  it("self-locking entry (1 − μ·tanα ≤ 0) yields no finite force and blocks the verdict", () => {
    const r = SnapFit.evaluate({ ...base, mu: 0.7, alphaRad: deg(60) }); // 1 − 0.7·1.732 < 0
    expect(r.values.W).toBeNull();
    expect(r.selfLock.insert).toBe(true);
    expect(r.status).toBe("indeterminate");
  });

  it("α′ = 90° is reported as a permanent joint, not infinite force", () => {
    const r = SnapFit.evaluate({ ...base, alphaPrimeRad: deg(90) });
    expect(r.values.Wremove).toBeNull();
    expect(r.selfLock.remove).toBe(true);
    expect(r.warnings.some((w: { code: string }) => w.code === "self-locking-return")).toBe(true);
    expect(r.status).toBe("pass"); // removal lock is a design choice, not a model failure
  });

  it("wedge denominator exactly at zero is treated as self-locking, not division", () => {
    const mu = 0.5;
    const alpha = Math.atan(1 / mu);
    const w = SnapFit.wedgeForce(10, alpha, mu);
    expect(w.selfLocking).toBe(true);
    expect(w.W).toBeNull();
  });

  it("very short beams (L/t < 5) are indeterminate, not silently green", () => {
    const r = SnapFit.evaluate({ ...base, L: base.t * 4 });
    expect(r.status).toBe("indeterminate");
    expect(r.warnings.some((w: { code: string }) => w.code === "short-beam")).toBe(true);
  });

  it("intermediate slenderness (5 ≤ L/t < 10) warns but still reports", () => {
    const r = SnapFit.evaluate({ ...base, L: base.t * 7, y: 0.5 });
    expect(r.status === "pass" || r.status === "fail").toBe(true);
    expect(r.warnings.some((w: { code: string; level: string }) => w.code === "short-beam" && w.level === "caution")).toBe(true);
  });

  it("large deflection y/L is flagged and eventually indeterminate", () => {
    const warn = SnapFit.evaluate({ ...base, y: base.L * 0.15, eAllow: 0.2 });
    expect(warn.warnings.some((w: { code: string }) => w.code === "large-deflection")).toBe(true);
    const hard = SnapFit.evaluate({ ...base, y: base.L * 0.3 });
    expect(hard.status).toBe("indeterminate");
  });

  it("utilization drives pass/fail when the model is applicable", () => {
    expect(SnapFit.evaluate({ ...base, eAllow: 0.02 }).status).toBe("fail"); // ε ≈ 2.4%
    expect(SnapFit.evaluate({ ...base, eAllow: 0.06 }).status).toBe("pass");
  });

  it("Kt scales utilization but never the reported raw strain", () => {
    const a = SnapFit.evaluate(base);
    const c = SnapFit.evaluate({ ...base, Kt: 2 });
    expect(c.values.U / a.values.U).toBeCloseTo(2, 10);
    expect(c.values.eps).toBeCloseTo(a.values.eps, 12);
  });

  it("zero, negative, and non-finite inputs are invalid — never NaN results", () => {
    for (const bad of [
      { L: 0 },
      { t: -1 },
      { y: Number.NaN },
      { Es: Number.POSITIVE_INFINITY },
      { eAllow: 0 },
      { mu: -0.1 },
      { alphaRad: 0 },
      { alphaRad: deg(90) },
      { alphaPrimeRad: deg(91) },
      { Kt: 0.5 },
      { profile: "banana" },
    ]) {
      const r = SnapFit.evaluate({ ...base, ...bad });
      expect(r.status).toBe("invalid");
      expect(r.values).toBeNull();
      expect(r.errors.length).toBeGreaterThan(0);
    }
  });

  it("plausibility tripwires catch unit blunders (GPa-as-MPa, metres-as-mm)", () => {
    const gpa = SnapFit.evaluate({ ...base, Es: 2.1 }); // GPa typed into an MPa field
    expect(gpa.warnings.some((w: { code: string }) => w.code === "modulus-range")).toBe(true);
    const metres = SnapFit.evaluate({ ...base, L: 1900, y: 190, t: 240, b: 950 });
    expect(metres.warnings.some((w: { code: string }) => w.code === "length-range")).toBe(true);
  });
});

describe("Interval propagation (uncertainty mode)", () => {
  it("brackets the nominal result and orders bounds", () => {
    const iv = SnapFit.evaluateInterval(base, {
      Es: [1400, 2200],
      y: [2.2, 2.6],
      mu: [0.2, 0.4],
      eAllow: [0.05, 0.07],
    });
    expect(iv.ok).toBe(true);
    const nom = SnapFit.evaluate(base).values;
    expect(iv.P[0]).toBeLessThanOrEqual(nom.P);
    expect(iv.P[1]).toBeGreaterThanOrEqual(nom.P);
    expect(iv.U[0]).toBeLessThanOrEqual(nom.U);
    expect(iv.U[1]).toBeGreaterThanOrEqual(nom.U);
    expect(iv.W[0]).toBeLessThanOrEqual(nom.W);
    expect(iv.W[1]).toBeGreaterThanOrEqual(nom.W);
  });

  it("verdict is marginal when the range straddles U = 1", () => {
    const iv = SnapFit.evaluateInterval(base, { eAllow: [0.02, 0.06] });
    expect(iv.verdict).toBe("marginal");
  });

  it("self-locking at the worst corner is surfaced, not averaged away", () => {
    const iv = SnapFit.evaluateInterval({ ...base, alphaRad: deg(55) }, { mu: [0.2, 0.8] });
    expect(iv.ok).toBe(true);
    expect(iv.selfLockingAnywhere).toBe(true);
  });

  it("rejects reversed or non-positive ranges", () => {
    expect(SnapFit.evaluateInterval(base, { Es: [2200, 1400] }).ok).toBe(false);
    expect(SnapFit.evaluateInterval(base, { y: [0, 1] }).ok).toBe(false);
  });
});

describe("Unit helpers round-trip exactly", () => {
  it("mm↔in, N↔lbf, MPa↔ksi, deg↔rad", () => {
    const U = SnapFit.UNITS;
    expect(U.inToMm(U.mmToIn(19))).toBeCloseTo(19, 12);
    expect(U.lbfToN(U.nToLbf(42))).toBeCloseTo(42, 12);
    expect(U.ksiToMpa(U.mpaToKsi(1800))).toBeCloseTo(1800, 9);
    expect(U.radToDeg(U.degToRad(30))).toBeCloseTo(30, 12);
    expect(U.inToMm(1)).toBe(25.4); // exact by definition
  });
});
