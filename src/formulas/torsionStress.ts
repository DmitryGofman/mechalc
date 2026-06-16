import type { FormulaDef, ValidationIssue } from "../engine/types";

const SHEAR_YIELD_FACTOR = 0.577;

export const torsionStress: FormulaDef = {
  id: "torsion",
  category: "Torsion",
  name: "Torsional Shear Stress",
  synonyms: ["torsion", "twist", "shaft", "Tr/J", "torque shear"],
  equation: "τ = T·r / J,   SF = 0.577·Sy / τ",
  diagramId: "torsion-shaft",
  explanation:
    "Maximum shear stress at the surface of a circular shaft under torque T. r is the outer " +
    "radius and J the polar moment of inertia (use Section Properties for J).",
  inputs: [
    { symbol: "T", name: "Torque", dimension: "moment", defaultUnit: "Nm", description: "Applied torque" },
    { symbol: "r", name: "Outer radius", dimension: "length", defaultUnit: "mm", description: "Radius to outer fiber", min: 0 },
    { symbol: "J", name: "Polar moment", dimension: "second_moment", defaultUnit: "mm4", description: "Polar moment of inertia", min: 0 },
    { symbol: "Sy", name: "Yield strength", dimension: "stress", defaultUnit: "MPa", description: "Material yield strength", min: 0, fillFrom: "material", materialKey: "Sy" },
  ],
  outputs: [
    { symbol: "tau", name: "Shear stress τ", dimension: "stress", preferredUnit: "MPa", description: "T·r / J" },
    { symbol: "SF", name: "Safety factor", dimension: "dimensionless", preferredUnit: "", description: "0.577·Sy / τ", isSafetyFactor: true },
  ],
  calculate: ({ T, r, J, Sy }) => {
    const tau = (T * r) / J;
    return { tau, SF: (SHEAR_YIELD_FACTOR * Sy) / Math.abs(tau) };
  },
  validate: ({ J, Sy }) => {
    const e: ValidationIssue[] = [];
    if (J <= 0) e.push({ field: "J", level: "error", message: "Polar moment must be greater than zero" });
    if (Sy <= 0) e.push({ field: "Sy", level: "error", message: "Yield strength must be greater than zero" });
    return e;
  },
};
