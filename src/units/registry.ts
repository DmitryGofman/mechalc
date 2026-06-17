import type { Dimension, Unit } from "../engine/types";

// Single source of truth for units. SI base per dimension:
//  length m · area m² · second_moment m⁴ · section_modulus m³ · force N
//  stress Pa · moment N·m · mass kg · acceleration m/s² · dimensionless 1
//
// Conversion factors are exact where the definition is exact (e.g. 1 in = 0.0254 m).
const IN = 0.0254;
const LBF = 4.4482216152605; // pound-force, exact per kgf def
const G0 = 9.80665; // standard gravity (exact)

export const UNITS: Record<string, Unit> = {
  // length
  m: { id: "m", dimension: "length", label: "m", toSI: 1 },
  cm: { id: "cm", dimension: "length", label: "cm", toSI: 1e-2 },
  mm: { id: "mm", dimension: "length", label: "mm", toSI: 1e-3 },
  in: { id: "in", dimension: "length", label: "in", toSI: IN },
  ft: { id: "ft", dimension: "length", label: "ft", toSI: IN * 12 },

  // area
  m2: { id: "m2", dimension: "area", label: "m²", toSI: 1 },
  cm2: { id: "cm2", dimension: "area", label: "cm²", toSI: 1e-4 },
  mm2: { id: "mm2", dimension: "area", label: "mm²", toSI: 1e-6 },
  in2: { id: "in2", dimension: "area", label: "in²", toSI: IN * IN },

  // second moment of area / polar moment (m^4)
  m4: { id: "m4", dimension: "second_moment", label: "m⁴", toSI: 1 },
  mm4: { id: "mm4", dimension: "second_moment", label: "mm⁴", toSI: 1e-12 },
  in4: { id: "in4", dimension: "second_moment", label: "in⁴", toSI: IN ** 4 },

  // section modulus (m^3)
  m3: { id: "m3", dimension: "section_modulus", label: "m³", toSI: 1 },
  mm3: { id: "mm3", dimension: "section_modulus", label: "mm³", toSI: 1e-9 },
  in3: { id: "in3", dimension: "section_modulus", label: "in³", toSI: IN ** 3 },

  // force
  N: { id: "N", dimension: "force", label: "N", toSI: 1 },
  kN: { id: "kN", dimension: "force", label: "kN", toSI: 1e3 },
  lbf: { id: "lbf", dimension: "force", label: "lbf", toSI: LBF },
  kgf: { id: "kgf", dimension: "force", label: "kgf", toSI: G0 },

  // stress / modulus
  Pa: { id: "Pa", dimension: "stress", label: "Pa", toSI: 1 },
  kPa: { id: "kPa", dimension: "stress", label: "kPa", toSI: 1e3 },
  MPa: { id: "MPa", dimension: "stress", label: "MPa", toSI: 1e6 },
  GPa: { id: "GPa", dimension: "stress", label: "GPa", toSI: 1e9 },
  psi: { id: "psi", dimension: "stress", label: "psi", toSI: LBF / (IN * IN) },
  ksi: { id: "ksi", dimension: "stress", label: "ksi", toSI: (LBF / (IN * IN)) * 1e3 },

  // moment / torque
  Nm: { id: "Nm", dimension: "moment", label: "N·m", toSI: 1 },
  Nmm: { id: "Nmm", dimension: "moment", label: "N·mm", toSI: 1e-3 },
  kNm: { id: "kNm", dimension: "moment", label: "kN·m", toSI: 1e3 },
  "lbf-in": { id: "lbf-in", dimension: "moment", label: "lbf·in", toSI: LBF * IN },
  "lbf-ft": { id: "lbf-ft", dimension: "moment", label: "lbf·ft", toSI: LBF * IN * 12 },

  // mass
  kg: { id: "kg", dimension: "mass", label: "kg", toSI: 1 },
  g: { id: "g", dimension: "mass", label: "g", toSI: 1e-3 },
  lb: { id: "lb", dimension: "mass", label: "lb", toSI: 0.45359237 },

  // acceleration
  "m/s2": { id: "m/s2", dimension: "acceleration", label: "m/s²", toSI: 1 },
  g0: { id: "g0", dimension: "acceleration", label: "g", toSI: G0 },
  "ft/s2": { id: "ft/s2", dimension: "acceleration", label: "ft/s²", toSI: IN * 12 },

  // dimensionless
  "": { id: "", dimension: "dimensionless", label: "—", toSI: 1 },
};

export function unitsForDimension(dim: Dimension): Unit[] {
  return Object.values(UNITS).filter((u) => u.dimension === dim);
}

// Preferred display unit per dimension, by unit system, used to format results nicely.
export const PREFERRED: Record<Dimension, { metric: string; imperial: string }> = {
  length: { metric: "mm", imperial: "in" },
  area: { metric: "mm2", imperial: "in2" },
  second_moment: { metric: "mm4", imperial: "in4" },
  section_modulus: { metric: "mm3", imperial: "in3" },
  force: { metric: "N", imperial: "lbf" },
  stress: { metric: "MPa", imperial: "ksi" },
  moment: { metric: "Nm", imperial: "lbf-ft" },
  mass: { metric: "kg", imperial: "lb" },
  acceleration: { metric: "m/s2", imperial: "ft/s2" },
  dimensionless: { metric: "", imperial: "" },
};
