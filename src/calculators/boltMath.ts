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

// Clamped-plate materials: E in GPa, yield in MPa, and pG = permissible
// surface (bearing) pressure in MPa under head/nut, VDI 2230-style typical
// values. tone = base color for the 3D plates.
export type PlateMaterial = { E: number; sy: number; pG: number; tone: string };

export const PLATE_MATERIALS: Record<string, PlateMaterial> = {
  "Mild steel (S235)": { E: 200, sy: 235, pG: 490, tone: "#39434e" },
  "Alloy steel (S355 / 4140)": { E: 200, sy: 355, pG: 760, tone: "#333d47" },
  "Stainless 304 / A2": { E: 193, sy: 215, pG: 500, tone: "#3d4a54" },
  "Aluminum 6061-T6": { E: 68.9, sy: 276, pG: 300, tone: "#4a525a" },
  "Aluminum 7075-T6": { E: 71.7, sy: 503, pG: 410, tone: "#4a525a" },
  "Gray cast iron (GJL-250)": { E: 110, sy: 165, pG: 800, tone: "#39404a" },
  "Brass (CuZn37)": { E: 100, sy: 200, pG: 300, tone: "#544e3a" },
  "Ti-6Al-4V": { E: 114, sy: 880, pG: 900, tone: "#4c4a42" },
  "POM / Delrin": { E: 3.1, sy: 70, pG: 90, tone: "#4e4c44" },
  "PA12 / Nylon": { E: 1.7, sy: 48, pG: 50, tone: "#464a40" },
};

// Fraction of the applied torque that is reacted in the threads (the rest is
// under-head friction) — the classic ~50/50 split; this part twists the shank.
const THREAD_TORQUE_FRACTION = 0.5;

// Shigley's pressure-cone half-apex angle for member stiffness.
const CONE_TAN = Math.tan(Math.PI / 6); // tan 30°

// Under-head bearing: washer-face diameter ≈ 1.5d, clearance hole ≈ 1.06d
// (normal fit). Used for bearing pressure and as the cone's starting diameter.
export const DW_RATIO = 1.5;
export const DHOLE_RATIO = 1.06;

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

// Member (clamped-plate) stiffness from Shigley's 30° pressure-cone frusta:
// the clamp load spreads as a cone from under the head to the grip midplane,
// then contracts back to the nut face. Each plate segment is a frustum; the
// frusta stack in series. Returns N/m.
export function memberStiffness(dMm: number, t1Mm: number, E1Gpa: number, t2Mm: number, E2Gpa: number): number {
  const d = dMm / 1000;
  const t1 = Math.max(t1Mm, 0) / 1000;
  const grip = t1 + Math.max(t2Mm, 0) / 1000;
  if (d <= 0 || grip <= 0) return Infinity;
  const dw = DW_RATIO * d;

  // Segment boundaries: bearing faces, the plate interface, and the cone
  // midplane (where widening flips to narrowing).
  const bounds = Array.from(new Set([0, grip / 2, Math.min(t1, grip), grip])).sort((a, b) => a - b);

  let inv = 0;
  for (let i = 0; i < bounds.length - 1; i++) {
    const a = bounds[i];
    const b = bounds[i + 1];
    const t = b - a;
    if (t <= 1e-12) continue;
    // Small end of this frustum sits toward the nearer bearing face.
    const inTop = b <= grip / 2 + 1e-12;
    const dist = inTop ? a : grip - b;
    const D = dw + 2 * dist * CONE_TAN;
    const E = ((a + b) / 2 <= t1 ? E1Gpa : E2Gpa) * 1e9;
    const num = (2 * t * CONE_TAN + D - d) * (D + d);
    const den = (2 * t * CONE_TAN + D + d) * (D - d);
    inv += Math.log(num / den) / (Math.PI * E * d * CONE_TAN);
  }
  return inv > 0 ? 1 / inv : Infinity;
}

export type JointResults = BoltResults & {
  kb: number; // bolt stiffness, N/m
  km: number; // member (plate stack) stiffness, N/m
  C: number; // load-sharing factor kb/(kb+km)
  Fb: number; // bolt force with external load applied, N
  Fm: number; // remaining clamp force at the interface, N (<0 = separated)
  Psep: number; // external load at which the joint separates, N
  nSep: number; // separation safety factor
  sigmaWork: number; // working bolt stress after torsion relaxes, Pa
  nYieldWork: number; // yield SF in the working state
  pHead: number; // bearing pressure under head/nut, Pa
  nBear1: number; // bearing SF vs plate 1 (head side) permissible pressure
  nBear2: number; // bearing SF vs plate 2 (nut side)
  pInt: number; // mean pressure at the plate/plate interface, Pa
  DiMm: number; // pressure-cone diameter at the interface, mm
  dLm: number; // member (plate) compression at preload, m
};

// Full bolted-joint model: tightening (boltResults) + the clamped "sandwich":
// bolt and plates as springs in parallel sharing an external tensile load P.
export function jointResults(
  thread: ThreadSpec,
  cls: BoltClass,
  K: number,
  T: number,
  t1Mm: number,
  m1: PlateMaterial,
  t2Mm: number,
  m2: PlateMaterial,
  Pext: number,
): JointResults {
  const gripMm = Math.max(t1Mm, 0) + Math.max(t2Mm, 0);
  const base = boltResults(thread, cls, K, T, gripMm);
  const d = thread.d / 1000;
  const As = thread.As * 1e-6;
  const grip = gripMm / 1000;

  // Springs: the bolt stretches, the plate stack compresses. Fully-threaded
  // fastener assumed, so the bolt spring uses the stress area over the grip.
  const kb = grip > 0 ? (cls.E * 1e9 * As) / grip : Infinity;
  const km = memberStiffness(thread.d, t1Mm, m1.E, t2Mm, m2.E);
  const C = kb / (kb + km);

  const Fi = base.F;
  const P = Math.max(0, Pext);
  const Fb = Fi + C * P; // bolt picks up only its stiffness share of P
  const Fm = Fi - (1 - C) * P; // the rest unloads the clamped plates
  const Psep = 1 - C > 0 ? Fi / (1 - C) : Infinity;
  const nSep = P > 0 ? Psep / P : Infinity;

  // Working state: thread-friction torsion relaxes after the wrench lets go,
  // so service is checked on direct tension (incl. the external-load share).
  const sigmaWork = As > 0 ? Fb / As : 0;
  const nYieldWork = sigmaWork > 0 ? (cls.sy * 1e6) / sigmaWork : Infinity;

  // Bearing (crushing) under the head / nut annulus.
  const dw = DW_RATIO * d;
  const dh = DHOLE_RATIO * d;
  const Abear = (Math.PI / 4) * (dw * dw - dh * dh);
  const pHead = Abear > 0 ? Math.max(Fi, Fb) / Abear : 0;
  const nBear1 = pHead > 0 ? (m1.pG * 1e6) / pHead : Infinity;
  const nBear2 = pHead > 0 ? (m2.pG * 1e6) / pHead : Infinity;

  // Mean pressure where the two plates meet: clamp force over the cone's
  // annular footprint at the interface depth.
  const distI = Math.min(t1Mm, t2Mm) / 1000; // interface depth from nearer face
  const Di = dw + 2 * distI * CONE_TAN;
  const Ai = (Math.PI / 4) * (Di * Di - dh * dh);
  const pInt = Ai > 0 ? Math.max(0, Fm) / Ai : 0;

  const dLm = isFinite(km) && km > 0 ? Fi / km : 0;

  return {
    ...base,
    kb,
    km,
    C,
    Fb,
    Fm,
    Psep,
    nSep,
    sigmaWork,
    nYieldWork,
    pHead,
    nBear1,
    nBear2,
    pInt,
    DiMm: Di * 1000,
    dLm,
  };
}
