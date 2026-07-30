// Cylinder-clamp math: a two-piece split collar gripping a rod or tube.
//
// The chain everything hangs on (all linear in torque until the gap shuts):
//
//   wrench torque T ──► per-bolt preload F = T/(K·d)
//              F×N ──► diametral clamp force on the cylinder
//                  ──► bore pressure p = ΣF/(D·W)
//                  ──► friction grip  Fax = η·μ·π·ΣF,  Thold = Fax·D/2
//                F ──► crown & ear bending, head bearing, bolt von Mises
//              ΣF ──► tube hoop crush + ovalization (hollow only)
//        δ, δoval ──► GAP CLOSURE: once the flange faces meet, further torque
//                     is carried flange-on-flange and grip stops growing.
//          plastic ──► creep relaxes preload, so grip is reported fresh AND
//                     long-term, and the long-term figure is the design one.
//
// Units: mm, N, MPa (N/mm²). Torque in/out is N·m.
// Reference values (ISO 898-1, Shigley, VDI 2230, Roark) — verify before use.

// Threads, bolt property classes, nut factors, the bearing annulus and the
// preload target all come from the toolkit's shared fastener module, so this
// calculator and the bolted-joint calculator answer "how tight?" with the same
// numbers and the same formula. Only the clamp-specific data lives below.
import {
  BEARING_MARGIN,
  CLASSES,
  NUT_FACTORS,
  THREADS,
  TARGET_PRELOAD_FRACTION,
  bearingArea,
  fastenerSpec,
  preloadForTorque,
  torqueForPreload,
} from "./fasteners";
import type { BoltClass, FastenerSpec, ThreadSpec } from "./fasteners";

export { CLASSES, THREADS, TARGET_PRELOAD_FRACTION, bearingArea, BEARING_MARGIN };
export type { BoltClass, ThreadSpec };
export const KFACT = NUT_FACTORS;

// The clamp only offers the small end of the thread range — a split collar on a
// rod this size is not held together by M20.
export const CLAMP_THREADS = ["M3", "M4", "M5", "M6", "M8", "M10"] as const;

// Clamp-body materials. E MPa; sy = strength MPa (printed: in-plane XY);
// pG = permissible bearing pressure under the head; creep = fraction of
// preload RETAINED long-term.
export type ClampMaterial = {
  E: number;
  sy: number;
  pG: number;
  creep: number;
  printed?: boolean;
  tone: string;
};
export const CLAMP_MATS: Record<string, ClampMaterial> = {
  "PC-ABS (FDM)": { E: 1900, sy: 41, pG: 48, creep: 0.6, printed: true, tone: "#3f3b4d" },
  "PLA (FDM)": { E: 3500, sy: 50, pG: 55, creep: 0.45, printed: true, tone: "#37452f" },
  "PETG (FDM)": { E: 2000, sy: 45, pG: 50, creep: 0.55, printed: true, tone: "#31434a" },
  "ASA (FDM)": { E: 2000, sy: 42, pG: 46, creep: 0.6, printed: true, tone: "#463f33" },
  "Nylon 12 (FDM)": { E: 1500, sy: 45, pG: 50, creep: 0.55, printed: true, tone: "#3d4433" },
  "Nylon 12 (MJF)": { E: 1700, sy: 48, pG: 55, creep: 0.55, printed: true, tone: "#40462f" },
  "Aluminum 5052-H32": { E: 70300, sy: 193, pG: 250, creep: 1, tone: "#4a525a" },
  "Aluminum 6061-T6": { E: 68900, sy: 276, pG: 300, creep: 1, tone: "#4a525a" },
  "Mild steel (S235)": { E: 200000, sy: 235, pG: 490, creep: 1, tone: "#39434e" },
  "Steel (S355 / 4140N)": { E: 200000, sy: 355, pG: 760, creep: 1, tone: "#333d47" },
};

// The cylinder being clamped.
export type CylMaterial = { E: number; sy: number };
export const CYL_MATS: Record<string, CylMaterial> = {
  "Steel tube (S235 / DOM)": { E: 200000, sy: 235 },
  "Steel, alloy (S355 / 4140)": { E: 200000, sy: 355 },
  "Stainless 304 tube": { E: 193000, sy: 215 },
  "Aluminum 6061-T6": { E: 68900, sy: 276 },
  "Aluminum 6063-T5": { E: 68900, sy: 145 },
  "Hard chromed rod": { E: 200000, sy: 600 },
};

// Bore ↔ cylinder friction. Real values scatter; these are conservative.
export const MU: Record<string, number> = {
  "Printed plastic ↔ steel, dry (μ≈0.30)": 0.3,
  "Aluminum ↔ steel, dry (μ≈0.35)": 0.35,
  "Steel ↔ steel, dry (μ≈0.40)": 0.4,
  "Conservative / unsure (μ≈0.25)": 0.25,
  "Smooth or slightly oily (μ≈0.15)": 0.15,
};

export const ETA = 0.75; // contact efficiency — real bore pressure is not uniform
export const LAMBDA = 0.2; // share of clamp load treated as an ovalizing pinch
export const DW = 1.5, DW_WASHER = 2.2, DH = 1.06; // head / washer / hole ratios × d
export const DESIGN_MARGIN = 1.5; // keep the governing structural check at SF ≥ this
const NSEG = 240; // stations for the deflection integration

export type ClampInput = {
  D: number;
  hollow: boolean;
  tw: number;
  cyl: string;
  mat: string;
  W: number;
  H: number;
  e: number;
  gap: number;
  washer: boolean;
  N: number;
  thread: string;
  cls: string;
  Kname: string;
  T: number;
  muName: string;
  mu?: number;
  Freq: number;
  Treq: number;
  SFt: number;
};

export function defaults(): ClampInput {
  return {
    D: 25, hollow: true, tw: 2, cyl: "Steel tube (S235 / DOM)",
    // Body is a FLAT block set by ONE height H; both bending sections follow.
    mat: "PC-ABS (FDM)", W: 40, H: 26, e: 9, gap: 2.0, washer: true,
    N: 4, thread: "M5", cls: "8.8 (medium-carbon, Q&T)", Kname: "Dry steel, plain (K ≈ 0.20)", T: 1.2,
    muName: "Printed plastic ↔ steel, dry (μ≈0.30)", Freq: 400, Treq: 3, SFt: 2,
  };
}

export const sfStatus = (sf: number) => (sf >= 2 ? "ok" : sf >= 1.2 ? "warn" : "bad");
export const sfColor = (sf: number) => (sf >= 2 ? "#4fb477" : sf >= 1.2 ? "#d9a441" : "#d65c5c");

export function fmt(v: number, digits = 1): string {
  if (!isFinite(v)) return "∞";
  const a = Math.abs(v);
  const d = a >= 100 ? 0 : a >= 10 ? 1 : digits + 1;
  return v.toLocaleString("en-US", { maximumFractionDigits: d, minimumFractionDigits: 0 });
}

export type ClampEvent = { key: string; label: string; T: number; type: "goal" | "info" | "limit"; capped: boolean };
export type ClampWarning = { level: "bad" | "warn" | "info"; text: string };

export type ClampResult = {
  d: number; As: number; Fb: number; Ftot: number;
  sigma: number; tau: number; vm: number; SFbolt: number; Trec: number;
  b: number; sigmaF: number; SFflange: number;
  H: number; tf: number; tc: number; tcRaw: number; g2: number;
  Zc: number; Mcrown: number; sigmaCrown: number; SFcrown: number;
  aBolt: number; halfW: number;
  dfShape: (z: number) => number;
  dfSlope: (z: number) => number;
  dfNA: (z: number) => number;
  cFl: number; dFl: number;
  cOval: number; dOval: number; cClose: number; Fclose: number; Tclose: number;
  bottomed: boolean; Fcl: number; closure: number; gapRemain: number;
  p: number; sigmaCyl: number; SFcyl: number;
  dw: number; pHead: number; SFbear: number;
  Fax: number; Thold: number; FaxLT: number; TholdLT: number;
  SFslip: number; SFslipLT: number;
  events: ClampEvent[]; warns: ClampWarning[];
  SFstruct: number; governing: string;
  creep: number; printed: boolean; mu: number; K: number;
};

export function solve(inp: ClampInput): ClampResult {
  const th = THREADS[inp.thread], cl = CLASSES[inp.cls];
  const cm = CLAMP_MATS[inp.mat], cy = CYL_MATS[inp.cyl];
  const K = KFACT[inp.Kname], mu = inp.mu ?? MU[inp.muName];
  const { D, W, e, gap, N, T } = inp;

  // ── Body geometry: a FLAT block, one height dimension ──────────────────
  // H is the height above the split face. Both bending sections derive from
  // it, so they can never contradict each other:
  //   ear   tf = H              (flange face → top of the block)
  //   crown tc = gap/2 + H − R  (top of the bore → top of the block)
  const g2 = Math.max(gap, 0) / 2;
  const H = Math.max(inp.H, 0.2);
  const tf = H;
  const tcRaw = g2 + H - D / 2;
  const tc = Math.max(tcRaw, 0.05); // guard: no material left over the bore
  const tw = Math.min(inp.tw, D / 2);
  const d = th.d, As = th.As;
  const R = D / 2;

  // 1) Torque → preload, per bolt, through the shared nut-factor relation.
  const Fb = preloadForTorque(K, d, T);
  const Ftot = N * Fb;

  // 2) Bolt: direct tension plus the torsion thread friction leaves in the
  //    shank, combined von Mises against proof.
  const sigma = As > 0 ? Fb / As : 0;
  const ds = Math.sqrt((4 * As) / Math.PI);
  const tau = (16 * (0.5 * 1000 * Math.abs(T))) / (Math.PI * ds ** 3);
  const vm = Math.sqrt(sigma * sigma + 3 * tau * tau);
  const SFbolt = vm > 0 ? cl.sp / vm : Infinity;
  const Trec = torqueForPreload(K, d, TARGET_PRELOAD_FRACTION * cl.sp * As);

  // 3) Ear bending: the ear alone, a short cantilever from the bore wall to
  //    the bolt line, over the slice of width each bolt commands.
  const b = W / (N / 2);
  const Zf = (b * tf * tf) / 6;
  const sigmaF = Zf > 0 ? (Fb * e) / Zf : Infinity;
  const SFflange = sigmaF > 0 ? cm.sy / sigmaF : Infinity;

  // 4) Crown bending — the see-saw. Bolt loads at ±(R+e), bore reaction
  //    spread over ±R, so mid-span carries M = F·(e + R/2) on the crown
  //    section, which is always thinner than the ear.
  const Zc = (b * tc * tc) / 6;
  const Mcrown = Fb * (e + R / 2);
  const sigmaCrown = Zc > 0 ? Mcrown / Zc : Infinity;
  const SFcrown = sigmaCrown > 0 ? cm.sy / sigmaCrown : Infinity;

  // 5) DEFLECTION — not the ear cantilever. Symmetry fixes the half at the
  //    bore CENTRE (span a = R + e, not e), and the depth VARIES: only tc
  //    over the bore, opening to H past it, with the thin part at the root
  //    where curvature does the most work. Integrate curvature twice.
  const aBolt = R + e;
  const halfW = R + e + 1.7 * d;
  const shapeD = new Float64Array(NSEG + 1);
  const shapeT = new Float64Array(NSEG + 1);
  {
    const dz = halfW / NSEG;
    let slope = 0, defl = 0;
    for (let i = 0; i < NSEG; i++) {
      const z = (i + 0.5) * dz;
      const yLo = z < R ? Math.max(Math.sqrt(Math.max(R * R - z * z, 0)) - g2, 0) : 0;
      const hSec = Math.max(H - yLo, 0.05);
      const Iz = (b * hSec ** 3) / 12;
      let M = z < aBolt ? Fb * (aBolt - z) : 0;
      if (z < R) M -= (Fb * (R - z) ** 2) / (2 * R);
      const kappa = Iz > 0 ? M / (cm.E * Iz) : 0;
      defl += (slope + (kappa * dz) / 2) * dz;
      slope += kappa * dz;
      shapeD[i + 1] = defl;
      shapeT[i + 1] = slope;
    }
  }
  const dFl = shapeD[NSEG]; // ear-tip deflection, mm
  const cFl = Fb > 0 ? dFl / Fb : 0; // mm per N of bolt force

  const samp = (arr: Float64Array, z: number) => {
    const az = Math.min(Math.abs(z), halfW);
    const i = Math.min(Math.floor((az / halfW) * NSEG), NSEG - 1);
    const t = (az / halfW) * NSEG - i;
    return arr[i] + (arr[i + 1] - arr[i]) * t;
  };
  const dfShape = (z: number) => (dFl > 0 ? samp(shapeD, z) / dFl : 0);
  // Section rotation θ(z). Plane sections stay plane and ROTATE, which is
  // what takes the bore out of round; without it a hole keeps its radius.
  const dfSlope = (z: number) => samp(shapeT, z) * Math.sign(z || 1);
  const dfNA = (z: number) => {
    const az = Math.abs(z);
    const yLo = az < R ? Math.max(Math.sqrt(Math.max(R * R - az * az, 0)) - g2, 0) : 0;
    return (yLo + H) / 2;
  };

  // 6) Hollow cylinders ovalize under the diametral pinch. Ring model, only
  //    the non-uniform share λ bends it — uniform pressure is pure hoop.
  const Rm = (D - tw) / 2;
  const Iring = tw ** 3 / 12;
  const cOval = inp.hollow && W > 0 && cy.E > 0 && Iring > 0
    ? (0.149 * LAMBDA * Rm ** 3) / (cy.E * Iring) / W
    : 0;

  // 7) GAP CLOSURE. Both halves deflect, so the faces approach by 2δ, plus
  //    the tube's ovalization. Once consumed, grip stops growing.
  const cClose = cOval + (2 * cFl) / N;
  const Fclose = cClose > 0 ? gap / cClose : Infinity;
  const bottomed = Ftot > Fclose;
  const Fcl = Math.min(Ftot, Fclose);
  const Tclose = Ftot > 0 ? (T * Fclose) / Ftot : Infinity;
  const closure = cClose * Fcl;
  const gapRemain = Math.max(0, gap - cClose * Ftot);
  const dOval = cOval * Fcl;

  // 8) Bore pressure and the cylinder's own stress.
  const p = D > 0 && W > 0 ? Fcl / (D * W) : 0;
  let sigmaCyl: number;
  if (inp.hollow) {
    const hoop = tw > 0 ? (p * Rm) / tw : Infinity;
    const q = W > 0 ? Fcl / W : 0;
    const bendC = tw > 0 ? (6 * (0.182 * LAMBDA * q * Rm)) / (tw * tw) : Infinity;
    sigmaCyl = hoop + bendC;
  } else {
    sigmaCyl = p; // conformal bore: a bearing-style check
  }
  const SFcyl = sigmaCyl > 0 ? cy.sy / sigmaCyl : Infinity;

  // 9) Bearing under the head/nut — the printed-part killer.
  const dw = (inp.washer ? DW_WASHER : DW) * d;
  const Abear = (Math.PI / 4) * (dw * dw - (DH * d) ** 2);
  const pHead = Abear > 0 ? Fb / Abear : Infinity;
  const SFbear = pHead > 0 ? cm.pG / pHead : Infinity;

  // 10) Grip: friction only, fresh and after creep relaxes the preload.
  const Fax = ETA * mu * Math.PI * Fcl;
  const Thold = (Fax * (D / 2)) / 1000;
  const FaxLT = Fax * cm.creep;
  const TholdLT = Thold * cm.creep;

  const util = (fa: number, thold: number) =>
    (inp.Freq > 0 && fa > 0 ? inp.Freq / fa : inp.Freq > 0 ? Infinity : 0) +
    (inp.Treq > 0 && thold > 0 ? inp.Treq / thold : inp.Treq > 0 ? Infinity : 0);
  const U = util(Fax, Thold), ULT = util(FaxLT, TholdLT);
  const SFslip = U > 0 ? 1 / U : Infinity;
  const SFslipLT = ULT > 0 ? 1 / ULT : Infinity;

  // 11) Event ladder — the torque at which each thing happens.
  const lin = (limit: number, cur: number) => (cur > 0 && T > 0 ? (T * limit) / cur : Infinity);
  const capped = (t: number) => t > Tclose + 1e-9;
  const Tgoal = SFslipLT > 0 && isFinite(SFslipLT) ? (T * inp.SFt) / SFslipLT : Infinity;
  const events: ClampEvent[] = ([
    { key: "goal", label: `Grip goal met (SF ${inp.SFt}, long-term)`, T: Tgoal, type: "goal", capped: capped(Tgoal) },
    { key: "gap", label: "Flange gap closes — grip stops growing", T: Tclose, type: "info", capped: false },
    { key: "bear", label: inp.washer ? "Bearing limit under washer" : "Head crushes clamp surface", T: lin(cm.pG, pHead), type: "limit", capped: false },
    { key: "flange", label: "Ear bending hits clamp yield", T: lin(cm.sy, sigmaF), type: "limit", capped: false },
    { key: "crown", label: "Cap crown yields over the bore", T: lin(cm.sy, sigmaCrown), type: "limit", capped: false },
    { key: "cyl", label: inp.hollow ? "Tube wall yields (crush/ovalization)" : "Bore pressure hits cylinder yield", T: lin(cy.sy, sigmaCyl), type: "limit", capped: capped(lin(cy.sy, sigmaCyl)) },
    { key: "bolt", label: "Bolt hits proof (von Mises)", T: lin(cl.sp, vm), type: "limit", capped: false },
  ] as ClampEvent[]).sort((a, b) => a.T - b.T);

  // 12) Warnings.
  const warns: ClampWarning[] = [];
  if (tcRaw < 0.5)
    warns.push({ level: "bad", text: `Only ${fmt(Math.max(tcRaw, 0), 2)} mm of material sits over the bore. Body height H must exceed the bore radius ${fmt(R, 1)} mm by a useful margin — raise H or shrink the bore.` });
  if (bottomed)
    warns.push({ level: "bad", text: `Flange faces are bottomed out: past ${fmt(Tclose, 2)} N·m per bolt, extra torque clamps flange-on-flange instead of gripping the cylinder. Widen the gap or accept the grip plateau.` });
  else if (gapRemain < 0.25 * gap)
    warns.push({ level: "warn", text: `Only ${fmt(gapRemain, 2)} mm of the ${fmt(gap, 2)} mm flange gap remains — close to bottoming.` });
  if (SFbear < 1.2 && !inp.washer)
    warns.push({ level: "warn", text: "The bolt head is crushing the clamp surface — add washers and re-check." });
  if (SFcrown < 1.2)
    warns.push({ level: "bad", text: "The crown is at or over yield — it bends over the cylinder like a see-saw. Raise the body height H, or bring the bolts closer to the bore." });
  if (SFflange < 1.2)
    warns.push({ level: "bad", text: "Ear bending is at or over yield — raise H, shorten the bolt offset e, or add bolts." });
  if (cm.printed) {
    warns.push({ level: "info", text: `Printed body: expect about ${fmt((1 - cm.creep) * 100, 0)}% preload lost to creep. Long-term grip already includes it; re-torque after 24 h.` });
    warns.push({ level: "info", text: "Print orientation: stand the part on end, bore axis vertical, so bolt tension and crown bending are both in-plane rather than pulling layers apart." });
  }
  if (inp.hollow && tw < D / 16)
    warns.push({ level: "warn", text: `Thin wall (${fmt(tw, 2)} mm on Ø${fmt(D, 1)}): the tube may dent or ovalize before the clamp is the limit.` });
  warns.push({ level: "info", text: "K and μ each scatter ±25% between real joints — treat grip as a band, not a line." });

  const SFstruct = Math.min(SFbolt, SFflange, SFcrown, SFbear, SFcyl);
  const governing =
    SFstruct === SFflange ? "ear bending"
      : SFstruct === SFcrown ? "crown bending"
        : SFstruct === SFbear ? "head bearing"
          : SFstruct === SFcyl ? (inp.hollow ? "tube wall" : "bore pressure")
            : "bolt proof";

  return {
    d, As, Fb, Ftot, sigma, tau, vm, SFbolt, Trec,
    b, sigmaF, SFflange,
    H, tf, tc, tcRaw, g2, Zc, Mcrown, sigmaCrown, SFcrown,
    aBolt, halfW, dfShape, dfSlope, dfNA,
    cFl, dFl, cOval, dOval, cClose, Fclose, Tclose, bottomed, Fcl, closure, gapRemain,
    p, sigmaCyl, SFcyl, dw, pHead, SFbear,
    Fax, Thold, FaxLT, TholdLT, SFslip, SFslipLT,
    events, warns, SFstruct, governing,
    creep: cm.creep, printed: !!cm.printed, mu, K,
  };
}

// ── Fastener-side tightening spec ────────────────────────────────────────
// The classic bolted-joint answer: what suits THIS fastener, capped by what
// the connected material takes under the head. Independent of the clamp's
// bending checks — a plastic body usually needs far less.
export type BoltSpec = FastenerSpec & {
  dw: number; pG: number; sp: number; K: number;
};

export function boltSpec(inp: ClampInput): BoltSpec {
  // Straight through to the shared fastener spec — this is the number the
  // bolted-joint calculator shows for the same thread, grade, finish and
  // permissible bearing pressure, and it has to stay that way.
  const spec = fastenerSpec({
    thread: THREADS[inp.thread],
    cls: CLASSES[inp.cls],
    K: KFACT[inp.Kname],
    pG: CLAMP_MATS[inp.mat].pG,
    washer: inp.washer,
  });
  return {
    ...spec,
    dw: (inp.washer ? DW_WASHER : DW) * spec.d,
    pG: CLAMP_MATS[inp.mat].pG,
    sp: CLASSES[inp.cls].sp,
    K: KFACT[inp.Kname],
  };
}

// ── Recommended torque ───────────────────────────────────────────────────
// Answers "how tight?" from all three sides at once: the BOLT (proof), the
// MATERIALS (whichever check yields first) and the GEOMETRY (never past the
// torque that shuts the gap, because grip stops growing there).
export type Recommendation = {
  T: number; Tyield: number; Tclose: number; Tbolt65: number; Tneed: number;
  governing: string; limits: { key: string; T: number }[]; ok: boolean; margin: number;
};

export function recommend(inp: ClampInput, margin = DESIGN_MARGIN): Recommendation {
  const probe = solve({ ...inp, T: 1 }); // every stress is linear in torque
  const cm = CLAMP_MATS[inp.mat], cy = CYL_MATS[inp.cyl], cl = CLASSES[inp.cls];
  const at = (allow: number, per: number) => (per > 0 ? allow / per : Infinity);

  const limits = [
    { key: "crown bending", T: at(cm.sy, probe.sigmaCrown) },
    { key: "ear bending", T: at(cm.sy, probe.sigmaF) },
    { key: inp.washer ? "bearing under washer" : "bearing under bolt head", T: at(cm.pG, probe.pHead) },
    { key: inp.hollow ? "tube wall" : "bore pressure", T: at(cy.sy, probe.sigmaCyl) },
    { key: "bolt proof", T: at(cl.sp, probe.vm) },
  ].sort((a, b) => a.T - b.T);

  const Tyield = limits[0].T;
  const Tclose = probe.Tclose;
  const Tbolt65 = probe.Trec;
  const T = Math.min(Tyield / margin, Tbolt65, Tclose);
  const governing =
    T === Tclose ? "flange gap closes"
      : T === Tbolt65 ? "bolt preload target (65% proof)"
        : limits[0].key;

  const demand = Math.max(0, inp.Freq) + (inp.D > 0 ? (2000 * Math.max(0, inp.Treq)) / inp.D : 0);
  const mu = inp.mu ?? MU[inp.muName];
  const FclReq = (inp.SFt * demand) / (ETA * mu * Math.PI * cm.creep);
  const Tneed = probe.Fb > 0 ? FclReq / (inp.N * probe.Fb) : Infinity;

  return { T: Math.max(T, 0), Tyield, Tclose, Tbolt65, Tneed, governing, limits, ok: T >= Tneed, margin };
}

// ── Curved-beam cross-check on the crown ─────────────────────────────────
// The crown is a curved segment centred on the bore, not a straight beam.
// Straight-beam theory puts the neutral axis at mid-depth; in a curved member
// it shifts toward the bore and the distribution goes hyperbolic. The gap
// between the two measures how biased the main model is.
export type CurvedBeam = {
  ri: number; ro: number; h: number; rn: number; rc: number; ecc: number;
  roRi: number; slenderness: number;
  sigIn: number; sigOut: number; sigStraight: number; ratioIn: number; ratioOut: number;
};

export function curvedBeam(inp: ClampInput, res: ClampResult): CurvedBeam | null {
  const ri = inp.D / 2, ro = ri + res.tc, h = res.tc, A = res.b * h;
  if (!(ri > 0 && ro > ri && A > 0)) return null;
  const rn = h / Math.log(ro / ri);
  const rc = (ri + ro) / 2;
  const ecc = rc - rn;
  if (!(ecc > 1e-9)) return null;
  const perIn = (rn - ri) / (A * ecc * ri);
  const perOut = Math.abs(rn - ro) / (A * ecc * ro);
  const perStraight = h / 2 / ((res.b * h ** 3) / 12);
  return {
    ri, ro, h, rn, rc, ecc, roRi: ro / ri, slenderness: rc / h,
    sigIn: res.Mcrown * perIn, sigOut: res.Mcrown * perOut, sigStraight: res.Mcrown * perStraight,
    ratioIn: perIn / perStraight, ratioOut: perOut / perStraight,
  };
}

// ── Signed bending stress anywhere on the body section ───────────────────
// Drives the smooth tension/compression colouring. Hogging over the bore puts
// the OUTER surface in tension and the bore surface in compression.
// z from the bore centre, y above the flange face. Returns σ/σyield.
export function bodyStressRatio(inp: ClampInput, res: ClampResult, z: number, y: number): number {
  const R = inp.D / 2, a = R + inp.e, F = res.Fb, az = Math.abs(z);
  if (az >= a || F <= 0) return 0;
  let M = F * (a - az);
  if (az < R) M -= (F * (R - az) ** 2) / (2 * R);
  const yLo = az < R ? Math.max(Math.sqrt(Math.max(R * R - az * az, 0)) - res.g2, 0) : 0;
  const h = Math.max(res.H - yLo, 1e-6);
  const yn = (yLo + res.H) / 2;
  const I = (res.b * h ** 3) / 12;
  const sig = I > 0 ? (M * (y - yn)) / I : 0;
  return sig / (CLAMP_MATS[inp.mat].sy || 1);
}

// Stress ramp: neutral green → amber → red in tension, green → teal → blue in
// compression. Matches the toolkit's other 3D viewers.
const NEUTRAL: [number, number, number] = [0.31, 0.706, 0.467];
const T_STOPS: [number, [number, number, number]][] = [
  [0, NEUTRAL], [0.5, [0.85, 0.55, 0.22]], [1, [0.84, 0.27, 0.27]], [1.4, [1, 0.3, 0.3]],
];
const C_STOPS: [number, [number, number, number]][] = [
  [0, NEUTRAL], [0.5, [0.2, 0.58, 0.68]], [1, [0.27, 0.46, 0.9]], [1.4, [0.3, 0.4, 1]],
];
function ramp(stops: [number, [number, number, number]][], x: number): [number, number, number] {
  const xc = Math.max(0, Math.min(stops[stops.length - 1][0], x));
  for (let i = 1; i < stops.length; i++) {
    const [p1, c1] = stops[i];
    if (xc <= p1) {
      const [p0, c0] = stops[i - 1];
      const t = (xc - p0) / (p1 - p0 || 1);
      return [c0[0] + (c1[0] - c0[0]) * t, c0[1] + (c1[1] - c0[1]) * t, c0[2] + (c1[2] - c0[2]) * t];
    }
  }
  return stops[stops.length - 1][1];
}
export const stressRGB = (signed: number): [number, number, number] =>
  signed >= 0 ? ramp(T_STOPS, signed) : ramp(C_STOPS, -signed);
