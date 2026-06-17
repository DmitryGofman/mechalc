import type { FormulaDef, ValidationIssue } from "../engine/types";

export const vonMises: FormulaDef = {
  id: "von-mises",
  category: "Von Mises",
  name: "Von Mises Stress (combined)",
  synonyms: ["von mises", "equivalent stress", "combined", "distortion energy", "sigma vm"],
  equation: "σvm = √(σ² + 3τ²),   SF = Sy / σvm",
  diagramId: "von-mises-element",
  explanation:
    "Equivalent (distortion-energy) stress for a plane state with a normal stress σ and a " +
    "shear stress τ. Compare against yield to gate combined loading.",
  inputs: [
    { symbol: "sigma", name: "Normal stress σ", dimension: "stress", defaultUnit: "MPa", description: "Axial / bending stress" },
    { symbol: "tau", name: "Shear stress τ", dimension: "stress", defaultUnit: "MPa", description: "Shear / torsional stress" },
    { symbol: "Sy", name: "Yield strength", dimension: "stress", defaultUnit: "MPa", description: "Material yield strength", min: 0, fillFrom: "material", materialKey: "Sy" },
  ],
  outputs: [
    { symbol: "sigma_vm", name: "Von Mises stress σvm", dimension: "stress", preferredUnit: "MPa", description: "√(σ² + 3τ²)" },
    { symbol: "SF", name: "Safety factor", dimension: "dimensionless", preferredUnit: "", description: "Sy / σvm", isSafetyFactor: true },
  ],
  calculate: ({ sigma, tau, Sy }) => {
    const sigma_vm = Math.sqrt(sigma * sigma + 3 * tau * tau);
    return { sigma_vm, SF: Sy / sigma_vm };
  },
  validate: ({ Sy }) => {
    const e: ValidationIssue[] = [];
    if (Sy <= 0) e.push({ field: "Sy", level: "error", message: "Yield strength must be greater than zero" });
    return e;
  },
};
