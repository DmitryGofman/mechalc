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

import { MM_PER_IN, MPA_PER_KSI } from "./units";

export type ThreadSeries = "ISO metric coarse" | "UNC" | "UNF";

// A thread is always stored in mm / mm², whichever series it belongs to, so
// every formula in this module stays single-system. `tpi` is carried for the
// inch series because threads per inch — not a pitch in mm — is how those
// fasteners are designated.
export type ThreadSpec = { d: number; p: number; As: number; tpi?: number; series?: ThreadSeries };

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

// Unified inch threads (ASME B1.1): nominal diameter in inches and tensile
// stress area in in², converted here to the module's mm / mm² so they drop
// into the same formulas as the metric sizes. UNC is the coarse series, UNF
// the fine one — a UNF thread of the same nominal Ø has a slightly larger
// stress area, so it is marginally stronger in tension and rather more prone
// to galling and stripping in soft material.
const inchThread = (dIn: number, tpi: number, AsIn2: number, series: "UNC" | "UNF"): ThreadSpec => ({
  d: dIn * MM_PER_IN,
  p: MM_PER_IN / tpi,
  As: AsIn2 * MM_PER_IN * MM_PER_IN,
  tpi,
  series,
});

export const UNIFIED_THREADS: Record<string, ThreadSpec> = {
  "#4-40 UNC": inchThread(0.112, 40, 0.00604, "UNC"),
  "#6-32 UNC": inchThread(0.138, 32, 0.00909, "UNC"),
  "#8-32 UNC": inchThread(0.164, 32, 0.014, "UNC"),
  "#10-24 UNC": inchThread(0.19, 24, 0.0175, "UNC"),
  "#10-32 UNF": inchThread(0.19, 32, 0.02, "UNF"),
  '1/4"-20 UNC': inchThread(0.25, 20, 0.0318, "UNC"),
  '1/4"-28 UNF': inchThread(0.25, 28, 0.0364, "UNF"),
  '5/16"-18 UNC': inchThread(0.3125, 18, 0.0524, "UNC"),
  '5/16"-24 UNF': inchThread(0.3125, 24, 0.058, "UNF"),
  '3/8"-16 UNC': inchThread(0.375, 16, 0.0775, "UNC"),
  '3/8"-24 UNF': inchThread(0.375, 24, 0.0878, "UNF"),
  '7/16"-14 UNC': inchThread(0.4375, 14, 0.1063, "UNC"),
  '1/2"-13 UNC': inchThread(0.5, 13, 0.1419, "UNC"),
  '1/2"-20 UNF': inchThread(0.5, 20, 0.1599, "UNF"),
  '5/8"-11 UNC': inchThread(0.625, 11, 0.226, "UNC"),
  '3/4"-10 UNC': inchThread(0.75, 10, 0.334, "UNC"),
};

export const isInchThread = (t: ThreadSpec) => t.series === "UNC" || t.series === "UNF";

// How a thread wants to be written in a dropdown: metric by pitch, inch by
// threads per inch (already in the key, so the label only adds the series).
export const threadLabel = (key: string, t: ThreadSpec) =>
  isInchThread(t) ? `${key} — ${t.tpi} TPI` : `${key} × ${t.p}`;

// The nearest thread in another series, matched on tensile stress area — the
// property that actually decides how much load the fastener carries. Used to
// offer "the inch size closest to your M6" when the units are switched.
export function nearestThread(As: number, table: Record<string, ThreadSpec>): string {
  return Object.keys(table).reduce((best, k) =>
    Math.abs(table[k].As - As) < Math.abs(table[best].As - As) ? k : best,
  );
}

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

// Inch fastener grades, SAE J429 — proof / yield / tensile are tabulated in
// ksi and converted here, so the solver never sees an imperial number. Unlike
// ISO's classes, the SAE grades are size-dependent: the figures below are for
// the size ranges these threads fall in (Grade 2 to 3/4", Grades 5 and 8 to
// 1"). Larger diameters are derated and are not covered here.
const sae = (spKsi: number, syKsi: number, suKsi: number, E = 200, note?: string): BoltClass => ({
  sp: spKsi * MPA_PER_KSI,
  sy: syKsi * MPA_PER_KSI,
  su: suKsi * MPA_PER_KSI,
  E,
  note,
});

export const SAE_CLASSES: Record<string, BoltClass> = {
  "SAE Grade 2 (low-carbon steel)": sae(55, 57, 74),
  "SAE Grade 5 (medium-carbon, Q&T)": sae(85, 92, 120),
  "SAE Grade 8 (alloy steel, Q&T)": sae(120, 130, 150),
  "18-8 stainless (ASTM F593 CW)": sae(
    58.5,
    65,
    100,
    193,
    "No tabulated proof load — 0.9·yield assumed; galls easily, lubricate",
  ),
};

// Roughly matched grades, used to keep the property class sensible when the
// thread is switched between series. The two standards line up more closely
// than they have any right to — Grade 5 is 85 ksi of proof against class
// 8.8's 580 MPa (84.1 ksi), and Grade 8's 120 ksi is 827 MPa against 10.9's
// 830 — but this is still a convenience default, not an equivalence claim.
export const CLASS_EQUIVALENT: Record<string, string> = {
  "4.8 (low-carbon steel)": "SAE Grade 2 (low-carbon steel)",
  "5.8 (low-carbon steel)": "SAE Grade 2 (low-carbon steel)",
  "8.8 (medium-carbon, Q&T)": "SAE Grade 5 (medium-carbon, Q&T)",
  "10.9 (alloy steel, Q&T)": "SAE Grade 8 (alloy steel, Q&T)",
  "12.9 (alloy steel, Q&T)": "SAE Grade 8 (alloy steel, Q&T)",
  "A2-70 (stainless 18-8)": "18-8 stainless (ASTM F593 CW)",
  "SAE Grade 2 (low-carbon steel)": "5.8 (low-carbon steel)",
  "SAE Grade 5 (medium-carbon, Q&T)": "8.8 (medium-carbon, Q&T)",
  "SAE Grade 8 (alloy steel, Q&T)": "10.9 (alloy steel, Q&T)",
  "18-8 stainless (ASTM F593 CW)": "A2-70 (stainless 18-8)",
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
