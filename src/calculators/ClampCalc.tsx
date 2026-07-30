import { useEffect, useMemo, useRef, useState } from "react";
import * as CM from "./clampMath";
import { buildScene, drawScene, type View } from "./clampScene";

// Cylinder Clamp — a two-piece split collar on a rod or tube.
// Answers the two bench questions: how many bolts, and how tight.

const M = "var(--mono)";
const f = CM.fmt;
const n2 = (v: number) => (isFinite(v) ? v.toFixed(2) : "∞");

/* ── typeset maths, CSS only (no library) ─────────────────────────────── */
const V = (x: string) => `<span class="mi">${x}</span>`;
const FR = (n: string, d: string) => `<span class="frac"><span>${n}</span><span>${d}</span></span>`;
const eqn = (lead: string, sym: string, sub: string, res: string, cls = "", cmt = "") =>
  `<div class="eqn"><span class="lead">${lead}</span><span class="mth">${sym} <span class="sub">= ${sub}</span> = ` +
  `<span class="res ${cls}">${res}</span></span>${cmt ? `<span class="cmt">${cmt}</span>` : ""}</div>`;

/* ── dimensioned drawing: every dimension outside the part ────────────── */
// `forPrint` swaps the palette for ink on paper. The colours are baked into the
// SVG's own fill/stroke attributes, so a print stylesheet cannot reach them —
// the diagram used to export as a full page of black.
function dimsSVG(inp: CM.ClampInput, r: CM.ClampResult, forPrint = false) {
  const R = inp.D / 2, g2 = r.g2, H = r.H, e = inp.e, dB = r.d;
  const half = R + e + 1.7 * dB, top = g2 + H, bad = r.tcRaw < 0.5;
  const VW = 400, VH = 272, ML = 52, MR = 54, MT = 44, MB = 50;
  const sc = Math.min((VW - ML - MR) / (2 * half), (VH - MT - MB) / (2 * top));
  const cx = ML + (VW - ML - MR) / 2, cyv = MT + (VH - MT - MB) / 2;
  const X = (z: number) => cx + z * sc, Y = (y: number) => cyv - y * sc;
  const INK = forPrint ? "#333" : "#8b97a3";
  const THIN = forPrint ? "#777" : "#46515c";
  const ACC = forPrint ? "#14459b" : "#3a78c2";
  const GRN = bad ? (forPrint ? "#a01d1d" : "#d65c5c") : forPrint ? "#0a6b3d" : "#4fb477";
  const AMB = forPrint ? "#8a5a00" : "#d9a441";
  const txt = (x: number, y: number, s: string, c = INK, size = 8.5, anc = "middle") =>
    `<text x="${x}" y="${y}" font-size="${size}" fill="${c}" text-anchor="${anc}" font-family="monospace">${s}</text>`;
  const ah = (x: number, y: number, dx: number, dy: number, c: string) => {
    const L = 5.2, Wd = 2.1, nx = -dy, ny = dx;
    return `<path d="M ${x} ${y} L ${x - dx * L + nx * Wd} ${y - dy * L + ny * Wd} L ${x - dx * L - nx * Wd} ${y - dy * L - ny * Wd} Z" fill="${c}"/>`;
  };
  const ext = (x1: number, y1: number, x2: number, y2: number) =>
    `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${THIN}" stroke-width=".45"/>`;
  const dimH = (z0: number, z1: number, yb: number, yf: number, s: string, c: string) => {
    const a = X(z0), b = X(z1);
    return ext(a, Y(yf), a, yb + (yb < cyv ? 4 : -4)) + ext(b, Y(yf), b, yb + (yb < cyv ? 4 : -4)) +
      `<line x1="${a}" y1="${yb}" x2="${b}" y2="${yb}" stroke="${c}" stroke-width=".7"/>` +
      ah(a, yb, -1, 0, c) + ah(b, yb, 1, 0, c) + txt((a + b) / 2, yb - 5, s, c);
  };
  const dimV = (y0: number, y1: number, xb: number, zf: number, s: string, c: string) => {
    const a = Y(y0), b = Y(y1);
    return ext(X(zf), a, xb + (xb < cx ? 4 : -4), a) + ext(X(zf), b, xb + (xb < cx ? 4 : -4), b) +
      `<line x1="${xb}" y1="${a}" x2="${xb}" y2="${b}" stroke="${c}" stroke-width=".7"/>` +
      ah(xb, a, 0, -1, c) + ah(xb, b, 0, 1, c) +
      `<text x="${xb - 4}" y="${(a + b) / 2 + 3}" font-size="8.5" fill="${c}" text-anchor="end" font-family="monospace">${s}</text>`;
  };
  const zb = Math.sqrt(Math.max(R * R - g2 * g2, 1e-6));
  const outline = (up: boolean) => {
    const sg = up ? 1 : -1;
    return `<path d="M ${X(-half)} ${Y(sg * g2)} L ${X(-zb)} ${Y(sg * g2)} M ${X(zb)} ${Y(sg * g2)} L ${X(half)} ${Y(sg * g2)}
      M ${X(-half)} ${Y(sg * g2)} L ${X(-half)} ${Y(sg * top)} L ${X(half)} ${Y(sg * top)} L ${X(half)} ${Y(sg * g2)}"
      fill="none" stroke="${INK}" stroke-width="1.2" stroke-linejoin="round"/>
      <path d="M ${X(-zb)} ${Y(sg * g2)} A ${R * sc} ${R * sc} 0 0 ${up ? 1 : 0} ${X(zb)} ${Y(sg * g2)}"
      fill="none" stroke="${GRN}" stroke-width="1.2" ${bad ? 'stroke-dasharray="4 3"' : ""}/>`;
  };
  const bolt = (z: number) =>
    `<line x1="${X(z)}" y1="${Y(top) - 13}" x2="${X(z)}" y2="${Y(-top) + 13}" stroke="${ACC}" stroke-width=".5" stroke-dasharray="7 2 2 2"/>
     <rect x="${X(z) - (dB * sc) / 2}" y="${Y(top)}" width="${dB * sc}" height="${2 * top * sc}" fill="none" stroke="${ACC}" stroke-width=".7"/>`;
  return `<svg viewBox="0 0 ${VW} ${VH}" role="img" aria-label="Dimensioned cross-section">
    ${outline(true)}${outline(false)}${bolt(R + e)}${bolt(-(R + e))}
    <line x1="${X(-half) - 10}" y1="${Y(0)}" x2="${X(half) + 10}" y2="${Y(0)}" stroke="${THIN}" stroke-width=".5" stroke-dasharray="7 2 2 2"/>
    ${dimV(g2, top, ML - 16, -half, "H " + f(H, 1), AMB)}
    ${dimH(R, R + e, MT - 18, top, "e " + f(e, 1), ACC)}
    ${dimH(-R, R, VH - MB + 20, -top, "D " + f(inp.D, 1), GRN)}
    ${bad ? "" : dimV(R, top, VW - MR + 34, 0, "tc " + f(r.tc, 1), "#d65c5c")}
    ${dimV(-g2, g2, VW - MR + 12, half, "gap " + f(inp.gap, 2), INK)}
    ${txt(X(R + e), MT - 26, "bolt axis at R + e", ACC, 8)}
    ${txt(X(0), VH - 10, "width W = " + f(inp.W, 1) + " mm into the page", THIN, 8)}
    ${bad ? txt(X(0), Y(0) + 4, "H must exceed D/2 = " + f(R, 1) + " mm — no material over the bore", "#d65c5c", 8.5) : ""}
  </svg>`;
}

/* ── the worked calculation ───────────────────────────────────────────── */
function reportHTML(inp: CM.ClampInput, r: CM.ClampResult, rec: CM.Recommendation, spec: CM.BoltSpec, T: number) {
  const R = inp.D / 2, cm = CM.CLAMP_MATS[inp.mat], n0 = (v: number) => Math.round(v).toLocaleString("en-US");
  const rows: [string, string, number][] = [
    ["Crown bending", f(r.sigmaCrown, 1) + " MPa", r.SFcrown],
    ["Ear bending", f(r.sigmaF, 1) + " MPa", r.SFflange],
    ["Head bearing", f(r.pHead, 1) + " MPa", r.SFbear],
    [inp.hollow ? "Tube wall" : "Bore pressure", f(r.sigmaCyl, 1) + " MPa", r.SFcyl],
    ["Bolt (von Mises)", f(r.vm, 0) + " MPa", r.SFbolt],
    ["Grip, long-term", "—", r.SFslipLT],
  ];
  return `<table class="rep"><tr><th>Given</th><th style="text-align:right">Value</th></tr>
    <tr><td>Cylinder ${V("D")} · wall ${V("t")}</td><td class="v">${f(inp.D, 1)} · ${inp.hollow ? f(inp.tw, 1) : "solid"} mm</td></tr>
    <tr><td>Body height ${V("H")} · width ${V("W")}</td><td class="v">${f(r.H, 1)} · ${f(inp.W, 1)} mm</td></tr>
    <tr><td>Bolt offset ${V("e")} · total gap</td><td class="v">${f(inp.e, 1)} · ${f(inp.gap, 2)} mm</td></tr>
    <tr><td>Bolts</td><td class="v">${inp.N} × ${inp.thread} ${inp.cls.split(" ")[0]}</td></tr>
    <tr><td>Body material (σ<sub>y</sub> ${f(cm.sy, 0)} · p<sub>G</sub> ${f(cm.pG, 0)} MPa)</td><td class="v">${inp.mat}</td></tr>
    <tr><td>Applied torque per bolt</td><td class="v">${n2(T)} N·m</td></tr></table>` +
    eqn("1 · Preload from wrench torque", `${V("F")} = ${FR(V("T"), `${V("K")}·${V("d")}`)}`,
      FR(`${n2(T)}×10³`, `${r.K} × ${f(r.d, 0)}`), `${n0(r.Fb)} N`, "",
      "The nut factor absorbs thread and under-head friction — most of your wrench effort never reaches the bolt. K scatters ±25%, so read this as a band.") +
    eqn("2 · Total clamp force", `Σ${V("F")} = ${V("N")}·${V("F")}`, `${inp.N} × ${n0(r.Fb)}`, `${n0(r.Ftot)} N`, "",
      r.bottomed ? `Capped at ${n0(r.Fcl)} N — the gap has shut, so extra torque no longer reaches the cylinder.` : "") +
    eqn("3 · Crown section left over the bore", `${V("t")}<sub>c</sub> = ${FR("gap", "2")} + ${V("H")} − ${FR(V("D"), "2")}`,
      `${f(inp.gap / 2, 2)} + ${f(r.H, 1)} − ${f(R, 2)}`, `${f(r.tc, 2)} mm`, r.tcRaw < 0.5 ? "bad" : "",
      "The only place the two bending sections come from — nothing to contradict.") +
    eqn("4 · Crown moment (the see-saw)", `${V("M")} = ${V("F")}·(${V("e")} + ${FR(V("R"), "2")})`,
      `${n0(r.Fb)} × (${f(inp.e, 1)} + ${f(R / 2, 2)})`, `${n0(r.Mcrown)} N·mm`, "",
      `The bolt sits at a = R + e = ${f(r.aBolt, 1)} mm; the bore reaction, spread over ±R, gives back F·R/2. The ear only sees F·e, so the crown carries ${f((inp.e + R / 2) / Math.max(inp.e, 0.01), 2)}× more on a thinner section.`) +
    eqn("5 · Crown stress", `σ<sub>c</sub> = ${FR(`6·${V("M")}`, `${V("b")}·${V("t")}<sub>c</sub>²`)}`,
      FR(`6 × ${n0(r.Mcrown)}`, `${f(r.b, 1)} × ${f(r.tc, 2)}²`), `${f(r.sigmaCrown, 1)} MPa`, "",
      `SF = ${f(cm.sy, 0)} / ${f(r.sigmaCrown, 1)} = <b style="color:${CM.sfColor(r.SFcrown)}">${r.SFcrown.toFixed(2)}</b>`) +
    eqn("6 · Ear stress", `σ<sub>e</sub> = ${FR(`6·${V("F")}·${V("e")}`, `${V("b")}·${V("H")}²`)}`,
      FR(`6 × ${n0(r.Fb)} × ${f(inp.e, 1)}`, `${f(r.b, 1)} × ${f(r.H, 1)}²`), `${f(r.sigmaF, 1)} MPa`, "",
      `SF = <b style="color:${CM.sfColor(r.SFflange)}">${r.SFflange.toFixed(2)}</b>`) +
    eqn("7 · Bore pressure", `${V("p")} = ${FR(`Σ${V("F")}`, `${V("D")}·${V("W")}`)}`,
      FR(`${n0(r.Fcl)}`, `${f(inp.D, 1)} × ${f(inp.W, 1)}`), `${f(r.p, 2)} MPa`) +
    eqn("8 · Friction grip", `${V("F")}<sub>ax</sub> = ${V("η")}·${V("μ")}·π·Σ${V("F")}`,
      `0.75 × ${f(r.mu, 2)} × π × ${n0(r.Fcl)}`, `${n0(r.Fax)} N`, "",
      `Holding torque = F<sub>ax</sub>·D/2 = ${f(r.Thold, 1)} N·m. η = 0.75 derates for non-uniform bore contact.`) +
    eqn("9 · After creep", `${V("F")}<sub>ax,LT</sub> = ${V("c")}·${V("F")}<sub>ax</sub>`,
      `${f(r.creep, 2)} × ${n0(r.Fax)}`, `${n0(r.FaxLT)} N`, r.SFslipLT >= inp.SFt ? "" : "bad",
      r.printed ? `Printed polymers give back ${f((1 - r.creep) * 100, 0)}% of preload over days.` : "Metal body — no creep derate.") +
    `<div class="lab" style="margin-top:16px">VERDICT</div>
     <table class="rep"><tr><th>Check</th><th>Stress</th><th style="text-align:right">SF</th></tr>` +
    rows.map(([k, v, sf]) => `<tr class="${sf === r.SFstruct ? "hi" : ""}"><td>${k}</td><td>${v}</td>` +
      `<td class="v" style="color:${CM.sfColor(sf)}">${isFinite(sf) ? sf.toFixed(2) : "∞"}</td></tr>`).join("") + `</table>
     <div class="lab" style="margin-top:16px">TORQUE SPECIFICATION</div>
     <table class="rep"><tr><th>Per bolt</th><th style="text-align:right">N·m</th></tr>
       <tr><td>Fastener alone — 65% of proof</td><td class="v">${n2(spec.T65)}</td></tr>
       <tr><td>Capped by bearing on ${inp.mat}</td><td class="v">${n2(spec.Tbear)}</td></tr>
       <tr class="hi"><td><b>Fastener-side spec</b> — ${spec.governs}</td><td class="v">${n2(spec.T)}</td></tr>
       <tr><td>First yield in the joint (${rec.limits[0].key})</td><td class="v">${n2(rec.Tyield)}</td></tr>
       <tr><td>Gap shuts</td><td class="v">${n2(rec.Tclose)}</td></tr>
       <tr class="hi"><td><b>Joint-side recommendation</b> — ${rec.governing}</td>
         <td class="v" style="color:${rec.ok ? "var(--green)" : "var(--red)"}">${n2(rec.T)}</td></tr></table>`;
}

/* ── deflection derivation + where the model stops ────────────────────── */
function theoryHTML(inp: CM.ClampInput, r: CM.ClampResult) {
  const cm = CM.CLAMP_MATS[inp.mat], R = inp.D / 2, cb = CM.curvedBeam(inp, r);
  const Ithin = (r.b * r.tc ** 3) / 12, Ifull = (r.b * r.H ** 3) / 12;
  const dThin = (r.Fb * r.aBolt ** 3) / (3 * cm.E * Ithin);
  const dFull = (r.Fb * r.aBolt ** 3) / (3 * cm.E * Ifull);
  const zb = Math.sqrt(Math.max(R * R - r.g2 * r.g2, 0));
  return `<p><b>One height dimension.</b> The body is a flat block, so you set <b>H</b> — its height above the split
    face — and both bending sections follow. The <b>ear</b> at the bolt is the full H. The <b>crown</b>, the material
    left over the bore, is <b>tc = gap/2 + H − D/2</b>. The crown is always the thinner of the two, which is why these
    clamps crack over the bore and not at the bolts.</p>

    <h3>How the deflection is calculated</h3>
    <p><b>The half is one beam, not two parts.</b> Symmetry fixes it at the bore <em>centre</em> — two bolts pull down
    either side, so the section at z = 0 cannot rotate. The span is <b>a = R + e = ${f(r.aBolt, 1)} mm</b>, and the
    depth <em>varies</em>: only ${f(r.tc, 1)} mm over the bore, opening to ${f(r.H, 1)} mm past it. The thin part sits
    at the root, where curvature does the most work.</p>` +
    eqn("Deflection — curvature integrated twice",
      `δ = ∫∫ ${FR(`${V("M")}(${V("z")})`, `${V("E")}·${V("I")}(${V("z")})`)} d${V("z")}²`,
      `θ(0) = 0 by symmetry · integrated over ${f(r.halfW, 1)} mm`, `${r.dFl.toFixed(3)} mm at the ear tip`, "",
      "No closed form exists for a varying depth. Both halves move, so the faces approach by twice this.") +
    `<p><b>Sanity check — it has to sit between two bounds.</b> A uniform cantilever of the same span made entirely of
    the thin crown section gives <b style="color:var(--amber)">${dThin.toFixed(3)} mm</b>; one of the full section
    gives <b style="color:var(--amber)">${dFull.toFixed(3)} mm</b>. The varying-depth answer must land between them,
    and does: <b style="color:var(--green)">${r.dFl.toFixed(3)} mm</b> — near the thin bound, as expected when the
    flexible part is at the root.</p>` +
    eqn("Gap consumed", `${V("g")}<sub>left</sub> = gap − (2δ + δ<sub>oval</sub>)`,
      `${f(inp.gap, 2)} − (2×${r.dFl.toFixed(3)} + ${r.dOval.toFixed(3)})`,
      r.bottomed ? "0 — SHUT" : `${f(r.gapRemain, 2)} mm`, r.bottomed ? "bad" : "",
      `The gap shuts at ${n2(r.Tclose)} N·m per bolt.`) +

    `<h3>Where this model stops being right</h3>
    <p><b>1 · The crown is curved, and this treats it as straight.</b> Straight-beam theory puts the neutral axis at
    mid-depth; in a curved bar it shifts toward the centre of curvature. The test is r<sub>c</sub>/h — below about 5
    you should use curved-beam theory.` +
    (cb ? ` Yours is <b style="color:var(--amber)">${cb.slenderness.toFixed(2)}</b>.</p>
    <table class="rep"><tr><th>Crown stress, same moment</th><th style="text-align:right">MPa</th><th style="text-align:right">vs straight</th></tr>
      <tr class="hi"><td>Straight beam — what this reports</td><td class="v">${f(cb.sigStraight, 1)}</td><td class="v">1.00×</td></tr>
      <tr><td>Winkler-Bach, bore surface</td><td class="v">${f(cb.sigIn, 1)}</td><td class="v" style="color:var(--amber)">${cb.ratioIn.toFixed(2)}×</td></tr>
      <tr><td>Winkler-Bach, outer surface</td><td class="v">${f(cb.sigOut, 1)}</td><td class="v">${cb.ratioOut.toFixed(2)}×</td></tr>
      <tr><td>Neutral axis shifted toward the bore</td><td class="v">${f(cb.ecc, 2)} mm</td><td class="v">—</td></tr></table>
    <p>So the reported figure is biased, not noisy — by roughly −20% on one surface and +33% on the other. It sits
    inside the ±25% that friction and nut-factor scatter already impose, which is why it is still used, but it is a
    known bias.</p>` : `</p>`) +
    `<p><b>2 · Is there a discontinuity at the flange/crown junction?</b> Not in the maths: the bore reaches the flange
    face at z = ${f(zb, 2)} mm and the depth is clamped there, so it runs smoothly from ${f(r.tc, 1)} to ${f(r.H, 1)} mm,
    and the moment is smooth through z = R because the bore reaction fades to zero exactly there. The real part is
    another matter — the <b>sharp re-entrant corner</b> where the bore breaks out is a <b>2–3× concentration</b> that
    beam theory cannot see, and it is usually where these parts actually crack. Relieve it with a hole or a fillet.</p>
    <p><b>3 · Should the flanges compress against each other?</b> Before the gap closes, no — the faces never touch,
    which is the whole point: the only load path is bolt → ear → crown → cylinder. There <em>is</em> local compression
    under the bolt head, and that is the bearing check. <b>Once the gap shuts you are right</b> — the faces carry
    compression directly and extra torque splits between them and the cylinder, which is why grip is capped there.
    Past closure the numbers mean "no further grip", not an accurate contact picture.</p>`;
}

/* ── preload theory ───────────────────────────────────────────────────── */
function preloadHTML(inp: CM.ClampInput, r: CM.ClampResult, spec: CM.BoltSpec, rec: CM.Recommendation) {
  const cl = CM.CLASSES[inp.cls], Sp = cl.sp, Sy = cl.sy;
  const at65 = CM.solve({ ...inp, T: spec.T65 });
  const vmR = at65.vm / Sp, loK = 0.65 / 0.75, hiK = 0.65 / 1.25;
  return `<h3 style="margin-top:0">What proof strength is</h3>
    <p><b>ISO 898-1</b> defines a <em>proof load</em>: the tension a bolt carries and releases with no measurable
    permanent set. Proof strength is that load over the tensile stress area. It is a <em>tabulated</em> column, not
    derived from yield, and sits deliberately below the 0.2% offset yield. For <b>${inp.cls}</b>:
    ${V("S")}<sub>p</sub> = <b>${Sp} MPa</b> against ${V("R")}<sub>p0.2</sub> = <b>${Sy} MPa</b>, a ratio of
    <b>${(Sp / Sy).toFixed(2)}</b>. Across the classes it runs 0.88–0.91. Past proof the bolt takes a permanent set and
    simply loses the preload you just installed.</p>

    <h3>Why preload is a fraction of proof</h3>
    <table class="rep"><tr><th>Source</th><th style="text-align:right">Recommends</th></tr>
      <tr><td><b>Shigley</b> — reused connections</td><td class="v">0.75 · F<sub>p</sub></td></tr>
      <tr><td><b>Shigley</b> — permanent connections</td><td class="v">0.90 · F<sub>p</sub></td></tr>
      <tr><td><b>VDI 2230</b></td><td class="v">≈0.90 of yield ÷ α<sub>A</sub></td></tr>
      <tr class="hi"><td><b>This calculator</b></td><td class="v">0.65 · F<sub>p</sub></td></tr></table>
    <p class="pn warn"><b>Do not cite 0.65 as Shigley.</b> Shigley's figure is 0.75 or 0.90; VDI 2230 does not
    work in "% of proof" at all. <b>0.65 is this tool's own conservative choice</b>, at the low end of the common
    60–75% band. Here is why.</p>

    <h3>Reason 1 — tightening torsion is not in the headline</h3>` +
    eqn("Combined stress while tightening", `σ<sub>red</sub> = √(σ² + 3τ²)`,
      `σ = 0.65·${Sp} = ${f(0.65 * Sp, 0)} MPa, plus thread torsion`,
      `${f(at65.vm, 0)} MPa = ${(vmR * 100).toFixed(0)}% of proof`, vmR > 1 ? "bad" : "warn",
      `A "65% preload" is really <b>${(vmR * 100).toFixed(0)}% utilisation</b> mid-wrench at K = ${r.K}. Shigley's 0.90
       would put the reduced stress past proof before the wrench let go. Torsion relaxes afterwards, which is why the
       service check runs on tension alone.`) +
    `<h3>Reason 2 — the nut factor scatters onto preload</h3>
    <table class="rep"><tr><th>Nut factor lands</th><th style="text-align:right">Preload / proof</th></tr>
      <tr><td>25% low — grabbier than assumed</td><td class="v" style="color:var(--red)">${loK.toFixed(2)}</td></tr>
      <tr><td>as assumed</td><td class="v">0.65</td></tr>
      <tr><td>25% high — slipperier</td><td class="v">${hiK.toFixed(2)}</td></tr></table>
    <p class="pn bad"><b>Be clear-eyed:</b> at the unlucky end, ${loK.toFixed(2)} of proof <em>plus</em> torsion
    reaches roughly <b>${((vmR * loK) / 0.65 * 100).toFixed(0)}%</b> of proof — the bolt yields. Dropping the target
    buys margin, not certainty. That is the weakness of torque control, and why joints that matter use angle control
    past snug or measure bolt stretch. Treat every preload figure here as ±25%.</p>
    <p>For this clamp it is largely academic: the body governs at <b>${n2(rec.T)} N·m</b> while the fastener could take
    <b>${n2(spec.T)}</b>, so the preload fraction only becomes binding with a metal body.</p>
    <div class="lab" style="margin-top:16px">REFERENCES</div>
    <table class="rep">
      <tr><td>Budynas &amp; Nisbett, <b>Shigley's Mechanical Engineering Design</b>, ch. 8</td></tr>
      <tr><td><b>ISO 898-1</b> — proof load, R<sub>p0.2</sub>, R<sub>m</sub> by property class</td></tr>
      <tr><td><b>VDI 2230 Part 1</b> — reduced stress, tightening factor α<sub>A</sub>, surface pressure p<sub>G</sub></td></tr>
      <tr><td>Roark's <b>Formulas for Stress and Strain</b> — thin-ring pinch, used for tube ovalization</td></tr></table>`;
}

/* ── design tips ──────────────────────────────────────────────────────── */
function tipsHTML(inp: CM.ClampInput, r: CM.ClampResult, rec: CM.Recommendation, spec: CM.BoltSpec, T: number) {
  const used = ((inp.gap - r.gapRemain) / Math.max(inp.gap, 1e-6)) * 100;
  return `<div class="tip key"><h4>1 · The flange gap is the design, not a leftover</h4>
    <p>Too small and the halves meet before working torque — grip flatlines and the wrench just squeezes flange on
    flange. Too large and the ears swing further to close it, loading the crown harder for the same grip. <b>Aim for
    half to two-thirds consumed at working torque</b>, leaving room for creep, tolerance and re-torquing.</p>
    <div class="tipnum">Yours: gap <b>${f(inp.gap, 2)} mm</b>, <b>${f(used, 0)}%</b> consumed at ${n2(T)} N·m ·
      shuts at <b>${n2(r.Tclose)} N·m</b> · recommended <b>${n2(rec.T)} N·m</b></div></div>

    <div class="tip"><h4>2 · Bore fit and finish beat torque</h4>
    <p>Commercial practice runs the bore at <b>h8/h9</b> with <b>0.02–0.08 mm radial clearance</b> for dynamic use. A
    mismatch as small as 0.05 mm clamps eccentrically, inviting vibration loosening and stress risers; a rough shaft
    can cost <b>30%</b> of holding torque. <b>Printed bores need a test coupon</b> — print a slice, measure, and offset
    CAD by the difference, typically 0.2–0.4 mm. Every millimetre of chamfer is clamp width W you paid for and are not
    using.</p></div>

    <div class="tip"><h4>3 · Uniform squeeze, never a point</h4>
    <p>Distributed clamping is roughly <b>twice</b> the holding power of a set screw, because load spreads around the
    bore instead of denting one spot. Never add a set screw "for insurance" — it marks the shaft and destroys the
    uniform contact the clamp depends on. <b>Keep the bolts close to the bore:</b> e is the lever on the ear <em>and</em>
    sets the crown moment, so pulling them in is the cheapest strength gain there is.</p></div>

    <div class="tip warn"><h4>4 · Material over the bore first</h4>
    <p>The crown is the same block minus the bore, so it carries more moment on less section — raising <b>H</b> buys
    crown depth directly, widening the ears buys almost nothing. <b>Relieve the corner where the split meets the
    bore</b>: split-hub practice is a stress-relief hole or a generous fillet at the root of the slot, because a sharp
    internal corner there is where the crack starts.</p></div>

    <div class="tip"><h4>5 · Printed parts: orientation decides the strength</h4>
    <p>Printed material is far weaker between layers, and the figures here are in-plane (XY) values. Lay the part flat
    and bolt tension pulls the ears apart along a layer boundary while the crown's tension face is also a boundary —
    both failures interlaminar, well below what is shown. <b>Stand the part on end, bore axis vertical</b>, and bolt
    tension and crown bending are both in-plane. Use 4–6 perimeters; a clamp is a bending part and bending lives in
    the skin. Model bolt holes in CAD rather than drilling them.</p></div>

    <div class="tip"><h4>6 · Fasteners and the plastic under them</h4>
    <p><b>Always washers on a soft body</b> — bearing is one of the first limits here, and a washer roughly triples the
    area. <b>Heat-set inserts:</b> boss ≈ 2× insert OD, hole 1–2 mm deeper so displaced plastic has somewhere to go,
    4–6 perimeters, modelled not drilled, iron 10–20 °C above print temperature. Otherwise a through-bolt and nut is
    simpler and stronger. <b>Don't over-grade the bolt</b> — a stronger class only helps if the bolt is the limit.</p>
    <div class="tipnum">Yours: ${inp.thread} ${inp.cls.split(" ")[0]} could take <b>${n2(spec.T)} N·m</b>, the body
      allows <b>${n2(rec.T)} N·m</b> — ${rec.T < spec.T
        ? `the fastener is <b>${(spec.T / Math.max(rec.T, 1e-6)).toFixed(1)}×</b> stronger than it needs to be`
        : `the fastener is the tighter limit`}</div></div>

    <div class="tip"><h4>7 · Assembly and service</h4>
    <p>Tighten <b>alternately in stages</b> — a third, two-thirds, full — so the halves stay parallel; pulling one side
    home first cocks the bore. <b>Re-torque printed parts after 24 hours</b>: polymers relax, and while long-term grip
    is already derated for it, a re-torque puts the preload back. Add thread locker or a nylon-insert nut — creep plus
    vibration is exactly what walks a fastener loose.</p></div>

    <div class="tip bad"><h4>8 · Reality check</h4>
    <p>Vendor figures for a <b>steel</b> two-piece collar on a 25 mm shaft run around <b>98 N·m</b> holding torque and
    over 2000 N axial. Yours is at <b>${f(r.TholdLT, 1)} N·m</b> and <b>${f(r.FaxLT, 0)} N</b> long-term — the right
    order for a polymer part, but do not expect steel-collar numbers from a printed one.</p>
    <p><b>Friction is never the sole safeguard where slipping is dangerous.</b> If letting go causes injury or wrecks
    the machine, add a key, a pin or a shoulder. The clamp then only holds position, not the consequence.</p></div>`;
}

/* ── one-page bench sheet (print only) ────────────────────────────────── */
function summaryHTML(inp: CM.ClampInput, r: CM.ClampResult, rec: CM.Recommendation, spec: CM.BoltSpec, T: number) {
  const row = (k: string, v: string) => `<tr><td>${k}</td><td class="v">${v}</td></tr>`;
  const chk = (k: string, sig: string, sf: number) =>
    `<tr${sf === r.SFstruct ? ' class="hi"' : ""}><td>${k}</td><td class="v">${sig}</td>` +
    `<td class="v" style="color:${CM.sfColor(sf)}">${isFinite(sf) ? sf.toFixed(2) : "∞"}</td></tr>`;
  return `<div class="headline"><span class="n">${n2(rec.T)} N·m</span>
      <span class="w">recommended per bolt · ${inp.N} bolts · limited by ${rec.governing}<br>
      keeps safety factor ${rec.margin.toFixed(1)} below first yield (${n2(rec.Tyield)} N·m)${rec.ok ? "" : `<br><b>Grip short of duty</b> — the duty asks ${n2(rec.Tneed)} N·m per bolt, which this joint cannot reach safely.`}</span></div>

    <h2>Geometry</h2><table class="rep">
      ${row("Cylinder", `Ø${f(inp.D, 1)} mm ${inp.hollow ? `× ${f(inp.tw, 1)} wall` : "solid"} · ${inp.cyl}`)}
      ${row("Clamp body", inp.mat)}
      ${row("Height above split H · width W", `${f(r.H, 1)} · ${f(inp.W, 1)} mm`)}
      ${row("Crown over bore tc (derived)", `${f(r.tc, 2)} mm`)}
      ${row("Bolt offset e · total gap", `${f(inp.e, 1)} · ${f(inp.gap, 2)} mm`)}
      ${row("Fasteners", `${inp.N} × ${inp.thread} grade ${inp.cls.split(" ")[0]} · ${inp.Kname}`)}</table>

    <h2>Torque</h2><table class="rep">
      ${row("<b>Use — joint-side recommendation</b>", `<b>${n2(rec.T)} N·m</b>`)}
      ${row("Fastener alone, 65% of proof", `${n2(spec.T65)} N·m`)}
      ${row(`Capped by bearing on ${inp.mat}`, `${n2(spec.Tbear)} N·m`)}
      ${row("First yield anywhere in the joint", `${n2(rec.Tyield)} N·m`)}
      ${row("Flange gap shuts (grip stops growing)", `${n2(r.Tclose)} N·m`)}
      ${row("Duty demands", isFinite(rec.Tneed) ? `${n2(rec.Tneed)} N·m` : "—")}</table>

    <h2>Checks at ${n2(T)} N·m per bolt</h2><table class="rep">
      <tr><th>Check</th><th style="text-align:right">Stress</th><th style="text-align:right">SF</th></tr>
      ${chk("Crown bending (over the bore)", f(r.sigmaCrown, 1) + " MPa", r.SFcrown)}
      ${chk("Ear bending", f(r.sigmaF, 1) + " MPa", r.SFflange)}
      ${chk("Bearing under head", f(r.pHead, 1) + " MPa", r.SFbear)}
      ${chk(inp.hollow ? "Tube wall" : "Bore pressure", f(r.sigmaCyl, 1) + " MPa", r.SFcyl)}
      ${chk("Bolt (von Mises vs proof)", f(r.vm, 0) + " MPa", r.SFbolt)}
      ${chk("Grip, long-term", "—", r.SFslipLT)}</table>

    <h2>What it holds before slipping</h2><table class="rep">
      <tr><th></th><th style="text-align:right">fresh</th><th style="text-align:right">after creep</th></tr>
      <tr><td>Pull along axis</td><td class="v">${f(r.Fax, 0)} N</td><td class="v">${f(r.FaxLT, 0)} N</td></tr>
      <tr><td>Twist around axis</td><td class="v">${f(r.Thold, 1)} N·m</td><td class="v">${f(r.TholdLT, 1)} N·m</td></tr>
      ${row("Clamp force · bore pressure", `${f(r.Fcl, 0)} N · ${r.p.toFixed(2)} MPa`)}
      ${row("Deflection per half · gap left", `${r.dFl.toFixed(3)} mm · ${r.bottomed ? "SHUT" : r.gapRemain.toFixed(2) + " mm"}`)}</table>

    <h2>Governing relations</h2>
    <div class="eqs">
      F = T/(K·d) = ${f(r.Fb, 0)} N per bolt &nbsp;·&nbsp; ΣF = ${f(r.Fcl, 0)} N<br>
      tc = gap/2 + H − D/2 = ${f(r.tc, 2)} mm &nbsp;·&nbsp; b = W/(N/2) = ${f(r.b, 1)} mm<br>
      σ_crown = 6·F·(e + D/4)/(b·tc²) = ${f(r.sigmaCrown, 1)} MPa &nbsp;·&nbsp; σ_ear = 6·F·e/(b·H²) = ${f(r.sigmaF, 1)} MPa<br>
      F_ax = η·μ·π·ΣF, η 0.75, μ ${f(r.mu, 2)} &nbsp;·&nbsp; T_hold = F_ax·D/2 &nbsp;·&nbsp; long-term × ${f(r.creep, 2)} creep
    </div>
    ${r.warns.filter((w) => w.level !== "info").length
      ? `<h2>Warnings</h2><table class="rep">` + r.warns.filter((w) => w.level !== "info").map((w) => `<tr><td>${w.text}</td></tr>`).join("") + `</table>`
      : ""}
    <p style="font-size:9px;color:#666;margin-top:10px">Typical reference values (ISO 898-1, Shigley, VDI 2230, Roark).
    Beam theory on a stubby section runs slightly stiff; friction scatters ±25%. Verify against a bench test.</p>`;
}

/* ── the calculator ───────────────────────────────────────────────────── */
type Tab = "model" | "theory" | "preload" | "tips";

export default function ClampCalc() {
  const [inp, setInp] = useState<CM.ClampInput>(CM.defaults);
  const [tab, setTab] = useState<Tab>("model");
  const [torque, setTorque] = useState(() => CM.recommend(CM.defaults()).T);
  const [ex, setEx] = useState(6);
  const [opacity, setOpacity] = useState(100);
  const [stressMode, setStressMode] = useState(true);
  const [contrast, setContrast] = useState(true);
  const [forces, setForces] = useState(true);
  const [cut, setCut] = useState(false);
  const [spin, setSpin] = useState(false);
  // Non-null only while an export is in flight: it carries which document to
  // build and the 3D snapshot to embed in it.
  const [printDoc, setPrintDoc] = useState<{ brief: boolean; img: string } | null>(null);

  const set = <K extends keyof CM.ClampInput>(k: K, v: CM.ClampInput[K]) => setInp((s) => ({ ...s, [k]: v }));

  const res = useMemo(() => CM.solve({ ...inp, T: torque }), [inp, torque]);
  const rec = useMemo(() => CM.recommend(inp), [inp]);
  // The joint at the recommended torque — so the card can quote the grip you
  // actually get there, not the grip at wherever the slider happens to sit.
  const recRes = useMemo(() => CM.solve({ ...inp, T: rec.T }), [inp, rec.T]);
  const spec = useMemo(() => CM.boltSpec(inp), [inp]);
  // The same fastener under the other head assumption, so the reference can show
  // both and the washer stops looking like a difference in method.
  const specBare = useMemo(() => CM.boltSpec({ ...inp, washer: false }), [inp]);
  const specWashered = useMemo(() => CM.boltSpec({ ...inp, washer: true }), [inp]);

  const cvRef = useRef<HTMLCanvasElement>(null);
  const viewRef = useRef<View>({ yaw: -0.7, pitch: -0.26, dist: 5.2 });
  const headsRef = useRef<number[][]>([]);
  const dragRef = useRef<{ mode: "orbit" | "bolt" | null; x: number; y: number; ly: number; t0: number }>({ mode: null, x: 0, y: 0, ly: 0, t0: 0 });
  const liveRef = useRef({ res, ex, stressMode, contrast, forces, cut, opacity, spin, inp, torque });
  liveRef.current = { res, ex, stressMode, contrast, forces, cut, opacity, spin, inp, torque };

  // One animation loop for the whole viewer.
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const cv = cvRef.current;
      const L = liveRef.current;
      if (cv && cv.offsetParent) {
        if (L.spin) viewRef.current.yaw += 0.006;
        const scene = buildScene({ ...L.inp, T: L.torque }, L.res, {
          ex: L.ex, stressMode: L.stressMode, contrast: L.contrast,
          forces: L.forces, cut: L.cut, opaque: L.opacity >= 100,
        });
        headsRef.current = drawScene(cv, scene, viewRef.current, L.opacity / 100);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  const tmax = useMemo(() => {
    const evs = CM.solve({ ...inp, T: Math.max(torque, 0.5) }).events.filter((e) => isFinite(e.T)).map((e) => e.T);
    return Math.max(2, Math.ceil(Math.min(1.4 * Math.max(...evs, 1), 40)));
  }, [inp]); // eslint-disable-line react-hooks/exhaustive-deps

  const onDown = (ev: React.PointerEvent<HTMLCanvasElement>) => {
    const cv = cvRef.current;
    if (!cv) return;
    cv.setPointerCapture(ev.pointerId);
    const rect = cv.getBoundingClientRect();
    const x = ev.clientX - rect.left, y = ev.clientY - rect.top;
    // Grabbing a bolt head tightens it; anywhere else orbits the view.
    const hit = headsRef.current.some((h) => Math.hypot(h[0] - x, h[1] - y) < 26);
    dragRef.current = { mode: hit ? "bolt" : "orbit", x: ev.clientX, y, ly: ev.clientY, t0: torque };
  };
  const onMove = (ev: React.PointerEvent<HTMLCanvasElement>) => {
    const d = dragRef.current;
    if (!d.mode) return;
    if (d.mode === "bolt") {
      const rect = cvRef.current!.getBoundingClientRect();
      setTorque(Math.max(0, Math.min(tmax, d.t0 + ((ev.clientY - rect.top - d.y) / 90) * tmax * 0.55)));
    } else {
      viewRef.current.yaw += (ev.clientX - d.x) * 0.008;
      viewRef.current.pitch = Math.max(-1.25, Math.min(1.0, viewRef.current.pitch + (ev.clientY - d.ly) * 0.006));
      d.x = ev.clientX;
      d.ly = ev.clientY;
    }
  };
  const onUp = () => { dragRef.current.mode = null; };

  // ── Report snapshot ──────────────────────────────────────────────────────
  // The viewer's own canvas is sized to its layout box and to the screen's
  // pixel ratio, so lifting it straight into a document gives a picture that is
  // soft the moment the page is printed or opened on a desktop. Render the same
  // scene again offscreen, at print density, on paper white.
  const snapshot = (brief: boolean): string => {
    const cv = document.createElement("canvas");
    const scene = buildScene({ ...inp, T: torque }, res, {
      ex, stressMode, contrast, forces, cut, opaque: opacity >= 100,
    });
    const view: View = { ...viewRef.current };
    // The bench sheet has one page to spend, so it gets a letterbox crop; the
    // full report can afford a taller figure. Scale 2 either way, which puts the
    // printed figure above 300 dpi instead of at screen resolution.
    drawScene(cv, scene, view, opacity / 100, {
      width: 1100, height: brief ? 460 : 700, scale: 2, background: "#ffffff", settle: true,
    });
    return cv.toDataURL("image/png");
  };

  // Printing renders a document of its own rather than re-skinning the live UI.
  // Re-skinning was the bug: inline dark backgrounds beat any @media print rule
  // that lacks !important, so panels, the app shell and the dimension diagram
  // all survived as black slabs with unreadable text on them.
  const exportPDF = (brief: boolean) => {
    setPrintDoc({ brief, img: snapshot(brief) });
  };

  useEffect(() => {
    if (!printDoc) return;
    let done = false;
    const finish = () => { if (!done) { done = true; setPrintDoc(null); } };
    // Chrome blocks inside print(); Safari returns immediately, so afterprint is
    // the signal that the document may be torn down. The timeout is only a
    // backstop for browsers that never fire it.
    window.addEventListener("afterprint", finish);
    // Two frames: one to mount the print document, one to lay it out.
    const raf = requestAnimationFrame(() => requestAnimationFrame(() => {
      window.print();
      setTimeout(finish, 1500);
    }));
    return () => { window.removeEventListener("afterprint", finish); cancelAnimationFrame(raf); };
  }, [printDoc]);

  const gripCol = CM.sfColor(res.SFslipLT * (2 / Math.max(inp.SFt, 0.5)));
  const dutyEq = Math.max(0, inp.Freq) + (inp.Treq > 0 ? (2000 * inp.Treq) / inp.D : 0);
  const scaleMPa = CM.CLAMP_MATS[inp.mat].sy;
  // Three distinct states, and they are not the same failure: green = safe and
  // the duty is covered; amber = the torque is perfectly safe but the grip it
  // buys falls short of the duty; red = the geometry leaves no room at all.
  const recAccent = rec.T <= 0 ? "#d65c5c" : rec.ok ? "#4fb477" : "#cf9f52";

  const lab: React.CSSProperties = { fontFamily: M, fontSize: 8.5, letterSpacing: ".14em", color: "#6b7884", textTransform: "uppercase" };
  const btn = (on: boolean): React.CSSProperties => ({
    fontFamily: M, fontSize: 9, letterSpacing: ".12em", textTransform: "uppercase", cursor: "pointer",
    background: "#0e1419", border: `1px solid ${on ? "#3a78c2" : "#1f2a33"}`, color: on ? "#3a78c2" : "#8b97a3",
    borderRadius: 2, padding: "7px 10px", whiteSpace: "nowrap",
  });
  const panel: React.CSSProperties = { background: "#0b1015", border: "1px solid #141c22", borderRadius: 3, padding: "10px 13px", marginTop: 8 };

  return (
    <div className="flexure-shell clamp-page" style={{ maxWidth: 620, margin: "0 auto" }}>
      <div className="flexure-header" style={{ marginBottom: 12, paddingBottom: 10, borderBottom: "1px solid #1f2a33" }}>
        <div>
          <div style={{ fontFamily: M, fontSize: 9, letterSpacing: ".25em", color: "#3a78c2" }}>FASTENERS</div>
          <h1 className="flexure-title" style={{ margin: "5px 0 0", fontSize: 20, fontWeight: 600 }}>Cylinder Clamp — Split Collar</h1>
          <div style={{ fontFamily: M, fontSize: 9, color: "#46515c", marginTop: 5, lineHeight: 1.7 }}>
            How many bolts, and how tight. Drag a bolt head to tighten the model; drag elsewhere to orbit.
          </div>
        </div>
      </div>

      <div className="tabbar" role="tablist">
        {([["model", "Model"], ["theory", "Theory & report"], ["preload", "Preload & torque"], ["tips", "Design tips"]] as [Tab, string][])
          .map(([k, t]) => (
            <button key={k} role="tab" aria-selected={tab === k} className={`tabbtn${tab === k ? " on" : ""}`} onClick={() => setTab(k)}>{t}</button>
          ))}
      </div>

      {/* ── MODEL ── */}
      <div className={`tabpane${tab === "model" ? " on" : ""}`} data-t="model">
        <div className="clamp-stage">
          <canvas ref={cvRef} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} />
          <div className="clamp-hud">
            T <b>{n2(torque)} N·m</b> → <b>{f(res.Fb, 0)} N</b>/bolt<br />
            on cylinder <b>{f(res.Fcl, 0)} N</b> · p <b>{f(res.p, 2)} MPa</b><br />
            grip <b>{f(res.FaxLT, 0)} N</b> · gap <b>{res.bottomed ? "SHUT" : `${f(res.gapRemain, 2)} mm`}</b>
          </div>
          <div className="clamp-hint">drag a bolt head to tighten · drag elsewhere to orbit</div>
        </div>

        <div style={{ ...panel, display: "flex", alignItems: "center", gap: 9 }}>
          <span style={{ ...lab, whiteSpace: "nowrap" }}>Torque/bolt</span>
          <input type="range" min={0} max={tmax} step={0.05} value={torque} aria-label="Torque per bolt"
            onChange={(e) => setTorque(+e.target.value)} style={{ flex: 1, accentColor: "#3a78c2", minWidth: 0 }} />
          <span style={{ fontFamily: M, fontSize: 13, fontWeight: 600, minWidth: 74, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
            {n2(torque)} N·m
          </span>
        </div>

        <div className="clamp-rec" style={{ borderColor: recAccent }}>
          <span style={{ fontFamily: M, fontSize: 22, fontWeight: 600, color: recAccent, whiteSpace: "nowrap" }}>
            {n2(rec.T)} N·m
          </span>
          <span style={{ fontFamily: M, fontSize: 9.5, color: "#8b97a3", lineHeight: 1.65, flex: 1, minWidth: 150 }}>
            {rec.T <= 0
              ? <><b style={{ color: "#e8edf1" }}>nothing left to give</b> — {rec.governing} is already at its limit
                with the bolts barely snug. Change the geometry or the material.</>
              : <>
                <b style={{ color: "#e8edf1" }}>safe to tighten to this</b> — the most this joint takes with
                SF {rec.margin.toFixed(1)} on {rec.governing}. Grips {f(recRes.FaxLT, 0)} N long-term.<br />
                {dutyEq <= 0
                  ? <span style={{ color: "#46515c" }}>No load entered below, so this is capacity only.</span>
                  : rec.ok
                    ? <>Holding your {f(inp.Freq, 0)} N + {f(inp.Treq, 1)} N·m at SF {f(inp.SFt, 1)} takes {n2(rec.Tneed)} N·m/bolt
                      — <span style={{ color: "#4fb477" }}>covered, {(rec.T / Math.max(rec.Tneed, 1e-9)).toFixed(1)}× over</span>.</>
                    : <><span style={{ color: "#cf9f52" }}>Grip is short:</span> holding your {f(inp.Freq, 0)} N + {f(inp.Treq, 1)} N·m
                      at SF {f(inp.SFt, 1)} would take {n2(rec.Tneed)} N·m/bolt.{" "}
                    {rec.Tneed > rec.Tclose
                      ? <>The gap shuts at {n2(rec.Tclose)} N·m, so no amount of torque gets there — add bolts, raise μ, or widen the gap.</>
                      : rec.Tneed <= rec.Tyield
                        ? <>You would reach it at {n2(rec.Tneed)} N·m, which is SF {(rec.Tyield / rec.Tneed).toFixed(2)} on {rec.governing} instead of {rec.margin.toFixed(1)} — accept that, or add bolts / raise H / shorten e.</>
                        : <>Even at first yield ({n2(rec.Tyield)} N·m) it falls short — add bolts, raise H, shorten e, or lower the duty.</>}</>}
              </>}
          </span>
          <button style={btn(false)} onClick={() => setTorque(rec.T)}>Use it</button>
        </div>
        <div className="clamp-hintline">
          <b>Safe torque</b> = min of three things: what the <b>body</b> takes at SF {rec.margin.toFixed(1)} ({n2(rec.Tyield / rec.margin)} N·m,
          first yield in {rec.limits[0].key} at {n2(rec.Tyield)}), what the <b>{inp.thread} {inp.cls.split(" ")[0]} bolt</b> wants
          as preload ({n2(rec.Tbolt65)} N·m, 65% of proof), and where the <b>flange gap shuts</b> ({n2(rec.Tclose)} N·m, past which
          grip stops growing). It is a limit on the part, not a promise about grip — grip is the line above.
        </div>

        <div className="btnrow">
          <button style={btn(stressMode)} onClick={() => setStressMode((v) => !v)}>Stress colours</button>
          <button style={btn(contrast)} onClick={() => setContrast((v) => !v)}>√ Contrast</button>
          <button style={btn(forces)} onClick={() => setForces((v) => !v)}>Forces</button>
          <button style={btn(cut)} onClick={() => setCut((v) => !v)}>Half section</button>
          <button style={btn(spin)} onClick={() => setSpin((v) => !v)}>Auto-spin</button>
        </div>
        <div className="btnrow">
          <span style={{ ...panel, margin: 0, padding: "5px 10px", display: "flex", alignItems: "center", gap: 6 }}>
            <span style={lab}>Split ×</span>
            <input type="range" min={1} max={16} value={ex} aria-label="Split magnification"
              onChange={(e) => setEx(+e.target.value)} style={{ width: 68, accentColor: "#3a78c2" }} />
            <span style={{ fontFamily: M, fontSize: 11, minWidth: 24 }}>×{ex}</span>
          </span>
          <span style={{ ...panel, margin: 0, padding: "5px 10px", display: "flex", alignItems: "center", gap: 6 }}>
            <span style={lab}>Opacity</span>
            <input type="range" min={15} max={100} value={opacity} aria-label="Model opacity"
              onChange={(e) => setOpacity(+e.target.value)} style={{ width: 68, accentColor: "#3a78c2" }} />
            <span style={{ fontFamily: M, fontSize: 11, minWidth: 32 }}>{opacity}%</span>
          </span>
        </div>

        <div className="clamp-legend">
          <span><i style={{ background: "linear-gradient(90deg,#456fe6,#349bb0,#4fb477,#d98c38,#d64545)" }} />
            {stressMode ? `−${f(scaleMPa, 0)} … 0 … +${f(scaleMPa, 0)} MPa (yield)${contrast ? " · √ contrast" : " · linear"}`
              : "colour = safety factor of that part"}</span>
        </div>

        <div className="clamp-strip">
          {/* Three of these four are the part checking itself against yield. The
              first is the only one that needs a load from you, so when the load
              box is empty it reports capacity and stays neutral instead of
              colouring an SF nobody asked for. */}
          {([dutyEq > 0
            ? ["won't slip", isFinite(res.SFslipLT) ? f(res.SFslipLT, 2) : "∞", `SF vs your ${f(dutyEq, 0)} N`, gripCol, false]
            : ["holds", f(res.FaxLT, 0), "N long-term", "#8b97a3", false],
          ["ears", res.SFflange.toFixed(2), `σ ${f(res.sigmaF, 1)} MPa`, CM.sfColor(res.SFflange), res.SFflange === res.SFstruct],
          ["crown", res.SFcrown.toFixed(2), `σ ${f(res.sigmaCrown, 1)} MPa`, CM.sfColor(res.SFcrown), res.SFcrown === res.SFstruct],
          [inp.hollow ? "tube" : "bore", res.SFcyl.toFixed(2), `σ ${f(res.sigmaCyl, 1)} MPa`, CM.sfColor(res.SFcyl), res.SFcyl === res.SFstruct],
          ] as [string, string, string, string, boolean][]).map(([k, n, u, c, hot]) => (
            <div key={k} className="clamp-cell" style={hot ? { borderColor: "#d65c5c" } : undefined}>
              <div className="k">{k}</div><div className="n" style={{ color: c }}>{n}</div><div className="u">{u}</div>
            </div>
          ))}
        </div>
        <div className="clamp-hintline">
          <b>ears</b>, <b>crown</b> and <b>{inp.hollow ? "tube" : "bore"}</b> are safety factors against yield at the
          torque on the slider — they come from your geometry and materials alone, and red means that part is at or over
          its limit. The first cell is different: {dutyEq > 0
            ? <>it divides the <b>{f(res.FaxLT, 0)} N</b> the joint can hold after creep by the <b>{f(dutyEq, 0)} N</b> your
              load box asks of it, and turns red as that ratio falls below the <b>SF {f(inp.SFt, 1)}</b> you set there.
              Nothing is wrong with the part when it is red — the grip is simply short of the load you entered.</>
            : <>with the load box empty there is nothing to check against, so it just reports what the joint can hold.
              Fill in a pull or a twist at the bottom of the page to turn it into a safety factor.</>}
        </div>

        {res.warns.filter((w) => w.level !== "info").slice(0, 2).map((w, i) => (
          <div key={i} className={`clamp-warn ${w.level}`}>{w.text}</div>
        ))}

        <div className="clamp-form">
          <Num label="Cylinder Ø" unit="mm" v={inp.D} on={(v) => set("D", v)} step={0.5} />
          <Num label="Width W" unit="mm along axis" v={inp.W} on={(v) => set("W", v)} step={1} />
          <Num label="Body height H" unit="mm above split" v={inp.H} on={(v) => set("H", v)} step={0.5} />
          <Num label="Bolt offset e" unit="mm from bore" v={inp.e} on={(v) => set("e", v)} step={0.5} />
          <Num label="Gap" unit="mm total" v={inp.gap} on={(v) => set("gap", v)} step={0.1} />
          <Ro label="Derived crown tc" unit="mm over bore" v={`${f(res.tc, 2)} mm`} />
          <Sel label="Clamp material" wide v={inp.mat} opts={Object.keys(CM.CLAMP_MATS)} on={(v) => set("mat", v)} />
          <Sel label="Bolts" v={String(inp.N)} opts={["2", "4", "6"]} on={(v) => set("N", +v)} />
          <Sel label="Thread" v={inp.thread} opts={[...CM.CLAMP_THREADS]} on={(v) => set("thread", v)} />
        </div>

        <details className="clamp-details">
          <summary>Cylinder · bolt grade</summary>
          <div className="clamp-form">
            <Num label="Wall" unit="mm" v={inp.tw} on={(v) => set("tw", v)} step={0.1} />
            <label className="clamp-chk"><input type="checkbox" checked={inp.hollow} onChange={(e) => set("hollow", e.target.checked)} /> hollow tube</label>
            <Sel label="Cylinder material" wide v={inp.cyl} opts={Object.keys(CM.CYL_MATS)} on={(v) => set("cyl", v)} />
            <Sel label="Bolt grade" v={inp.cls} opts={Object.keys(CM.CLASSES)} on={(v) => set("cls", v)} />
            <Sel label="Bolt thread condition" v={inp.Kname} opts={Object.keys(CM.KFACT)} on={(v) => set("Kname", v)} />
            <label className="clamp-chk wide"><input type="checkbox" checked={inp.washer} onChange={(e) => set("washer", e.target.checked)} /> washers</label>
            <Sel label="Bore friction" wide v={inp.muName} opts={Object.keys(CM.MU)} on={(v) => set("muName", v)} />
          </div>
        </details>

        <div className="clamp-ref">
          <span className="hdr">FASTENER REFERENCE · PER BOLT</span>
          {inp.thread} grade {inp.cls.split(" ")[0]} at 65% of proof: <b>{n2(spec.T65)} N·m</b>
          {" · "}capped by bearing on {inp.mat} (p<sub>G</sub> {f(spec.pG, 0)} MPa,{" "}
          {inp.washer ? `washer face ${f(spec.dw, 1)} mm` : `bare head ${f(spec.dw, 1)} mm`}): <b>{n2(spec.Tbear)} N·m</b><br />
          → fastener-side spec <b>{n2(spec.T)} N·m</b>, limited by {spec.governs}.{" "}
          {rec.T < spec.T
            ? <>The clamp body gives out first, so use the <b>{n2(rec.T)} N·m</b> above — the fastener could take {(spec.T / Math.max(rec.T, 1e-6)).toFixed(1)}× more.</>
            : <>Here the fastener is the tighter limit, so do not exceed <b>{n2(spec.T)} N·m</b>.</>}
          {/* The single biggest reason this used to disagree with the bolted-joint
              calculator. Show the other assumption's number so the comparison is
              never apples-to-oranges. */}
          <div className="sub">
            Same thread, grade, finish and p<sub>G</sub> as the <b>Bolted Joint</b> calculator — one shared table.
            The washer is what moves it: {inp.washer
              ? <>with washers you get <b>{n2(spec.Tbear)} N·m</b>; on a bare head the annulus is 3.3× smaller,
                so it drops to <b>{n2(specBare.Tbear)} N·m</b>.</>
              : <>bare-head here gives <b>{n2(spec.Tbear)} N·m</b>; adding washers spreads the load over 3.3× the
                annulus and raises it to <b>{n2(specWashered.Tbear)} N·m</b>.</>}
            {" "}Both keep 10% clear of p<sub>G</sub>.
          </div>
        </div>

        <div className="clamp-cap">
          <div className="hdr">SLIP CAPACITY AT {n2(torque)} N·m PER BOLT · {inp.N} BOLTS</div>
          <table>
            <tbody>
              <tr><th>Before it slips on the cylinder</th><th>fresh</th><th>after creep</th></tr>
              <tr><td>Pull / push along the axis</td><td><b>{f(res.Fax, 0)}</b> N</td><td><b style={{ color: gripCol }}>{f(res.FaxLT, 0)}</b> N</td></tr>
              <tr><td>&nbsp;&nbsp;<span style={{ color: "#46515c" }}>— same, as weight</span></td><td>{f(res.Fax / 9.81, 0)} kgf</td><td>{f(res.FaxLT / 9.81, 0)} kgf</td></tr>
              <tr><td>Twist around the axis</td><td><b>{f(res.Thold, 1)}</b> N·m</td><td><b style={{ color: gripCol }}>{f(res.TholdLT, 1)}</b> N·m</td></tr>
              <tr><td>Clamp force · bore pressure</td><td>{f(res.Fcl, 0)} N</td><td>{f(res.p, 2)} MPa</td></tr>
            </tbody>
          </table>
          <div className="foot">
            <b>All outputs — you set nothing here.</b> Every row falls out of the torque on the slider: it becomes
            preload <b>F = T/(K·d)</b>, ΣF = {inp.N}·F = <b>{f(res.Ftot, 0)} N</b> squeezing the bore, and friction turns
            that into a hold. <b>F<sub>ax</sub> = η·μ·π·ΣF</b> with η 0.75 for non-uniform bore contact and μ{" "}
            {f(res.mu, 2)} from the bore-friction setting; the twist figure is that same force at the bore radius,{" "}
            <b>T = F<sub>ax</sub>·D/2</b>. The “after creep” column multiplies by{" "}
            <b>{f(res.creep, 2)}</b>, the preload this body retains long-term — that column is the design one.
            Either row alone will do it; they share the same friction, so you cannot have both at full value.
            {dutyEq > 0
              ? <> The green/red here is the same comparison as the first cell above: these capacities against
                the <b>{f(dutyEq, 0)} N</b> your load box asks for.</>
              : <> Nothing is being judged — no load entered, so these are plain capacities.</>}
            {" "}Never rely on friction alone where slipping is dangerous — add a key, pin or shoulder.
          </div>
        </div>

        <div className="clamp-cap">
          <div className="hdr">OPTIONAL — CHECK IT AGAINST YOUR LOAD</div>
          <div className="clamp-cmp">
            <Num label="Pull along axis" unit="N" v={inp.Freq} on={(v) => set("Freq", v)} step={10} />
            <Num label="Twist around axis" unit="N·m" v={inp.Treq} on={(v) => set("Treq", v)} step={0.5} />
            <Num label="Safety factor" unit="× your load" v={inp.SFt} on={(v) => set("SFt", v)} step={0.5} />
          </div>
          <div className="foot">
            {dutyEq > 0
              ? <>Your {f(inp.Freq, 0)} N pull and {f(inp.Treq, 1)} N·m twist come to <b>{f(dutyEq, 0)} N</b> equivalent axial
                (the twist converts as 2T/D). Against the <b>{f(res.FaxLT, 0)} N</b> long-term capacity that is{" "}
                <b style={{ color: gripCol }}>SF {isFinite(res.SFslipLT) ? res.SFslipLT.toFixed(2) : "∞"}</b> — you asked for {f(inp.SFt, 1)}.{" "}
                <span style={{ color: "#46515c" }}>These change nothing about the part: they only compare your load with the capacity above.</span></>
              : <span style={{ color: "#46515c" }}>Leave these empty and the tool just reports capacity.</span>}
          </div>
        </div>
      </div>

      {/* ── THEORY & REPORT ── */}
      <div className={`tabpane${tab === "theory" ? " on" : ""}`} data-t="theory">
        <div className="expbar">
          <span style={lab}>Export</span>
          <button style={btn(false)} onClick={() => exportPDF(true)}>⇩ One-page summary</button>
          <button style={btn(false)} onClick={() => exportPDF(false)}>⇩ Full report</button>
          <span style={{ fontFamily: M, fontSize: 8.5, color: "#46515c", flex: 1, minWidth: 120 }}>
            opens your browser's print dialog — choose “Save as PDF”
          </span>
        </div>
        <div className="clamp-theory">
          <div className="lab">HOW IT WORKS — THE DIMENSIONS</div>
          <div className="clamp-dims" dangerouslySetInnerHTML={{ __html: dimsSVG(inp, res) }} />
          <div dangerouslySetInnerHTML={{ __html: theoryHTML(inp, res) }} />
          <div className="lab" style={{ marginTop: 18 }}>CALCULATION REPORT</div>
          <div dangerouslySetInnerHTML={{ __html: reportHTML(inp, res, rec, spec, torque) }} />
        </div>
      </div>

      {/* ── PRELOAD ── */}
      <div className={`tabpane${tab === "preload" ? " on" : ""}`} data-t="preload">
        <div className="clamp-theory">
          <div className="lab">PROOF STRENGTH, PRELOAD AND WHERE THE 65% COMES FROM</div>
          <div dangerouslySetInnerHTML={{ __html: preloadHTML(inp, res, spec, rec) }} />
        </div>
      </div>

      {/* ── TIPS ── */}
      <div className={`tabpane${tab === "tips" ? " on" : ""}`} data-t="tips">
        <div className="clamp-theory">
          <div className="lab">DESIGNING A TWO-PIECE CLAMP — WHAT ACTUALLY MATTERS</div>
          <div dangerouslySetInnerHTML={{ __html: tipsHTML(inp, res, rec, spec, torque) }} />
        </div>
      </div>

      {/* ── The export document ────────────────────────────────────────────
          Mounted only while printing, and it is the ONLY thing @media print
          shows. Everything in it is authored for paper — no live controls, no
          inherited panel colours — so there is nothing left to re-skin and
          nothing that can survive as a black slab. */}
      {printDoc && (
        <div id="clampPrint" className={printDoc.brief ? "brief" : "full"}>
          <div className="ph">
            <h1>Cylinder Clamp — {printDoc.brief ? "bench sheet" : "design calculation"}</h1>
            <div className="meta">
              Ø{f(inp.D, 1)} {inp.hollow ? `× ${f(inp.tw, 1)} wall tube` : "solid rod"} · {inp.cyl}<br />
              body {inp.mat} · H {f(res.H, 1)} · W {f(inp.W, 1)} · e {f(inp.e, 1)} · gap {f(inp.gap, 2)} mm (crown t<sub>c</sub> {f(res.tc, 2)})<br />
              {inp.N} × {inp.thread} grade {inp.cls.split(" ")[0]} · {inp.Kname}{inp.washer ? " · washers" : " · bare heads"} · applied {n2(torque)} N·m/bolt<br />
              typical reference values — verify before production
            </div>
          </div>

          <figure className="fig">
            <img src={printDoc.img} alt="3D view of the clamp, coloured by stress" />
            <figcaption>
              {stressMode
                ? <>Stress at {n2(torque)} N·m per bolt — blue compression through green to red tension,
                  scaled to {f(scaleMPa, 0)} MPa yield{contrast ? " with √ contrast" : " linearly"}.</>
                : <>Coloured by safety factor at {n2(torque)} N·m per bolt.</>}
              {" "}Split and deflections magnified ×{ex}{cut ? " · half section" : ""}.
            </figcaption>
          </figure>

          <div dangerouslySetInnerHTML={{ __html: summaryHTML(inp, res, rec, spec, torque) }} />

          {!printDoc.brief && (
            <>
              <h2 className="sec">How it works — the dimensions</h2>
              <div className="clamp-dims print" dangerouslySetInnerHTML={{ __html: dimsSVG(inp, res, true) }} />
              <div className="clamp-theory" dangerouslySetInnerHTML={{ __html: theoryHTML(inp, res) }} />
              <h2 className="sec brk">Calculation report</h2>
              <div className="clamp-theory" dangerouslySetInnerHTML={{ __html: reportHTML(inp, res, rec, spec, torque) }} />
              <h2 className="sec brk">Proof strength, preload and where the 65% comes from</h2>
              <div className="clamp-theory" dangerouslySetInnerHTML={{ __html: preloadHTML(inp, res, spec, rec) }} />
              <h2 className="sec brk">Designing a two-piece clamp — what actually matters</h2>
              <div className="clamp-theory" dangerouslySetInnerHTML={{ __html: tipsHTML(inp, res, rec, spec, torque) }} />
            </>
          )}

          <div className="foot">
            Closed-form design check, not FEA. Deflections and the split are magnified in the figure so the motion is
            visible. Typical reference values — verify against your own data before production use.
          </div>
        </div>
      )}

      <div className="clamp-note">
        <strong>Scope.</strong> Closed-form design check, not FEA. Deflections are magnified by <b>SPLIT ×</b> so the
        motion is visible; the gap is magnified by the same factor, so the halves meet exactly when the joint bottoms
        out. Typical reference values — verify before production use.
      </div>
    </div>
  );
}

/* ── small controls, matching the toolkit's language ──────────────────── */
function Num({ label, unit, v, on, step }: { label: string; unit: string; v: number; on: (v: number) => void; step: number }) {
  // While the field has focus it shows exactly what you typed — including
  // nothing at all. Committing 0 the instant the box was emptied is what made a
  // cleared field refill with "0" and then read "05" when you typed 5. Only a
  // parseable number reaches the model; clearing and clicking away restores the
  // last good value rather than zeroing the design.
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <div className="clamp-fld">
      <label>{label}<span>{unit}</span></label>
      <input
        type="number"
        step={step}
        inputMode="decimal"
        value={draft ?? String(v)}
        onChange={(e) => {
          const t = e.target.value;
          setDraft(t);
          const n = parseFloat(t);
          if (t.trim() !== "" && !Number.isNaN(n)) on(n);
        }}
        onBlur={() => setDraft(null)}
      />
    </div>
  );
}
function Ro({ label, unit, v }: { label: string; unit: string; v: string }) {
  return (
    <div className="clamp-fld">
      <label>{label}<span>{unit}</span></label>
      <input type="text" readOnly tabIndex={-1} value={v} />
    </div>
  );
}
function Sel({ label, v, opts, on, wide }: { label: string; v: string; opts: string[]; on: (v: string) => void; wide?: boolean }) {
  return (
    <div className={`clamp-fld${wide ? " wide" : ""}`}>
      <label>{label}</label>
      <select value={v} onChange={(e) => on(e.target.value)}>{opts.map((o) => <option key={o}>{o}</option>)}</select>
    </div>
  );
}
