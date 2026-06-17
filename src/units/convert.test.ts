import { describe, it, expect } from "vitest";
import { toSI, fromSI, convert } from "./convert";
import { UNITS } from "./registry";

describe("unit conversion", () => {
  it("converts length to SI", () => {
    expect(toSI({ value: 250, unit: "mm" })).toBeCloseTo(0.25, 9);
    expect(toSI({ value: 1, unit: "in" })).toBeCloseTo(0.0254, 9);
    expect(toSI({ value: 1, unit: "ft" })).toBeCloseTo(0.3048, 9);
  });

  it("converts force to SI", () => {
    expect(toSI({ value: 44.1, unit: "lbf" })).toBeCloseTo(196.16, 1);
    expect(toSI({ value: 1, unit: "kgf" })).toBeCloseTo(9.80665, 5);
  });

  it("converts stress to SI", () => {
    expect(toSI({ value: 1, unit: "MPa" })).toBe(1e6);
    expect(toSI({ value: 30, unit: "ksi" })).toBeCloseTo(206.84e6, -4);
  });

  it("round-trips through fromSI", () => {
    const q = fromSI(0.25, "mm");
    expect(q.value).toBeCloseTo(250, 6);
  });

  it("converts ksi to MPa correctly (~6.895)", () => {
    const r = convert({ value: 1, unit: "ksi" }, "MPa");
    expect(r.value).toBeCloseTo(6.895, 2);
  });

  it("converts in^4 to mm^4", () => {
    const r = convert({ value: 1, unit: "in4" }, "mm4");
    expect(r.value).toBeCloseTo(416231.4, 0);
  });

  it("refuses cross-dimension conversion", () => {
    expect(() => convert({ value: 1, unit: "mm" }, "N")).toThrow();
  });

  it("every registry unit has a positive toSI factor", () => {
    for (const u of Object.values(UNITS)) {
      expect(u.toSI).toBeGreaterThan(0);
    }
  });
});
