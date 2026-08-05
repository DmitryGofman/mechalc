// Display units — metric ⇄ imperial, for presentation only.
//
// Every calculator in the toolkit computes in one system internally (mm, N,
// MPa, N·m, and SI where the physics wants it). This module decides how those
// numbers are SHOWN, and how a number typed into an imperial field gets back
// to the internal one. Nothing here touches the mechanics: a unit toggle that
// reached into the formulas would mean auditing every equation twice, and the
// first rounding error would land in a safety factor.
//
// Conversion factors are the exact definitions (1 in = 25.4 mm,
// 1 lbf = 4.448 221 615 260 5 N), so a round trip is lossless.

export type UnitSystem = "metric" | "imperial";

export const MM_PER_IN = 25.4;
export const N_PER_LBF = 4.4482216152605;
export const MPA_PER_KSI = (N_PER_LBF / (MM_PER_IN * MM_PER_IN)) * 1000; // 6.894757…
export const NM_PER_LBFIN = (N_PER_LBF * MM_PER_IN) / 1000; // 0.112984…
export const NPERM_PER_KLBFIN = (N_PER_LBF * 1000) / (MM_PER_IN / 1000); // klbf/in → N/m

// One physical quantity, in whichever system is active.
//   from : internal value → the number to display
//   to   : a displayed/typed number → internal value
// `dp` is how many decimals that number wants in this system; `step` is a
// sensible increment for a spinner in these units.
export type Quantity = {
  label: string;
  from: (internal: number) => number;
  to: (shown: number) => number;
  dp: number;
  step: number;
};

const scaled = (label: string, perUnit: number, dp: number, step: number): Quantity => ({
  label,
  from: (v) => v / perUnit,
  to: (v) => v * perUnit,
  dp,
  step,
});

// Every quantity the calculators show, with the internal unit each one speaks.
export type UnitPack = {
  sys: UnitSystem;
  imperial: boolean;
  length: Quantity; // internal mm
  area: Quantity; // internal mm²
  force: Quantity; // internal N
  forceBig: Quantity; // internal N — kN metric, lbf imperial
  torque: Quantity; // internal N·m
  stress: Quantity; // internal MPa
  modulus: Quantity; // internal GPa
  micro: Quantity; // internal m — the micron-scale deflections
  stiffness: Quantity; // internal N/m
};

const METRIC: UnitPack = {
  sys: "metric",
  imperial: false,
  length: scaled("mm", 1, 2, 0.5),
  area: scaled("mm²", 1, 2, 1),
  force: scaled("N", 1, 0, 50),
  forceBig: scaled("kN", 1000, 2, 0.1),
  torque: scaled("N·m", 1, 2, 0.1),
  stress: scaled("MPa", 1, 0, 1),
  modulus: scaled("GPa", 1, 1, 1),
  micro: scaled("µm", 1e-6, 1, 0.1),
  stiffness: scaled("kN/mm", 1e6, 0, 1),
};

const IMPERIAL: UnitPack = {
  sys: "imperial",
  imperial: true,
  length: scaled("in", MM_PER_IN, 3, 0.05),
  area: scaled("in²", MM_PER_IN * MM_PER_IN, 4, 0.01),
  force: scaled("lbf", N_PER_LBF, 0, 10),
  forceBig: scaled("lbf", N_PER_LBF, 0, 10),
  // Always lbf·in, never lbf·ft: small fasteners are specified in lbf·in on
  // every torque wrench that can reach them, and one unit keeps the theory
  // page's arithmetic readable.
  torque: scaled("lbf·in", NM_PER_LBFIN, 1, 1),
  stress: scaled("ksi", MPA_PER_KSI, 1, 1),
  // 1 Msi = 1000 ksi = 6.8948 GPa, and the internal unit here is GPa.
  modulus: scaled("Msi", MPA_PER_KSI, 2, 1),
  micro: scaled("mil", 25.4e-6, 2, 0.1),
  stiffness: scaled("klbf/in", NPERM_PER_KLBFIN, 0, 1),
};

export const UNITS: Record<UnitSystem, UnitPack> = { metric: METRIC, imperial: IMPERIAL };

export const unitsFor = (sys: UnitSystem): UnitPack => UNITS[sys];

// Formatted number in the active system, without / with its symbol.
export const q = (u: Quantity, internal: number, dp = u.dp): string =>
  isFinite(internal) ? u.from(internal).toFixed(dp) : "∞";
export const qu = (u: Quantity, internal: number, dp = u.dp): string => `${q(u, internal, dp)} ${u.label}`;

const trim = (s: string) => (s.includes(".") ? s.replace(/0+$/, "").replace(/\.$/, "") : s);

/**
 * The value in a text input, re-expressed for the other system when the user
 * flips the toggle. Takes the fewest decimals that still land back on the
 * number they typed — so 8 mm becomes 0.315 in and 0.315 in becomes 8 mm
 * again, instead of drifting to 8.001 and staying there.
 */
export function reexpress(value: string, from: Quantity, to: Quantity, fallback = 0): string {
  const n = parseFloat(value);
  const internal = from.to(isNaN(n) ? fallback : n);
  const shown = to.from(internal);
  // Half a step of the SOURCE field's own precision: any round-trip error
  // smaller than that is invisible in the box the number came from.
  const tol = 0.5 * Math.pow(10, -from.dp) * from.to(1);
  for (let dp = to.dp; dp < to.dp + 5; dp++) {
    const s = trim(shown.toFixed(dp));
    if (Math.abs(to.to(parseFloat(s)) - internal) <= tol) return s;
  }
  return trim(shown.toFixed(to.dp + 5));
}
