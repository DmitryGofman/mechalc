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
      // clamp body
      mat: "PC-ABS (FDM)", W: 30, tf: 12, tc: 16, e: 10, gap: 1.5, washer: true,
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
    const { D, W, tf, e, gap, N, T } = inp;
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

    // 3) Flange (ear) bending: each ear is a short cantilever from the bore
    //    wall to the bolt line. Per-bolt slice of the clamp width:
    const b = W / (N / 2);
    const Zf = (b * tf * tf) / 6;
    const If = (b * tf ** 3) / 12;
    const sigmaF = Zf > 0 ? (Fb * e) / Zf : Infinity;
    const SFflange = sigmaF > 0 ? cm.sy / sigmaF : Infinity;
    const cFl = If > 0 ? e ** 3 / (3 * cm.E * If) : Infinity; // mm per N of bolt force
    const dFl = cFl * Fb;

    // 3b) Cap crown bending — the "see-saw" statics model: the cap is a beam
    //     resting on the cylinder (pin support), bolt forces F at ±(R+e) pull
    //     the ends down, the bore reaction pushes up distributed over ±R.
    //     Peak moment at mid-span: M = F·(e + R/2), section = b × tc (crown
    //     wall over the bore, usually thicker than the ears).
    const tc = inp.tc || tf;
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

    const SFstruct = Math.min(SFbolt, SFflange, SFcrown, SFbear, SFcyl);
    const governing =
      SFstruct === SFflange ? "flange bending" : SFstruct === SFcrown ? "cap crown bending" : SFstruct === SFbear ? "head bearing" : SFstruct === SFcyl ? (inp.hollow ? "tube wall" : "bore pressure") : "bolt proof";

    return {
      d, As, Fb, Ftot, sigma, tau, vm, SFbolt, Trec,
      b, Zf, sigmaF, SFflange, cFl, dFl,
      tc, Zc, Mcrown, sigmaCrown, SFcrown,
      Rm, cOval, dOval, cClose, Fclose, Tclose, bottomed, Fcl, closure, gapRemain,
      p, hoop, bend, sigmaCyl, SFcyl,
      dw, Abear, pHead, SFbear,
      Fax, Thold, FaxLT, TholdLT, U, ULT, SFslip, SFslipLT,
      events, warns, SFstruct, governing,
      creep: cm.creep, printed: !!cm.printed, mu, K,
    };
  }

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
      const spacingOk = spacing <= 4 * inp.tf;
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
    const { D, tf, e, gap } = inp;
    const R = D / 2;
    const dB = res.d;
    const eW = e + 1.7 * dB; // ear reach past the bore wall
    const Ro = R + (inp.tc || tf); // crown / body outer radius
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

  return { THREADS, CLASSES, KFACT, CLAMP_MATS, CYL_MATS, MU, ETA, LAMBDA, defaults, solve, advise, renderSection, fmt, sfStatus, sfColor };
})();
