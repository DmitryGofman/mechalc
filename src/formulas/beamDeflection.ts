import type { FormulaDef, ValidationIssue } from "../engine/types";

export const beamDeflection: FormulaDef = {
  id: "cantilever-deflection",
  category: "Deflection",
  name: "Cantilever Deflection (end load)",
  synonyms: ["deflection", "stiffness", "cantilever", "PL^3/3EI", "delta"],
  equation: "δ = P·L³ / (3·E·I)",
  diagramId: "cantilever-end-load",
  explanation:
    "Tip deflection of a cantilever with an end load P. E is the elastic modulus and I the " +
    "area moment of inertia (use Section Properties for I).",
  inputs: [
    { symbol: "P", name: "End load", dimension: "force", defaultUnit: "N", description: "Transverse force at the tip" },
    { symbol: "L", name: "Length", dimension: "length", defaultUnit: "mm", description: "Beam length", min: 0 },
    { symbol: "E", name: "Elastic modulus", dimension: "stress", defaultUnit: "GPa", description: "Young's modulus", min: 0, fillFrom: "material", materialKey: "E" },
    { symbol: "I", name: "Moment of inertia", dimension: "second_moment", defaultUnit: "mm4", description: "Area moment of inertia", min: 0 },
  ],
  outputs: [
    { symbol: "delta", name: "Tip deflection δ", dimension: "length", preferredUnit: "mm", description: "P·L³ / (3·E·I)" },
  ],
  calculate: ({ P, L, E, I }) => ({ delta: (P * L ** 3) / (3 * E * I) }),
  validate: ({ E, I }) => {
    const e: ValidationIssue[] = [];
    if (E <= 0) e.push({ field: "E", level: "error", message: "Elastic modulus must be greater than zero" });
    if (I <= 0) e.push({ field: "I", level: "error", message: "Moment of inertia must be greater than zero" });
    return e;
  },
};
