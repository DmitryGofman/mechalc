// Shaft in torsion: the classical circular-shaft theory — polar second moment,
// surface shear stress, angle of twist and torsional stiffness — for solid and
// hollow sections, plus the geometric stress raisers (keyseats, shoulder
// fillets, retaining-ring grooves) that decide where a real shaft actually
// breaks, and the power ⇄ torque conversion that drives the whole thing.
//
// Everything here is SI: metres, newton-metres, pascals, radians. The page
// converts at the edges.

// ── Stress raisers ──────────────────────────────────────────────────
// A plain shaft almost never exists: something has to drive the load in, and
// whatever cuts into the surface multiplies the shear stress there. Kts values
// are the standard first-iteration estimates for torsion (Shigley Table 7-1) —
// good enough to size a shaft, not a substitute for Peterson's charts once the
// fillet radius is on the drawing.
export type StressRaiser = {
  Kts: number;
  /** Where the peak sits along the modelled feature, and what it looks like. */
  kind: "none" | "keyseat" | "step" | "groove";
  /** Keyseats only: the cutter walks in and out instead of ending square. */
  runout?: boolean;
  /** Shoulder fillets only: r/d, the ratio the Kts estimate is quoted at. */
  rd?: number;
  note: string;
};

export const STRESS_RAISERS: Record<string, StressRaiser> = {
  "None — plain shaft": {
    Kts: 1.0,
    kind: "none",
    note: "Nominal surface stress; no feature",
  },
  "Sled-runner keyseat": {
    Kts: 1.6,
    kind: "keyseat",
    runout: true,
    note: "Cut by a side mill — runs out gently",
  },
  "End-milled keyseat (profiled)": {
    Kts: 3.0,
    kind: "keyseat",
    note: "Square-ended pocket — the classic shaft killer",
  },
  "Shoulder fillet — sharp (r/d 0.02)": {
    Kts: 2.2,
    kind: "step",
    rd: 0.02,
    note: "Step down to the bearing seat, tight radius",
  },
  "Shoulder fillet — well rounded (r/d 0.1)": {
    Kts: 1.5,
    kind: "step",
    rd: 0.1,
    note: "Same step, generous radius",
  },
  "Retaining-ring groove": {
    Kts: 3.0,
    kind: "groove",
    note: "Sharp-cornered circlip groove",
  },
};

export const DEFAULT_RAISER = "End-milled keyseat (profiled)";

// ── Power ⇄ torque ──────────────────────────────────────────────────
// P = T·ω with ω = 2πn/60. In the shop units that becomes the familiar
// T[N·m] = 9549 · P[kW] / n[rpm].
export const rpmToRadPerSec = (rpm: number) => (2 * Math.PI * rpm) / 60;
export const torqueFromPower = (watts: number, rpm: number) =>
  rpm > 0 ? watts / rpmToRadPerSec(rpm) : 0;
export const powerFromTorque = (T: number, rpm: number) => Math.abs(T) * rpmToRadPerSec(rpm);

/** Isotropic elasticity: the shear modulus a twist actually works against. */
export const shearModulus = (EPa: number, nu: number) => EPa / (2 * (1 + nu));

/**
 * Distortion-energy (von Mises) shear yield. Pure torsion is pure shear, so a
 * material gives way at 0.577·σy — the single most useful number on this page,
 * and the reason a shaft that would happily carry a load in tension shears off
 * at a little over half that stress.
 */
export const SHEAR_YIELD_FACTOR = 0.577;
export const shearYield = (sigmaYPa: number) => SHEAR_YIELD_FACTOR * sigmaYPa;

export type ShaftResults = {
  J: number; // polar second moment of area, m⁴
  Zp: number; // polar section modulus J/c, m³
  A: number; // cross-section area, m²
  c: number; // outer radius, m
  G: number; // shear modulus, Pa
  tauNom: number; // surface shear stress Tc/J, Pa
  tauPeak: number; // Kts · tauNom, Pa — what the material actually sees
  tauAllow: number; // 0.577·σy, Pa
  SF: number; // tauAllow / tauPeak
  Tyield: number; // torque at SF = 1, N·m
  theta: number; // angle of twist, rad (signed with T)
  thetaDeg: number;
  degPerM: number; // twist per metre of shaft
  thetaYield: number; // twist magnitude when the surface first yields, rad
  kt: number; // torsional stiffness GJ/L, N·m/rad
  ktDeg: number; // same, N·m/deg — the number a designer quotes
  JFrac: number; // J relative to a solid shaft of the same OD
  AFrac: number; // metal used relative to that solid shaft
  twistLimitDeg: number; // rule of thumb: 1° per 20 diameters
  twistUtil: number; // thetaDeg / twistLimitDeg
};

/**
 * The whole shaft, from geometry and one torque.
 *
 * `doM`/`diM` are outer and bore diameter in metres (diM = 0 → solid). The
 * bore is clamped just below the OD so a runaway input can't produce a
 * zero-stiffness tube.
 */
export function shaftResults(
  EPa: number,
  sigmaYPa: number,
  nu: number,
  doM: number,
  diM: number,
  Lm: number,
  T: number,
  Kts: number,
): ShaftResults {
  const dOut = Math.max(doM, 1e-6);
  const dIn = Math.min(Math.max(diM, 0), dOut * 0.98);
  const L = Math.max(Lm, 1e-9);
  const K = Math.max(Kts, 1);

  const c = dOut / 2;
  const J = (Math.PI * (Math.pow(dOut, 4) - Math.pow(dIn, 4))) / 32;
  const A = (Math.PI * (dOut * dOut - dIn * dIn)) / 4;
  const Zp = J / c;
  const G = Math.max(shearModulus(EPa, nu), 1e-9);

  const Tabs = Math.abs(T);
  const tauNom = Tabs / Zp; // = Tc/J = 16T/πd³ for a solid shaft
  const tauPeak = K * tauNom;
  const tauAllow = shearYield(sigmaYPa);
  const SF = tauPeak > 0 ? tauAllow / tauPeak : Infinity;
  const Tyield = (tauAllow * Zp) / K;

  const theta = (T * L) / (G * J);
  const thetaDeg = (theta * 180) / Math.PI;
  const degPerM = thetaDeg / L;
  // Twist at first yield is independent of J: θy = τallow·L / (Kts·c·G).
  const thetaYield = (tauAllow * L) / (K * c * G);

  const kt = (G * J) / L;
  const ktDeg = (kt * Math.PI) / 180;

  const Jsolid = (Math.PI * Math.pow(dOut, 4)) / 32;
  const Asolid = (Math.PI * dOut * dOut) / 4;

  // Rule of thumb for power-transmission shafting: keep the twist under
  // 1° per 20 diameters of length.
  const twistLimitDeg = L / (20 * dOut);

  return {
    J,
    Zp,
    A,
    c,
    G,
    tauNom,
    tauPeak,
    tauAllow,
    SF,
    Tyield,
    theta,
    thetaDeg,
    degPerM,
    thetaYield,
    kt,
    ktDeg,
    JFrac: J / Jsolid,
    AFrac: A / Asolid,
    twistLimitDeg,
    twistUtil: twistLimitDeg > 0 ? Math.abs(thetaDeg) / twistLimitDeg : Infinity,
  };
}

/**
 * Real twist is invisible: a steel driveshaft at yield turns through a couple
 * of degrees, and at working load a fraction of one. The 3D view exaggerates
 * it by a factor picked so that first yield always reads as a clear turn
 * (VIEW_TWIST_AT_YIELD), except for the rubbery cases that already twist that
 * far on their own — those are shown honestly at ×1.
 */
export const VIEW_TWIST_AT_YIELD = Math.PI / 3; // 60°

export function twistMagnification(thetaYieldRad: number): number {
  if (!isFinite(thetaYieldRad) || thetaYieldRad <= 0) return 1;
  return Math.max(1, Math.min(5000, VIEW_TWIST_AT_YIELD / thetaYieldRad));
}

/**
 * Shear stress at radius r — linear from zero on the axis to τmax at the
 * surface. This is the whole argument for hollow shafts: the metal near the
 * centre is barely working.
 */
export const shearAtRadius = (tauSurface: number, r: number, c: number) =>
  c > 0 ? (tauSurface * r) / c : 0;
