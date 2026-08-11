// Pin / bolt loaded in SHEAR through a stack of flanges — the classic clevis
// or lap joint of Shigley ch. 8 (Fig. 8-23: modes of failure in shear loading
// of a bolted or riveted connection; Fig. 8-25: edge shearing of the member).
//
// Two configurations:
//   3 flanges → CLEVIS,    double shear (2 shear planes, symmetric load path)
//   2 flanges → LAP JOINT, single shear (1 shear plane, offset load path)
//
// Every check is LINEAR in the applied load F, so the solver works in
// "stress per newton" and gets both the stress at F and the load at which each
// mode lets go from the same number. That is what makes the capacity ladder
// exact rather than a search, and it stays well-defined at F = 0.
//
//   F ──► pin shear     τ = F/(n·A)            vs Ssy = 0.577·Sy   (8-23c)
//     ──► pin bending   σ = 32M/πd³ (clevis)   vs Sy               (8-23b)
//     ──► bearing       p = Fᵢ/(d·t)           vs pb, both parts   (8-23e, 8-55)
//     ──► net section   σ = Fᵢ/((w−d)·t)       vs Sy               (8-23d, 8-54)
//     ──► edge tear-out τ = Fᵢ/(2·t·(a−d/2))   vs Ssy              (8-23f/g, 8-25)
//
// Units: mm, N, MPa (N/mm²). Reference-quality typical values — verify before
// production use.

import { CLASSES } from "./fasteners";
import { rampColor, NEUTRAL_RGB, type Stops } from "./stressColor";

// Distortion-energy shear yield: Ssy = 0.577·Sy.
export const SHEAR_YIELD = 0.577;

// Bearing on a projected area yields later than the same material in simple
// tension — the loaded material is confined by what surrounds it. 1.5·Sy is the
// usual allowance for ductile metals, and it is what every metal row below
// derives its permissible bearing pressure from, so the table cannot drift out
// of step with its own yield strengths. Polymers and laminates do NOT follow
// it: their bearing limit is creep-driven and far lower relative to yield, so
// those rows state pb explicitly.
export const BEARING_FACTOR = 1.5;

// Structural practice keeps the hole at least this many diameters from the
// loaded edge, which is what makes edge shearing "usually neglected" (Shigley
// §8-11). Below it, tear-out is a live failure mode and the solver says so.
export const MIN_EDGE_RATIO = 1.5;

export type PinMaterial = {
  Sy: number;   // yield strength, MPa
  Su: number;   // ultimate tensile strength, MPa
  pb?: number;  // permissible bearing pressure, MPa (defaults to 1.5·Sy)
  printed?: boolean; // 3D-printed: in-plane (XY) values, creeps, layer-sensitive
  tone: string; // base colour in the 3D view
};

// A bolt used as a shear pin is the same steel the toolkit already tabulates,
// so the property classes come from the shared fastener table rather than a
// second copy that could disagree with the bolted-joint calculator.
const boltPin = (cls: keyof typeof CLASSES | string, tone: string): PinMaterial => ({
  Sy: CLASSES[cls].sy,
  Su: CLASSES[cls].su,
  tone,
});

export const PIN_MATS: Record<string, PinMaterial> = {
  "Mild steel pin (S235 / A36)": { Sy: 235, Su: 360, tone: "#39434e" },
  "Medium-carbon (C45 / 1045)": { Sy: 340, Su: 620, tone: "#39434e" },
  "Alloy steel Q&T (4140)": { Sy: 655, Su: 900, tone: "#333d47" },
  "Hardened dowel pin (DIN 6325)": { Sy: 1200, Su: 1500, tone: "#2e3842" },
  "Bolt, class 8.8": boltPin("8.8 (medium-carbon, Q&T)", "#333d47"),
  "Bolt, class 10.9": boltPin("10.9 (alloy steel, Q&T)", "#2e3842"),
  "Bolt, A2-70 stainless": boltPin("A2-70 (stainless 18-8)", "#414c56"),
  "Titanium Grade 5 (Ti-6Al-4V)": { Sy: 880, Su: 950, tone: "#3d4550" },
  "Aluminum 7075-T6": { Sy: 503, Su: 572, tone: "#4a525a" },
  "Aluminum 6061-T6": { Sy: 276, Su: 310, tone: "#4a525a" },
  "Brass (CuZn39Pb3)": { Sy: 160, Su: 400, tone: "#4e4a38" },
  // Printed pins. Same in-plane (XY) figures the rest of the toolkit uses, with
  // the creep-limited bearing pressure — see the printed-pin warning in solve():
  // a pin printed standing up puts its shear planes on layer boundaries, which
  // is the worst thing you can do to it.
  "PLA (FDM)": { Sy: 50, Su: 50, pb: 55, printed: true, tone: "#37452f" },
  "PETG (FDM)": { Sy: 45, Su: 45, pb: 50, printed: true, tone: "#31434a" },
  "ABS (FDM)": { Sy: 40, Su: 40, pb: 45, printed: true, tone: "#453b33" },
  "ASA (FDM)": { Sy: 42, Su: 42, pb: 46, printed: true, tone: "#463f33" },
  "PC-ABS (FDM)": { Sy: 41, Su: 41, pb: 48, printed: true, tone: "#3f3b4d" },
  "Polycarbonate (FDM)": { Sy: 57, Su: 57, pb: 62, printed: true, tone: "#354350" },
  "Nylon 12 / PA12 (FDM)": { Sy: 45, Su: 45, pb: 50, printed: true, tone: "#3d4433" },
  "Nylon 12 CF (FDM)": { Sy: 70, Su: 70, pb: 75, printed: true, tone: "#3a3f44" },
  "PA12 (MJF)": { Sy: 48, Su: 48, pb: 55, printed: true, tone: "#40462f" },
};

export type PlateMaterial = {
  E: number;    // MPa — for deformation hints only, no stiffness check here
  Sy: number;   // in-plane yield (FDM: XY), MPa
  Su: number;
  pb?: number;  // permissible bearing on the hole wall (defaults to 1.5·Sy)
  printed?: boolean;
  tone: string;
};

export const PLATE_MATS: Record<string, PlateMaterial> = {
  "Mild steel (S235 / A36)": { E: 200000, Sy: 235, Su: 360, tone: "#39434e" },
  "Steel (S355 / 4140N)": { E: 200000, Sy: 355, Su: 520, tone: "#333d47" },
  "Stainless 304": { E: 193000, Sy: 215, Su: 505, tone: "#414c56" },
  "Aluminum 6061-T6": { E: 68900, Sy: 276, Su: 310, tone: "#4a525a" },
  "Aluminum 5052-H32": { E: 70300, Sy: 193, Su: 228, tone: "#4a525a" },
  "Brass (CuZn37)": { E: 97000, Sy: 120, Su: 340, tone: "#4e4a38" },
  // Laminate and polymers: bearing is creep-limited, well under 1.5·Sy.
  "FR-4 / G10 (in-plane)": { E: 24000, Sy: 260, Su: 320, pb: 240, tone: "#3a4a3a" },
  "PLA (FDM)": { E: 3500, Sy: 50, Su: 50, pb: 55, printed: true, tone: "#37452f" },
  "PETG (FDM)": { E: 2000, Sy: 45, Su: 45, pb: 50, printed: true, tone: "#31434a" },
  "ABS (FDM)": { E: 2000, Sy: 40, Su: 40, pb: 45, printed: true, tone: "#453b33" },
  "ASA (FDM)": { E: 2000, Sy: 42, Su: 42, pb: 46, printed: true, tone: "#463f33" },
  "PC-ABS (FDM)": { E: 1900, Sy: 41, Su: 41, pb: 48, printed: true, tone: "#3f3b4d" },
  "Polycarbonate (FDM)": { E: 2200, Sy: 57, Su: 57, pb: 62, printed: true, tone: "#354350" },
  "Nylon 12 / PA12 (FDM)": { E: 1500, Sy: 45, Su: 45, pb: 50, printed: true, tone: "#3d4433" },
  "Nylon 12 CF (FDM)": { E: 4000, Sy: 70, Su: 70, pb: 75, printed: true, tone: "#3a3f44" },
  "PA12 (MJF)": { E: 1700, Sy: 48, Su: 48, pb: 55, printed: true, tone: "#40462f" },
};

export const bearingAllow = (m: { Sy: number; pb?: number }) => m.pb ?? BEARING_FACTOR * m.Sy;

// What actually crosses the shear plane. A plain pin (or a bolt with its shank
// in the plane) works on the full circle; a bolt loaded through its THREADS
// has only the minor-diameter core — about 75% of the nominal area for ISO
// coarse threads across the common sizes. The same core also bends: with
// A ∝ d² and Z ∝ d³, an area factor k means a section-modulus factor k^1.5
// (0.75 → 0.65), so the selector moves the bending check too — which is the
// one that usually governs a clevis.
export const SHANKS: Record<string, { areaFactor: number }> = {
  "Plain pin / dowel (full shank)": { areaFactor: 1.0 },
  "Bolt — shank in shear plane": { areaFactor: 1.0 },
  "Bolt — threads in shear plane": { areaFactor: 0.75 },
};

export type PinConfig = 2 | 3;

export type PinInput = {
  config: PinConfig; // 3 = clevis (double shear), 2 = lap (single shear)
  d: number;         // pin OUTSIDE diameter, mm
  hollow: boolean;   // tube / rolled pin rather than solid bar
  wall: number;      // wall thickness when hollow, mm
  shank: string;
  pinMat: string;
  t1: number;        // outer plates (clevis, each) / plate A (lap), mm
  mat1: string;
  t2: number;        // middle plate (clevis) / plate B (lap), mm
  mat2: string;
  w: number;         // plate width across the hole, mm
  a: number;         // hole centre → loaded edge, mm
  clr: number;       // clevis clearance per side — the pin's bending arm, mm
  F: number;         // applied load, N
  SFt: number;       // target safety factor
};

export function defaults(): PinInput {
  return {
    config: 3,
    d: 8,
    hollow: false,
    wall: 1.5,
    shank: "Plain pin / dowel (full shank)",
    pinMat: "Alloy steel Q&T (4140)",
    t1: 6, mat1: "Aluminum 6061-T6",
    t2: 8, mat2: "Steel (S355 / 4140N)",
    w: 32, a: 12, clr: 0.2,
    F: 6000, SFt: 2,
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

// Which part a mode belongs to, so the 3D view can paint the right surfaces.
export type PinPart = "pin" | "outer" | "middle" | "plateA" | "plateB";

export type PinMode = {
  key: string;
  part: PinPart;
  label: string;
  kind: "τ" | "σ" | "p"; // what the number is, for the readouts
  perN: number;          // stress per newton of applied load, MPa/N
  stress: number;        // at the applied load, MPa
  allow: number;         // MPa
  SF: number;
  Fcap: number;          // load at which this mode reaches its allowable, N
};

export type PinMember = {
  key: PinPart;
  label: string;
  t: number;
  share: number;   // fraction of F this member puts through its own hole
  mat: PlateMaterial;
  matName: string;
  Fi: number;
  pBear: number;
  sigmaNet: number;
  tauTear: number;
  lig: number;     // net ligament to the loaded edge, mm
  SFbearPlate: number;
  SFbearPin: number;
  SFnet: number;
  SFtear: number;
  worst: number;
};

export type PinWarning = { level: "bad" | "warn" | "info"; text: string };

export type PinResult = {
  double: boolean;
  nPlanes: number;
  members: PinMember[];
  di: number;    // pin bore, mm (0 when solid)
  wall: number;  // effective wall, mm
  Apin: number;
  Ipin: number;
  Zpin: number;  // the full section
  Zeff: number;  // what actually bends — the threaded core, if that is in the joint
  Ashear: number;
  tau: number;
  Ssy: number;
  SFshear: number;
  Mpin: number;
  sigmaBend: number;
  SFbend: number;
  SFbearPinAll: number;
  modes: PinMode[];
  ladder: PinMode[]; // same modes, ordered by capacity
  SFjoint: number;
  governing: PinMode;
  Fcap: number;
  holds: boolean;
  meetsTarget: boolean;
  partSF: Record<string, number>;
  warns: PinWarning[];
  pinTone: string;
};

export function solve(inp: PinInput): PinResult {
  const pm = PIN_MATS[inp.pinMat] ?? PIN_MATS[defaults().pinMat];
  const m1 = PLATE_MATS[inp.mat1] ?? PLATE_MATS[defaults().mat1];
  const m2 = PLATE_MATS[inp.mat2] ?? PLATE_MATS[defaults().mat2];
  const sh = SHANKS[inp.shank] ?? SHANKS[defaults().shank];
  const d = Math.max(inp.d, 0.1);
  const w = Math.max(inp.w, d + 0.01);
  const a = Math.max(inp.a, 0.01);
  const F = Math.max(inp.F, 0);
  const t1 = Math.max(inp.t1, 0.1), t2 = Math.max(inp.t2, 0.1);
  const double = inp.config === 3;
  const nPlanes = double ? 2 : 1;

  // Load sharing. In double shear the middle plate carries the whole F and each
  // outer plate half of it; in a lap joint both plates carry the full F.
  const spec: Array<{ key: PinPart; label: string; t: number; share: number; mat: PlateMaterial; matName: string }> = double
    ? [
        { key: "outer", label: "outer plates (×2)", t: t1, share: 0.5, mat: m1, matName: inp.mat1 },
        { key: "middle", label: "middle plate", t: t2, share: 1.0, mat: m2, matName: inp.mat2 },
      ]
    : [
        { key: "plateA", label: "plate A", t: t1, share: 1.0, mat: m1, matName: inp.mat1 },
        { key: "plateB", label: "plate B", t: t2, share: 1.0, mat: m2, matName: inp.mat2 },
      ];

  // ── PIN SECTION ──────────────────────────────────────────────────────────
  // A hollow pin (tube, rolled spring pin, printed tube) is the same two
  // formulas with the bore taken out. The wall is clamped below d/2, so a wall
  // at or past the axis simply reads as solid rather than going negative.
  const wall = inp.hollow ? Math.min(Math.max(inp.wall, 0.01), d / 2) : d / 2;
  const di = Math.max(d - 2 * wall, 0); // bore diameter; 0 when solid
  const Apin = (Math.PI / 4) * (d * d - di * di);
  // Second moment of area, and the section modulus about the pin's own axis.
  const Ipin = (Math.PI / 64) * (d ** 4 - di ** 4);
  const Zpin = d > 0 ? Ipin / (d / 2) : 0;

  // 1) PIN SHEAR (Fig 8-23c). The shear plane is the whole annulus.
  const Ashear = Apin * sh.areaFactor;
  const tauPerN = Ashear > 0 ? 1 / (nPlanes * Ashear) : Infinity;
  const Ssy = SHEAR_YIELD * pm.Sy;

  // Threaded core bends as well as shears: an areaFactor k on d² is k^1.5 on
  // d³, so the working section modulus shrinks faster than the shear area.
  const Zeff = Zpin * sh.areaFactor ** 1.5;

  // 2) PIN BENDING (Fig 8-23b). Only meaningful in double shear, where the pin
  //    is a tiny simply-supported beam: the middle plate delivers F over t2,
  //    the outer reactions F/2 over t1, separated by the clevis clearance.
  //    Peak moment at mid-span, M = F/2·(t2/4 + clr + t1/2). In a lap joint the
  //    joint tilts instead — flagged as a warning rather than a stress, because
  //    the moment there depends on restraint this model does not know.
  //    σ = M/Z, which reduces to the familiar 32M/πd³ for a solid pin.
  const armPerN = 0.5 * (t2 / 4 + Math.max(inp.clr, 0) + t1 / 2);
  const bendPerN = double && Zeff > 0 ? armPerN / Zeff : 0;

  const modes: PinMode[] = [];
  const push = (key: string, part: PinPart, label: string, kind: PinMode["kind"], perN: number, allow: number) => {
    modes.push({
      key, part, label, kind, perN, allow,
      stress: perN * F,
      // Both are the same statement — allowable ÷ what one newton costs — but
      // SF needs a load to divide into and capacity does not.
      SF: F > 0 && perN > 0 ? allow / (perN * F) : Infinity,
      Fcap: perN > 0 ? allow / perN : Infinity,
    });
  };

  push("shear", "pin", double ? "Pin shear (2 planes)" : "Pin shear (1 plane)", "τ", tauPerN, Ssy);
  if (double) push("bend", "pin", "Pin bending (clevis beam)", "σ", bendPerN, pm.Sy);

  // 3–5) Per-member checks — projected-area and net-section formulas.
  const members: PinMember[] = spec.map((mb) => {
    const Fi = mb.share * F;
    const bearPerN = mb.share / (mb.t * d);              // 8-55: p = Fᵢ/(t·d)
    const netPerN = mb.share / (Math.max(w - d, 0.01) * mb.t); // 8-54
    const lig = Math.max(a - d / 2, 0.01);
    const tearPerN = mb.share / (2 * mb.t * lig);        // Fig 8-25, two ligaments
    const pbPlate = bearingAllow(mb.mat), pbPin = bearingAllow(pm);
    const sf = (perN: number, allow: number) => (F > 0 && perN > 0 ? allow / (perN * F) : Infinity);
    return {
      ...mb,
      Fi,
      pBear: bearPerN * F,
      sigmaNet: netPerN * F,
      tauTear: tearPerN * F,
      lig,
      SFbearPlate: sf(bearPerN, pbPlate),
      SFbearPin: sf(bearPerN, pbPin),
      SFnet: sf(netPerN, mb.mat.Sy),
      SFtear: sf(tearPerN, SHEAR_YIELD * mb.mat.Sy),
      worst: Math.min(sf(bearPerN, pbPlate), sf(netPerN, mb.mat.Sy), sf(tearPerN, SHEAR_YIELD * mb.mat.Sy)),
    };
  });

  // Bearing ON THE PIN: the worst member pressing on it, checked once.
  const worstBearPerN = Math.max(...spec.map((mb) => mb.share / (mb.t * d)));
  push("bearpin", "pin", "Bearing on the pin surface", "p", worstBearPerN, bearingAllow(pm));

  for (const mb of spec) {
    const bearPerN = mb.share / (mb.t * d);
    const netPerN = mb.share / (Math.max(w - d, 0.01) * mb.t);
    const tearPerN = mb.share / (2 * mb.t * Math.max(a - d / 2, 0.01));
    push(`bear-${mb.key}`, mb.key, `Bearing — ${mb.label}`, "p", bearPerN, bearingAllow(mb.mat));
    push(`net-${mb.key}`, mb.key, `Net-section tension — ${mb.label}`, "σ", netPerN, mb.mat.Sy);
    push(`tear-${mb.key}`, mb.key, `Edge tear-out — ${mb.label}`, "τ", tearPerN, SHEAR_YIELD * mb.mat.Sy);
  }

  const ladder = modes.slice().sort((x, y) => x.Fcap - y.Fcap);
  // The joint's capacity is the weakest mode's — a property of the joint, not
  // of the load, so it stays right at F = 0 where every SF is infinite.
  const governing = ladder[0];
  const Fcap = governing.Fcap;
  const SFjoint = F > 0 ? Fcap / F : Infinity;
  const holds = F <= Fcap;
  const meetsTarget = SFjoint >= inp.SFt;

  const partSF: Record<string, number> = {
    pin: Math.min(...modes.filter((m) => m.part === "pin").map((m) => m.SF)),
  };
  for (const mb of members) partSF[mb.key] = mb.worst;

  const warns: PinWarning[] = [];
  if (!holds)
    warns.push({ level: "bad", text: `Joint FAILS at this load: ${governing.label.toLowerCase()} gives way first (SF ${fmt(SFjoint, 2)}). Capacity ≈ ${fmt(Fcap / 1000, 2)} kN.` });
  else if (!meetsTarget)
    warns.push({ level: "warn", text: `Holds, but below your target SF ${fmt(inp.SFt, 1)} — governing mode is ${governing.label.toLowerCase()} at SF ${fmt(SFjoint, 2)}.` });
  if (a < MIN_EDGE_RATIO * d)
    warns.push({ level: "warn", text: `Edge distance a = ${fmt(a, 1)} mm is under the structural-practice minimum of ${MIN_EDGE_RATIO}·d = ${fmt(MIN_EDGE_RATIO * d, 1)} mm — the spacing that lets edge shearing be neglected. Tear-out is a live mode here.` });
  if (w < 2.5 * d)
    warns.push({ level: "warn", text: `Plate width w = ${fmt(w, 1)} mm is tight for a Ø${fmt(d, 1)} hole — the net section is only ${fmt(w - d, 1)} mm. Aim for w ≥ 2.5–3·d.` });
  if (!double)
    warns.push({ level: "info", text: "Single shear: the offset load path makes a lap joint tilt, adding secondary pin bending and prying that this model does not capture — treat the numbers as optimistic, or use the 3-flange clevis." });
  if (inp.hollow) {
    // A tube keeps most of its strength because the material near the axis was
    // barely working — worth stating, because the intuition is usually wrong.
    const solid = (Math.PI / 64) * d ** 4;
    warns.push({
      level: "info",
      text: `Hollow pin, Ø${fmt(d, 1)} × ${fmt(wall, 2)} mm wall (bore Ø${fmt(di, 1)}): it keeps ${fmt(100 * (Apin / ((Math.PI / 4) * d * d)), 0)}% of the solid shear area but ${fmt(100 * (Ipin / solid), 0)}% of the bending stiffness — the material near the axis was barely working in bending, which is why tubes lose so little.`,
    });
    if (wall < d / 8)
      warns.push({
        level: "warn",
        text: `Thin wall (${fmt(wall, 2)} mm on Ø${fmt(d, 1)}, under d/8): a thin tube dents and ovalizes under the bearing load long before the bearing pressure reaches its allowable. That local wall crushing is NOT modelled here — the bearing check assumes the pin holds its round section. Use a thicker wall, or a solid pin, where bearing governs.`,
      });
  }
  if (pm.printed) {
    warns.push({
      level: "warn",
      text: `Printed pin (${inp.pinMat}): a pin printed standing on its end has its layer boundaries lying exactly in the shear planes — the weakest possible orientation, and well below the in-plane figures used here. Print it lying down so the shear planes cut across the layers, and treat even that as an upper bound.`,
    });
    warns.push({
      level: "info",
      text: "Shear strength of a printed polymer is not really 0.577·Sy — that ratio comes from metal plasticity. It is used here for consistency; if the pin is the governing part, test a coupon rather than trusting the number.",
    });
  }
  if (inp.shank === "Bolt — threads in shear plane")
    warns.push({ level: "info", text: "Threads in the shear plane: only the minor-diameter core carries shear (~75% of the nominal area). A longer shank, a shoulder bolt, or a washer stack that moves the thread run-out clear of the joint recovers the full circle." });
  for (const mb of members)
    if (mb.mat.printed)
      warns.push({ level: "info", text: `The ${mb.label} is printed (${mb.matName}): these are in-plane (XY) values — a hole loaded across layers is far weaker. Bearing on plastic also creeps, so expect the hole to elongate under sustained load even below the limit.` });
  warns.push({ level: "info", text: "Static checks at yield onset. No stress concentration (Kt ≈ 2–3 at the hole, which governs fatigue and brittle plates) and no friction — a preloaded bolt carries shear by clamp friction until it slips; this is the slipped, bearing state (Shigley §8-12)." });

  const byKey = (k: string) => modes.find((m) => m.key === k);
  return {
    double, nPlanes, members,
    di: inp.hollow ? di : 0, wall: inp.hollow ? wall : d / 2,
    Apin, Ipin, Zpin, Zeff, Ashear,
    tau: tauPerN * F, Ssy,
    SFshear: byKey("shear")!.SF,
    Mpin: double ? F * armPerN : 0,
    sigmaBend: bendPerN * F,
    SFbend: byKey("bend")?.SF ?? Infinity,
    SFbearPinAll: Math.min(...members.map((mb) => mb.SFbearPin)),
    modes, ladder, SFjoint, governing, Fcap, holds, meetsTarget,
    partSF, warns,
    pinTone: pm.tone,
  };
}

// Utilization → colour. Utilization (not SF) is what the 3D view paints,
// because it stays finite and linear as the load goes to zero.
//
// The toolkit's identity — calm green, through amber, to yield red — but on
// its own stop positions rather than the shared tension ramp's. The shared one
// is built for a signed stress field where ±1 is the interesting edge and the
// scale runs on past it; here 1.0 is THE event, the allowable, and it has to
// be unmistakable at a glance on a phone. So the amber arrives earlier, full
// red lands exactly at 1.0, and past that it only brightens — going further
// over cannot make a joint "more failed", it just makes the picture louder.
const UTIL_STOPS: Stops = [
  [0.0, NEUTRAL_RGB],
  [0.35, [0.62, 0.66, 0.30]], // still fine, but no longer idle
  [0.60, [0.85, 0.55, 0.22]], // amber — working hard
  [0.85, [0.90, 0.34, 0.18]], // orange-red — close
  [1.0, [0.92, 0.14, 0.14]],  // at the allowable
  [1.4, [1.0, 0.42, 0.38]],   // past it: brighter, so overload still reads
];

export function utilRGB(u: number): [number, number, number] {
  const c = rampColor(UTIL_STOPS, Math.max(0, u));
  return [c.r, c.g, c.b];
}
