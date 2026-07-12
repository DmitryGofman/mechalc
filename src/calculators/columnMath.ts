// Column buckling: Euler elastic buckling with effective-length factors for
// the four classical end conditions, the Johnson parabola for short columns,
// and the imperfection-amplification model that drives the 3D bowing.

export type EndSupport = "fixed" | "pinned" | "free";

export type EndCondition = {
  K: number; // effective length factor
  base: EndSupport;
  top: EndSupport;
  shape: (s: number) => number; // buckled mode shape, s = height fraction 0..1, normalized to max 1
  curv: (s: number) => number; // mode curvature φ''(s), normalized to max |1|, signed
};

// Fixed–pinned eigenvalue: tan(μ) = μ → μ = 4.4934…, K = π/μ ≈ 0.699.
const MU = 4.493409457909064;
const fpRaw = (s: number) => Math.sin(MU * s) - MU * Math.cos(MU * s) - MU * s + MU;
const fpCurvRaw = (s: number) => -MU * MU * Math.sin(MU * s) + MU * MU * MU * Math.cos(MU * s);
// Normalize numerically once at module load.
let fpMax = 0;
let fpCurvMax = 0;
for (let i = 0; i <= 200; i++) {
  const s = i / 200;
  fpMax = Math.max(fpMax, Math.abs(fpRaw(s)));
  fpCurvMax = Math.max(fpCurvMax, Math.abs(fpCurvRaw(s)));
}

export const END_CONDITIONS: Record<string, EndCondition> = {
  "Pinned – pinned (K = 1.0)": {
    K: 1.0,
    base: "pinned",
    top: "pinned",
    shape: (s) => Math.sin(Math.PI * s),
    curv: (s) => -Math.sin(Math.PI * s),
  },
  "Fixed – free, flagpole (K = 2.0)": {
    K: 2.0,
    base: "fixed",
    top: "free",
    shape: (s) => 1 - Math.cos((Math.PI * s) / 2),
    curv: (s) => -Math.cos((Math.PI * s) / 2),
  },
  "Fixed – pinned (K = 0.7)": {
    K: Math.PI / MU, // 0.699…
    base: "fixed",
    top: "pinned",
    shape: (s) => fpRaw(s) / fpMax,
    curv: (s) => fpCurvRaw(s) / fpCurvMax,
  },
  "Fixed – fixed (K = 0.5)": {
    K: 0.5,
    base: "fixed",
    top: "fixed",
    shape: (s) => (1 - Math.cos(2 * Math.PI * s)) / 2,
    curv: (s) => -Math.cos(2 * Math.PI * s),
  },
};

export type ColumnResults = {
  A: number; // area, m²
  I: number; // weak-axis second moment, m⁴
  rg: number; // radius of gyration, m
  Le: number; // effective length, m
  lambda: number; // slenderness KL/r
  lambdaT: number; // Euler/Johnson transition slenderness
  PcrEuler: number; // N
  Pcr: number; // governing critical load, N
  regime: "euler" | "johnson";
  SF: number; // Pcr / P
  sigmaAx: number; // axial stress P/A, Pa
  nCrush: number; // yield SF on pure compression
};

export function columnResults(
  EPa: number,
  syPa: number,
  Lm: number,
  tM: number,
  wM: number,
  K: number,
  P: number,
): ColumnResults {
  const A = Math.max(tM * wM, 1e-12);
  // Buckling picks the weak axis on its own — use the smaller I.
  const I = Math.min(wM * Math.pow(tM, 3), tM * Math.pow(wM, 3)) / 12;
  const rg = Math.sqrt(I / A);
  const Le = K * Math.max(Lm, 1e-9);
  const lambda = Le / rg;
  const lambdaT = Math.sqrt((2 * Math.PI * Math.PI * EPa) / syPa);

  const PcrEuler = (Math.PI * Math.PI * EPa * I) / (Le * Le);
  // Short/intermediate columns crush-buckle below Euler: Johnson parabola,
  // tangent to Euler at λt, reaching A·σy at λ = 0.
  const regime: "euler" | "johnson" = lambda >= lambdaT ? "euler" : "johnson";
  const Pcr =
    regime === "euler"
      ? PcrEuler
      : A * syPa * (1 - (syPa * lambda * lambda) / (4 * Math.PI * Math.PI * EPa));

  const Pabs = Math.max(0, P);
  const SF = Pabs > 0 ? Pcr / Pabs : Infinity;
  const sigmaAx = Pabs / A;
  const nCrush = sigmaAx > 0 ? syPa / sigmaAx : Infinity;

  return { A, I, rg, Le, lambda, lambdaT, PcrEuler, Pcr, regime, SF, sigmaAx, nCrush };
}

// How the buckling happens: a real column is never perfectly straight. Its
// initial bow a0 is amplified by 1/(1 − P/Pcr) — creeping growth at low load,
// runaway as P → Pcr, then unbounded post-buckle (capped for display).
export function bowAmplitude(P: number, Pcr: number, Lm: number): number {
  if (Pcr <= 0 || Lm <= 0) return 0;
  const a0 = Lm / 300; // typical straightness imperfection
  const g = Math.max(0, P) / Pcr;
  const cap = 0.22 * Lm;
  const amp = g < 0.98 ? a0 / (1 - g) : a0 / 0.02 + (g - 0.98) * 2 * Lm;
  return Math.min(cap, amp);
}

// Axial travel of the loaded end: elastic shortening plus the geometric
// drop as the bowed centerline curls (half-sine approximation) — this is
// what makes the top visibly sink when the column lets go.
export function axialDrop(P: number, EPa: number, A: number, Lm: number, amp: number): number {
  const elastic = (Math.max(0, P) * Lm) / (EPa * A || 1);
  const geometric = (Math.PI * Math.PI * amp * amp) / (4 * Math.max(Lm, 1e-9));
  return elastic + geometric;
}
