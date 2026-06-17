// Core domain types. Everything the engine computes is in SI base units;
// units are converted only at the UI boundary (see ../units).

export type Dimension =
  | "length"
  | "area"
  | "second_moment" // area moment of inertia I and polar moment J (m^4)
  | "section_modulus" // Z (m^3)
  | "force"
  | "stress" // also used for elastic modulus E (Pa)
  | "moment" // torque / bending moment (N·m)
  | "mass"
  | "acceleration"
  | "dimensionless";

export interface Unit {
  id: string;
  dimension: Dimension;
  label: string;
  toSI: number; // multiply a value in this unit by toSI to get SI base
}

// A physical quantity is always a value + a unit — never a bare number in the UI.
export interface Quantity {
  value: number;
  unit: string;
}

export interface InputVariable {
  symbol: string;
  name: string;
  dimension: Dimension;
  defaultUnit: string;
  description: string;
  defaultValue?: number;
  min?: number;
  max?: number;
  // Optional hint that a picker can auto-fill this field:
  fillFrom?: "material" | "bolt";
  materialKey?: "Sy" | "Su" | "E";
}

export interface OutputVariable {
  symbol: string;
  name: string;
  dimension: Dimension;
  preferredUnit: string; // metric display unit
  preferredUnitImperial?: string; // overrides the default imperial unit when set
  description: string;
  isSafetyFactor?: boolean;
}

export interface ValidationIssue {
  field: string;
  level: "error" | "warning";
  message: string;
}

// Formula metadata + its pure SI calculator, combined for a single registry entry.
export interface FormulaDef {
  id: string;
  category: string;
  name: string;
  synonyms: string[];
  equation: string; // human-readable unicode form, e.g. "σ = F / A"
  diagramId: string;
  explanation: string;
  inputs: InputVariable[];
  outputs: OutputVariable[];
  // inputs/outputs here are plain SI numbers keyed by symbol.
  calculate: (si: Record<string, number>) => Record<string, number>;
  validate?: (si: Record<string, number>) => ValidationIssue[];
  references?: string[];
}

export interface SavedCalculation {
  id: string;
  formulaId: string;
  formulaName: string;
  category: string;
  inputs: Record<string, Quantity>; // exactly as the user typed (value + unit)
  outputs: Record<string, Quantity>;
  safetyFactor?: number;
  createdAt: string; // ISO
  notes?: string;
}
