// Theory pages for the bolted-joint calculator.
//
// Same idea as the cylinder clamp's theory tabs: not a static formula sheet,
// but the derivation worked through with the numbers currently in the inputs,
// so every line can be checked against the readouts on the model tab. All of
// it respects the metric/imperial toggle — the arithmetic is substituted in
// whichever units are on screen, and the nut-factor relation happens to be
// unit-consistent in both (T[N·m] = K·F[N]·d[m], T[lbf·in] = K·F[lbf]·d[in]).

import { FR, V, eqn } from "./typeset";
import { q, qu, type UnitPack } from "./units";
import { DW_WASHER_RATIO } from "./fasteners";
import {
  DHOLE_RATIO,
  DW_RATIO,
  PLATE_MATERIALS,
  SAE_CLASSES,
  bearingArea,
  fastenerSpec,
  serviceFastenerSpec,
} from "./boltMath";
import type { BoltClass, JointResults, PlateMaterial, ThreadSpec } from "./boltMath";

// Everything the theory pages read: the inputs, the solved joint, and the
// unit system to render them in.
export type BoltState = {
  threadKey: string;
  thread: ThreadSpec;
  classKey: string;
  cls: BoltClass;
  fricKey: string;
  K: number;
  mat1Key: string;
  m1: PlateMaterial;
  mat2Key: string;
  m2: PlateMaterial;
  t1: number; // mm
  t2: number; // mm
  Pext: number; // N
  T: number; // N·m
  washer: boolean; // plain washers under head and nut
  preloadFrac: number; // preload target, fraction of proof
  r: JointResults;
  U: UnitPack;
};

// How much the (real, micron-scale) elastic deflections are exaggerated in the
// 3D view so you can see the bolt stretch and the plates squash. Lives here
// because the theory page has to quote it while explaining the picture.
export const VIEW_EXAG = 40;

const GREEN = "#4fb477";
const AMBER = "#d9a441";
const RED = "#d65c5c";

const sfColor = (n: number) => (n >= 1.25 ? GREEN : n >= 1 ? AMBER : RED);
// "8.8 (medium-carbon, Q&T)" → "8.8"; "SAE Grade 5 (medium-carbon, Q&T)" →
// "SAE Grade 5". The metric classes are one token, the SAE grades are three.
const grade = (classKey: string) => classKey.split(" (")[0];
const sf = (n: number) => (isFinite(n) ? n.toFixed(2) : "∞");
const n0 = (v: number) => (isFinite(v) ? Math.round(v).toLocaleString("en-US") : "∞");

// Per-quantity shortcuts against the active unit system. `x` gives the bare
// number, `xu` the number with its symbol.
function conv(U: UnitPack) {
  return {
    len: (mm: number) => q(U.length, mm),
    lenu: (mm: number) => qu(U.length, mm),
    area: (mm2: number) => q(U.area, mm2),
    areau: (mm2: number) => qu(U.area, mm2),
    // Forces are shown whole in both systems — N and lbf are close enough in
    // magnitude that a thousands separator reads better than a scale prefix.
    force: (N: number) => n0(U.force.from(N)),
    forceu: (N: number) => `${n0(U.force.from(N))} ${U.force.label}`,
    torque: (Nm: number) => q(U.torque, Nm),
    torqueu: (Nm: number) => qu(U.torque, Nm),
    // Stresses arrive from the solver in pascals; the material tables are MPa.
    pa: (Pa: number) => q(U.stress, Pa / 1e6),
    pau: (Pa: number) => qu(U.stress, Pa / 1e6),
    mpa: (MPa: number) => q(U.stress, MPa),
    mpau: (MPa: number) => qu(U.stress, MPa),
    gpa: (GPa: number) => q(U.modulus, GPa),
    gpau: (GPa: number) => qu(U.modulus, GPa),
    micro: (m: number) => q(U.micro, m),
    microu: (m: number) => qu(U.micro, m),
    stiff: (Npm: number) => q(U.stiffness, Npm),
    stiffu: (Npm: number) => qu(U.stiffness, Npm),
    // ── keeping the substituted arithmetic dimensionally honest ──
    // The two systems each have one place where the display units don't
    // multiply out cleanly, and a worked line you can't check on a calculator
    // is worse than no worked line at all.
    //   metric   — torque is N·m while lengths are mm, so T needs ×10³
    //   imperial — force/area lands in psi (and stress×area in kip), so the
    //              result is quoted in both psi and the ksi on the readouts
    torqueSub: (Nm: number) => (U.imperial ? q(U.torque, Nm) : `${q(U.torque, Nm)}×10³`),
    kilo: U.imperial ? " × 10³" : "", // ksi·in² → lbf, Msi·in → klbf/in
    milli: U.imperial ? "" : " / 10³", // N·mm → N·m
    stressRes: (Pa: number) =>
      U.imperial ? `${n0(Pa / 6894.757293168)} psi = ${qu(U.stress, Pa / 1e6)}` : qu(U.stress, Pa / 1e6),
    U,
  };
}

/* ── the joint diagram ─────────────────────────────────────────────────────
   The one picture that explains preloaded joints: bolt and members as two
   springs sharing a deflection axis, meeting at the preload. The external
   load moves the operating point right — the bolt climbs its (shallow) line
   by C·P while the members fall down their (steep) one by (1−C)·P. Why the
   bolt barely feels a load it is nominally carrying, in one figure.
   `forPrint` swaps the palette for ink on paper. */
export function jointDiagramSVG(s: BoltState, forPrint = false): string {
  const { r, Pext } = s;
  const c = conv(s.U);
  const INK = forPrint ? "#333" : "#8b97a3";
  const THIN = forPrint ? "#888" : "#2f3945";
  const DIM = forPrint ? "#666" : "#46515c";
  const BOLT = forPrint ? "#0a6b3d" : GREEN;
  const MEM = forPrint ? "#14459b" : "#3aa0c2";
  const LOAD = forPrint ? "#8a5a00" : AMBER;

  const Fi = Math.max(r.F, 0);
  const kb = r.kb;
  const km = isFinite(r.km) ? r.km : kb * 1e3; // a rigid stack still needs a slope to draw
  const P = Math.max(Pext, 0);
  const db = kb > 0 ? Fi / kb : 0; // bolt stretch at preload, m
  const dm = km > 0 ? Fi / km : 0; // member squash at preload, m
  const dP = kb + km > 0 ? P / (kb + km) : 0; // how far the joint point walks

  const VW = 400;
  const VH = 256;
  const ML = 46;
  const MR = 92;
  const MT = 24;
  const MB = 40;
  const separated = r.Fm <= 0;
  // Axis ranges: always show the whole triangle, plus the loaded state.
  const xMax = Math.max(db + dm + (separated ? dm * 0.35 : 0), db + dP + dm * 0.15, 1e-9);
  const yMax = Math.max(Fi, r.Fb, 1e-9) * 1.18;
  const X = (d: number) => ML + (d / xMax) * (VW - ML - MR);
  const Y = (F: number) => VH - MB - (F / yMax) * (VH - MT - MB);

  const txt = (x: number, y: number, t: string, col = INK, size = 8, anchor = "middle") =>
    `<text x="${x}" y="${y}" font-size="${size}" fill="${col}" text-anchor="${anchor}" font-family="monospace">${t}</text>`;
  const line = (x1: number, y1: number, x2: number, y2: number, col: string, w = 1, dash = "") =>
    `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${col}" stroke-width="${w}"${dash ? ` stroke-dasharray="${dash}"` : ""}/>`;

  const apexX = X(db);
  const apexY = Y(Fi);
  const opX = X(db + dP);
  const FbY = Y(r.Fb);
  const FmY = Y(Math.max(r.Fm, 0));

  return `<svg viewBox="0 0 ${VW} ${VH}" role="img" aria-label="Joint force-deflection diagram">
    <!-- axes -->
    ${line(ML, VH - MB, VW - MR + 8, VH - MB, THIN, 0.7)}
    ${line(ML, VH - MB, ML, MT - 6, THIN, 0.7)}
    ${txt(ML - 6, MT - 10, "force", DIM, 8, "start")}
    ${txt(VW - MR + 8, VH - MB + 14, "deflection", DIM, 8, "end")}

    <!-- the two springs, meeting at the preload -->
    ${line(ML, VH - MB, apexX, apexY, BOLT, 1.6)}
    ${line(X(db + dm + dP), VH - MB, apexX, apexY, MEM, 1.6)}
    ${line(ML, apexY, X(db + dm + dP), apexY, THIN, 0.6, "3 3")}
    ${txt(ML - 5, apexY + 3, "Fi", INK, 8.5, "end")}
    ${txt(apexX - 12, (apexY + VH - MB) / 2, "k" + "b", BOLT, 8.5, "end")}
    ${txt(X(db + dm * 0.55) + 12, (apexY + VH - MB) / 2, "km", MEM, 8.5, "start")}

    <!-- the loaded state -->
    ${P > 0 ? line(opX, FbY, opX, FmY, LOAD, 1.1, "4 2") : ""}
    ${P > 0 ? line(ML, FbY, opX, FbY, BOLT, 0.6, "2 3") : ""}
    ${P > 0 ? line(ML, FmY, opX, FmY, MEM, 0.6, "2 3") : ""}
    ${P > 0 ? `<circle cx="${opX}" cy="${FbY}" r="2.6" fill="${BOLT}"/>` : ""}
    ${P > 0 ? `<circle cx="${opX}" cy="${FmY}" r="2.6" fill="${separated ? RED : MEM}"/>` : ""}
    <circle cx="${apexX}" cy="${apexY}" r="2.4" fill="${INK}"/>

    <!-- right-hand labels -->
    ${txt(VW - MR + 8, apexY + 3, `Fi ${c.forceu(Fi)}`, INK, 8.5, "start")}
    ${P > 0 ? txt(VW - MR + 8, FbY - 4, `Fb ${c.forceu(r.Fb)}`, BOLT, 8.5, "start") : ""}
    ${P > 0
      ? txt(
          VW - MR + 8,
          FmY + 11,
          separated ? "Fm 0 — SEPARATED" : `Fm ${c.forceu(Math.max(r.Fm, 0))}`,
          separated ? RED : MEM,
          8.5,
          "start",
        )
      : ""}
    ${P > 0 ? txt((opX + VW - MR) / 2, MT + 2, `P ${c.forceu(P)}`, LOAD, 8, "middle") : ""}

    <!-- what the split actually is -->
    ${P > 0
      ? txt(
          ML + 4,
          VH - 8,
          `bolt takes C·P = ${c.forceu(r.C * P)}  ·  members lose (1−C)·P = ${c.forceu((1 - r.C) * P)}`,
          DIM,
          8,
          "start",
        )
      : txt(ML + 4, VH - 8, "set an external load P to see how it is shared", DIM, 8, "start")}
  </svg>`;
}

/* ── worked calculation ───────────────────────────────────────────────── */
export function reportHTML(s: BoltState): string {
  const { thread, cls, K, m1, m2, t1, t2, Pext, T, r, U } = s;
  const c = conv(U);
  const grip = t1 + t2;
  const status = r.SF >= 1.25 ? "" : r.SF >= 1 ? "warn" : "bad";
  const ds = Math.sqrt((4 * thread.As) / Math.PI); // stress-area equivalent Ø, mm
  const frac = s.preloadFrac;
  const pct = Math.round(frac * 100);
  const Abear = bearingArea(thread.d, s.washer);
  const spec = fastenerSpec({ thread, cls, K, pG: Math.min(m1.pG, m2.pG), washer: s.washer, preloadFrac: frac });
  const CP = r.C * Math.max(Pext, 0);
  // The OTHER washer setting, so the spec table shows what flipping it buys.
  const specAlt = serviceFastenerSpec({
    thread, cls, K,
    pG: Math.min(m1.pG, m2.pG),
    CP,
    washer: !s.washer,
    preloadFrac: frac,
  });

  const rows: [string, string, number][] = [
    ["Bolt while tightening (von Mises vs proof)", c.pau(r.vm), r.SF],
    ["Bolt in service (tension vs yield)", c.pau(r.sigmaWork), r.nYieldWork],
    ["Joint separation", isFinite(r.Psep) ? c.forceu(r.Psep) + " to separate" : "—", r.nSep],
    [`Bearing on ${s.mat1Key} (head)`, c.pau(r.pHead), r.nBear1],
    [`Bearing on ${s.mat2Key} (nut)`, c.pau(r.pHead), r.nBear2],
  ];
  const worst = Math.min(...rows.map(([, , n]) => n));

  return `<table class="rep"><tr><th>Given</th><th style="text-align:right">Value</th></tr>
    <tr><td>Thread ${s.threadKey} — ${V("d")} · ${V("A")}<sub>s</sub></td>
      <td class="v">${c.lenu(thread.d)} · ${c.areau(thread.As)}</td></tr>
    <tr><td>Property class (${V("S")}<sub>p</sub> / ${V("S")}<sub>y</sub>)</td>
      <td class="v">${grade(s.classKey)} — ${c.mpau(cls.sp)} / ${c.mpau(cls.sy)}</td></tr>
    <tr><td>Nut factor ${V("K")}</td><td class="v">${K} — ${s.fricKey.replace(/\s*\(.*\)/, "")}</td></tr>
    <tr><td>Plate 1 (head side) — ${s.mat1Key}</td>
      <td class="v">${c.lenu(t1)} · E ${c.gpau(m1.E)} · p<sub>G</sub> ${c.mpau(m1.pG)}</td></tr>
    <tr><td>Plate 2 (nut side) — ${s.mat2Key}</td>
      <td class="v">${c.lenu(t2)} · E ${c.gpau(m2.E)} · p<sub>G</sub> ${c.mpau(m2.pG)}</td></tr>
    <tr><td>Grip length ${V("L")} = t₁ + t₂</td><td class="v">${c.lenu(grip)}</td></tr>
    <tr><td>External load ${V("P")} · applied torque ${V("T")}</td>
      <td class="v">${c.forceu(Pext)} · ${c.torqueu(T)}</td></tr>
    <tr><td>Washers · preload target</td>
      <td class="v">${s.washer ? "under head and nut" : "none (bare head)"} · ${pct}% of proof</td></tr></table>

    <h3 style="margin-top:18px">1 · Tightening — what the wrench actually does</h3>` +
    eqn(
      "1 · Preload from torque",
      `${V("F")}<sub>i</sub> = ${FR(V("T"), `${V("K")}·${V("d")}`)}`,
      FR(c.torqueSub(T), `${K} × ${c.len(thread.d)}`),
      c.forceu(r.F),
      "",
      `Roughly half the wrench torque is reacted in the threads and half under the head, and most of both is spent on
       friction — only around a tenth of it ends up as preload. K bundles all of that into one number, and it
       scatters ±25% between real joints, so read F<sub>i</sub> as a band rather than a value.`,
    ) +
    eqn(
      "2 · Direct tensile stress",
      `σ = ${FR(`${V("F")}<sub>i</sub>`, `${V("A")}<sub>s</sub>`)}`,
      FR(c.force(r.F), c.area(thread.As)),
      c.stressRes(r.sigma),
      "",
      `A<sub>s</sub> is the tensile stress area — between the pitch and minor diameters, not the nominal Ø, because
       that is the section that actually carries the load through the threads.`,
    ) +
    eqn(
      "3 · Torsion left in the shank",
      `τ = ${FR(`16·${V("T")}<sub>th</sub>`, `π·${V("d")}<sub>s</sub>³`)}, ${V("T")}<sub>th</sub> ≈ 0.5·${V("T")}`,
      FR(`16 × ${c.torqueSub(0.5 * T)}`, `π × ${c.len(ds)}³`),
      c.stressRes(r.tau),
      "",
      `Half the applied torque is reacted in the threads and twists the shank while the wrench is on. It relaxes
       once you let go, which is why the service check below drops it.`,
    ) +
    eqn(
      "4 · Combined (reduced) stress — the tightening check",
      `σ<sub>red</sub> = √(σ² + 3τ²)`,
      `√(${c.pa(r.sigma)}² + 3 × ${c.pa(r.tau)}²)`,
      c.pau(r.vm),
      status,
      `SF = S<sub>p</sub> / σ<sub>red</sub> = ${c.mpa(cls.sp)} / ${c.pa(r.vm)} =
       <b style="color:${sfColor(r.SF)}">${sf(r.SF)}</b> — this is the headline number, and it is the harshest moment
       in the joint's life. VDI 2230 works exactly this way; Shigley reaches the same place by capping preload at
       75–90% of proof instead.`,
    ) +
    `<h3>2 · The two springs</h3>
    <p>Everything after tightening follows from one fact: the bolt is a stretched spring and the clamped plates are a
    squashed one, and they share the same joint. Their <b>relative</b> stiffness is what decides who feels an external
    load.</p>` +
    eqn(
      "5 · Bolt stiffness",
      `${V("k")}<sub>b</sub> = ${FR(`${V("E")}·${V("A")}<sub>s</sub>`, V("L"))}`,
      FR(`${c.gpa(cls.E)} × ${c.area(thread.As)}`, c.len(grip)) + c.kilo,
      c.stiffu(r.kb),
      "",
      `A plain tension member over the grip length. Stretch at preload: ΔL = F<sub>i</sub>/k<sub>b</sub> =
       <b>${c.microu(r.dL)}</b>.`,
    ) +
    eqn(
      "6 · Member stiffness",
      `${V("k")}<sub>m</sub> = f(30° cone frusta)`,
      `${c.lenu(t1)} of ${s.mat1Key} + ${c.lenu(t2)} of ${s.mat2Key}, in series`,
      isFinite(r.km) ? c.stiffu(r.km) : "∞",
      "",
      `Shigley's pressure cone: the clamp force spreads at 30° from under the head to mid-grip and converges again on
       the nut, so the plates are a stack of frusta in series — each with its own modulus. Squash at preload:
       δ<sub>m</sub> = <b>${c.microu(r.dLm)}</b>. The stack is
       <b>${isFinite(r.km) ? (r.km / r.kb).toFixed(1) : "∞"}×</b> stiffer than the bolt, and that ratio is the whole
       game.`,
    ) +
    eqn(
      "7 · Stiffness ratio",
      `${V("C")} = ${FR(`${V("k")}<sub>b</sub>`, `${V("k")}<sub>b</sub> + ${V("k")}<sub>m</sub>`)}`,
      FR(c.stiff(r.kb), `${c.stiff(r.kb)} + ${isFinite(r.km) ? c.stiff(r.km) : "∞"}`),
      r.C.toFixed(3),
      "",
      `The bolt's share of any external load. C = ${r.C.toFixed(3)} means the bolt picks up
       <b>${(r.C * 100).toFixed(0)}%</b> of P and the plates give up the other ${((1 - r.C) * 100).toFixed(0)}%.`,
    ) +
    `<h3>3 · In service — with P = ${c.forceu(Pext)} on the joint</h3>` +
    eqn(
      "8 · Load sharing",
      `${V("F")}<sub>b</sub> = ${V("F")}<sub>i</sub> + ${V("C")}·${V("P")}`,
      `${c.force(r.F)} + ${r.C.toFixed(3)} × ${c.force(Pext)}`,
      c.forceu(r.Fb),
      "",
      `The bolt rises by only ${c.forceu(r.C * Pext)} — this is why a preloaded joint survives fatigue: the bolt
       barely notices the load cycling.`,
    ) +
    eqn(
      "9 · What is left clamping",
      `${V("F")}<sub>m</sub> = ${V("F")}<sub>i</sub> − (1−${V("C")})·${V("P")}`,
      `${c.force(r.F)} − ${(1 - r.C).toFixed(3)} × ${c.force(Pext)}`,
      r.Fm <= 0 ? "0 — SEPARATED" : c.forceu(r.Fm),
      r.Fm <= 0 ? "bad" : "",
      `The external load is mostly subtracted from the clamp, not added to the bolt.`,
    ) +
    eqn(
      "10 · Separation",
      `${V("P")}<sub>sep</sub> = ${FR(`${V("F")}<sub>i</sub>`, `1 − ${V("C")}`)}`,
      FR(c.force(r.F), (1 - r.C).toFixed(3)),
      isFinite(r.Psep) ? c.forceu(r.Psep) : "∞",
      r.nSep < 1.5 ? (r.nSep < 1 ? "bad" : "warn") : "",
      `SF against separation = P<sub>sep</sub>/P = <b style="color:${sfColor(r.nSep)}">${sf(r.nSep)}</b>. Past this
       load the plates lift, the bolt takes the whole of P directly, and the joint starts hammering itself apart.
       Keep 1.5 or more here.`,
    ) +
    eqn(
      "11 · Bearing under the head and nut",
      `${V("p")} = ${FR(V("F"), `π/4·(${V("d")}<sub>w</sub>² − ${V("d")}<sub>h</sub>²)`)}`,
      FR(c.force(Math.max(r.F, r.Fb)), c.area(Abear)),
      c.stressRes(r.pHead),
      Math.min(r.nBear1, r.nBear2) < 1 ? "bad" : "",
      `${s.washer
         ? `Washer face: d<sub>w</sub> = ${DW_WASHER_RATIO}d = ${c.lenu(DW_WASHER_RATIO * thread.d)}`
         : `Bare head: d<sub>w</sub> = ${DW_RATIO}d = ${c.lenu(DW_RATIO * thread.d)}`} over a
       d<sub>h</sub> = ${DHOLE_RATIO}d clearance hole, so A<sub>bear</sub> = ${c.areau(Abear)}. Against p<sub>G</sub>:
       <b style="color:${sfColor(r.nBear1)}">${sf(r.nBear1)}</b> on ${s.mat1Key},
       <b style="color:${sfColor(r.nBear2)}">${sf(r.nBear2)}</b> on ${s.mat2Key}. ${s.washer
         ? `On a bare head the annulus would shrink to ${c.areau(bearingArea(thread.d))} — 3.3× the pressure for the
            same preload.`
         : `A washer takes the annulus to ${c.areau(bearingArea(thread.d, true))} — 3.3× the area for the same
            preload.`}`,
    ) +
    `<div class="lab" style="margin-top:16px">VERDICT AT ${c.torqueu(T)}</div>
     <table class="rep"><tr><th>Check</th><th>Value</th><th style="text-align:right">SF</th></tr>` +
    rows
      .map(
        ([k, v, n]) =>
          `<tr class="${n === worst ? "hi" : ""}"><td>${k}</td><td>${v}</td>` +
          `<td class="v" style="color:${sfColor(n)}">${sf(n)}</td></tr>`,
      )
      .join("") +
    `</table>
     <div class="lab" style="margin-top:16px">TORQUE SPECIFICATION</div>
     <table class="rep"><tr><th>Per bolt</th><th style="text-align:right">${U.torque.label}</th></tr>
       <tr><td>Bolt alone — ${pct}% of proof (${c.forceu(spec.F65)})</td>
         <td class="v">${c.torque(spec.T65)}</td></tr>
       <tr><td>Capped by bearing on ${m1.pG <= m2.pG ? s.mat1Key : s.mat2Key}
         (p<sub>G</sub> ${c.mpau(Math.min(m1.pG, m2.pG))})${CP > 0.5 ? " — preload alone, before the C·P deduction" : ""}</td>
         <td class="v">${c.torque(spec.Tbear)}</td></tr>
       <tr class="hi"><td><b>Recommended</b> — limited by ${
           r.TrecGovernedBy === "bolt"
             ? "the bolt"
             : `plate bearing${r.C * Pext > 0.5 ? ", net of the C·P the bolt adds in service" : ""}`
         }</td>
         <td class="v" style="color:${GREEN}">${c.torque(r.TrecJoint)}</td></tr>
       <tr><td>Same joint ${s.washer ? "without washers (bare head)" : "with washers under head and nut"}</td>
         <td class="v">${c.torque(specAlt.T)}</td></tr>
       <tr><td>You have applied</td>
         <td class="v" style="color:${T > r.TrecJoint * 1.05 ? AMBER : "#e8edf1"}">${c.torque(T)}</td></tr></table>`;
}

/* ── how the model is put together, and where it stops ────────────────── */
export function howItWorksHTML(s: BoltState): string {
  const { r, U } = s;
  const c = conv(U);
  return `<p><b>A bolted joint is a pre-stretched bolt fighting pre-squashed plates.</b> Tightening does not
    "hold the parts together" by pulling on them — it locks a large internal force into the assembly, and every
    external load after that is a change to how that locked-in force is <em>shared</em>. All the interesting
    behaviour, good and bad, comes out of the sharing.</p>

    <h3>What the numbers mean</h3>
    <p><b>Preload F<sub>i</sub></b> is what the wrench installs. <b>C</b> is the bolt's share of anything that comes
    later. <b>F<sub>m</sub></b> is the clamp left at the interface — friction, sealing and stiffness all come from it,
    and when it reaches zero the joint has separated even though nothing has broken. <b>σ<sub>red</sub></b> is the
    bolt's worst moment, mid-wrench, with torsion still in the shank.</p>

    <h3>Tightening</h3>
    <p>The wrench torque drives the nut down the thread incline, converting twist into axial preload that clamps the
    plates. While the wrench is on, thread friction also twists the shank, so the tightening check has to combine
    tension and torsion into the <em>reduced stress</em> σ<sub>red</sub> = √(σ² + 3τ²). This von Mises form is the
    standard bolted-joint method (VDI 2230; Shigley arrives at the same numbers by capping preload at 75–90% of proof
    instead). That torsion largely dissipates once the wrench is released, which is why the calculator also reports
    the milder <b>working stress</b> — pure tension, including the bolt's share of the external load — checked
    against yield rather than proof.</p>

    <h3>The clamped sandwich</h3>
    <p>The joint is two springs in parallel: the bolt (stiffness k<sub>b</sub>) stretched by F<sub>i</sub>, and the
    plate stack (k<sub>m</sub>) compressed by the same F<sub>i</sub>. The clamp force does not flow uniformly through
    the plates — it spreads in ~30° pressure cones from under the head to mid-grip and back to the nut, which is what
    the frustum stiffness model captures. Each plate's material enters through its modulus: swap a steel plate for
    aluminium or POM and k<sub>m</sub> drops, shifting C = k<sub>b</sub>/(k<sub>b</sub>+k<sub>m</sub>). Stiff plates
    (small C) are why preloaded joints survive fatigue — the bolt barely notices the load cycles. But the clamp
    erodes by (1−C)·P, and at P<sub>sep</sub> the plates separate; after that the bolt takes everything, and the
    joint hammers itself apart.</p>

    <h3>What "external load P" means</h3>
    <p>P is the working load your product applies to the joint <em>after</em> it is assembled — the thing trying to
    pull the two plates apart along the bolt axis. Pressure lifting a cover, a belt tensioning a bracket, the weight
    of whatever hangs off the part, an impact. It is <em>not</em> the tightening force: preload comes from the torque,
    and P is what arrives later, in service. The interesting result is that the bolt does not feel all of P — it
    picks up only C·P, typically 10–25% with metal plates, while the remaining (1−C)·P is subtracted from the clamp
    squeezing the plates. Set P = 0 to look at the tightened joint alone; raise it to find the load where the clamp
    reaches zero and the joint separates.</p>

    <h3>Soft materials and bearing</h3>
    <p>The head and nut press on small annular faces, and soft plate materials crush there long before the bolt is in
    danger — so the calculator checks that surface pressure against each material's permissible pressure p<sub>G</sub>
    (VDI-style values). This is also why the <b>recommended torque follows the materials you clamp</b>, not just the
    bolt: the target preload is the lesser of ${Math.round(s.preloadFrac * 100)}% of the bolt's proof load and what
    the softer plate's bearing limit allows. With steel or aluminium plates the bolt governs and you get the familiar handbook number
    (${c.torqueu(9)} for M6 class 8.8, dry); put the same bolt through nylon or FR-4 and the recommendation drops
    several-fold, because the plate would crush first. That matches the separate torque tables plastics and PCB
    suppliers publish. Washers raise the limit by enlarging the bearing area — worth adding whenever a plate flags
    red. Embedding (surfaces flattening over time) also costs proportionally more preload in soft, short joints.</p>

    <h3>Reading the diagram above</h3>
    <p>The two lines are the springs. The <b style="color:${GREEN}">shallow</b> one is the bolt — it stretches a lot
    for little force. The <b style="color:#3aa0c2">steep</b> one is the plate stack, which barely moves. They meet at
    the preload. An external load walks the joint point to the right: the bolt climbs its shallow line by
    <b>C·P</b> while the members fall down their steep one by <b>(1−C)·P</b>. Here that is
    <b>${c.forceu(r.C * Math.max(s.Pext, 0))}</b> onto the bolt against
    <b>${c.forceu((1 - r.C) * Math.max(s.Pext, 0))}</b> off the clamp. Where the member line hits zero, the plates
    lift and the geometry stops applying — beyond that point the bolt is alone.</p>

    <h3>Reading the 3D view</h3>
    <p>The cone inside the plates <em>is</em> the clamp load, spreading at 30° from under the head to mid-grip and
    converging on the nut. It is shaded by the local pressure at each depth: intense at the two bearing faces where
    the force crosses a small annulus, washed out in the middle where the same force is carried by a much larger
    area. That is exactly why fasteners crush the surface long before they crush the core, and why a washer fixes it.
    Each depth is coloured against the limit of whichever plate it falls in, so in a mixed stack the soft half goes
    amber while the steel beside it stays cool under the identical force.</p>

    <h3>Where this model stops being right</h3>
    <p><b>1 · Torque control is the weak link, not the arithmetic.</b> Every preload figure here inherits K's ±25%
    scatter. The equations are exact; the input is not. Joints that matter use angle control past snug, or measure
    bolt stretch directly.</p>
    <p><b>2 · Embedding and relaxation are not modelled.</b> Real surfaces flatten over the first hours and days,
    and short, soft joints lose proportionally more of their preload to it — a thin plastic stack can give back
    10–20%. Re-torque after 24 h, or design with the loss allowed for.</p>
    <p><b>3 · The load is assumed concentric and purely tensile.</b> An eccentric load bends the bolt and shifts the
    pressure cone off-axis; a shear load is carried by friction at the interface (or by a dowel), not by the bolt in
    the way this page describes. Neither is checked here.</p>
    <p><b>4 · Fatigue, thread stripping and gaskets are out of scope.</b> The stiffness ratio C is the first half of
    a fatigue calculation, but the alternating stress and the thread-root concentration are not evaluated. Engagement
    length is assumed sufficient — in a tapped soft-metal or plastic hole it usually is not, and the threads strip
    before any number on this page is reached.</p>
    <p><b>5 · The 3D view exaggerates the deflections.</b> Real stretch here is ${c.microu(r.dL)} and real squash is
    ${c.microu(r.dLm)} — invisible at any honest scale, so the viewer multiplies both by ${VIEW_EXAG}×. The
    kinematics are true even so: the head only sinks as the plates compress, and the elongation appears below the nut
    where it really does.</p>

    <p class="pn" style="margin-top:16px;padding-top:12px;border-top:1px dashed #1f2a33;color:#b9c3cc">
    <b style="color:#e8edf1;text-decoration:underline;text-underline-offset:3px">In short:</b> tighten until the bolt
    carries a healthy fraction of proof — checked with torsion included, von Mises — and make the plates as stiff as
    you can. Then external loads mostly relax the plates instead of working the bolt. Watch the two clamped
    materials: they set how the load is shared, when the joint separates, and whether anything crushes under the
    head.</p>`;
}

/* ── preload, proof and where the recommendation comes from ───────────── */
export function preloadHTML(s: BoltState): string {
  const { thread, cls, K, r, U } = s;
  const c = conv(U);
  const Sp = cls.sp;
  const Sy = cls.sy;
  const frac = s.preloadFrac;
  const pct = Math.round(frac * 100);
  const Abear = bearingArea(thread.d, s.washer);
  const F65 = frac * Sp * thread.As;
  // The bearing chain, kept numerically identical to jointResults' joint-
  // aware recommendation so line 3 multiplies out to the number on the
  // model tab: allowance (at YOUR washer setting), minus the bolt's service
  // share of P, capped by what the bolt itself wants at YOUR target.
  const Fbear = 0.9 * Math.min(s.m1.pG, s.m2.pG) * Abear;
  const CP = r.C * Math.max(s.Pext, 0);
  const FbearNet = Math.max(0, Fbear - CP);
  const Fuse = Math.min(F65, FbearNet);
  // The same bolt tightened to the selected target, so the utilisation quoted
  // below is this joint's, not a generic one.
  const T65 = (K * thread.d * F65) / 1000;
  const As = thread.As * 1e-6;
  const ds = Math.sqrt((4 * As) / Math.PI);
  const sigma65 = F65 / As;
  const tau65 = (16 * 0.5 * T65) / (Math.PI * ds ** 3);
  const vm65 = Math.sqrt(sigma65 ** 2 + 3 * tau65 ** 2);
  const util = vm65 / (Sp * 1e6);
  const loK = frac / 0.75;
  const hiK = frac / 1.25;
  // The unlucky end of the K band. Note what does NOT move: torsion is set by
  // the torque you applied, not by the preload that torque happened to
  // produce, so a grabbier-than-assumed joint raises the tensile term alone.
  // Scaling the whole von Mises by the preload ratio overstates it.
  const sigmaLow = loK * Sp * 1e6;
  const vmLow = Math.sqrt(sigmaLow ** 2 + 3 * tau65 ** 2);
  const utilLow = vmLow / (Sp * 1e6);

  // Every row through the SAME function the model tab's recommendation uses,
  // with your joint's C·P — so the row for your softer plate IS the number in
  // the recommendation slot, digit for digit. The what-if in each row is the
  // bearing surface only; the load share is your joint's (a stack made of
  // that material throughout would shift C somewhat).
  const rows = Object.keys(PLATE_MATERIALS)
    .map((k) => {
      const m = PLATE_MATERIALS[k];
      const cap = fastenerSpec({ thread, cls, K, pG: m.pG, washer: false, preloadFrac: frac });
      const use = serviceFastenerSpec({ thread, cls, K, pG: m.pG, CP, preloadFrac: frac });
      const useW = serviceFastenerSpec({ thread, cls, K, pG: m.pG, CP, washer: true, preloadFrac: frac });
      const here = k === s.mat1Key || k === s.mat2Key;
      return (
        `<tr${here ? ' class="hi"' : ""}><td>${here ? `<b>${k}</b>` : k}</td>` +
        `<td class="v">${c.gpa(m.E)}</td><td class="v">${c.mpa(m.sy)}</td><td class="v">${c.mpa(m.pG)}</td>` +
        `<td class="v">${c.torque(cap.Tbear)}</td>` +
        `<td class="v" style="color:${use.governs === "plate" ? AMBER : GREEN}">${c.torque(use.T)}</td>` +
        `<td class="v">${c.torque(useW.T)}</td></tr>`
      );
    })
    .join("");

  const sae = s.classKey in SAE_CLASSES;
  return `<h3 style="margin-top:0">What proof strength is</h3>
    <p><b>${sae ? "SAE J429" : "ISO 898-1"}</b> tabulates a <em>proof load</em>: the tension a bolt carries and
    releases with no measurable permanent set. Proof strength is that load over the stress area. It is a tabulated
    column, not something derived from yield, and it sits deliberately below the 0.2% offset yield. For
    <b>${s.classKey}</b>, ${V("S")}<sub>p</sub> = <b>${c.mpau(Sp)}</b> against
    ${V(sae ? "S" : "R")}<sub>${sae ? "y" : "p0.2"}</sub> = <b>${c.mpau(Sy)}</b> — a ratio of
    <b>${(Sp / Sy).toFixed(2)}</b>, and across the ${sae ? "grades" : "classes"} it runs
    ${sae ? "0.92–0.96" : "0.88–0.91"}. Past proof the bolt takes a permanent set and simply loses the preload you
    just installed.${
      sae
        ? " Note that the SAE grades are <em>size-dependent</em>: the figures here cover the diameters in the thread" +
          " list (Grade 2 to 3/4 in, Grades 5 and 8 to 1 in). Bigger fasteners are derated."
        : ""
    }</p>

    <h3>Why the target preload is a fraction of it</h3>
    <table class="rep"><tr><th>Source</th><th style="text-align:right">Recommends</th></tr>
      <tr><td><b>Shigley</b> — reused connections</td><td class="v">0.75 · F<sub>p</sub></td></tr>
      <tr><td><b>Shigley</b> — permanent connections</td><td class="v">0.90 · F<sub>p</sub></td></tr>
      <tr><td><b>VDI 2230</b></td><td class="v">≈0.90 of yield ÷ α<sub>A</sub></td></tr>
      <tr class="hi"><td><b>This calculator — your setting</b></td><td class="v">${frac.toFixed(2)} · F<sub>p</sub></td></tr></table>
    ${frac <= 0.65
      ? `<p class="pn warn"><b>Do not cite 0.65 as Shigley.</b> Shigley's figure is 0.75 or 0.90, and VDI 2230 does
        not work in "% of proof" at all. <b>0.65 is this toolkit's own conservative default</b>, at the low end of the
        common 60–75% band, because these calculators are aimed at joints where a printed or light-alloy part — not
        the bolt — is the weak side. The selector on the model tab raises it to Shigley's figures when the joint
        warrants it. Two reasons the default is defensible:</p>`
      : `<p class="pn warn"><b>You have selected ${frac.toFixed(2)} — ${frac >= 0.9 ? "Shigley's permanent-joint figure" : "Shigley's reused-connection figure"}.</b>
        Legitimate for an all-metal joint with controlled assembly, but read the utilisation below with care:
        Shigley's targets assume the tightening torsion is accounted for elsewhere, and this calculator shows it to
        you explicitly. The two sections below are why the default is lower:</p>`}

    <h3>Reason 1 — the headline number leaves out tightening torsion</h3>` +
    eqn(
      `Reduced stress at the ${pct}% target`,
      `σ<sub>red</sub> = √(σ² + 3τ²)`,
      `σ = ${frac.toFixed(2)}·${c.mpa(Sp)} = ${c.mpa(frac * Sp)}, plus thread torsion at K = ${K}`,
      `${c.pau(vm65)} = ${(util * 100).toFixed(0)}% of proof`,
      util > 1 ? "bad" : "warn",
      `A "${pct}% preload" is really <b>${(util * 100).toFixed(0)}% utilisation</b> while the wrench is still on.
       ${util > 1
         ? "Past proof mid-wrench: the bolt takes a permanent set while you tighten and keeps less preload than the target — Shigley accepts this because his check runs on tension alone."
         : "Shigley's 0.90 would put the reduced stress past proof before you let go — legitimately, because that figure assumes the torsion is accounted for elsewhere."}
       Torsion relaxes afterwards, which is why the service check on the model tab runs on tension alone.`,
    ) +
    `<h3>Reason 2 — the nut factor scatters straight onto preload</h3>
    <table class="rep"><tr><th>If K lands…</th><th style="text-align:right">Preload / proof</th></tr>
      <tr><td>25% low — grabbier than assumed</td><td class="v" style="color:${RED}">${loK.toFixed(2)}</td></tr>
      <tr><td>as assumed</td><td class="v">${frac.toFixed(2)}</td></tr>
      <tr><td>25% high — slipperier</td><td class="v">${hiK.toFixed(2)}</td></tr></table>
    <p class="pn bad"><b>Be clear-eyed:</b> at the unlucky end the same wrench reading installs ${loK.toFixed(2)} of
    proof in tension. The torsion does not grow with it — you applied the same torque — but the combined stress still
    reaches <b>${(utilLow * 100).toFixed(0)}%</b> of proof (${((vmLow / (Sy * 1e6)) * 100).toFixed(0)}% of yield),
    which is past the load the bolt is guaranteed to release from without a permanent set. It will not snap; it will
    quietly keep less preload than you think it has. Dropping the target buys margin, not certainty — that is the
    weakness of torque control, and it is why joints that matter use angle control past snug or measure bolt
    stretch.</p>

    <h3>Where the recommended torque comes from</h3>
    <p>Handbook torque tables answer "how tight?" for the <em>bolt</em>, and quietly assume the clamped parts can take
    it. True for steel and aluminium; false for plastics, laminates and thin castings, where the head crushes into the
    surface long before the bolt is in danger. So the recommendation here is the lesser of two preloads:</p>` +
    eqn(
      `1 · what the bolt wants — your ${pct}% target`,
      `${V("F")}<sub>tgt</sub> = ${frac.toFixed(2)} · ${V("S")}<sub>p</sub> · ${V("A")}<sub>s</sub>`,
      `${frac.toFixed(2)} × ${c.mpa(Sp)} × ${c.area(thread.As)}${c.kilo}`,
      c.forceu(F65),
      "",
      `Fixed by the fastener and the target — ${s.threadKey}, ${grade(s.classKey)} at ${pct}% — so it is the same in
       every row of the table below.`,
    ) +
    eqn(
      "2 · what the clamped material allows under the head",
      `${V("F")}<sub>bear</sub> = 0.9 · ${V("p")}<sub>G</sub> · ${V("A")}<sub>bear</sub>`,
      `0.9 × ${c.mpa(Math.min(s.m1.pG, s.m2.pG))} × ${c.area(Abear)}${c.kilo}`,
      c.forceu(0.9 * Math.min(s.m1.pG, s.m2.pG) * Abear),
      "",
      `The softer of the two plates sets the cap. A<sub>bear</sub> is the annulus under ${s.washer
         ? `your washer: π/4·((${DW_WASHER_RATIO}d)² − (${DHOLE_RATIO}d)²)`
         : `a bare head: π/4·((${DW_RATIO}d)² − (${DHOLE_RATIO}d)²)`} = ${c.areau(Abear)}. The 0.9 keeps the
       recommendation clear of the limit it is capped by, so a torque this tool suggests is never simultaneously
       flagged as crushing.`,
    ) +
    (CP > 0.5
      ? eqn(
          "2b · minus the share of P the bolt hands to that same face",
          `${V("F")}<sub>bear,net</sub> = ${V("F")}<sub>bear</sub> − ${V("C")}·${V("P")}`,
          `${c.force(Fbear)} − ${r.C.toFixed(3)} × ${c.force(s.Pext)}`,
          c.forceu(FbearNet),
          FbearNet <= 0 ? "bad" : "",
          `Bearing is checked in <em>service</em>, on F<sub>b</sub> = F<sub>i</sub> + C·P — the nut presses on the
           plate with the external load's share as well as the preload. Preload may only use what is left.` +
            (FbearNet <= 0
              ? ` Here C·P alone exceeds the whole allowance — no preload keeps this joint inside the bearing limit.
                 Add a washer.`
              : ""),
        )
      : "") +
    eqn(
      "3 · the lesser of the two, as a wrench reading",
      `${V("T")} = ${V("K")}·${V("F")}·${V("d")}`,
      `${K} × ${c.force(Fuse)} × ${c.len(thread.d)}${c.milli}`,
      c.torqueu(r.TrecJoint),
      "",
      `Limited by <b>${r.TrecGovernedBy === "bolt" ? "the bolt" : "bearing on the plates"}</b>. Same relation, same
       shared fastener table and same 0.9 margin as the Cylinder Clamp calculator${
         CP > 0.5
           ? " — plus the C·P deduction above, which only this calculator needs because only it models an external load"
           : ""
       }.`,
    ) +
    `<h3>Every clamped material, at your thread and grade</h3>
    <p>Run at <b>${s.threadKey}</b>, <b>${grade(s.classKey)}</b>,
    <b>${s.fricKey.replace(/\s*\(.*\)/, "")}</b>${
      CP > 0.5
        ? ` — and at <b>your</b> joint's load share C·P = ${c.forceu(CP)}, deducted from every <em>use</em> column
           exactly as in steps 2b–3 above, so the row for your softer plate is the model tab's recommendation`
        : ""
    } — change any of those and every torque column moves. Amber means <b>bearing on the plate</b> is what holds you
    back, not the bolt.</p>
    <table class="rep">
      <tr><th>Clamped material</th><th style="text-align:right">E<br>${U.modulus.label}</th>
      <th style="text-align:right">σ<sub>y</sub><br>${U.stress.label}</th>
      <th style="text-align:right">p<sub>G</sub><br>${U.stress.label}</th>
      <th style="text-align:right">bearing<br>cap ${U.torque.label}</th>
      <th style="text-align:right">use, bare<br>${U.torque.label}</th>
      <th style="text-align:right">with<br>washer</th></tr>
      ${rows}</table>
    <p><b>Reading it.</b> <em>Bearing cap</em> is line 2 above turned into torque — how hard you could pull this bolt
    before the head starts sinking into that material, preload alone. <em>Use</em> is the lesser of the bolt's own
    target and that cap${CP > 0.5 ? " minus your load's C·P" : ""}, so it flattens at <b>${c.torqueu(T65)}</b> for
    every material where the bolt governs, and drops several-fold for polymers and laminates. That is not conservatism — it matches the separate torque tables plastics and PCB
    suppliers publish. The last column is the same joint with washers: 3.3× the bearing area, which is the cheapest
    fix there is whenever a plate flags red.</p>

    <div class="lab" style="margin-top:16px">REFERENCES</div>
    <table class="rep">
      <tr><td>Budynas &amp; Nisbett, <b>Shigley's Mechanical Engineering Design</b>, ch. 8 — pressure-cone stiffness,
        load sharing, preload targets</td></tr>
      <tr><td><b>ISO 898-1</b> — proof load, R<sub>p0.2</sub>, R<sub>m</sub> and stress area by property class</td></tr>
      <tr><td><b>VDI 2230 Part 1</b> — reduced stress while tightening, tightening factor α<sub>A</sub>, permissible
        surface pressure p<sub>G</sub></td></tr>
      <tr><td><b>SAE J429</b> — inch fastener grades (proof, yield and tensile in ksi)</td></tr></table>
    <p class="pn warn"><b>Typical reference values, not certified allowables.</b> p<sub>G</sub> for polymers is a
    short-term surface pressure — they creep badly above it, so it doubles as the long-term clamp limit. Verify
    against your own material data before production.</p>`;
}

/* ── design tips, with this joint's numbers in them ───────────────────── */
export function tipsHTML(s: BoltState): string {
  const { thread, cls, K, m1, m2, t1, t2, r, U } = s;
  const c = conv(U);
  const grip = t1 + t2;
  const soft = m1.pG <= m2.pG ? s.mat1Key : s.mat2Key;
  const specW = serviceFastenerSpec({
    thread, cls, K,
    pG: Math.min(m1.pG, m2.pG),
    CP: r.C * Math.max(s.Pext, 0),
    washer: true,
    preloadFrac: s.preloadFrac,
  });
  // The joint-aware recommendation (bearing net of C·P), and the preload it
  // installs — derived from the torque so the two numbers cannot disagree.
  const longer = {
    T: r.TrecJoint,
    F: K * thread.d > 0 ? (1000 * r.TrecJoint) / (K * thread.d) : 0,
    governedBy: r.TrecGovernedBy,
  };
  // The same joint with twice the grip, to put a number on "longer is better".
  const kbLong = grip > 0 ? (cls.E * 1e9 * thread.As * 1e-6) / (2 * grip * 1e-3) : Infinity;
  const Clong = kbLong / (kbLong + (isFinite(r.km) ? r.km : kbLong * 1e3));

  return `<div class="tip key"><h4>1 · Tighten it properly — a loose preloaded joint is the failure</h4>
    <p>Nearly every bolted-joint failure in service is a joint that was <b>under-tightened</b>, not over-tightened.
    Too little preload and the plates separate under load, the bolt takes the full cycle instead of a fraction of it,
    and it fails in fatigue — or simply walks loose. Aim for the recommendation and treat it as a target, not a
    ceiling to creep up on.</p>
    <div class="tipnum">Yours: recommended <b>${c.torqueu(longer.T)}</b> (limited by
      ${longer.governedBy === "bolt" ? "the bolt" : "plate bearing"}) · installs
      <b>${c.forceu(longer.F)}</b> of preload · separation SF at your load
      <b style="color:${sfColor(r.nSep)}">${sf(r.nSep)}</b></div></div>

    <div class="tip"><h4>2 · Stiff members, flexible bolt — that ratio is the design</h4>
    <p>C = k<sub>b</sub>/(k<sub>b</sub>+k<sub>m</sub>) decides how much of every external load the bolt has to carry.
    Low C is what you want: the load unclamps the plates instead of working the fastener. You lower it by making the
    <b>members stiffer</b> (steel not plastic, more material around the hole, no soft gaskets in the stack) or the
    <b>bolt longer and more slender</b> — which is why aerospace joints use long, thin, waisted bolts rather than
    short stubby ones.</p>
    <div class="tipnum">Yours: C = <b>${r.C.toFixed(3)}</b> — the bolt takes <b>${(r.C * 100).toFixed(0)}%</b> of P.
      Double the grip to ${c.lenu(2 * grip)} and it would fall to <b>${Clong.toFixed(3)}</b></div></div>

    <div class="tip warn"><h4>3 · Washers, whenever a soft material is in the stack</h4>
    <p>The head and nut press on a small annulus, and soft plates crush there long before the bolt is in danger.
    A plain washer takes the bearing area from ${DW_RATIO}d to ${DW_WASHER_RATIO}d across — about
    <b>3.3× the annulus</b> — and raises the whole torque ceiling with it. It is the cheapest fix in fastening.</p>
    <div class="tipnum">Yours: bearing <b>${c.pau(r.pHead)}</b> under the head · softest plate is <b>${soft}</b>
      (p<sub>G</sub> ${c.mpau(Math.min(m1.pG, m2.pG))}) · SF
      <b style="color:${sfColor(Math.min(r.nBear1, r.nBear2))}">${sf(Math.min(r.nBear1, r.nBear2))}</b> ·
      ${s.washer
        ? `washers are on — they are what raises this joint to <b>${c.torqueu(longer.T)}</b>`
        : specW.T > longer.T * 1.01
          ? `with washers the joint would take <b>${c.torqueu(specW.T)}</b> instead of <b>${c.torqueu(longer.T)}</b>`
          : `the bolt already governs here, so washers buy margin against crushing rather than more torque`}</div></div>

    <div class="tip"><h4>4 · Lubrication is a specification, not a detail</h4>
    <p>K is not a property of the bolt — it is a property of the bolt <em>as you assemble it</em>. Dry, zinc-plated,
    oiled and anti-seize span K ≈ 0.12–0.22, nearly a factor of two in preload for the same wrench reading. Pick one,
    write it on the drawing, and use it. Lubricating a joint whose torque was specified dry over-tightens it by up to
    <b>60%</b>; the reverse leaves it slack.</p>
    <div class="tipnum">Yours: ${s.fricKey} → K = <b>${K}</b>. The same ${c.torqueu(s.T)} at K = 0.12 would install
      <b>${c.forceu((1000 * s.T) / (0.12 * thread.d))}</b> instead of <b>${c.forceu(r.F)}</b></div></div>

    <div class="tip"><h4>5 · Grip length: longer is better, and short joints are brittle</h4>
    <p>A short grip makes a stiff bolt (high C) and makes every bit of embedding cost a large fraction of the
    preload — surfaces flattening by ${c.microu(5e-6)} matter enormously across a ${c.lenu(6)} grip and hardly at all
    across ${c.lenu(60)}. Where a joint must be short, use a shoulder or a long collar to buy elastic length back.</p>
    <div class="tipnum">Yours: grip <b>${c.lenu(grip)}</b> = ${(grip / thread.d).toFixed(1)}·d · bolt stretch at
      preload <b>${c.microu(r.dL)}</b> — losing ${c.microu(5e-6)} of that to embedding costs
      <b>${((5e-6 / Math.max(r.dL, 1e-12)) * 100).toFixed(0)}%</b> of the preload</div></div>

    <div class="tip"><h4>6 · Don't over-grade the bolt</h4>
    <p>A 12.9 bolt only helps if the <b>bolt</b> is the limit. When the recommendation is capped by bearing on a
    plastic or a laminate, a stronger class changes nothing at all — the head still sinks into the plate at the same
    pressure. Spend the money on a washer, a bigger thread, or a metal insert instead. Higher classes are also more
    notch-sensitive and, in the case of 12.9, prone to hydrogen embrittlement when plated.</p>
    <div class="tipnum">Yours: limited by <b>${r.TrecGovernedBy === "bolt" ? "the bolt" : "plate bearing"}</b> —
      ${r.TrecGovernedBy === "bolt"
        ? "a higher class would raise the recommendation"
        : "a higher class would change nothing; a washer or a wider head would"}</div></div>

    <div class="tip"><h4>7 · Threads into soft material need engagement, not torque</h4>
    <p>This calculator assumes a through-bolt with a nut, and never checks thread stripping. Tapped into aluminium
    you need roughly <b>1.5–2·d</b> of engagement, into plastic <b>2–2.5·d</b> or a heat-set insert, before the
    threads are as strong as the bolt. Below that the hole strips well under any torque on this page, and the failure
    is sudden and unrepairable in place.</p></div>

    <div class="tip bad"><h4>8 · Re-torque, and never trust one reading</h4>
    <p>Surfaces embed and polymers creep: a joint checked 24 hours after assembly regularly reads 10–20% low, more
    in a soft or freshly-printed stack. Re-torque it. Add thread locker or a prevailing-torque nut where vibration is
    present — friction is what keeps a fastener from backing out, and it is the first thing a loosening cycle eats.
    <b>Where a joint failing would injure someone, torque control alone is not enough</b>: use angle control, load-
    indicating washers, or measure the stretch.</p></div>`;
}
