import type { FormulaDef } from "../engine/types";

export const gLoad: FormulaDef = {
  id: "g-load",
  category: "G-Loads",
  name: "G-Load → Force",
  synonyms: ["acceleration force", "shock", "inertial load", "g force", "F = m n g"],
  equation: "F = m · n · g",
  diagramId: "g-load-mass",
  explanation:
    "Equivalent inertial force on a mass under an acceleration of n times gravity. " +
    "Use the resulting force as the load input for a bracket or fastener check.",
  inputs: [
    { symbol: "m", name: "Mass", dimension: "mass", defaultUnit: "kg", description: "Mass being accelerated", min: 0 },
    { symbol: "n", name: "G count", dimension: "dimensionless", defaultUnit: "", description: "Acceleration as a multiple of g", min: 0 },
    { symbol: "g", name: "Gravity", dimension: "acceleration", defaultUnit: "m/s2", description: "Standard gravity", defaultValue: 9.81 },
  ],
  outputs: [
    { symbol: "F", name: "Resultant force", dimension: "force", preferredUnit: "N", description: "Equivalent inertial force m·n·g" },
  ],
  calculate: ({ m, n, g }) => ({ F: m * n * g }),
  validate: ({ m, n }) => {
    const e = [] as { field: string; level: "error" | "warning"; message: string }[];
    if (m < 0) e.push({ field: "m", level: "error", message: "Mass cannot be negative" });
    if (n < 0) e.push({ field: "n", level: "error", message: "G count cannot be negative" });
    return e;
  },
  references: ["Shigley's Mechanical Engineering Design"],
};
