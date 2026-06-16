import type { FormulaDef, ValidationIssue } from "../engine/types";

function bendValidate({ Z, Sy }: Record<string, number>): ValidationIssue[] {
  const e: ValidationIssue[] = [];
  if (Z <= 0) e.push({ field: "Z", level: "error", message: "Section modulus must be greater than zero" });
  if (Sy <= 0) e.push({ field: "Sy", level: "error", message: "Yield strength must be greater than zero" });
  return e;
}

export const bendingCantilever: FormulaDef = {
  id: "bending-cantilever",
  category: "Bending",
  name: "Bending — cantilever, end load",
  synonyms: ["cantilever", "bending stress", "moment", "M/Z", "bracket", "arm"],
  equation: "M = P·L,   σb = M / Z,   SF = Sy / σb",
  diagramId: "cantilever-end-load",
  explanation:
    "Maximum bending stress at the fixed end of a cantilever with a transverse load P at " +
    "the free end. Z is the section modulus (use the Section Properties calc to get it).",
  inputs: [
    { symbol: "P", name: "End load", dimension: "force", defaultUnit: "N", description: "Transverse force at the free end" },
    { symbol: "L", name: "Arm length", dimension: "length", defaultUnit: "mm", description: "Distance from load to fixed end", min: 0 },
    { symbol: "Z", name: "Section modulus", dimension: "section_modulus", defaultUnit: "mm3", description: "I / c of the cross-section", min: 0 },
    { symbol: "Sy", name: "Yield strength", dimension: "stress", defaultUnit: "MPa", description: "Material yield strength", min: 0, fillFrom: "material", materialKey: "Sy" },
  ],
  outputs: [
    { symbol: "M", name: "Bending moment M", dimension: "moment", preferredUnit: "Nm", description: "P · L" },
    { symbol: "sigma_b", name: "Bending stress σb", dimension: "stress", preferredUnit: "MPa", description: "M / Z" },
    { symbol: "SF", name: "Safety factor", dimension: "dimensionless", preferredUnit: "", description: "Sy / σb", isSafetyFactor: true },
  ],
  calculate: ({ P, L, Z, Sy }) => {
    const M = P * L;
    const sigma_b = M / Z;
    return { M, sigma_b, SF: Sy / Math.abs(sigma_b) };
  },
  validate: bendValidate,
};

export const bendingSimplySupported: FormulaDef = {
  id: "bending-simply-supported",
  category: "Bending",
  name: "Bending — simply supported, center load",
  synonyms: ["simply supported", "beam", "center load", "PL/4", "bending"],
  equation: "M = P·L / 4,   σb = M / Z,   SF = Sy / σb",
  diagramId: "simply-supported-center-load",
  explanation:
    "Maximum bending stress at mid-span of a simply-supported beam with a central point " +
    "load P over span L. Maximum moment is P·L/4 at the center.",
  inputs: [
    { symbol: "P", name: "Center load", dimension: "force", defaultUnit: "N", description: "Point load at mid-span" },
    { symbol: "L", name: "Span", dimension: "length", defaultUnit: "mm", description: "Distance between supports", min: 0 },
    { symbol: "Z", name: "Section modulus", dimension: "section_modulus", defaultUnit: "mm3", description: "I / c of the cross-section", min: 0 },
    { symbol: "Sy", name: "Yield strength", dimension: "stress", defaultUnit: "MPa", description: "Material yield strength", min: 0, fillFrom: "material", materialKey: "Sy" },
  ],
  outputs: [
    { symbol: "M", name: "Bending moment M", dimension: "moment", preferredUnit: "Nm", description: "P · L / 4" },
    { symbol: "sigma_b", name: "Bending stress σb", dimension: "stress", preferredUnit: "MPa", description: "M / Z" },
    { symbol: "SF", name: "Safety factor", dimension: "dimensionless", preferredUnit: "", description: "Sy / σb", isSafetyFactor: true },
  ],
  calculate: ({ P, L, Z, Sy }) => {
    const M = (P * L) / 4;
    const sigma_b = M / Z;
    return { M, sigma_b, SF: Sy / Math.abs(sigma_b) };
  },
  validate: bendValidate,
};
