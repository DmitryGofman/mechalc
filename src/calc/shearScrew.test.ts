import { describe, it, expect } from "vitest";
import {
  FIELDS,
  validateField,
  validateAll,
  isValid,
  computeShearSI,
  evaluate,
  gradeSF,
  type Inputs,
} from "./shearScrew";

const field = (k: string) => FIELDS.find((f) => f.key === k)!;

describe("field validation", () => {
  it("flags empty as required", () => {
    expect(validateField(field("F"), "")).toBe("Required");
    expect(validateField(field("F"), "   ")).toBe("Required");
  });

  it("flags non-numeric", () => {
    expect(validateField(field("F"), "abc")).toBe("Must be a valid number");
    expect(validateField(field("d"), "1,5")).toBe("Must be a valid number");
  });

  it("rejects zero and negative for F, d, Sy", () => {
    expect(validateField(field("F"), "0")).toBe("Must be greater than 0");
    expect(validateField(field("d"), "-2")).toBe("Must be greater than 0");
    expect(validateField(field("Sy"), "0")).toBe("Must be greater than 0");
  });

  it("requires n to be a whole number ≥ 1", () => {
    expect(validateField(field("n"), "2.5")).toBe("Must be a whole number");
    expect(validateField(field("n"), "0")).toBe("Must be at least 1");
    expect(validateField(field("n"), "1")).toBeNull();
    expect(validateField(field("n"), "4")).toBeNull();
  });

  it("accepts valid positive values", () => {
    expect(validateField(field("F"), "5000")).toBeNull();
    expect(validateField(field("d"), "6")).toBeNull();
    expect(validateField(field("Sy"), "640")).toBeNull();
  });
});

const goodInputs = (): Inputs => ({
  F: { value: "5000", unit: "N" },
  d: { value: "6", unit: "mm" },
  n: { value: "1", unit: "" },
  Sy: { value: "640", unit: "MPa" },
});

describe("validateAll / isValid", () => {
  it("passes for good inputs", () => {
    expect(validateAll(goodInputs())).toEqual({});
    expect(isValid(goodInputs())).toBe(true);
  });

  it("collects every invalid field", () => {
    const bad: Inputs = {
      F: { value: "", unit: "N" },
      d: { value: "-1", unit: "mm" },
      n: { value: "0", unit: "" },
      Sy: { value: "x", unit: "MPa" },
    };
    const errs = validateAll(bad);
    expect(Object.keys(errs).sort()).toEqual(["F", "Sy", "d", "n"].sort());
    expect(isValid(bad)).toBe(false);
  });
});

describe("computation (SI hand-calc)", () => {
  it("single M6 screw, 5000 N, Sy 640 MPa", () => {
    // A = π·0.006²/4 = 2.827e-5 m²; τ = 5000/A = 176.8 MPa
    // τ_allow = 0.577·640 = 369.3 MPa; SF = 2.089
    const r = computeShearSI({ F: 5000, d: 0.006, n: 1, Sy: 640e6 });
    expect(r.A).toBeCloseTo(2.827e-5, 7);
    expect(r.tau / 1e6).toBeCloseTo(176.8, 1);
    expect(r.tauAllow / 1e6).toBeCloseTo(369.3, 1);
    expect(r.SF).toBeCloseTo(2.089, 2);
  });

  it("doubling screws halves the stress and doubles SF", () => {
    const one = computeShearSI({ F: 5000, d: 0.006, n: 1, Sy: 640e6 });
    const two = computeShearSI({ F: 5000, d: 0.006, n: 2, Sy: 640e6 });
    expect(two.tau).toBeCloseTo(one.tau / 2, 6);
    expect(two.SF).toBeCloseTo(one.SF * 2, 6);
  });

  it("evaluate converts imperial inputs correctly", () => {
    // 1124 lbf ≈ 5000 N, 0.2362 in ≈ 6 mm, 92.8 ksi ≈ 640 MPa → same SF
    const r = evaluate({
      F: { value: "1124.04", unit: "lbf" },
      d: { value: "0.23622", unit: "in" },
      n: { value: "1", unit: "" },
      Sy: { value: "92.83", unit: "ksi" },
    })!;
    expect(r.SF).toBeCloseTo(2.089, 1);
  });

  it("evaluate returns null when invalid", () => {
    expect(evaluate({ ...goodInputs(), F: { value: "0", unit: "N" } })).toBeNull();
  });
});

describe("safety factor grading", () => {
  it("grades fail / marginal / ok", () => {
    expect(gradeSF(0.8)).toBe("fail");
    expect(gradeSF(1.2)).toBe("marginal");
    expect(gradeSF(2.0)).toBe("ok");
    expect(gradeSF(Infinity)).toBe("fail");
  });
});
