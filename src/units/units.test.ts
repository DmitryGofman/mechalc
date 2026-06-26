import { describe, it, expect } from "vitest";
import { toSI, convert, UNITS } from "./units";

describe("units", () => {
  it("converts to SI exactly", () => {
    expect(toSI(6, "mm")).toBeCloseTo(0.006, 9);
    expect(toSI(1, "in")).toBeCloseTo(0.0254, 9);
    expect(toSI(1, "lbf")).toBeCloseTo(4.448222, 5);
    expect(toSI(1, "MPa")).toBe(1e6);
  });

  it("converts ksi to MPa (~6.895)", () => {
    expect(convert(1, "ksi", "MPa")).toBeCloseTo(6.895, 2);
  });

  it("refuses cross-dimension conversion", () => {
    expect(() => convert(1, "mm", "N")).toThrow();
  });

  it("all units have a positive factor", () => {
    for (const u of Object.values(UNITS)) expect(u.toSI).toBeGreaterThan(0);
  });
});
