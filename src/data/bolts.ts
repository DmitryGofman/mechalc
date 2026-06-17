// Fastener reference data. Tensile stress area At and nominal diameter stored in SI
// (m² and m). Reference values — verify before production use.
export interface Bolt {
  id: string;
  label: string;
  system: "metric" | "unified";
  series: string; // "coarse" | "fine" | "UNC" | "UNF"
  dNom: number; // nominal diameter, m
  At: number; // tensile stress area, m²
}

const MM2 = 1e-6;
const IN2 = 0.0254 * 0.0254;
const MM = 1e-3;
const IN = 0.0254;

export const BOLTS: Bolt[] = [
  // Metric coarse
  { id: "m3", label: "M3", system: "metric", series: "coarse", dNom: 3 * MM, At: 5.03 * MM2 },
  { id: "m4", label: "M4", system: "metric", series: "coarse", dNom: 4 * MM, At: 8.78 * MM2 },
  { id: "m5", label: "M5", system: "metric", series: "coarse", dNom: 5 * MM, At: 14.2 * MM2 },
  { id: "m6", label: "M6", system: "metric", series: "coarse", dNom: 6 * MM, At: 20.1 * MM2 },
  { id: "m8", label: "M8", system: "metric", series: "coarse", dNom: 8 * MM, At: 36.6 * MM2 },
  { id: "m10", label: "M10", system: "metric", series: "coarse", dNom: 10 * MM, At: 58.0 * MM2 },
  { id: "m12", label: "M12", system: "metric", series: "coarse", dNom: 12 * MM, At: 84.3 * MM2 },
  // Metric fine
  { id: "m8x1", label: "M8×1.0", system: "metric", series: "fine", dNom: 8 * MM, At: 39.2 * MM2 },
  { id: "m10x1.25", label: "M10×1.25", system: "metric", series: "fine", dNom: 10 * MM, At: 61.2 * MM2 },
  { id: "m12x1.25", label: "M12×1.25", system: "metric", series: "fine", dNom: 12 * MM, At: 92.1 * MM2 },
  // Imperial UNC
  { id: "n4unc", label: "#4-40 UNC", system: "unified", series: "UNC", dNom: 0.112 * IN, At: 0.00604 * IN2 },
  { id: "n6unc", label: "#6-32 UNC", system: "unified", series: "UNC", dNom: 0.138 * IN, At: 0.00909 * IN2 },
  { id: "n8unc", label: "#8-32 UNC", system: "unified", series: "UNC", dNom: 0.164 * IN, At: 0.0140 * IN2 },
  { id: "n10unc", label: "#10-24 UNC", system: "unified", series: "UNC", dNom: 0.190 * IN, At: 0.0175 * IN2 },
  { id: "q4unc", label: "1/4-20 UNC", system: "unified", series: "UNC", dNom: 0.25 * IN, At: 0.0318 * IN2 },
  { id: "s16unc", label: "5/16-18 UNC", system: "unified", series: "UNC", dNom: 0.3125 * IN, At: 0.0524 * IN2 },
  { id: "t8unc", label: "3/8-16 UNC", system: "unified", series: "UNC", dNom: 0.375 * IN, At: 0.0775 * IN2 },
  { id: "h2unc", label: "1/2-13 UNC", system: "unified", series: "UNC", dNom: 0.5 * IN, At: 0.1419 * IN2 },
];

// Proof strength by grade, Pa. Used for preload F ≈ 0.75·proof·At and σ = F/At.
export const BOLT_PROOF_STRENGTH: Record<string, number> = {
  "8.8": 580e6,
  "10.9": 830e6,
  "12.9": 970e6,
  "SAE2": 379e6, // ~55 ksi
  "SAE5": 586e6, // ~85 ksi
  "SAE8": 827e6, // ~120 ksi
};

export const BOLT_BY_ID: Record<string, Bolt> = Object.fromEntries(BOLTS.map((b) => [b.id, b]));
