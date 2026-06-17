import type { FormulaDef, ValidationIssue } from "../engine/types";

export const bearingStress: FormulaDef = {
  id: "bearing-stress",
  category: "Bearing",
  name: "Bearing Stress (pin / bolt in hole)",
  synonyms: ["bearing", "lug", "hole", "pin", "F/(d·t)", "pull-out", "crush"],
  equation: "σ_bearing = F / (d·t),   SF = Sy / σ_bearing",
  diagramId: "rivet-shear",
  explanation:
    "Contact (bearing) stress where a pin or bolt presses on the side of a hole, using the " +
    "projected area d·t. Pairs with a shear check on the pin itself. Sy is the yield of the " +
    "weaker member (plate or pin).",
  inputs: [
    { symbol: "F", name: "Load", dimension: "force", defaultUnit: "N", description: "Force transferred through the hole" },
    { symbol: "d", name: "Pin / hole diameter", dimension: "length", defaultUnit: "mm", description: "Bearing diameter", min: 0 },
    { symbol: "t", name: "Plate thickness", dimension: "length", defaultUnit: "mm", description: "Thickness of the bearing member", min: 0 },
    { symbol: "Sy", name: "Yield strength", dimension: "stress", defaultUnit: "MPa", description: "Yield of the weaker member", min: 0, fillFrom: "material", materialKey: "Sy" },
  ],
  outputs: [
    { symbol: "sigma_bearing", name: "Bearing stress σ", dimension: "stress", preferredUnit: "MPa", description: "F / (d·t)" },
    { symbol: "SF", name: "Safety factor", dimension: "dimensionless", preferredUnit: "", description: "Sy / σ_bearing", isSafetyFactor: true },
  ],
  calculate: ({ F, d, t, Sy }) => {
    const sigma_bearing = F / (d * t);
    return { sigma_bearing, SF: Sy / Math.abs(sigma_bearing) };
  },
  validate: ({ d, t, Sy }) => {
    const e: ValidationIssue[] = [];
    if (d <= 0) e.push({ field: "d", level: "error", message: "Diameter must be greater than zero" });
    if (t <= 0) e.push({ field: "t", level: "error", message: "Thickness must be greater than zero" });
    if (Sy <= 0) e.push({ field: "Sy", level: "error", message: "Yield strength must be greater than zero" });
    return e;
  },
};
