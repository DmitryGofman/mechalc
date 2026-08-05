import { describe, expect, it } from "vitest";
import { UNITS, q, qu, reexpress, unitsFor } from "./units";

const M = UNITS.metric;
const I = UNITS.imperial;

describe("display units", () => {
  it("metric is the identity — internal values pass straight through", () => {
    expect(M.length.from(12.5)).toBe(12.5);
    expect(M.length.to(12.5)).toBe(12.5);
    expect(M.stress.from(580)).toBe(580);
    expect(M.torque.from(9.5)).toBe(9.5);
    // …except the ones metric itself scales for readability.
    expect(M.forceBig.from(12_000)).toBeCloseTo(12, 12); // N → kN
    expect(M.micro.from(2.4e-5)).toBeCloseTo(24, 12); // m → µm
    expect(M.stiffness.from(1.2e9)).toBeCloseTo(1200, 12); // N/m → kN/mm
  });

  it("converts each quantity against its handbook value", () => {
    expect(I.length.from(25.4)).toBeCloseTo(1, 12); // mm → in
    expect(I.area.from(645.16)).toBeCloseTo(1, 12); // mm² → in²
    expect(I.force.from(4.4482216152605)).toBeCloseTo(1, 12); // N → lbf
    expect(I.forceBig.from(4448.2216152605)).toBeCloseTo(1000, 9); // N → lbf
    expect(I.torque.from(1)).toBeCloseTo(8.850745791, 8); // N·m → lbf·in
    expect(I.stress.from(6.894757293168)).toBeCloseTo(1, 12); // MPa → ksi
    expect(I.modulus.from(200)).toBeCloseTo(29.0075, 4); // GPa → Msi (steel)
    expect(I.micro.from(25.4e-6)).toBeCloseTo(1, 12); // m → mil
    expect(I.stiffness.from(175126.835)).toBeCloseTo(1, 6); // N/m → klbf/in
  });

  it("round-trips losslessly in both directions", () => {
    for (const u of [I.length, I.area, I.force, I.torque, I.stress, I.modulus, I.micro, I.stiffness]) {
      expect(u.to(u.from(137.42))).toBeCloseTo(137.42, 9);
      expect(u.from(u.to(137.42))).toBeCloseTo(137.42, 9);
    }
  });

  it("puts a familiar bolt spec in familiar imperial numbers", () => {
    // M6 class 8.8, dry: ≈9 N·m and 580 MPa proof are the numbers a metric
    // table quotes; imperial readers expect ≈80 lbf·in and ≈84 ksi.
    expect(+q(I.torque, 9)).toBeCloseTo(79.7, 1);
    expect(+q(I.stress, 580)).toBeCloseTo(84.1, 1);
    // …and an M6 shank is a hair under a quarter inch.
    expect(qu(I.length, 6)).toBe("0.236 in");
    expect(qu(M.length, 6)).toBe("6.00 mm");
  });

  it("reports an unbounded safety factor rather than NaN", () => {
    expect(q(I.stress, Infinity)).toBe("∞");
    expect(q(M.forceBig, Infinity)).toBe("∞");
  });

  it("re-expresses a typed field without drifting on repeated toggles", () => {
    let v = "8"; // 8 mm
    for (let i = 0; i < 6; i++) {
      v = reexpress(v, M.length, I.length);
      v = reexpress(v, I.length, M.length);
    }
    expect(v).toBe("8"); // not 8.001, and not 8.0000094
    expect(reexpress("12", M.length, I.length)).toBe("0.4724");
    expect(reexpress("0.4724", I.length, M.length)).toBe("12");
    expect(reexpress("", M.length, I.length, 5)).toBe("0.197"); // empty → fallback
    // A torque the wrench actually reads, both ways.
    expect(reexpress("9", M.torque, I.torque)).toBe("79.7");
    expect(reexpress("79.7", I.torque, M.torque)).toBe("9");
  });

  it("hands out the pack the toggle asks for", () => {
    expect(unitsFor("imperial").imperial).toBe(true);
    expect(unitsFor("metric").imperial).toBe(false);
    expect(unitsFor("imperial").torque.label).toBe("lbf·in");
  });
});
