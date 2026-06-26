// Units layer — calculations happen in SI base units; values are converted only at
// the UI boundary. Mixing dimensions (e.g. mm -> N) is impossible by construction.

export type Dimension = "force" | "length" | "area" | "stress" | "dimensionless";

export interface Unit {
  id: string;
  dimension: Dimension;
  label: string;
  toSI: number; // multiply a value in this unit by toSI to get the SI base value
}

// Exact conversion constants.
const IN = 0.0254; // 1 inch in metres (exact)
const LBF = 4.4482216152605; // pound-force in newtons (exact)
const G0 = 9.80665; // standard gravity (exact)

export const UNITS: Record<string, Unit> = {
  // force (SI: N)
  N: { id: "N", dimension: "force", label: "N", toSI: 1 },
  kN: { id: "kN", dimension: "force", label: "kN", toSI: 1e3 },
  lbf: { id: "lbf", dimension: "force", label: "lbf", toSI: LBF },
  kgf: { id: "kgf", dimension: "force", label: "kgf", toSI: G0 },

  // length (SI: m)
  mm: { id: "mm", dimension: "length", label: "mm", toSI: 1e-3 },
  cm: { id: "cm", dimension: "length", label: "cm", toSI: 1e-2 },
  m: { id: "m", dimension: "length", label: "m", toSI: 1 },
  in: { id: "in", dimension: "length", label: "in", toSI: IN },

  // area (SI: m²)
  mm2: { id: "mm2", dimension: "area", label: "mm²", toSI: 1e-6 },
  cm2: { id: "cm2", dimension: "area", label: "cm²", toSI: 1e-4 },
  m2: { id: "m2", dimension: "area", label: "m²", toSI: 1 },
  in2: { id: "in2", dimension: "area", label: "in²", toSI: IN * IN },

  // stress (SI: Pa)
  Pa: { id: "Pa", dimension: "stress", label: "Pa", toSI: 1 },
  MPa: { id: "MPa", dimension: "stress", label: "MPa", toSI: 1e6 },
  GPa: { id: "GPa", dimension: "stress", label: "GPa", toSI: 1e9 },
  psi: { id: "psi", dimension: "stress", label: "psi", toSI: LBF / (IN * IN) },
  ksi: { id: "ksi", dimension: "stress", label: "ksi", toSI: (LBF / (IN * IN)) * 1e3 },
};

export function unitsFor(dimension: Dimension): Unit[] {
  return Object.values(UNITS).filter((u) => u.dimension === dimension);
}

export function toSI(value: number, unit: string): number {
  const u = UNITS[unit];
  if (!u) throw new Error(`Unknown unit: ${unit}`);
  return value * u.toSI;
}

export function fromSI(siValue: number, unit: string): number {
  const u = UNITS[unit];
  if (!u) throw new Error(`Unknown unit: ${unit}`);
  return siValue / u.toSI;
}

export function convert(value: number, fromUnit: string, toUnit: string): number {
  const a = UNITS[fromUnit];
  const b = UNITS[toUnit];
  if (!a) throw new Error(`Unknown unit: ${fromUnit}`);
  if (!b) throw new Error(`Unknown unit: ${toUnit}`);
  if (a.dimension !== b.dimension) {
    throw new Error(`Cannot convert ${a.label} (${a.dimension}) to ${b.label} (${b.dimension})`);
  }
  return fromSI(toSI(value, fromUnit), toUnit);
}

// Preferred display unit per dimension and unit system.
export const PREFERRED: Record<Dimension, { metric: string; imperial: string }> = {
  force: { metric: "N", imperial: "lbf" },
  length: { metric: "mm", imperial: "in" },
  area: { metric: "mm2", imperial: "in2" },
  stress: { metric: "MPa", imperial: "ksi" },
  dimensionless: { metric: "", imperial: "" },
};

// Engineering-friendly number formatting.
export function formatNumber(x: number): string {
  if (!isFinite(x)) return "—";
  if (x === 0) return "0";
  const abs = Math.abs(x);
  if (abs >= 1e6 || abs < 1e-3) return x.toExponential(3);
  return String(Number(x.toPrecision(4)));
}
