// Shared fastener data and tightening formulas — the single source of truth for
// every calculator in the toolkit that turns a wrench torque into a preload.
//
// This module exists because the bolt calculator and the cylinder clamp used to
// keep their own copies of the thread table, the property classes, the nut
// factors and the bearing geometry. The numbers happened to agree, but the
// FORMULAS had drifted: one kept a 10% margin below the permissible bearing
// pressure and the other went right up to it, and only one of them knew about
// washers. Same M5 8.8 into the same polymer, and the two tools disagreed by
// 2.7×. Anything that feeds a torque recommendation now lives here, so the
// only way they can differ is if the inputs genuinely differ.
//
// Units: mm, N, MPa (N/mm²) — torque crosses the boundary in N·m.
// Reference values (ISO 898-1, Shigley, VDI 2230) — verify before production.

export type ThreadSpec = { d: number; p: number; As: number };

// ISO metric coarse threads: nominal diameter d and pitch p in mm, tensile
// stress area As in mm² (ISO 898-1 tabulated values).
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

// Bolt property classes: proof / yield / ultimate in MPa, Young's modulus in
// GPa. sp = proof strength, sy = 0.2% offset yield; both are tabulated in
// ISO 898-1, where proof runs 0.88–0.91 of yield.
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

// Nut factor K for T = K·F·d. K lumps thread and under-head friction together
// with the thread incline; real joints scatter ±25% around these.
export const NUT_FACTORS: Record<string, number> = {
  "Dry steel, plain (K ≈ 0.20)": 0.2,
  "Zinc plated, dry (K ≈ 0.22)": 0.22,
  "Oiled (K ≈ 0.15)": 0.15,
  "Moly / anti-seize (K ≈ 0.12)": 0.12,
};

// Preload target as a fraction of proof strength. Shigley recommends 0.75 for
// reused connections and 0.90 for permanent ones; 0.65 is this toolkit's own
// conservative choice, chosen because these calculators are aimed at printed
// and light-alloy parts where the joint, not the bolt, is usually the weak
// side. It is not a quotation from Shigley — see the preload theory page.
export const TARGET_PRELOAD_FRACTION = 0.65;

// Keep the recommendation itself clear of the bearing limit, so a torque this
// module suggests is never simultaneously flagged as crushing the material.
export const BEARING_MARGIN = 0.9;

// Under-head geometry as multiples of the nominal diameter: plain hex/socket
// washer face, a plain washer's outer face, and a normal-fit clearance hole.
export const DW_RATIO = 1.5;
export const DW_WASHER_RATIO = 2.2;
export const DHOLE_RATIO = 1.06;

// Bearing (washer-face) annulus under the head or nut, mm². A washer spreads
// the same preload over ~3.3× the area, which is exactly why the two
// calculators used to disagree — the assumption has to be explicit.
export function bearingArea(dMm: number, washer = false): number {
  const dw = (washer ? DW_WASHER_RATIO : DW_RATIO) * dMm;
  return (Math.PI / 4) * (dw * dw - (DHOLE_RATIO * dMm) ** 2);
}

// The nut-factor relation, in the units the UI speaks: T[N·m] = K·F[N]·d[mm]/1000.
export function torqueForPreload(K: number, dMm: number, forceN: number): number {
  return (K * dMm * forceN) / 1000;
}

export function preloadForTorque(K: number, dMm: number, torqueNm: number): number {
  return K * dMm > 0 ? (1000 * torqueNm) / (K * dMm) : 0;
}

// Preload the FASTENER wants: TARGET_PRELOAD_FRACTION of proof on the stress area.
export function boltPreloadTarget(cls: BoltClass, thread: ThreadSpec): number {
  return TARGET_PRELOAD_FRACTION * cls.sp * thread.As;
}

// Preload the CLAMPED MATERIAL will take under the head, held BEARING_MARGIN
// clear of its permissible surface pressure.
export function bearingPreloadCap(pG: number, thread: ThreadSpec, washer = false): number {
  return BEARING_MARGIN * pG * bearingArea(thread.d, washer);
}

export type FastenerSpec = {
  d: number;
  As: number;
  Abear: number;
  F65: number; // what the bolt wants
  T65: number;
  Fbear: number; // what the clamped material allows
  Tbear: number;
  F: number; // the lesser of the two
  T: number;
  governs: "bolt proof strength" | "bearing on the clamped material";
};

// The fastener-side answer to "how tight?", identical for every calculator that
// asks it: the bolt's own preload target, capped by what the softest clamped
// material takes under the head.
export function fastenerSpec(opts: {
  thread: ThreadSpec;
  cls: BoltClass;
  K: number;
  pG: number;
  washer?: boolean;
}): FastenerSpec {
  const { thread, cls, K, pG } = opts;
  const washer = !!opts.washer;
  const F65 = boltPreloadTarget(cls, thread);
  const Fbear = bearingPreloadCap(pG, thread, washer);
  const bearingGoverns = Fbear < F65;
  const F = Math.min(F65, Fbear);
  return {
    d: thread.d,
    As: thread.As,
    Abear: bearingArea(thread.d, washer),
    F65,
    T65: torqueForPreload(K, thread.d, F65),
    Fbear,
    Tbear: torqueForPreload(K, thread.d, Fbear),
    F,
    T: torqueForPreload(K, thread.d, F),
    governs: bearingGoverns ? "bearing on the clamped material" : "bolt proof strength",
  };
}
