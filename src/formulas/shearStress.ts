import type { FormulaDef, ValidationIssue } from "../engine/types";

// Distortion-energy shear yield ≈ 0.577 · Sy.
const SHEAR_YIELD_FACTOR = 0.577;

function shearValidate({ A, Sy }: Record<string, number>): ValidationIssue[] {
  const e: ValidationIssue[] = [];
  if (A <= 0) e.push({ field: "A", level: "error", message: "Area must be greater than zero" });
  if (Sy <= 0) e.push({ field: "Sy", level: "error", message: "Yield strength must be greater than zero" });
  return e;
}

export const shearSingle: FormulaDef = {
  id: "shear-single",
  category: "Shear",
  name: "Shear Stress — single shear",
  synonyms: ["single shear", "pin shear", "bolt shear", "tau", "F/A"],
  equation: "τ = F / A,   SF = 0.577·Sy / τ",
  diagramId: "pin-single-shear",
  explanation:
    "Average shear stress on one cross-section of a pin or bolt loaded transversely. " +
    "Shear yield is estimated as 0.577·Sy (distortion-energy).",
  inputs: [
    { symbol: "F", name: "Shear force", dimension: "force", defaultUnit: "N", description: "Transverse load" },
    { symbol: "A", name: "Shear area", dimension: "area", defaultUnit: "mm2", description: "Cross-sectional area of the pin/bolt", min: 0 },
    { symbol: "Sy", name: "Yield strength", dimension: "stress", defaultUnit: "MPa", description: "Material yield strength", min: 0, fillFrom: "material", materialKey: "Sy" },
  ],
  outputs: [
    { symbol: "tau", name: "Shear stress τ", dimension: "stress", preferredUnit: "MPa", description: "F / A" },
    { symbol: "SF", name: "Safety factor", dimension: "dimensionless", preferredUnit: "", description: "0.577·Sy / τ", isSafetyFactor: true },
  ],
  calculate: ({ F, A, Sy }) => {
    const tau = F / A;
    return { tau, SF: (SHEAR_YIELD_FACTOR * Sy) / Math.abs(tau) };
  },
  validate: shearValidate,
};

export const shearDouble: FormulaDef = {
  id: "shear-double",
  category: "Shear",
  name: "Shear Stress — double shear",
  synonyms: ["double shear", "clevis", "two shear planes", "tau", "F/2A"],
  equation: "τ = F / (2A),   SF = 0.577·Sy / τ",
  diagramId: "pin-double-shear",
  explanation:
    "Shear stress in a pin loaded across two shear planes (e.g. a clevis joint); the " +
    "load is shared by two cross-sections, halving the stress.",
  inputs: [
    { symbol: "F", name: "Shear force", dimension: "force", defaultUnit: "N", description: "Transverse load" },
    { symbol: "A", name: "Shear area (one plane)", dimension: "area", defaultUnit: "mm2", description: "Cross-sectional area of the pin", min: 0 },
    { symbol: "Sy", name: "Yield strength", dimension: "stress", defaultUnit: "MPa", description: "Material yield strength", min: 0, fillFrom: "material", materialKey: "Sy" },
  ],
  outputs: [
    { symbol: "tau", name: "Shear stress τ", dimension: "stress", preferredUnit: "MPa", description: "F / (2A)" },
    { symbol: "SF", name: "Safety factor", dimension: "dimensionless", preferredUnit: "", description: "0.577·Sy / τ", isSafetyFactor: true },
  ],
  calculate: ({ F, A, Sy }) => {
    const tau = F / (2 * A);
    return { tau, SF: (SHEAR_YIELD_FACTOR * Sy) / Math.abs(tau) };
  },
  validate: shearValidate,
};
