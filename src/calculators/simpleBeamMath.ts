// Beam on two supports with a center point load, Euler–Bernoulli closed
// forms. Two end conditions: simply supported (pins — ends free to rotate)
// and fixed-fixed (built-in ends). All SI units in, SI out.

export type SupportType = "simple" | "fixed";

// Center stiffness F/δ: 48EI/L³ pinned, 192EI/L³ built-in (4× stiffer).
export function beamStiffness(EPa: number, I: number, Lm: number, support: SupportType): number {
  if (Lm <= 0) return Infinity;
  const c = support === "simple" ? 48 : 192;
  return (c * EPa * I) / Math.pow(Lm, 3);
}

// Peak bending stress for a rectangular section at center deflection δ.
// Simply supported: M = FL/4 at mid-span → σ = 6Etδ/L².
// Fixed-fixed: M = FL/8 at the walls → σ = 12Etδ/L².
export function beamSigma(EPa: number, tM: number, Lm: number, deltaM: number, support: SupportType): number {
  if (Lm <= 0) return 0;
  const c = support === "simple" ? 6 : 12;
  return (c * EPa * tM * Math.abs(deltaM)) / (Lm * Lm);
}

// Normalized deflected shape: ξ = distance from the nearer support / L
// (0 at a support, 0.5 at mid-span), returns y/δ ∈ [0, 1].
export function beamShape(xi: number, support: SupportType): number {
  const x = Math.max(0, Math.min(0.5, xi));
  return support === "simple" ? x * (3 - 4 * x * x) : 4 * x * x * (3 - 4 * x);
}

// Normalized bending moment m(ξ) = M / M_max, signed: + puts the BOTTOM face
// in tension when the beam is pressed down. Simply supported peaks (+1) at
// mid-span and vanishes at the pins; fixed-fixed runs −1 at the walls
// (top-face tension) through 0 at L/4 to +1 at mid-span.
export function beamMoment(xi: number, support: SupportType): number {
  const x = Math.max(0, Math.min(0.5, xi));
  return support === "simple" ? 2 * x : 4 * x - 1;
}
