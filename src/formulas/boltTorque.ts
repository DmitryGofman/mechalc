import type { FormulaDef, ValidationIssue } from "../engine/types";

export const boltTorque: FormulaDef = {
  id: "bolt-preload",
  category: "Bolts",
  name: "Bolt Preload, Torque & Stress",
  synonyms: ["bolt", "torque", "preload", "tighten", "T = K F d", "clamp", "fastener"],
  equation: "T = K·F·d,   σ = F / Aₜ,   SF = Sp / σ",
  diagramId: "bolt-preload",
  explanation:
    "Tightening torque for a target bolt preload F, and the tensile stress with a safety " +
    "factor against proof strength. Nut factor K ≈ 0.2 for dry steel. A common target " +
    "preload is F ≈ 0.75·Sp·Aₜ. Use the bolt picker on Aₜ to fill the tensile area.",
  inputs: [
    { symbol: "F", name: "Preload", dimension: "force", defaultUnit: "N", description: "Target axial clamp force", min: 0 },
    { symbol: "d", name: "Nominal diameter", dimension: "length", defaultUnit: "mm", description: "Bolt nominal diameter", min: 0 },
    { symbol: "K", name: "Nut factor", dimension: "dimensionless", defaultUnit: "", description: "Torque coefficient (≈0.2 dry, ≈0.15 lubricated)", defaultValue: 0.2 },
    { symbol: "At", name: "Tensile area Aₜ", dimension: "area", defaultUnit: "mm2", description: "Bolt tensile stress area", min: 0 },
    { symbol: "Sp", name: "Proof strength", dimension: "stress", defaultUnit: "MPa", description: "Bolt proof strength (8.8→580, 10.9→830, 12.9→970 MPa)", min: 0 },
  ],
  outputs: [
    { symbol: "T", name: "Tightening torque T", dimension: "moment", preferredUnit: "Nm", preferredUnitImperial: "lbf-ft", description: "K·F·d" },
    { symbol: "sigma", name: "Tensile stress σ", dimension: "stress", preferredUnit: "MPa", description: "F / Aₜ" },
    { symbol: "SF", name: "Safety factor", dimension: "dimensionless", preferredUnit: "", description: "Sp / σ", isSafetyFactor: true },
  ],
  calculate: ({ F, d, K, At, Sp }) => {
    const sigma = F / At;
    return { T: K * F * d, sigma, SF: Sp / Math.abs(sigma) };
  },
  validate: ({ At, Sp }) => {
    const e: ValidationIssue[] = [];
    if (At <= 0) e.push({ field: "At", level: "error", message: "Tensile area must be greater than zero" });
    if (Sp <= 0) e.push({ field: "Sp", level: "error", message: "Proof strength must be greater than zero" });
    return e;
  },
  references: ["Shigley's; VDI 2230"],
};
