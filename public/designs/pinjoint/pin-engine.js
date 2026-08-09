// ─────────────────────────────────────────────────────────────────────────────
// pin-engine.js — shared physics for the PIN / BOLT SHEAR JOINT prototypes.
//
// The part: a pin (or bolt) carrying a transverse load through a stack of
// plates — the classic clevis / lug / lap-joint problem of Shigley ch. 8
// (Fig. 8-23: modes of failure in shear loading of a bolted or riveted
// connection; Fig. 8-25: edge shearing of the member).
//
// Two configurations:
//   2 plates  → LAP JOINT, single shear  (1 shear plane, load path offset)
//   3 plates  → CLEVIS,    double shear  (2 shear planes, symmetric)
//
// Every check is linear in the applied load F, so one solve gives both the
// stresses at F and the capacity (load at failure) of every mode:
//
//   F ──► pin shear        τ = F / (n·A)          vs Ssy = 0.577·Sy   (8-23c)
//     ──► pin bending      σ = 32M/πd³, clevis    vs Sy               (8-23b)
//     ──► bearing, plate   σ = Fi/(d·t) per plate vs pb               (8-23e)
//     ──► bearing, pin     same pressure          vs pin pb           (8-23e)
//     ──► net tension      σ = Fi/((w−d)·t)       vs Sy               (8-23d, 8-54)
//     ──► edge tear-out    τ = Fi/(2·t·(a−d/2))   vs Ssy              (8-23f/g, 8-25)
//
// Units inside: mm, N, MPa (N/mm²). Reference-quality typical values —
// verify before production use.
// ─────────────────────────────────────────────────────────────────────────────
(typeof window !== "undefined" ? window : globalThis).PIN = (() => {
  // Pin / bolt materials. Sy yield, Su ultimate, MPa. pb = permissible bearing
  // pressure on the pin's own surface (~1.5·Sy for ductile metals — projected-
  // area bearing yields later than uniaxial). tone = 3D/SVG base colour.
  const PIN_MATS = {
    "Mild steel pin (S235 / A36)":      { Sy: 235,  Su: 360,  pb: 350,  tone: "#39434e" },
    "Medium-C steel (C45 / 1045)":      { Sy: 340,  Su: 620,  pb: 510,  tone: "#39434e" },
    "Alloy steel Q&T (4140)":           { Sy: 655,  Su: 900,  pb: 980,  tone: "#333d47" },
    "Hardened dowel pin (DIN 6325)":    { Sy: 1200, Su: 1500, pb: 1800, tone: "#2e3842" },
    "Bolt, class 8.8":                  { Sy: 640,  Su: 800,  pb: 960,  tone: "#333d47" },
    "Bolt, class 10.9":                 { Sy: 940,  Su: 1040, pb: 1400, tone: "#2e3842" },
    "Stainless A2-70":                  { Sy: 450,  Su: 700,  pb: 675,  tone: "#414c56" },
    "Titanium Grade 5 (Ti-6Al-4V)":     { Sy: 880,  Su: 950,  pb: 1300, tone: "#3d4550" },
    "Aluminum 7075-T6":                 { Sy: 503,  Su: 572,  pb: 750,  tone: "#4a525a" },
    "Aluminum 6061-T6":                 { Sy: 276,  Su: 310,  pb: 410,  tone: "#4a525a" },
    "Brass (CuZn39Pb3)":                { Sy: 160,  Su: 400,  pb: 240,  tone: "#4e4a38" },
  };

  // Plate (flange / member) materials. E for deformation hints; Sy in-plane
  // yield (FDM: XY); pb = permissible bearing on the hole wall — metals
  // ~1.5·Sy, plastics from supplier bearing data (creep-limited, like the
  // toolkit's bolt calculator pG values); printed → orientation warnings.
  const PLATE_MATS = {
    "Mild steel (S235 / A36)":   { E: 200000, Sy: 235, Su: 360, pb: 350, tone: "#39434e" },
    "Steel (S355 / 4140N)":      { E: 200000, Sy: 355, Su: 520, pb: 530, tone: "#333d47" },
    "Stainless 304":             { E: 193000, Sy: 215, Su: 505, pb: 320, tone: "#414c56" },
    "Aluminum 6061-T6":          { E: 68900,  Sy: 276, Su: 310, pb: 410, tone: "#4a525a" },
    "Aluminum 5052-H32":         { E: 70300,  Sy: 193, Su: 228, pb: 290, tone: "#4a525a" },
    "Brass (CuZn37)":            { E: 97000,  Sy: 120, Su: 340, pb: 180, tone: "#4e4a38" },
    "FR-4 / G10 (in-plane)":     { E: 24000,  Sy: 260, Su: 320, pb: 240, tone: "#3a4a3a" },
    "PC-ABS (FDM)":              { E: 1900,   Sy: 41,  Su: 41,  pb: 48,  printed: true, tone: "#3f3b4d" },
    "PLA (FDM)":                 { E: 3500,   Sy: 50,  Su: 50,  pb: 55,  printed: true, tone: "#37452f" },
    "PETG (FDM)":                { E: 2000,   Sy: 45,  Su: 45,  pb: 50,  printed: true, tone: "#31434a" },
    "Nylon 12 (MJF)":            { E: 1700,   Sy: 48,  Su: 48,  pb: 55,  printed: true, tone: "#40462f" },
  };

  // What crosses the shear plane. A plain pin (or a bolt with the shank in the
  // plane) shears on the full circle; a bolt sheared through its THREADS only
  // has the minor-diameter core — ~75% of the nominal area for coarse threads.
  const SHANKS = {
    "Plain pin / dowel (full shank)":   { areaFactor: 1.0 },
    "Bolt — shank in shear plane":      { areaFactor: 1.0 },
    "Bolt — threads in shear plane":    { areaFactor: 0.75 },
  };

  const SHEAR_YIELD = 0.577; // distortion-energy: Ssy = 0.577·Sy

  function defaults() {
    return {
      config: 3,                                // 3 = clevis (double shear), 2 = lap (single shear)
      d: 8,                                     // pin diameter, mm
      shank: "Plain pin / dowel (full shank)",
      pinMat: "Alloy steel Q&T (4140)",
      t1: 6,  mat1: "Aluminum 6061-T6",         // outer plates (clevis) / plate A (lap)
      t2: 8,  mat2: "Steel (S355 / 4140N)",     // middle plate  (clevis) / plate B (lap)
      w: 32,                                    // plate width across the hole, mm
      a: 12,                                    // hole centre → loaded edge, mm
      clr: 0.2,                                 // clevis gap per side (pin bending arm), mm
      F: 6000,                                  // applied load, N
      SFt: 2,                                   // target safety factor
    };
  }

  const sfStatus = (sf) => (sf >= 2 ? "ok" : sf >= 1.2 ? "warn" : "bad");
  const sfColor = (sf) => (sf >= 2 ? "#4fb477" : sf >= 1.2 ? "#d9a441" : "#d65c5c");
  function fmt(v, digits = 1) {
    if (!isFinite(v)) return "∞";
    const a = Math.abs(v);
    const d = a >= 100 ? 0 : a >= 10 ? 1 : digits + 1;
    return v.toLocaleString("en-US", { maximumFractionDigits: d, minimumFractionDigits: 0 });
  }

  // ── The full solve ─────────────────────────────────────────────────────────
  function solve(inp) {
    const pm = PIN_MATS[inp.pinMat];
    const m1 = PLATE_MATS[inp.mat1], m2 = PLATE_MATS[inp.mat2];
    const sh = SHANKS[inp.shank];
    const { d, w, a, F } = inp;
    const t1 = Math.max(inp.t1, 0.1), t2 = Math.max(inp.t2, 0.1);
    const double = inp.config === 3;
    const nPlanes = double ? 2 : 1;

    // The members. In double shear the MIDDLE plate carries the full F and each
    // outer plate half of it; in a lap joint both plates carry the full F.
    // (share = fraction of F that member puts through ITS hole wall / sections)
    const members = double
      ? [
          { key: "outer",  label: "outer plates (×2)", t: t1, share: 0.5, mat: m1, matName: inp.mat1 },
          { key: "middle", label: "middle plate",      t: t2, share: 1.0, mat: m2, matName: inp.mat2 },
        ]
      : [
          { key: "plateA", label: "plate A", t: t1, share: 1.0, mat: m1, matName: inp.mat1 },
          { key: "plateB", label: "plate B", t: t2, share: 1.0, mat: m2, matName: inp.mat2 },
        ];

    // 1) PIN SHEAR (Fig 8-23c). τ = F / (n·A_eff), vs Ssy of the pin.
    const Apin = (Math.PI / 4) * d * d;
    const Ashear = Apin * sh.areaFactor;
    const tau = F / (nPlanes * Ashear);
    const Ssy = SHEAR_YIELD * pm.Sy;
    const SFshear = tau > 0 ? Ssy / tau : Infinity;

    // 2) PIN BENDING (Fig 8-23b). Only meaningful in double shear, where the
    //    pin is a tiny simply-supported beam: middle plate load F spread over
    //    t2, outer reactions F/2 spread over t1, clearance clr between plates.
    //    Peak moment at centre: M = F/2 · (t2/4 + clr + t1/2). In single shear
    //    the joint tilts instead — flagged as a warning, not a stress.
    let Mpin = 0, sigmaBend = 0, SFbend = Infinity;
    if (double) {
      Mpin = (F / 2) * (t2 / 4 + Math.max(inp.clr, 0) + t1 / 2);
      sigmaBend = (32 * Mpin) / (Math.PI * d ** 3);
      SFbend = sigmaBend > 0 ? pm.Sy / sigmaBend : Infinity;
    }

    // 3–6) Per-member checks. All projected-area / net-section formulas from
    //      Shigley 8-54/8-55 and Fig 8-25.
    const perMember = members.map((mb) => {
      const Fi = mb.share * F;
      // bearing on the hole wall (8-55): σ = Fi/(t·d), vs plate pb AND pin pb
      const pBear = Fi / (mb.t * d);
      const SFbearPlate = pBear > 0 ? mb.mat.pb / pBear : Infinity;
      const SFbearPin = pBear > 0 ? pm.pb / pBear : Infinity;
      // net-section tension (8-54): σ = Fi/((w−d)·t), vs plate Sy
      const Anet = Math.max(w - d, 0.01) * mb.t;
      const sigmaNet = Fi / Anet;
      const SFnet = sigmaNet > 0 ? mb.mat.Sy / sigmaNet : Infinity;
      // edge shear tear-out (Fig 8-25): two shear planes from the hole to the
      // edge. Conservative area 2·t·(a − d/2) — the net ligament, not 2·t·a.
      const lig = Math.max(a - d / 2, 0.01);
      const Atear = 2 * mb.t * lig;
      const tauTear = Fi / Atear;
      const SFtear = tauTear > 0 ? (SHEAR_YIELD * mb.mat.Sy) / tauTear : Infinity;
      const worst = Math.min(SFbearPlate, SFnet, SFtear);
      return { ...mb, Fi, pBear, SFbearPlate, SFbearPin, Anet, sigmaNet, SFnet, lig, Atear, tauTear, SFtear, worst };
    });

    // Collapse the pin-bearing check to the worst member pressing on it.
    const SFbearPinAll = Math.min(...perMember.map((m) => m.SFbearPin));

    // ── The mode table: every failure mode, its SF at F, and its capacity ────
    // (everything linear in F ⇒ capacity = F·SF).
    const modes = [];
    modes.push({ key: "shear", part: "pin", label: double ? "Pin shear (2 planes)" : "Pin shear (1 plane)",
      stress: tau, allow: Ssy, kind: "τ", SF: SFshear });
    if (double)
      modes.push({ key: "bend", part: "pin", label: "Pin bending (clevis beam)",
        stress: sigmaBend, allow: pm.Sy, kind: "σ", SF: SFbend });
    modes.push({ key: "bearpin", part: "pin", label: "Bearing on the pin surface",
      stress: Math.max(...perMember.map((m) => m.pBear)), allow: pm.pb, kind: "p", SF: SFbearPinAll });
    for (const mb of perMember) {
      modes.push({ key: `bear-${mb.key}`, part: mb.key, label: `Bearing — ${mb.label}`,
        stress: mb.pBear, allow: mb.mat.pb, kind: "p", SF: mb.SFbearPlate });
      modes.push({ key: `net-${mb.key}`, part: mb.key, label: `Net-section tension — ${mb.label}`,
        stress: mb.sigmaNet, allow: mb.mat.Sy, kind: "σ", SF: mb.SFnet });
      modes.push({ key: `tear-${mb.key}`, part: mb.key, label: `Edge tear-out — ${mb.label}`,
        stress: mb.tauTear, allow: SHEAR_YIELD * mb.mat.Sy, kind: "τ", SF: mb.SFtear });
    }
    for (const m of modes) m.Fcap = F > 0 ? F * m.SF : m.allow * 0; // load at which this mode lets go
    const ladder = modes.slice().sort((x, y) => x.Fcap - y.Fcap);

    const SFjoint = Math.min(...modes.map((m) => m.SF));
    const governing = modes.find((m) => m.SF === SFjoint);
    const Fcap = F > 0 ? F * SFjoint : Infinity;   // joint capacity, N
    const holds = SFjoint >= 1;
    const meetsTarget = SFjoint >= inp.SFt;

    // Per-part worst SF, for painting the 3D / SVG parts.
    const partSF = { pin: Math.min(SFshear, SFbend, SFbearPinAll) };
    for (const mb of perMember) partSF[mb.key] = mb.worst;

    // ── Warnings ─────────────────────────────────────────────────────────────
    const warns = [];
    if (!holds)
      warns.push({ level: "bad", text: `Joint FAILS at this load: ${governing.label.toLowerCase()} gives way first (SF ${fmt(SFjoint, 2)}). Capacity ≈ ${fmt(Fcap / 1000, 2)} kN.` });
    else if (!meetsTarget)
      warns.push({ level: "warn", text: `Holds, but below your target SF ${fmt(inp.SFt, 1)} — governing mode is ${governing.label.toLowerCase()} at SF ${fmt(SFjoint, 2)}.` });
    if (a < 1.5 * d)
      warns.push({ level: "warn", text: `Edge distance a = ${fmt(a, 1)} mm is under the structural-practice minimum of 1.5·d = ${fmt(1.5 * d, 1)} mm (Shigley: spacing that avoids edge shearing). Tear-out is likely governing.` });
    if (w < 2.5 * d)
      warns.push({ level: "warn", text: `Plate width w = ${fmt(w, 1)} mm is tight for a Ø${fmt(d, 1)} hole — net section is only ${fmt(w - d, 1)} mm. Consider w ≥ 2.5–3·d.` });
    if (!double)
      warns.push({ level: "info", text: "Single shear: the offset load path makes a lap joint tilt and adds secondary pin bending + prying not captured here — treat the numbers as optimistic, or use the 3-plate clevis." });
    if (inp.shank === "Bolt — threads in shear plane")
      warns.push({ level: "info", text: "Threads in the shear plane: only the minor-diameter core carries shear (~75% of the nominal area). A longer shank or a shoulder bolt recovers the full circle." });
    for (const mb of perMember)
      if (mb.mat.printed)
        warns.push({ level: "info", text: `${mb.label} is printed (${mb.matName}): values assume in-plane (XY) loading — a hole loaded across layers is far weaker. Bearing on plastic also creeps: expect the hole to elongate under sustained load.` });
    warns.push({ level: "info", text: "Static checks against yield onset — no stress concentration (Kt ≈ 2–3 at the hole matters for fatigue or brittle plates), no friction (a preloaded bolt carries load by clamp friction until it slips, Shigley §8-12: this is the slipped, bearing state)." });

    return {
      double, nPlanes, members: perMember,
      Apin, Ashear, tau, Ssy, SFshear,
      Mpin, sigmaBend, SFbend, SFbearPinAll,
      modes, ladder, SFjoint, governing, Fcap, holds, meetsTarget,
      partSF, warns,
      pinTone: pm.tone,
    };
  }

  // ── Toolkit stress ramp (same stops as the other calculators) ─────────────
  const NEUTRAL = [0.31, 0.706, 0.467];
  const T_STOPS = [[0, NEUTRAL], [0.5, [0.85, 0.55, 0.22]], [1, [0.84, 0.27, 0.27]], [1.4, [1, 0.3, 0.3]]];
  function ramp(stops, x) {
    const xc = Math.max(0, Math.min(stops[stops.length - 1][0], x));
    for (let i = 1; i < stops.length; i++) {
      const [p1, c1] = stops[i];
      if (xc <= p1) {
        const [p0, c0] = stops[i - 1], t = (xc - p0) / (p1 - p0 || 1);
        return [c0[0] + (c1[0] - c0[0]) * t, c0[1] + (c1[1] - c0[1]) * t, c0[2] + (c1[2] - c0[2]) * t];
      }
    }
    return stops[stops.length - 1][1];
  }
  // utilization u = 1/SF: 0 = idle, 1 = at the limit
  const utilRGB = (u) => ramp(T_STOPS, Math.max(0, u));

  return { PIN_MATS, PLATE_MATS, SHANKS, SHEAR_YIELD, defaults, solve, utilRGB, fmt, sfStatus, sfColor };
})();
