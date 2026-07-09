// Bolted-joint tightening math: torque → preload (nut-factor form), direct
// tension on the tensile stress area, torsion left in the shank by thread
// friction, and the combined von Mises check against proof strength.

// ISO metric coarse threads: nominal diameter d and pitch p in mm,
// tensile stress area As in mm² (ISO 898-1 tabulated values).
export type ThreadSpec = { d: number; p: number; As: number };

export const THREADS: Record<string, ThreadSpec> = {
  M2: { d: 2, p: 0.4, As: 2.07 },
  "M2.5": { d: 2.5, p: 0.45, As: 3.39 },
  M3: { d: 3, p: 0.5, As: 5.03 },
  M4: { d: 4, p: 0.7, As: 8.78 },
  M5: { d: 5, p: 0.8, As: 14.2 },
  M6: { d: 6, p: 1.0, As: 20.1 },
  M8: { d: 8, p: 1.25, As: 36.6 },
  M10: { d: 10, p: 1.5, As: 58.0 },
  M12: { d: 12, p: 1.75, As: 84.3 },
  M16: { d: 16, p: 2.0, As: 157 },
  M20: { d: 20, p: 2.5, As: 245 },
};

// Bolt property classes: proof / yield / ultimate strength in MPa,
// Young's modulus in GPa (used only for the stretch readout & 3D feel).
export type BoltClass = { sp: number; sy: number; su: number; E: number; note?: string };

export const CLASSES: Record<string, BoltClass> = {
  "4.8 (low-carbon steel)": { sp: 310, sy: 340, su: 420, E: 200 },
  "5.8 (low-carbon steel)": { sp: 380, sy: 420, su: 520, E: 200 },
  "8.8 (medium-carbon, Q&T)": { sp: 580, sy: 640, su: 800, E: 200 },
  "10.9 (alloy steel, Q&T)": { sp: 830, sy: 940, su: 1040, E: 200 },
  "12.9 (alloy steel, Q&T)": { sp: 970, sy: 1100, su: 1220, E: 200 },
  "A2-70 (stainless 18-8)": {
    sp: 410,
    sy: 450,
    su: 700,
    E: 193,
    note: "Cold-worked austenitic; galls easily — lubricate",
  },
};

// Nut factor K presets for T = K·F·d. K lumps thread + under-head friction
// and the thread incline; real joints scatter ±25% around these.
export const FRICTION: Record<string, number> = {
  "Dry steel, plain (K ≈ 0.20)": 0.2,
  "Zinc plated, dry (K ≈ 0.22)": 0.22,
  "Oiled (K ≈ 0.15)": 0.15,
  "Moly / anti-seize (K ≈ 0.12)": 0.12,
};

// Fraction of the applied torque that is reacted in the threads (the rest is
// under-head friction) — the classic ~50/50 split; this part twists the shank.
const THREAD_TORQUE_FRACTION = 0.5;

// Design target: preload at 65% of proof strength — conservative enough to
// leave room for the tightening torsion and K-scatter.
export const TARGET_PRELOAD_FRACTION = 0.65;

export type BoltResults = {
  F: number; // preload, N
  sigma: number; // direct tensile stress, Pa
  tau: number; // tightening torsion, Pa
  vm: number; // von Mises combined, Pa
  SF: number; // safety factor vs proof strength
  util: number; // vm / proof
  dL: number; // bolt stretch over the grip, m
  Trec: number; // recommended torque (65% proof preload), N·m
};

export function boltResults(thread: ThreadSpec, cls: BoltClass, K: number, T: number, gripMm: number): BoltResults {
  const d = thread.d / 1000; // m
  const As = thread.As * 1e-6; // m²
  const sp = cls.sp * 1e6; // Pa

  const F = K > 0 && d > 0 ? Math.abs(T) / (K * d) : 0; // N
  const sigma = As > 0 ? F / As : 0;

  // Torsion on the equivalent stress-area cylinder, from the thread torque.
  const ds = Math.sqrt((4 * As) / Math.PI); // m
  const tau = ds > 0 ? (16 * (THREAD_TORQUE_FRACTION * Math.abs(T))) / (Math.PI * Math.pow(ds, 3)) : 0;

  const vm = Math.sqrt(sigma * sigma + 3 * tau * tau);
  const SF = vm > 0 ? sp / vm : Infinity;

  const dL = (F * (Math.max(gripMm, 0) / 1000)) / (cls.E * 1e9 * As || 1);

  const Trec = K * d * As * (TARGET_PRELOAD_FRACTION * sp);

  return { F, sigma, tau, vm, SF, util: vm / sp, dL, Trec };
}
