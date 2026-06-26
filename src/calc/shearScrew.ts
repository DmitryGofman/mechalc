import type { Dimension } from "../units/units";
import { toSI } from "../units/units";

// ---------------------------------------------------------------------------
// Single calculator: shear stress on a screw connecting two plates.
//
// Two plates in a lap joint, one (or n) screws through both. The pulling load is
// carried across ONE shear plane per screw → single shear.
//   A   = π·d²/4            (shear area of one screw)
//   τ   = F / (n·A)         (average shear stress)
//   τ_allow = 0.577·Sy      (distortion-energy shear yield)
//   SF  = τ_allow / τ
// ---------------------------------------------------------------------------

export const SHEAR_YIELD_FACTOR = 0.577; // ≈ 1/√3, distortion-energy theory

export type FieldKey = "F" | "d" | "n" | "Sy";

export interface FieldSpec {
  key: FieldKey;
  symbol: string;
  name: string;
  dimension: Dimension;
  description: string;
  integer?: boolean; // value must be a whole number
  defaultUnit: string;
}

export const FIELDS: FieldSpec[] = [
  {
    key: "F",
    symbol: "F",
    name: "Applied shear load",
    dimension: "force",
    description: "Force pulling the two plates apart, carried across the screw(s).",
    defaultUnit: "N",
  },
  {
    key: "d",
    symbol: "d",
    name: "Screw shear diameter",
    dimension: "length",
    description:
      "Screw diameter at the shear plane. Use the shank (major) diameter if the shank is in shear, or the minor/root diameter if the threads are in the shear plane (conservative).",
    defaultUnit: "mm",
  },
  {
    key: "n",
    symbol: "n",
    name: "Number of screws",
    dimension: "dimensionless",
    description: "How many screws share the load equally.",
    integer: true,
    defaultUnit: "",
  },
  {
    key: "Sy",
    symbol: "Sy",
    name: "Screw yield strength",
    dimension: "stress",
    description: "Tensile yield strength of the screw material.",
    defaultUnit: "MPa",
  },
];

export interface RawInput {
  value: string;
  unit: string;
}

export type Inputs = Record<FieldKey, RawInput>;

// --- validation -----------------------------------------------------------

/** Validate one field's raw text. Returns an error message, or null if valid. */
export function validateField(spec: FieldSpec, raw: string): string | null {
  const trimmed = (raw ?? "").trim();
  if (trimmed === "") return "Required";

  const num = Number(trimmed);
  if (Number.isNaN(num) || !Number.isFinite(num)) return "Must be a valid number";

  if (spec.integer && !Number.isInteger(num)) return "Must be a whole number";

  if (spec.key === "n") {
    if (num < 1) return "Must be at least 1";
    return null;
  }

  // F, d, Sy must be strictly positive.
  if (num <= 0) return "Must be greater than 0";
  return null;
}

/** Validate every field. Returns a map of field → error (only invalid fields present). */
export function validateAll(inputs: Inputs): Partial<Record<FieldKey, string>> {
  const errors: Partial<Record<FieldKey, string>> = {};
  for (const spec of FIELDS) {
    const err = validateField(spec, inputs[spec.key].value);
    if (err) errors[spec.key] = err;
  }
  return errors;
}

export function isValid(inputs: Inputs): boolean {
  return Object.keys(validateAll(inputs)).length === 0;
}

// --- computation (pure SI) -------------------------------------------------

export interface ShearResult {
  A: number; // shear area per screw, m²
  tau: number; // shear stress, Pa
  tauAllow: number; // allowable shear stress, Pa
  SF: number; // safety factor
}

export function computeShearSI(si: { F: number; d: number; n: number; Sy: number }): ShearResult {
  const A = (Math.PI * si.d * si.d) / 4;
  const tau = si.F / (si.n * A);
  const tauAllow = SHEAR_YIELD_FACTOR * si.Sy;
  return { A, tau, tauAllow, SF: tauAllow / tau };
}

/** Validate, convert to SI, and compute. Returns null if any field is invalid. */
export function evaluate(inputs: Inputs): ShearResult | null {
  if (!isValid(inputs)) return null;
  const si = {
    F: toSI(Number(inputs.F.value), inputs.F.unit),
    d: toSI(Number(inputs.d.value), inputs.d.unit),
    n: Number(inputs.n.value),
    Sy: toSI(Number(inputs.Sy.value), inputs.Sy.unit),
  };
  return computeShearSI(si);
}

export type SFGrade = "fail" | "marginal" | "ok";

export function gradeSF(sf: number): SFGrade {
  if (!isFinite(sf) || sf < 1) return "fail";
  if (sf < 1.5) return "marginal";
  return "ok";
}
