import { describe, expect, it } from "vitest";
import engineSource from "../../public/designs/wiregate/wiregate-engine.js?raw";
import { wireGateResults, kiFactor, sideCompliance, wireI } from "./wireGateMath";

// The engine is a plain browser script shared by the standalone design
// prototypes in public/designs/wiregate/. We evaluate its source with a
// CommonJS shim — the exact file that ships to the browser is what runs here —
// and hold it against the production TS module so the two cannot drift apart.
const shim = { exports: {} as Record<string, never> };
new Function("module", engineSource)(shim);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const WireGate = shim.exports as any;

const base = {
  d: 2,
  L1: 30,
  L2: 26,
  w: 8,
  a: 20,
  delta0: 1,
  g: 5,
  E: 207000,
  sigmaAllow: 1590,
};

describe("wiregate engine (public prototype script)", () => {
  it("agrees with the production TS module on every shared value", () => {
    const e = WireGate.evaluate(base).values;
    // TS module runs in SI (m, Pa) — convert and compare.
    const r = wireGateResults(207e9, 1590e6, 0.002, 0.03, 0.026, 0.008, 0.02, 0.001, 0.005);
    expect(e.k).toBeCloseTo(r.k / 1000, 6); // N/m → N/mm
    expect(e.Fpin0).toBeCloseTo(r.Fpin0, 6);
    expect(e.FpinOpen).toBeCloseTo(r.FpinOpen, 6);
    expect(e.T0).toBeCloseTo(r.T0 * 1000, 4); // N·m → N·mm
    expect(e.FnoseOpen).toBeCloseTo(r.FnoseOpen, 6);
    expect(e.sigmaPeak).toBeCloseTo(r.sigmaPeak / 1e6, 4); // Pa → MPa
    expect(e.SF).toBeCloseTo(r.SF, 6);
    expect(e.deltaYield).toBeCloseTo(r.deltaYield * 1000, 6);
    expect(e.gYield).toBeCloseTo(r.gYield * 1000, 4);
    expect(e.Ki).toBeCloseTo(r.Ki, 10);
    expect(e.hotSide).toBe(r.hotSide);
    expect(e.phiMax).toBeCloseTo(r.phiMax, 10);
  });

  it("shares the exact Ki and compliance closed forms", () => {
    expect(WireGate.kiFactor(4)).toBeCloseTo(kiFactor(4), 12);
    expect(WireGate.kiFactor(4)).toBeCloseTo(59 / 48, 12);
    // Engine works in mm/N; the TS module in m/N — compliances scale by 10³.
    const I = wireI(0.002);
    expect(WireGate.sideCompliance(207000, I * 1e12, 30, 4)).toBeCloseTo(
      sideCompliance(207e9, I, 0.03, 0.004) * 1e3,
      10,
    );
  });

  it("flags a too-tight U-bend instead of failing silently", () => {
    const r = WireGate.evaluate({ ...base, w: 4 });
    expect(r.warnings.join(" ")).toMatch(/U-bend index/);
  });

  it("flags a swing beyond the small-angle kinematics", () => {
    const r = WireGate.evaluate({ ...base, g: 40 });
    expect(r.warnings.join(" ")).toMatch(/swing angle/);
  });

  it("rejects nonsense inputs as invalid, not NaN", () => {
    expect(WireGate.evaluate({ ...base, d: 0 }).status).toBe("invalid");
    expect(WireGate.evaluate({ ...base, delta0: -1 }).status).toBe("invalid");
  });

  it("pass/fail pivots on SF = 1", () => {
    const ok = WireGate.evaluate(base);
    expect(ok.status).toBe("pass");
    const hot = WireGate.evaluate({ ...base, g: 9 });
    expect(hot.values.SF).toBeLessThan(1);
    expect(hot.status).toBe("fail");
  });
});
