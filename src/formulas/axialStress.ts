import type { FormulaDef, ValidationIssue } from "../engine/types";

export const axialStress: FormulaDef = {
  id: "axial-stress",
  category: "Axial",
  name: "Axial Stress (tension / compression)",
  synonyms: ["tension", "compression", "normal stress", "sigma", "F/A", "pull"],
  equation: "σ = F / A,   SF = Sy / σ",
  diagramId: "axial-bar",
  explanation:
    "Direct normal stress in a member loaded along its axis, with a yield safety factor. " +
    "A is the cross-sectional area resisting the load.",
  inputs: [
    { symbol: "F", name: "Axial force", dimension: "force", defaultUnit: "N", description: "Tension (+) or compression load" },
    { symbol: "A", name: "Cross-section area", dimension: "area", defaultUnit: "mm2", description: "Area resisting the load", min: 0 },
    { symbol: "Sy", name: "Yield strength", dimension: "stress", defaultUnit: "MPa", description: "Material yield strength", min: 0, fillFrom: "material", materialKey: "Sy" },
  ],
  outputs: [
    { symbol: "sigma", name: "Axial stress σ", dimension: "stress", preferredUnit: "MPa", description: "F / A" },
    { symbol: "SF", name: "Safety factor", dimension: "dimensionless", preferredUnit: "", description: "Sy / σ", isSafetyFactor: true },
  ],
  calculate: ({ F, A, Sy }) => {
    const sigma = F / A;
    return { sigma, SF: Sy / Math.abs(sigma) };
  },
  validate: ({ A, Sy }) => {
    const e: ValidationIssue[] = [];
    if (A <= 0) e.push({ field: "A", level: "error", message: "Area must be greater than zero" });
    if (Sy <= 0) e.push({ field: "Sy", level: "error", message: "Yield strength must be greater than zero" });
    return e;
  },
};
