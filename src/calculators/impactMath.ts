// Impact / perforation engine: a rigid (or mushrooming) sphere or cube striking
// a clamped circular sheet. Two coupled degrees of freedom integrated in time —
// the projectile and the plate's center — joined by a local contact/penetration
// force and checked each step against the classical thin-plate failure modes:
//
//   local resistance   F = A(δ)·(σr + ρt·v²)     Poncelet / cavity expansion
//   plug initiation    F > perimeter·(h−δ)·τd     transverse shear ligament
//   membrane rupture   ε_tip > ε_f                discing / petaling
//   brittle fracture   σ_bend(back face) > σ_f    radial + cone cracks
//   residual velocity  momentum share with plug   Recht–Ipson style
//
// Global plate response: Timoshenko large-deflection bending + membrane,
// capped by the rigid-plastic collapse + plastic-membrane curve. All SI units.

export type ImpactMaterial = {
  rho: number; // kg/m³
  E: number; // GPa
  nu: number;
  sigmaY: number; // MPa yield (flexural/fracture strength for brittle)
  sigmaU: number; // MPa ultimate tensile
  epsF: number; // failure strain (biaxial stretch ductility)
  sigmaC?: number; // MPa compressive strength (brittle solids)
  brittle?: boolean;
  rateD?: number; // Cowper–Symonds D (s⁻¹); omitted = rate-insensitive
  rateQ?: number;
  color: string;
  grp: string;
};

// One shared library for plate and projectile. Handbook-typical values.
export const IMPACT_MATERIALS: Record<string, ImpactMaterial> = {
  // — Steels —
  "Mild steel (A36 / can stock)": { rho: 7850, E: 200, nu: 0.29, sigmaY: 250, sigmaU: 420, epsF: 0.28, rateD: 40.4, rateQ: 5, color: "#8b97a3", grp: "Steel" },
  "Stainless 304": { rho: 8000, E: 193, nu: 0.29, sigmaY: 215, sigmaU: 505, epsF: 0.5, rateD: 100, rateQ: 10, color: "#aab4be", grp: "Steel" },
  "Hardened steel (52100 ball)": { rho: 7810, E: 210, nu: 0.3, sigmaY: 1700, sigmaU: 2000, epsF: 0.05, color: "#9aa7b4", grp: "Steel" },
  "Armor steel (AR500)": { rho: 7850, E: 205, nu: 0.29, sigmaY: 1250, sigmaU: 1600, epsF: 0.09, rateD: 40.4, rateQ: 5, color: "#7c8894", grp: "Steel" },
  // — Non-ferrous metals —
  "Aluminum 6061-T6": { rho: 2700, E: 68.9, nu: 0.33, sigmaY: 276, sigmaU: 310, epsF: 0.14, color: "#b8bcc0", grp: "Metal" },
  "Aluminum 7075-T6": { rho: 2810, E: 71.7, nu: 0.33, sigmaY: 503, sigmaU: 572, epsF: 0.1, color: "#b8bcc0", grp: "Metal" },
  "Aluminum 1100 (soft / pouch foil)": { rho: 2710, E: 69, nu: 0.33, sigmaY: 34, sigmaU: 90, epsF: 0.32, color: "#c6cacd", grp: "Metal" },
  "Ti-6Al-4V": { rho: 4430, E: 114, nu: 0.34, sigmaY: 880, sigmaU: 950, epsF: 0.12, color: "#c4b59a", grp: "Metal" },
  "Copper C110": { rho: 8940, E: 117, nu: 0.34, sigmaY: 70, sigmaU: 220, epsF: 0.45, color: "#c98d5f", grp: "Metal" },
  "Brass (C260)": { rho: 8530, E: 100, nu: 0.34, sigmaY: 124, sigmaU: 338, epsF: 0.4, color: "#c9b25f", grp: "Metal" },
  "Lead (bullet core)": { rho: 11340, E: 16, nu: 0.44, sigmaY: 12, sigmaU: 17, epsF: 0.5, color: "#6e747c", grp: "Metal" },
  "Tungsten heavy alloy": { rho: 17600, E: 340, nu: 0.28, sigmaY: 750, sigmaU: 980, epsF: 0.12, color: "#5d666e", grp: "Metal" },
  "Tungsten carbide (WC-Co)": { rho: 14900, E: 600, nu: 0.22, sigmaY: 1600, sigmaU: 1600, epsF: 0.01, sigmaC: 5000, brittle: true, color: "#4d565e", grp: "Metal" },
  // — Ceramics & glass — (sigmaY holds flexural/fracture strength)
  "Alumina 99.5%": { rho: 3900, E: 370, nu: 0.22, sigmaY: 380, sigmaU: 380, epsF: 0.001, sigmaC: 2600, brittle: true, color: "#e6e2d8", grp: "Ceramic" },
  "Silicon carbide": { rho: 3210, E: 410, nu: 0.16, sigmaY: 550, sigmaU: 550, epsF: 0.001, sigmaC: 3900, brittle: true, color: "#3d454d", grp: "Ceramic" },
  "Soda-lime glass": { rho: 2500, E: 70, nu: 0.22, sigmaY: 70, sigmaU: 70, epsF: 0.001, sigmaC: 1000, brittle: true, color: "#9fc4c9", grp: "Ceramic" },
  // — Plastics —
  Polycarbonate: { rho: 1200, E: 2.3, nu: 0.37, sigmaY: 62, sigmaU: 70, epsF: 1.1, color: "#d2dce0", grp: "Plastic" },
  "Acrylic (PMMA)": { rho: 1190, E: 3.1, nu: 0.37, sigmaY: 110, sigmaU: 72, epsF: 0.04, sigmaC: 120, brittle: true, color: "#dbe4e8", grp: "Plastic" },
  ABS: { rho: 1050, E: 2.1, nu: 0.35, sigmaY: 40, sigmaU: 42, epsF: 0.25, color: "#e0d4cf", grp: "Plastic" },
  HDPE: { rho: 960, E: 1.0, nu: 0.42, sigmaY: 26, sigmaU: 30, epsF: 1.2, color: "#dee0d2", grp: "Plastic" },
  "PLA (printed)": { rho: 1250, E: 3.5, nu: 0.35, sigmaY: 55, sigmaU: 58, epsF: 0.05, color: "#cfe0c8", grp: "Plastic" },
};

export const IMPACT_GROUPS = ["Steel", "Metal", "Ceramic", "Plastic"];

export type Shape = "sphere" | "cube";

export type SimParams = {
  shape: Shape;
  size: number; // m — sphere diameter or cube side
  proj: ImpactMaterial;
  plate: ImpactMaterial;
  h: number; // m plate thickness
  R: number; // m free-span radius (clamped rim)
  v0: number; // m/s
};

export type Phase =
  | "contact" // elastic + plastic indentation / penetration
  | "plug" // pushing a shear plug (or torn disc) out
  | "enlarge" // sphere widening an undersized hole (petals fold back)
  | "through" // free exit
  | "rebound"
  | "done";

export type Frame = {
  t: number; // s since first contact
  z: number; // m nose position past the original front face
  w0: number; // m plate center deflection
  delta: number; // m local indentation (z − w0)
  F: number; // N contact force
  sPlug: number; // m plug travel (plug/enlarge phases)
  phase: Phase;
  broken: boolean; // brittle fracture has happened
};

export type Outcome =
  | "bounce"
  | "dent"
  | "embedded"
  | "perforate-plug"
  | "perforate-petal"
  | "perforate-hole"
  | "shatter"
  | "crack-stop";

export type SimResult = {
  outcome: Outcome;
  perforated: boolean;
  fractured: boolean; // brittle plate cracked
  projSoft: boolean; // projectile mushrooms / shatters on impact
  mass: number; // kg projectile
  E0: number; // J incoming kinetic energy
  vr: number; // m/s residual (exit) velocity, 0 if stopped
  vRebound: number; // m/s bounce-back speed, 0 if perforated/stuck
  tContact: number; // s duration of contact / transit
  Fpeak: number; // N
  aPeakG: number; // peak projectile deceleration, g
  w0Peak: number; // m peak plate center deflection
  dent: number; // m permanent center dish (non-perforating)
  holeD: number; // m hole diameter (perforating)
  plugMass: number; // kg
  tFracture: number; // s brittle crack time (−1 = none)
  Eplate: number; // J energy left in the plate (strain + vibration)
  Elocal: number; // J local indentation / shear / petal work
  Eresidual: number; // J projectile exit KE
  Eplug: number; // J plug / disc KE
  Erebound: number; // J returned to the projectile (bounce)
  frames: Frame[];
};

// ── material helpers ────────────────────────────────────────────

// Representative plastic flow stress: average of yield and ultimate.
export function flowStress(m: ImpactMaterial): number {
  return ((m.sigmaY + m.sigmaU) / 2) * 1e6;
}

// Quasi-static cavity-expansion resistance — the "hardness-like" pressure a
// projectile must exert to open a hole in a thick target. Bishop/Hill form
// σr = ⅔σf·(1 + ln(2E/3σf)) ≈ 3–5·σf for metals. Brittle solids resist with
// ~2.5× their compressive strength until they crack.
export function cavityResistance(m: ImpactMaterial): number {
  if (m.brittle) return 2.5 * (m.sigmaC ?? m.sigmaY) * 1e6;
  const sf = flowStress(m);
  return (2 / 3) * sf * (1 + Math.log((2 * (m.E * 1e9)) / (3 * sf)));
}

// Cowper–Symonds dynamic elevation of flow stress, capped at 2× to stay
// conservative when extrapolated to very high rates.
function rateFactor(m: ImpactMaterial, epsDot: number): number {
  if (!m.rateD || !m.rateQ || epsDot <= 0) return 1;
  return Math.min(2, 1 + Math.pow(epsDot / m.rateD, 1 / m.rateQ));
}

// How overmatched the projectile is: local impact pressure vs its own
// strength. > 1 means it mushrooms (ductile) or shatters (brittle).
export function projectileSoftness(p: SimParams): number {
  const pressure = cavityResistance(p.plate) + p.plate.rho * p.v0 * p.v0;
  const own = p.proj.brittle
    ? 2.5 * (p.proj.sigmaC ?? p.proj.sigmaY) * 1e6
    : 3 * flowStress(p.proj);
  return pressure / own;
}

export function projectileMass(p: SimParams): number {
  const V = p.shape === "sphere" ? (Math.PI / 6) * p.size ** 3 : p.size ** 3;
  return p.proj.rho * V;
}

// ── the simulation ──────────────────────────────────────────────

export function simulate(p: SimParams, wantFrames = true): SimResult {
  const { h, R, v0 } = p;
  const mat = p.plate;
  const m = projectileMass(p);
  const E0 = 0.5 * m * v0 * v0;

  // Projectile mushrooming: an overmatched projectile spreads its load over a
  // larger footprint (lead splats, ceramic shatters at the tip) — modeled as
  // a widened effective diameter, which makes perforation harder.
  const soft = projectileSoftness(p);
  const projSoft = soft > 1;
  const areaMul = projSoft ? Math.min(3, Math.cbrt(soft)) : 1;
  const dMul = Math.sqrt(areaMul);

  const dSphere = p.size * dMul;
  const d = (p.shape === "sphere" ? p.size : p.size * Math.sqrt(4 / Math.PI)) * dMul; // area-equivalent dia
  const A0 = (Math.PI / 4) * d * d;
  const nose = p.shape === "sphere" ? dSphere / 2 : 0; // stroke to develop full area

  // Contact patch vs indentation depth.
  const contactDia = (delta: number) =>
    p.shape === "cube" ? d : Math.min(d, 2 * Math.sqrt(Math.max(0, delta * (dSphere - delta))));
  const contactArea = (delta: number) => {
    const dc = contactDia(delta);
    return (Math.PI / 4) * dc * dc;
  };
  const contactPerim = (delta: number) =>
    p.shape === "cube" ? 4 * p.size * dMul : Math.PI * contactDia(delta);

  // Local strength terms (with a moderate strain-rate elevation).
  const eta = rateFactor(mat, v0 / Math.max(5 * h, 1e-4));
  const sigF = flowStress(mat) * eta;
  const tauD = 0.577 * sigF; // von Mises shear
  const RtDyn = cavityResistance(mat) * eta;
  // A cracked brittle sheet has almost no residual strength — fragments are
  // pushed aside; only a small comminution term plus inertia remains.
  const RtRubble = 0.01 * RtDyn;

  // Hertz elastic contact (sphere) / flat-punch (cube), with plastic
  // unloading hysteresis via the permanent indentation deltaPl.
  const Estar =
    1 / ((1 - mat.nu ** 2) / (mat.E * 1e9) + (1 - p.proj.nu ** 2) / (p.proj.E * 1e9));
  const hertzC = (4 / 3) * Estar * Math.sqrt(dSphere / 2);
  const punchC = 2 * Estar * (d / 2);
  const hertz = (de: number) =>
    p.shape === "sphere" ? hertzC * Math.pow(Math.max(de, 0), 1.5) : punchC * Math.max(de, 0);
  const invHertz = (F: number) =>
    p.shape === "sphere" ? Math.pow(F / hertzC, 2 / 3) : F / punchC;

  // Global plate DOF: Timoshenko large-deflection loading curve capped by the
  // rigid-plastic collapse + plastic membrane curve; elastic unloading.
  const D = ((mat.E * 1e9) * h ** 3) / (12 * (1 - mat.nu ** 2));
  const kb = (16 * Math.PI * D) / (R * R);
  const aRef = Math.max(d / 2, 1e-5);
  const lnRa = Math.max(1.05, Math.log(R / aRef));
  const FelPlate = (w: number) => kb * w * (1 + 0.443 * (w / h) ** 2);
  const FplPlate = (w: number) =>
    Math.PI * sigF * h * h + (2 * Math.PI * sigF * h * Math.max(w, 0)) / lnRa;
  const Fload = (w: number) => {
    if (w <= 0) return kb * w;
    if (mat.brittle) return FelPlate(w); // ceramics don't yield — they crack
    return Math.min(FelPlate(w), FplPlate(w));
  };
  // Membrane strain concentrated at the contact rim (conical dish profile).
  const tipStrain = (w: number) => 0.5 * (Math.max(w, 0) / (aRef * lnRa)) ** 2;
  // Back-face bending tensile stress under a central patch load (Timoshenko).
  const bendStress = (F: number, delta: number) => {
    const ac = Math.max(contactDia(Math.max(delta, 1e-6)) / 2, h / 4);
    return ((3 * F) / (2 * Math.PI * h * h)) * ((1 + mat.nu) * Math.log(R / Math.min(ac, R * 0.9)) + 1);
  };

  // Projectile crush pressure — what its own material can transmit.
  const projCrush = p.proj.brittle
    ? 2.5 * (p.proj.sigmaC ?? p.proj.sigmaY) * 1e6
    : 3 * flowStress(p.proj);

  // Effective (first-mode) plate mass.
  const mPlate = 0.25 * mat.rho * h * Math.PI * R * R;

  // ── integrate ──
  const tMax = 4e-3;
  const dt = Math.min(5e-8, Math.max(5e-9, h / Math.max(v0, 10) / 400));
  const maxSteps = Math.min(Math.ceil(tMax / dt), 500_000);

  let z = 0,
    vp = v0,
    w0 = 0,
    vw = 0,
    t = 0;
  let phase: Phase = "contact";
  let broken = false; // brittle plate cracked
  let tFracture = -1;
  let ruptured = false; // ductile membrane torn
  let deltaPl = 0; // permanent local indentation
  let Fpeak = 0,
    aPeak = 0,
    w0Peak = 0,
    deltaMax = 0;
  let Elocal = 0,
    Eplate = 0;
  let plugM = 0,
    plugDia = 0,
    plugLig = 0,
    sPlug = 0,
    plugV = 0,
    plugMode: "plug" | "petal" = "plug";
  let enlargeW = 0,
    enlargeS0 = 0;
  let vr = 0,
    vRebound = 0,
    tEnd = 0,
    lastF = 0;
  let outcome: Outcome | null = null;

  // Frame capture adapts to the (unknown) sim duration: push every `stride`
  // steps, and when the buffer overfills, drop every other frame and double
  // the stride — always ends with 600–1200 evenly spaced frames.
  const frames: Frame[] = [];
  let frameStride = 1;
  const pushFrame = (f: Frame) => {
    frames.push(f);
    if (frames.length > 1200) {
      for (let k = 0; k < frames.length; k += 2) frames[k >> 1] = frames[k];
      frames.length = Math.ceil(frames.length / 2);
      frameStride *= 2;
    }
  };

  const startPlug = (mode: "plug" | "petal", dia: number, lig: number) => {
    plugMode = mode;
    plugDia = dia;
    plugLig = Math.max(lig, 1e-6);
    plugM = mat.rho * plugLig * (Math.PI / 4) * plugDia * plugDia;
    // Impulsive momentum share with the plug (Recht–Ipson); the KE lost in
    // the instantaneous join is real dissipation in the shear band.
    const vJoin = (m * vp + plugM * vw) / (m + plugM);
    Elocal += 0.5 * m * vp * vp + 0.5 * plugM * vw * vw - 0.5 * (m + plugM) * vJoin * vJoin;
    vp = vJoin;
    sPlug = 0;
  };

  // Advance the plate DOF one step under a transmitted force Fp: loading
  // curve on the way out, elastic unloading back; a cracked brittle sheet
  // keeps only a small residual (interlocked-wedge) stiffness.
  const plateStep = (Fp: number) => {
    // Elastic unloading tangent at the peak — includes the membrane term,
    // otherwise a membrane-stiff plate would return energy over a huge stroke.
    const kUnl = kb * (1 + 1.33 * (w0Peak / h) ** 2);
    const FwRaw =
      broken && mat.brittle
        ? 0.15 * kb * Math.max(w0, 0)
        : w0 >= w0Peak
          ? Fload(w0)
          : Math.max(0, Fload(w0Peak) - kUnl * (w0Peak - w0));
    vw += ((Fp - FwRaw) / mPlate) * dt;
    const w0prev = w0;
    w0 += vw * dt;
    if (w0 > w0Peak) w0Peak = w0;
    Eplate += FwRaw * (w0 - w0prev);
  };

  for (let i = 0; i < maxSteps && t < tMax; i++) {
    if (phase === "plug") {
      // Combined projectile+plug decelerated by the remaining shear ring
      // (plugging) or by the tearing/petal work (petaling); the same force
      // keeps dishing the plate.
      const lig = Math.max(plugLig - sPlug, 0);
      const F =
        plugMode === "plug"
          ? Math.PI * plugDia * lig * tauD
          : 0.5 * Math.PI * sigF * h * h * (lig / plugLig);
      if (F / (m + plugM) > aPeak) aPeak = F / (m + plugM);
      vp -= (F / (m + plugM)) * dt;
      const dz = vp * dt;
      sPlug += Math.max(vp - vw, 0) * dt;
      z += dz;
      Elocal += F * Math.max(dz, 0);
      plateStep(F);
      if (F > Fpeak) Fpeak = F;
      lastF = F;
      if (vp <= 0) {
        outcome = "embedded";
        tEnd = t;
        break;
      }
      if (sPlug >= plugLig) {
        plugV = vp; // plug leaves at the common velocity
        if (p.shape === "sphere" && plugDia < 0.95 * d && !mat.brittle) {
          // Undersized disc torn out — the ball still has to shove the hole
          // open to its full diameter: plastic hole-enlargement work.
          enlargeW = sigF * (A0 - (Math.PI / 4) * plugDia * plugDia) * h;
          enlargeS0 = Math.max(nose, h * 0.5);
          sPlug = 0;
          phase = "enlarge";
        } else {
          phase = "through";
        }
      }
    } else if (phase === "enlarge") {
      const sFrac = Math.min(sPlug / enlargeS0, 1);
      const F = ((2 * enlargeW) / enlargeS0) * (1 - sFrac);
      if (F / m > aPeak) aPeak = F / m;
      vp -= (F / m) * dt;
      const dz = vp * dt;
      sPlug += dz;
      z += dz;
      Elocal += F * Math.max(dz, 0);
      plateStep(0.5 * F); // petals fold; only part of the load reaches the plate
      if (F > Fpeak) Fpeak = F;
      lastF = F;
      if (vp <= 0) {
        outcome = "embedded";
        tEnd = t;
        break;
      }
      if (sFrac >= 1) phase = "through";
    } else if (phase === "through") {
      vr = vp;
      tEnd = t;
      break;
    } else if (phase === "rebound") {
      vRebound = Math.max(0, -vp);
      tEnd = t;
      break;
    } else {
      // ── contact phase ──
      const delta = z - w0;
      let F = 0;
      if (delta > 0) {
        const vRel = vp - vw;
        const Fe = hertz(delta - deltaPl);
        const Acur = Math.max(contactArea(delta), 1e-12);
        if (vRel <= 0) {
          // Unloading: elastic springback along the (offset) Hertz curve only.
          F = Fe;
        } else {
          // Interface pressure is set by whichever side flows first: target
          // penetration resistance, or the projectile's own crush pressure
          // (a soft slug can never load the target harder than it can bear).
          const strength = broken && mat.brittle ? RtRubble : RtDyn;
          const pTarg = strength + mat.rho * vRel * vRel;
          const pProj = projCrush + p.proj.rho * vRel * vRel;
          const pPl = Math.min(pTarg, pProj);
          const Fplast = Acur * pPl;
          // Elastic contact until the mean pressure reaches the plasticity
          // threshold ≈ 2.8·σy of the weaker side; then the plastic /
          // hydrodynamic branch governs. A cracked brittle sheet is rubble.
          const pStar =
            broken && mat.brittle
              ? 0
              : Math.min(mat.brittle ? RtDyn : 2.8 * mat.sigmaY * 1e6, projCrush);
          if (Fe / Acur < pStar) {
            F = Fe;
          } else {
            F = Fplast;
            deltaPl = Math.max(deltaPl, delta - invHertz(F)); // plastic set
          }
        }
        if (delta > deltaMax) deltaMax = delta;

        // — ductile plug check — cubes punch at any speed; spheres only when
        // the impact is fast enough to localize the shear (adiabatic band,
        // v > √(τ/ρ)) or once the nose is deeply engaged. Slow spheres on
        // thin sheets fail by stretching instead, like hemispherical noses.
        if (!mat.brittle && !ruptured) {
          const lig = Math.max(h - delta, 0);
          const blunt =
            p.shape === "cube" ||
            vRel > Math.sqrt(tauD / mat.rho) ||
            delta > 0.15 * dSphere;
          // Plugging is a thin-plate mode: only ligaments up to ~a projectile
          // diameter can pop out as a plug; thicker targets must be tunneled.
          if (blunt && lig > 0 && lig < 1.2 * dSphere && F > contactPerim(delta) * lig * tauD) {
            ruptured = true;
            startPlug("plug", contactDia(delta), lig);
            phase = "plug";
          }
        }
        // — brittle fracture check —
        if (mat.brittle && !broken && bendStress(F, delta) > mat.sigmaY * 1e6) {
          broken = true;
          tFracture = t;
        }
        // Straight-through local perforation (thick-plate tunneling, or a
        // shattered brittle sheet pushed clean through).
        if (phase === "contact" && delta >= h + nose) phase = "through";
      } else if (i > 4 && vp < 0) {
        phase = "rebound"; // separated and moving away
      }

      // — membrane tear check — fires on the plate's own state, in contact
      // or not: past the tearing strain the dish rips at the contact rim
      // (discing / petaling) and stops carrying load.
      if (phase === "contact" && !mat.brittle && !ruptured && w0 > h && tipStrain(w0) > mat.epsF) {
        ruptured = true;
        if (delta > 1e-6) {
          startPlug("petal", Math.max(contactDia(delta), 0.5 * d), Math.max(h - delta, 0.2 * h));
          phase = "plug";
        } else {
          // The sheet tore open ahead of the projectile — it sails through.
          plugMode = "petal";
          plugDia = d;
          plugM = mat.rho * h * (Math.PI / 4) * d * d;
          plugV = vw;
          phase = "through";
        }
      }

      if (phase === "contact") {
        const aP = F / m;
        if (aP > aPeak) aPeak = aP;
        vp -= aP * dt;
        z += vp * dt;
        // Net local dissipation bookkeeping via the relative travel.
        Elocal += F * (vp - vw) * dt;
        plateStep(F);
      }
      if (F > Fpeak) Fpeak = F;
      lastF = F;
    }

    t += dt;
    if (wantFrames && i % frameStride === 0) {
      pushFrame({ t, z, w0, delta: Math.max(z - w0, 0), F: lastF, sPlug, phase, broken });
    }
  }

  // Permanent dish after elastic springback (membrane-stiffened tangent).
  const wPl = mat.brittle
    ? 0
    : Math.max(0, w0Peak - Fload(w0Peak) / (kb * (1 + 1.33 * (w0Peak / h) ** 2)));

  if (!outcome) {
    if (phase === "through") {
      outcome = mat.brittle
        ? "shatter"
        : plugM > 0
          ? plugMode === "petal"
            ? "perforate-petal"
            : "perforate-plug"
          : "perforate-hole";
    } else if (phase === "rebound") {
      if (mat.brittle && broken) outcome = "crack-stop";
      else outcome = wPl + deltaPl > h * 0.05 ? "dent" : "bounce";
    } else if (deltaMax > 0.5 * h && vp >= 0) {
      outcome = "embedded";
    } else if (mat.brittle && broken) {
      outcome = "crack-stop";
    } else {
      outcome = wPl + deltaPl > h * 0.05 ? "dent" : "bounce";
      vRebound = Math.max(0, -vp);
    }
    if (!tEnd) tEnd = t;
  }
  if (outcome === "shatter" && !broken) {
    broken = true;
    if (tFracture < 0) tFracture = tEnd;
  }

  const perforated =
    outcome === "perforate-plug" ||
    outcome === "perforate-petal" ||
    outcome === "perforate-hole" ||
    outcome === "shatter";

  if (wantFrames) {
    frames.push({
      t: tEnd,
      z,
      w0,
      delta: Math.max(z - w0, 0),
      F: 0,
      sPlug,
      phase: perforated ? "through" : "done",
      broken,
    });
  }

  return {
    outcome,
    perforated,
    fractured: broken,
    projSoft,
    mass: m,
    E0,
    vr,
    vRebound,
    tContact: tEnd,
    Fpeak,
    aPeakG: aPeak / 9.81,
    w0Peak,
    dent: perforated || mat.brittle ? 0 : wPl + deltaPl * 0.8,
    holeD: perforated ? d : 0,
    plugMass: perforated ? plugM : 0,
    tFracture,
    Eplate: Math.max(0, Eplate) + 0.5 * mPlate * vw * vw,
    Elocal: Math.max(0, Elocal),
    Eresidual: 0.5 * m * vr * vr,
    Eplug: perforated ? 0.5 * plugM * plugV * plugV : 0,
    Erebound: 0.5 * m * vRebound * vRebound,
    frames,
  };
}

// Ballistic limit: lowest impact velocity that just perforates, by bisection.
// Returns NaN if the plate can't be perforated below vMax.
export function ballisticLimit(p: SimParams, vMax = 3000): number {
  const perf = (v: number) => simulate({ ...p, v0: v }, false).perforated;
  if (!perf(vMax)) return NaN;
  let lo = 0.5,
    hi = vMax;
  if (perf(lo)) return lo;
  for (let i = 0; i < 22; i++) {
    const mid = 0.5 * (lo + hi);
    if (perf(mid)) hi = mid;
    else lo = mid;
  }
  return hi;
}
