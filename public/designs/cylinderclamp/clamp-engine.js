// ─────────────────────────────────────────────────────────────────────────────
// clamp-engine.js — shared physics for the CYLINDER CLAMP calculator prototypes.
//
// The part: a two-piece pillow-block / split clamp (printed or machined) that
// grips a cylinder (solid rod or hollow tube) with N bolts, N/2 per side.
//
// The chain the whole calculator hangs on (everything is linear in torque
// until the flange gap bottoms out):
//
//   wrench torque T ──► per-bolt preload Fb = T/(K·d)
//        Fb×N = Ftot ──► diametral clamp force on the cylinder  Fcl
//              Fcl  ──► contact pressure p = Fcl/(D·W)
//                p  ──► holding: Fax = η·μ·π·Fcl, Thold = Fax·D/2
//                Fb ──► flange (ear) bending σf, deflection δf
//               Fcl ──► tube hoop crush + ovalization (hollow cylinders)
//        δf, δoval  ──► GAP CLOSURE: once the ear faces touch, extra torque
//                       goes into the flange joint, NOT into grip → Fcl caps.
//                Fb ──► bearing pressure under head/nut (crushes plastic)
//           plastic ──► creep: printed clamps relax 40–55% of preload over
//                       time, so grip is reported fresh AND long-term.
//
// Units inside: mm, N, MPa (N/mm²). Torque I/O in N·m.
// Reference-quality typical values — verify before production use.
// ─────────────────────────────────────────────────────────────────────────────
(typeof window !== "undefined" ? window : globalThis).CLAMP = (() => {
  // ISO coarse threads: d, pitch, tensile stress area (ISO 898-1).
  const THREADS = {
    M3: { d: 3, p: 0.5, As: 5.03 },
    M4: { d: 4, p: 0.7, As: 8.78 },
    M5: { d: 5, p: 0.8, As: 14.2 },
    M6: { d: 6, p: 1.0, As: 20.1 },
    M8: { d: 8, p: 1.25, As: 36.6 },
    M10: { d: 10, p: 1.5, As: 58.0 },
  };

  // Bolt property classes: proof / yield strength, MPa.
  const CLASSES = {
    "4.8 (low-carbon)": { sp: 310, sy: 340 },
    "8.8 (Q&T steel)": { sp: 580, sy: 640 },
    "10.9 (alloy Q&T)": { sp: 830, sy: 940 },
    "12.9 (alloy Q&T)": { sp: 970, sy: 1100 },
    "A2-70 (stainless)": { sp: 410, sy: 450 },
  };

  // Nut factor K for T = K·F·d (±25% scatter in real joints).
  const KFACT = {
    "Dry, plain (K≈0.20)": 0.2,
    "Zinc plated, dry (K≈0.22)": 0.22,
    "Oiled (K≈0.15)": 0.15,
    "Anti-seize (K≈0.12)": 0.12,
  };

  // Clamp-body materials. E in MPa; sy = yield/strength MPa (FDM: XY in-plane);
  // pG = permissible bearing pressure under head; creep = fraction of preload
  // RETAINED long-term (plastics relax); printed → orientation warnings.
  const CLAMP_MATS = {
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

  // Cylinder materials (the thing being clamped). E MPa, sy MPa.
  const CYL_MATS = {
    "Steel tube (S235 / DOM)": { E: 200000, sy: 235 },
    "Steel, alloy (S355 / 4140)": { E: 200000, sy: 355 },
    "Stainless 304 tube": { E: 193000, sy: 215 },
    "Aluminum 6061-T6": { E: 68900, sy: 276 },
    "Aluminum 6063-T5": { E: 68900, sy: 145 },
    "Hard chromed rod": { E: 200000, sy: 600 },
  };

  // Bore↔cylinder friction presets. Real values scatter — allow override.
  const MU = {
    "Printed plastic ↔ steel, dry (μ≈0.30)": 0.3,
    "Aluminum ↔ steel, dry (μ≈0.35)": 0.35,
    "Steel ↔ steel, dry (μ≈0.40)": 0.4,
    "Conservative / unsure (μ≈0.25)": 0.25,
    "Smooth or slightly oily (μ≈0.15)": 0.15,
  };

  const ETA = 0.75; // contact efficiency: real bore pressure is non-uniform, derate uniform-p holding
  const LAMBDA = 0.2; // fraction of clamp load treated as an ovalizing (non-uniform) pinch on a tube
  const DW = 1.5, DW_WASHER = 2.2, DH = 1.06; // head face / washer / clearance-hole ratios vs d
  const TARGET_PRELOAD_FRACTION = 0.65; // bolt-side design target vs proof

  function defaults() {
    return {
      // cylinder
      D: 25, hollow: true, tw: 2, cyl: "Steel tube (S235 / DOM)",
      // clamp body — ONE height dimension; the ear and crown sections follow
      mat: "PC-ABS (FDM)", W: 40, H: 26, e: 9, gap: 2.0, washer: true,
      // bolts
      N: 4, thread: "M5", cls: "8.8 (Q&T steel)", Kname: "Dry, plain (K≈0.20)", T: 1.2,
      // duty
      muName: "Printed plastic ↔ steel, dry (μ≈0.30)", Freq: 400, Treq: 3, SFt: 2,
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
    const th = THREADS[inp.thread], cl = CLASSES[inp.cls];
    const cm = CLAMP_MATS[inp.mat], cy = CYL_MATS[inp.cyl];
    const K = KFACT[inp.Kname], mu = inp.mu ?? MU[inp.muName];
    const { D, W, e, gap, N, T } = inp;

    // ── Body geometry: a FLAT rectangular block, one height dimension ────────
    // H = height of the body above the split face. Everything else follows, so
    // the two bending sections can never contradict each other:
    //   ear section   tf = H                (flange face → top of the block)
    //   crown section tc = g2 + H − R       (top of the bore → top of the block)
    // Older callers may still pass tf; treat it as H.
    const g2 = Math.max(gap, 0) / 2;
    const H = Math.max(inp.H != null ? inp.H : inp.tf != null ? inp.tf : 12, 0.2);
    const tf = H;
    const tcRaw = g2 + H - D / 2;
    const tc = Math.max(tcRaw, 0.05); // guard: no material over the bore
    const tw = Math.min(inp.tw, D / 2);
    const d = th.d, As = th.As;

    // 1) Torque → per-bolt preload (nut-factor form; T N·m → N·mm).
    const Fb = K > 0 ? (1000 * T) / (K * d) : 0;
    const Ftot = N * Fb;

    // 2) Bolt tightening check: direct tension + thread-friction torsion, von
    //    Mises vs proof (same model as the toolkit's bolt calculator).
    const sigma = Fb / As;
    const ds = Math.sqrt((4 * As) / Math.PI);
    const tau = (16 * (0.5 * 1000 * T)) / (Math.PI * ds ** 3);
    const vm = Math.sqrt(sigma * sigma + 3 * tau * tau);
    const SFbolt = vm > 0 ? cl.sp / vm : Infinity;
    const Trec = (K * d * As * TARGET_PRELOAD_FRACTION * cl.sp) / 1000; // N·m to hit 65% proof

    // 3) Flange (ear) bending stress: the ear alone, as a short cantilever from
    //    the bore wall out to the bolt line. Per-bolt slice of the clamp width:
    const b = W / (N / 2);
    const Zf = (b * tf * tf) / 6;
    const sigmaF = Zf > 0 ? (Fb * e) / Zf : Infinity;
    const SFflange = sigmaF > 0 ? cm.sy / sigmaF : Infinity;

    // 3a) DEFLECTION — this is NOT the ear cantilever. Treating it as one
    //     understates the movement by ~80x, for two reasons: symmetry fixes the
    //     half at the bore CENTRE (span a = R + e, not e), and the section over
    //     the bore is only tc deep, not H — and that thin part sits right at the
    //     root where curvature does the most work.
    //     So integrate the real varying-depth beam: curvature M/EI twice over,
    //     θ(0) = 0 by symmetry, free overhang past the bolt.
    const aBolt = D / 2 + e;
    const halfW = D / 2 + e + 1.7 * d;
    const NSEG = 240;
    const shapeZ = [0], shapeD = [0], shapeT = [0];
    {
      const dz = halfW / NSEG;
      let th = 0, dd = 0;
      for (let i = 0; i < NSEG; i++) {
        const z = (i + 0.5) * dz;
        const yLo = z < D / 2 ? Math.max(Math.sqrt(Math.max((D / 2) ** 2 - z * z, 0)) - g2, 0) : 0;
        const hSec = Math.max(H - yLo, 0.05);
        const Iz = (b * hSec ** 3) / 12;
        let M = z < aBolt ? Fb * (aBolt - z) : 0;
        if (z < D / 2) M -= (Fb * Math.pow(D / 2 - z, 2)) / (2 * (D / 2));
        const kappa = Iz > 0 ? M / (cm.E * Iz) : 0;
        dd += (th + (kappa * dz) / 2) * dz;
        th += kappa * dz;
        shapeZ.push((i + 1) * dz);
        shapeD.push(dd);
        shapeT.push(th);
      }
    }
    const dFl = shapeD[NSEG];                       // ear-tip deflection, mm
    const cFl = Fb > 0 ? dFl / Fb : 0;              // mm per N of bolt force
    // Sampler over the integrated curves, for the 3D view.
    const samp = (arr, z) => {
      const az = Math.min(Math.abs(z), halfW);
      const i = Math.min(Math.floor((az / halfW) * NSEG), NSEG - 1);
      const t = (az / halfW) * NSEG - i;
      return arr[i] + (arr[i + 1] - arr[i]) * t;
    };
    // normalised deflection δ(z)/δ(tip)
    const dfShape = (z) => (dFl > 0 ? samp(shapeD, z) / dFl : 0);
    // section rotation θ(z) in radians. Euler-Bernoulli kinematics: plane
    // sections stay plane and ROTATE, so material off the neutral axis also
    // moves along the beam by −θ·(y−y_na). Without this term every hole keeps
    // its radius no matter how hard the part bends, which is not what happens.
    const dfSlope = (z) => samp(shapeT, z) * Math.sign(z || 1);
    // neutral axis height at z, measured from the flange face
    const dfNA = (z) => {
      const az = Math.abs(z);
      const yLo = az < D / 2 ? Math.max(Math.sqrt(Math.max((D / 2) ** 2 - az * az, 0)) - g2, 0) : 0;
      return (yLo + H) / 2;
    };

    // 3b) Cap crown bending — the "see-saw" statics model: the cap is a beam
    //     resting on the cylinder (pin support), bolt forces F at ±(R+e) pull
    //     the ends down, the bore reaction pushes up distributed over ±R.
    //     Peak moment at mid-span: M = F·(e + R/2) on the crown section b × tc.
    //     tc is always thinner than the ear on a flat block, which is exactly
    //     why these clamps crack over the bore rather than at the bolts.
    const Zc = (b * tc * tc) / 6;
    const Mcrown = Fb * (e + D / 4); // e + R/2
    const sigmaCrown = Zc > 0 ? Mcrown / Zc : Infinity;
    const SFcrown = sigmaCrown > 0 ? cm.sy / sigmaCrown : Infinity;

    // 4) Cylinder compliance: hollow tubes ovalize under the diametral pinch.
    //    Ring model (per mm of width, I = tw³/12), only the non-uniform share
    //    λ of the pressure bends the ring — uniform pressure is pure hoop.
    const Rm = (D - tw) / 2;
    const Iring = tw ** 3 / 12;
    const cOval = inp.hollow ? (0.149 * LAMBDA * Rm ** 3) / (cy.E * Iring) / W : 0; // mm per N of Fcl

    // 5) GAP CLOSURE — the interaction that makes or breaks these clamps.
    //    Closure per N of total clamp force: tube ovalization + both ears
    //    bending toward each other. (2·cFl/N per total-force newton.)
    const cClose = cOval + (2 * cFl) / N;
    const Fclose = cClose > 0 ? gap / cClose : Infinity; // total force at which ears touch
    const bottomed = Ftot > Fclose;
    const Fcl = Math.min(Ftot, Fclose); // force actually reaching the cylinder
    const Tclose = Ftot > 0 ? (T * Fclose) / Ftot : Infinity; // per-bolt torque at touch
    const closure = cClose * Fcl;
    const gapRemain = Math.max(0, gap - cClose * Ftot);

    // 6) Contact pressure and cylinder stress.
    const p = Fcl / (D * W);
    let hoop = 0, bend = 0, sigmaCyl, SFcyl, dOval = 0;
    if (inp.hollow) {
      hoop = (p * Rm) / tw; // uniform crush component
      const q = Fcl / W; // pinch line-load, N/mm
      bend = (6 * (0.182 * LAMBDA * q * Rm)) / (tw * tw); // ovalizing bending
      sigmaCyl = hoop + bend;
      dOval = cOval * Fcl; // diametral ovalization, mm
    } else {
      sigmaCyl = p; // conformal bore: bearing-style check
    }
    SFcyl = sigmaCyl > 0 ? cy.sy / sigmaCyl : Infinity;

    // 7) Bearing under head/nut — the classic plastic-clamp killer.
    const dw = (inp.washer ? DW_WASHER : DW) * d;
    const Abear = (Math.PI / 4) * (dw * dw - (DH * d) ** 2);
    const pHead = Abear > 0 ? Fb / Abear : Infinity;
    const SFbear = pHead > 0 ? cm.pG / pHead : Infinity;

    // 8) Holding capacity — fresh, and long-term after plastic creep relaxes
    //    the preload (creep = retained fraction).
    const Fax = ETA * mu * Math.PI * Fcl;
    const Thold = (Fax * (D / 2)) / 1000; // N·m
    const FaxLT = Fax * cm.creep;
    const TholdLT = Thold * cm.creep;

    // 9) Duty check: axial force + torque demands superposed linearly
    //    (conservative). Grip SF = 1/utilization.
    const util = (fa, th_) => (inp.Freq > 0 ? inp.Freq / fa : 0) + (inp.Treq > 0 ? inp.Treq / th_ : 0);
    const U = util(Fax, Thold);
    const ULT = util(FaxLT, TholdLT);
    const SFslip = U > 0 ? 1 / U : Infinity;
    const SFslipLT = ULT > 0 ? 1 / ULT : Infinity;

    // 10) Event ladder: per-bolt torque at which each thing happens (all linear
    //     in T below gap-close; grip & cylinder stress cap at Tclose).
    const lin = (limit, cur) => (cur > 0 && T > 0 ? (T * limit) / cur : Infinity);
    const capped = (t) => t > Tclose + 1e-9;
    const TgoalRaw = SFslipLT > 0 && isFinite(SFslipLT) ? (T * inp.SFt) / SFslipLT : Infinity;
    const events = [
      { key: "goal", label: `Grip goal met (SF ${inp.SFt}, long-term)`, T: TgoalRaw, type: "goal", capped: capped(TgoalRaw) },
      { key: "gap", label: "Flange gap closes — grip stops growing", T: Tclose, type: "info", capped: false },
      { key: "bear", label: inp.washer ? "Bearing limit under washer" : "Head crushes clamp surface", T: lin(cm.pG, pHead), type: "limit", capped: false },
      { key: "flange", label: "Flange bending hits clamp yield", T: lin(cm.sy, sigmaF), type: "limit", capped: false },
      { key: "crown", label: "Cap crown yields over the bore (see-saw bending)", T: lin(cm.sy, sigmaCrown), type: "limit", capped: false },
      { key: "cyl", label: inp.hollow ? "Tube wall yields (crush/ovalization)" : "Bore pressure hits cylinder yield", T: lin(cy.sy, sigmaCyl), type: "limit", capped: capped(lin(cy.sy, sigmaCyl)) },
      { key: "bolt", label: "Bolt hits proof (von Mises)", T: lin(cl.sp, vm), type: "limit", capped: false },
    ].sort((a, b) => a.T - b.T);

    // 11) Warnings.
    const warns = [];
    if (bottomed)
      warns.push({ level: "bad", text: `Flange faces are bottomed out: past ${fmt(Tclose, 2)} N·m per bolt, extra torque clamps flange-on-flange instead of gripping the cylinder. Widen the gap (machine/print more relief) or accept the grip plateau.` });
    else if (gapRemain < 0.25 * gap)
      warns.push({ level: "warn", text: `Only ${fmt(gapRemain, 2)} mm of the ${fmt(gap, 2)} mm flange gap remains — close to bottoming. Consider a larger as-designed gap.` });
    if (SFbear < 1.2 && !inp.washer)
      warns.push({ level: "warn", text: "Bolt head is crushing the clamp surface — add washers (or increase head bearing area) and re-check." });
    if (cm.printed) {
      warns.push({ level: "info", text: `Printed clamp: expect ~${fmt((1 - cm.creep) * 100, 0)}% preload loss to creep/stress-relaxation. Long-term grip readouts already include it; re-torque after 24 h helps.` });
      warns.push({ level: "info", text: "Print orientation: lay the part so flange bending stresses run along the layers (bore axis vertical = ears loaded across layers = much weaker than the XY numbers used here)." });
    }
    if (inp.hollow && tw < D / 16)
      warns.push({ level: "warn", text: `Thin wall (t = ${fmt(tw, 2)} mm on Ø${fmt(D, 1)}): tube dents/ovalizes easily — the cylinder, not the clamp, may be the limit. A snug bore fit and full-width contact matter more than torque.` });
    if (SFflange < 1.2)
      warns.push({ level: "bad", text: "Flange (ear) bending is at/over yield — thicken the ears (tf), shorten the bolt-to-bore distance (e), or add bolts to split the load." });
    if (SFcrown < 1.2)
      warns.push({ level: "bad", text: "Cap crown is at/over yield — the cap bends over the cylinder like a see-saw. Thicken the crown wall (tc) or shorten the bolt offset (e)." });
    warns.push({ level: "info", text: "K (nut factor) and μ each scatter ±25% between real joints — treat grip numbers as a band, not a line." });

    if (tcRaw < 0.5)
      warns.push({
        level: "bad",
        text: `Only ${fmt(Math.max(tcRaw, 0), 2)} mm of material sits over the bore (crown). The body height H must exceed the bore radius ${fmt(D / 2, 1)} mm by a useful margin — raise H or shrink the bore.`,
      });

    const SFstruct = Math.min(SFbolt, SFflange, SFcrown, SFbear, SFcyl);
    const governing =
      SFstruct === SFflange ? "flange bending" : SFstruct === SFcrown ? "cap crown bending" : SFstruct === SFbear ? "head bearing" : SFstruct === SFcyl ? (inp.hollow ? "tube wall" : "bore pressure") : "bolt proof";

    return {
      d, As, Fb, Ftot, sigma, tau, vm, SFbolt, Trec,
      b, Zf, sigmaF, SFflange, cFl, dFl,
      H, tf, tc, tcRaw, g2, Zc, Mcrown, sigmaCrown, SFcrown, aBolt, halfW, dfShape, dfSlope, dfNA,
      Rm, cOval, dOval, cClose, Fclose, Tclose, bottomed, Fcl, closure, gapRemain,
      p, hoop, bend, sigmaCyl, SFcyl,
      dw, Abear, pHead, SFbear,
      Fax, Thold, FaxLT, TholdLT, U, ULT, SFslip, SFslipLT,
      events, warns, SFstruct, governing,
      creep: cm.creep, printed: !!cm.printed, mu, K,
    };
  }

  // ── Recommended tightening torque ──────────────────────────────────────────
  // Answers "how tight?" from all three sides at once: the BOLT (proof stress),
  // the MATERIALS (whichever of ear / crown / bearing / cylinder yields first)
  // and the GEOMETRY (no point tightening past the torque that shuts the gap,
  // because grip stops growing there).
  //
  // Every stress is linear in torque, so one probe solve gives every limit by
  // proportion. The recommendation sits a design margin below the first limit.
  const DESIGN_MARGIN = 1.5; // keep the governing structural check at SF ≥ 1.5

  function recommend(inp, margin = DESIGN_MARGIN) {
    const probe = solve({ ...inp, T: 1 }); // stresses per 1 N·m
    const cm = CLAMP_MATS[inp.mat], cy = CYL_MATS[inp.cyl], cl = CLASSES[inp.cls];
    const at = (allow, per) => (per > 0 ? allow / per : Infinity);

    const limits = [
      { key: "crown bending", T: at(cm.sy, probe.sigmaCrown) },
      { key: "ear bending", T: at(cm.sy, probe.sigmaF) },
      { key: inp.washer ? "bearing under washer" : "bearing under bolt head", T: at(cm.pG, probe.pHead) },
      { key: inp.hollow ? "tube wall" : "bore pressure", T: at(cy.sy, probe.sigmaCyl) },
      { key: "bolt proof", T: at(cl.sp, probe.vm) },
    ].sort((a, b) => a.T - b.T);

    const first = limits[0];
    const Tyield = first.T; // torque at which something first reaches yield/proof
    const Tclose = probe.Tclose; // torque that shuts the flange gap
    const Tbolt65 = probe.Trec; // classic 65%-of-proof bolt target

    // The recommendation: a margin below first yield, never past gap closure,
    // never past the bolt's own 65%-proof target.
    let T = Math.min(Tyield / margin, Tbolt65, Tclose);
    let governing = T === Tclose ? "flange gap closes" : T === Tbolt65 ? "bolt preload target (65% proof)" : first.key;

    // What the duty actually demands (long-term, after creep).
    const demand = Math.max(0, inp.Freq) + (2000 * Math.max(0, inp.Treq)) / inp.D;
    const FclReq = (inp.SFt * demand) / (ETA * (inp.mu ?? MU[inp.muName]) * Math.PI * cm.creep);
    const Tneed = probe.Fb > 0 ? FclReq / (inp.N * probe.Fb) : Infinity;

    const ok = T >= Tneed;
    return {
      T: Math.max(T, 0),
      Tyield,
      Tclose,
      Tbolt65,
      Tneed,
      governing,
      limits,
      ok,
      margin,
      SFat: solve({ ...inp, T }).SFstruct,
    };
  }

  // ── Curved-beam cross-check on the crown ───────────────────────────────────
  // The crown is not a straight beam: it is a curved segment whose centre of
  // curvature is the bore. Straight-beam theory puts the neutral axis at
  // mid-depth; in a curved member it shifts toward the bore and the stress
  // distribution goes hyperbolic. Winkler-Bach gives the honest surface values,
  // and the gap between the two is a measure of how much the main model is off.
  function curvedBeam(inp, res) {
    const ri = inp.D / 2, ro = ri + res.tc, h = res.tc, A = res.b * h;
    if (!(ri > 0 && ro > ri && A > 0)) return null;
    const rn = h / Math.log(ro / ri);      // neutral-axis radius
    const rc = (ri + ro) / 2;              // centroid radius
    const ecc = rc - rn;                   // shift toward the bore
    if (!(ecc > 1e-9)) return null;
    const perM_in = (rn - ri) / (A * ecc * ri);
    const perM_out = Math.abs(rn - ro) / (A * ecc * ro);
    const perM_straight = h / 2 / ((res.b * Math.pow(h, 3)) / 12);
    return {
      ri, ro, h, rn, rc, ecc, roRi: ro / ri, slenderness: rc / h,
      sigIn: res.Mcrown * perM_in, sigOut: res.Mcrown * perM_out,
      sigStraight: res.Mcrown * perM_straight,
      ratioIn: perM_in / perM_straight, ratioOut: perM_out / perM_straight,
    };
  }

  // ── Fastener-side tightening spec ──────────────────────────────────────────
  // The classic bolted-joint answer, same as the toolkit's bolt calculator:
  // what torque suits THIS fastener, capped by what the CONNECTED material can
  // take under the head. Independent of the clamp's bending checks — a plastic
  // body usually needs far less than the fastener could carry, which is exactly
  // why both numbers are worth showing side by side.
  function boltSpec(inp) {
    const th = THREADS[inp.thread], cl = CLASSES[inp.cls];
    const cm = CLAMP_MATS[inp.mat], K = KFACT[inp.Kname];
    const d = th.d, As = th.As;

    const F65 = TARGET_PRELOAD_FRACTION * cl.sp * As; // N at 65% of proof
    const T65 = (K * d * F65) / 1000; // N·m

    const dw = (inp.washer ? DW_WASHER : DW) * d, dh = DH * d;
    const Abear = (Math.PI / 4) * (dw * dw - dh * dh);
    const Fbear = cm.pG * Abear; // N that just reaches permissible bearing
    const Tbear = (K * d * Fbear) / 1000;

    const T = Math.min(T65, Tbear);
    return { d, As, F65, T65, dw, dh, Abear, Fbear, Tbear, T, pG: cm.pG, sp: cl.sp, K,
      governs: Tbear < T65 ? "bearing on the clamped material" : "bolt proof strength" };
  }

  // ── Signed bending stress anywhere on the body section ─────────────────────
  // Drives the smooth tension/compression colouring. The half is a beam: bolt
  // loads down at ±(R+e), bore reaction up spread over ±R. Hogging over the
  // bore puts the OUTER surface in tension and the bore surface in compression.
  // z = transverse position from the bore centre, y = height above the flange
  // face. Returns σ/σyield: positive tension, negative compression.
  function bodyStressRatio(inp, res, z, y) {
    const R = inp.D / 2, a = R + inp.e, F = res.Fb, az = Math.abs(z);
    if (az >= a || F <= 0) return 0;
    let M = F * (a - az);
    // inside the bore span the distributed reaction relieves the moment
    if (az < R) M -= (F * Math.pow(R - az, 2)) / (2 * R);
    // section available at this z: from the bore surface (or flange face) to the top
    const yLo = az < R ? Math.max(Math.sqrt(Math.max(R * R - az * az, 0)) - res.g2, 0) : 0;
    const yHi = res.H;
    const h = Math.max(yHi - yLo, 1e-6);
    const yn = (yLo + yHi) / 2;
    const I = (res.b * Math.pow(h, 3)) / 12;
    const sig = I > 0 ? (M * (y - yn)) / I : 0;
    return sig / (CLAMP_MATS[inp.mat].sy || 1);
  }

  // Toolkit stress ramp: neutral green → amber → red in tension,
  // neutral green → teal → blue in compression. Returns [r,g,b] in 0..1.
  const NEUTRAL = [0.31, 0.706, 0.467];
  const T_STOPS = [[0, NEUTRAL], [0.5, [0.85, 0.55, 0.22]], [1, [0.84, 0.27, 0.27]], [1.4, [1, 0.3, 0.3]]];
  const C_STOPS = [[0, NEUTRAL], [0.5, [0.2, 0.58, 0.68]], [1, [0.27, 0.46, 0.9]], [1.4, [0.3, 0.4, 1]]];
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
  const stressRGB = (signed) => (signed >= 0 ? ramp(T_STOPS, signed) : ramp(C_STOPS, -signed));

  // ── Bolt-count advisor: work BACKWARDS from the duty ───────────────────────
  // For n = 2, 4, 6: how much torque per bolt to meet the grip target
  // long-term, and does the clamp survive it?
  function advise(inp) {
    const th = THREADS[inp.thread];
    const cm = CLAMP_MATS[inp.mat];
    const K = KFACT[inp.Kname], mu = inp.mu ?? MU[inp.muName];
    const demand = Math.max(0, inp.Freq) + (2000 * Math.max(0, inp.Treq)) / inp.D; // equivalent axial, N
    const FclReq = (inp.SFt * demand) / (ETA * mu * Math.PI * cm.creep); // clamp force needed, long-term
    const out = [2, 4, 6].map((n) => {
      const Fb = FclReq / n;
      const T = (K * th.d * Fb) / 1000;
      const r = solve({ ...inp, N: n, T });
      const checks = { flange: r.SFflange, crown: r.SFcrown, bearing: r.SFbear, bolt: r.SFbolt, cylinder: r.SFcyl };
      const worst = Math.min(...Object.values(checks));
      const ok = worst >= 1 && !r.bottomed;
      const worstKey = Object.keys(checks).find((k) => checks[k] === worst);
      // Pressure uniformity along the clamp width: with few bolts on a wide
      // clamp the ends lift — rule of thumb: bolt "tributary" width ≤ ~4·tf.
      const spacing = inp.W / (n / 2);
      const spacingOk = spacing <= 4 * r.H;
      return { n, Fb, T, r, checks, worst, worstKey, ok: ok && spacingOk, structOk: ok, spacing, spacingOk, bottomed: r.bottomed };
    });
    const rec = out.find((o) => o.ok && o.worst >= 1.2) || out.find((o) => o.ok) || null;
    return { demand, FclReq, options: out, rec };
  }

  // ── Shared cross-section renderer (front view, bore axis into screen) ─────
  // Draws cap + base + ears + bolts + cylinder into an <svg>, with deformation
  // exaggerated ×ex: ears bend toward each other, tube ovalizes, gap shrinks.
  // Parts carry data-part attributes; opts.onPick(part) wires click handling.
  function renderSection(svg, inp, res, opts = {}) {
    const ex = opts.exagg ?? 20;
    const { D, e, gap } = inp;
    const R = D / 2;
    const dB = res.d;
    const tf = res.tf; // flat body: ear section = body height above the split
    const eW = e + 1.7 * dB; // ear reach past the bore wall
    const Ro = R + res.tc; // top of the block, measured from the bore centre
    const half = R + eW; // half overall width
    const yTopEar = -(gap / 2 + tf);
    const yBotEar = gap / 2 + tf;
    const baseBottom = R + tf;
    const headH = 0.6 * dB, nutH = 0.8 * dB, headW = 1.7 * dB;
    const xc = Math.sqrt(Math.max(Ro * Ro - yTopEar * yTopEar, 0.01));

    // deformation (exaggerated): ear tips bend inward; tube goes elliptical
    const bendY = Math.min(res.dFl * ex, gap / 2 + tf * 0.4);
    const oval = Math.min((res.dOval || 0) * ex, R * 0.25);
    const shut = res.bottomed;

    const earTop = (sx) => {
      // cap ear (top piece): bottom face at -gap/2 bends DOWN by bendY at the tip
      const x0 = sx * R, x1 = sx * half;
      const xb = sx * (R + e); // bolt line
      return `M ${x0} ${-gap / 2}
        L ${xb} ${-gap / 2 + bendY * 0.7} L ${x1} ${-gap / 2 + bendY}
        L ${x1} ${yTopEar + bendY} L ${sx * xc} ${yTopEar} Z`;
    };
    const earBot = (sx) => {
      const x0 = sx * R, x1 = sx * half;
      const xb = sx * (R + e);
      return `M ${x0} ${gap / 2}
        L ${xb} ${gap / 2 - bendY * 0.7} L ${x1} ${gap / 2 - bendY}
        L ${x1} ${yBotEar - bendY} L ${sx * xc} ${yBotEar} Z`;
    };

    const capPath = `M ${-xc} ${yTopEar} A ${Ro} ${Ro} 0 0 1 ${xc} ${yTopEar}
      L ${R} ${-gap / 2} A ${R} ${R} 0 0 0 ${-R} ${-gap / 2} Z`;
    const basePath = `M ${-xc} ${yBotEar} L ${-Ro} ${baseBottom} L ${Ro} ${baseBottom} L ${xc} ${yBotEar}
      L ${R} ${gap / 2} A ${R} ${R} 0 0 1 ${-R} ${gap / 2} Z`;

    const tone = CLAMP_MATS[inp.mat].tone;
    const cylFill = sfColor(res.SFcyl);
    const flFill = sfColor(res.SFflange);
    const gapCol = shut ? "#d65c5c" : res.gapRemain < 0.25 * gap ? "#d9a441" : "#4fb477";

    const bolt = (sx) => {
      const x = sx * (R + e);
      return `
      <g data-part="bolts" class="hot">
        <rect x="${x - dB / 2}" y="${yTopEar - 1}" width="${dB}" height="${yBotEar - yTopEar + 2}" fill="#232c34" stroke="#0e1419" stroke-width="0.4"/>
        <rect x="${x - headW / 2}" y="${yTopEar + bendY - headH}" width="${headW}" height="${headH}" rx="0.6" fill="${sfColor(res.SFbolt)}" opacity="0.85"/>
        <rect x="${x - headW / 2}" y="${yBotEar - bendY}" width="${headW}" height="${nutH}" rx="0.6" fill="${sfColor(res.SFbear)}" opacity="0.85"/>
      </g>`;
    };

    const rx = R + oval / 2, ry = Math.max(R - oval / 2, R * 0.5);
    const tw = Math.min(inp.tw, R - 0.1);
    const cyl = inp.hollow
      ? `<path data-part="cylinder" class="hot" fill-rule="evenodd" fill="${cylFill}" fill-opacity="0.5" stroke="${cylFill}" stroke-width="0.8"
           d="M ${-rx} 0 A ${rx} ${ry} 0 1 0 ${rx} 0 A ${rx} ${ry} 0 1 0 ${-rx} 0 Z
              M ${-(rx - tw)} 0 A ${rx - tw} ${ry - tw} 0 1 0 ${rx - tw} 0 A ${rx - tw} ${ry - tw} 0 1 0 ${-(rx - tw)} 0 Z"/>`
      : `<ellipse data-part="cylinder" class="hot" cx="0" cy="0" rx="${rx}" ry="${ry}" fill="${cylFill}" fill-opacity="0.5" stroke="${cylFill}" stroke-width="0.8"/>`;

    const pad = headH + 4;
    const vb = `${-half - pad} ${yTopEar - pad} ${2 * (half + pad)} ${baseBottom - yTopEar + 2 * pad}`;
    svg.setAttribute("viewBox", vb);
    svg.innerHTML = `
      <path data-part="clamp" class="hot" d="${capPath}" fill="${tone}" stroke="#5a6672" stroke-width="0.5"/>
      <path data-part="clamp" class="hot" d="${basePath}" fill="${tone}" stroke="#5a6672" stroke-width="0.5"/>
      <path data-part="clamp" class="hot" d="${earTop(-1)}" fill="${flFill}" fill-opacity="0.55" stroke="#5a6672" stroke-width="0.5"/>
      <path data-part="clamp" class="hot" d="${earTop(1)}" fill="${flFill}" fill-opacity="0.55" stroke="#5a6672" stroke-width="0.5"/>
      <path data-part="clamp" class="hot" d="${earBot(-1)}" fill="${flFill}" fill-opacity="0.55" stroke="#5a6672" stroke-width="0.5"/>
      <path data-part="clamp" class="hot" d="${earBot(1)}" fill="${flFill}" fill-opacity="0.55" stroke="#5a6672" stroke-width="0.5"/>
      ${cyl}
      ${bolt(-1)}${bolt(1)}
      <line x1="${R + 1}" y1="0" x2="${half}" y2="0" stroke="${gapCol}" stroke-width="0.5" stroke-dasharray="1.5 1.5" opacity="0.9"/>
      <line x1="${-half}" y1="0" x2="${-R - 1}" y2="0" stroke="${gapCol}" stroke-width="0.5" stroke-dasharray="1.5 1.5" opacity="0.9"/>
      ${shut ? `<g font-family="monospace" font-size="3.2" fill="#d65c5c" text-anchor="middle"><text x="0" y="${baseBottom + pad * 0.7}">FLANGES BOTTOMED — GRIP CAPPED</text></g>` : ""}
    `;
    if (opts.onPick) {
      svg.querySelectorAll(".hot").forEach((el) => {
        el.style.cursor = "pointer";
        el.addEventListener("click", () => opts.onPick(el.getAttribute("data-part")));
      });
    }
  }

  return { THREADS, CLASSES, KFACT, CLAMP_MATS, CYL_MATS, MU, ETA, LAMBDA, DESIGN_MARGIN,
    defaults, solve, recommend, boltSpec, curvedBeam, bodyStressRatio, stressRGB, advise, renderSection, fmt, sfStatus, sfColor };
})();
