// Theory, worked report and design tips for the wire-gate clip spring
// calculator. Same split as the shaft and bolt pages: the maths lives in
// wireGateMath.ts, the page in WireGateCalc.tsx, and the long-form prose here
// as HTML strings built around the user's own numbers — strings, because the
// same markup renders in the theory tab and inside the print document.

import type { WireGateResults } from "./wireGateMath";
import { C_VALID_MIN, kiFactor, sideCompliance, wireI } from "./wireGateMath";

export type WireGateState = {
  matKey: string;
  E: number; // GPa
  sigmaY: number; // MPa
  d: number; // mm
  L1: number; // mm
  L2: number; // mm
  w: number; // mm — U-bend width, R = w/2
  a: number; // mm — pin separation, the crank
  delta0: number; // mm — assembly preload spread
  g: number; // mm — nose opening at full open
  r: WireGateResults;
};

const f = (v: number, d = 2) => (isFinite(v) ? v.toFixed(d) : "∞");
const MPa = (pa: number, d = 0) => f(pa / 1e6, d);
const Nmm = (nPerM: number, d = 2) => f(nPerM / 1000, d); // N/m → N/mm
const deg = (rad: number, d = 1) => f((rad * 180) / Math.PI, d);

const verdict = (sf: number) =>
  sf >= 1.5
    ? { cls: "", word: "holds with margin" }
    : sf >= 1
      ? { cls: "warn", word: "holds, but only just" }
      : { cls: "bad", word: "takes a permanent set" };

/* ── the worked calculation ───────────────────────────────────────────── */
export function reportHTML(st: WireGateState): string {
  const r = st.r;
  const v = verdict(r.SF);
  const tightBend = r.C < C_VALID_MIN;
  const Lmax = Math.max(st.L1, st.L2);

  return `<div class="theory">
  <div class="lab">1 · HOW THIS SPRING ACTUALLY WORKS</div>
  <p>The gate's two bent tips sit as <b>pins in holes</b> — they rotate freely, so the ends of the wire
  carry no moment at all. The visible swing of the gate is rigid-body rotation about the long-leg pin.
  The spring action comes from geometry: the second pin sits <b>a = ${f(st.a, 0)} mm from the pivot</b>, so a
  swing of φ tries to displace one pinned end relative to the other by the chord 2a·sin(φ/2). Both pins are
  held by the body, so the loop has to absorb that mismatch by flexing in its own plane — the legs bow,
  <b>every part of the wire moves a little</b>, and the bending moment grows from zero at the pins to its
  maximum at the U-bend. Assembly already imposes a preload spread δ₀ (the holes are offset from where the
  free wire wants to sit — US 4,423,757's trick), and that is what snaps the gate shut.</p>

  <div class="lab" style="margin-top:16px">2 · THE LOOP AS A SPRING</div>
  <div class="eqn">
    <div class="lead">WIRE SECOND MOMENT</div>
    <span class="mth">I = πd⁴/64 = π·${f(st.d, 2)}⁴/64 = <span class="res">${f(r.I * 1e12, 3)} mm⁴</span></span>
    <span class="cmt">Round wire, Ø${f(st.d, 2)} mm — c = d/2 = ${f(st.d / 2, 2)} mm to the outer fibre.</span>
  </div>
  <div class="eqn">
    <div class="lead">SIDE COMPLIANCE — CASTIGLIANO OVER LEG + QUARTER BEND</div>
    <span class="mth">δ/F = [L³/3 + πRL²/2 + 2LR² + πR³/4] / EI</span>
    <span class="cmt">M(x) = F·x along the leg, F·(L + R·sinθ) around the bend — the pinned end makes the
    moment start from zero, which is why the whole length participates. Side 1 (L = ${f(st.L1, 0)}):
    ${f(r.cs1 * 1e6, 3)} mm/N · side 2 (L = ${f(st.L2, 0)}): ${f(r.cs2 * 1e6, 3)} mm/N.</span>
  </div>
  <div class="eqn">
    <div class="lead">SPREAD RATE — THE HALVES IN SERIES</div>
    <span class="mth">k = 1 / (δ₁/F + δ₂/F) = <span class="res">${Nmm(r.k)} N/mm</span></span>
    <span class="cmt">Soft, deliberately: compare ~${f((3 * st.E * 1e3 * (r.I * 1e12)) / Math.pow(Lmax, 3), 1)} N/mm
    for one clamped leg alone. A pinned loop spreads with the whole wire working, which is what keeps the
    stress down.</span>
  </div>

  <div class="lab" style="margin-top:16px">3 · SWING BECOMES SPREAD</div>
  <div class="eqn">
    <div class="lead">KINEMATICS OF THE OFFSET PINS</div>
    <span class="mth">φ = g/(L+R) = ${f(st.g, 1)}/${f(r.armNose * 1000, 1)} = ${deg(r.phiMax)}° →
    s = 2a·sin(φ/2) = <span class="res">${f(r.s * 1000, 2)} mm</span></span>
    <span class="cmt">Opening the nose by ${f(st.g, 1)} mm swings the gate ${deg(r.phiMax)}° and forces the
    loop to spread a further ${f(r.s * 1000, 2)} mm on top of the δ₀ = ${f(st.delta0, 2)} mm it was assembled with.</span>
  </div>
  <table class="rep">
    <tr><th>State</th><th style="text-align:right">Spread δ</th><th style="text-align:right">Pin force k·δ</th><th style="text-align:right">Torque k·δ·a·cos(φ/2)</th><th style="text-align:right">At the nose</th></tr>
    <tr><td>Closed (preload only)</td><td class="v">${f(st.delta0, 2)} mm</td><td class="v">${f(r.Fpin0, 1)} N</td><td class="v">${f(r.T0 * 1000, 0)} N·mm</td><td class="v">${f(r.Fnose0, 1)} N</td></tr>
    <tr class="hi"><td>Full open (g = ${f(st.g, 1)} mm)</td><td class="v">${f(r.delta * 1000, 2)} mm</td><td class="v">${f(r.FpinOpen, 1)} N</td><td class="v">${f(r.Topen * 1000, 0)} N·mm</td><td class="v">${f(r.FnoseOpen, 1)} N</td></tr>
  </table>
  <p>Snap hooks and carabiner gates land between roughly 3 and 15 N at the nose — below that they false-open
  in a pocket, far above it they fight the user. The closing force at rest is pure preload: no δ₀, no snap.</p>

  <div class="lab" style="margin-top:16px">4 · THE STRESS LIVES AT THE U-BEND</div>
  <p>With pinned, moment-free ends, the bending moment is M = F·x from each pin — so the hot spot is the
  <b>U-bend</b>, reached through the full arm L + R, and the wire there is curved:</p>
  <div class="eqn">
    <div class="lead">PEAK BENDING, THROUGH THE LONGER SIDE'S ARM</div>
    <span class="mth">σ = F·(L+R)·c / I = ${f(r.FpinOpen, 1)} × ${f((Lmax + r.R * 1000), 1)} × ${f(st.d / 2, 1)} / ${f(r.I * 1e12, 3)} =
    <span class="res">${MPa(Math.max(r.sigma1, r.sigma2))} MPa</span></span>
    <span class="cmt">Side ${r.hotSide} carries the bigger arm. The pins themselves see zero moment — the
    tang bends are no longer the failure site, which is exactly why this anchorage survives.</span>
  </div>
  <div class="eqn">
    <div class="lead">CURVED-WIRE CORRECTION AT THE U-BEND</div>
    <span class="mth">C = w/d = ${f(r.C, 2)} → Ki = (4C²−C−1)/(4C(C−1)) = <span class="res ${tightBend ? "warn" : ""}">${f(r.Ki, 3)}</span></span>
    <span class="cmt">The torsion-spring inner-fibre factor (Shigley 10-43): a curved beam in bending carries
    more on the inside of the bend than Mc/I admits. ${tightBend ? `<b>C is below ${C_VALID_MIN}</b> — tighter than spring
    practice; widen the loop.` : `Spring practice keeps C ≥ ${C_VALID_MIN}; you are at ${f(r.C, 2)}.`}</span>
  </div>

  <div class="lab" style="margin-top:16px">5 · THE CHECK</div>
  <table class="rep">
    <tr><th>Quantity</th><th style="text-align:right">Value</th></tr>
    <tr><td>Material</td><td class="v">${st.matKey}</td></tr>
    <tr><td>Allowable bending stress σ_allow</td><td class="v">${f(st.sigmaY, 0)} MPa</td></tr>
    <tr><td>Peak stress Ki·σ at full open</td><td class="v">${MPa(r.sigmaPeak)} MPa</td></tr>
    <tr class="hi"><td>Safety factor n = σ_allow / σ_peak</td><td class="v">${f(r.SF)}</td></tr>
    <tr><td>Spread budget δ_yield = σ_allow·I/(Ki·(L+R)·c·k)</td><td class="v">${f(r.deltaYield * 1000, 2)} mm</td></tr>
    <tr><td>Budget used at full open</td><td class="v">${f(100 * r.budgetUsed, 0)}%</td></tr>
    <tr><td>Nose opening that spends the budget</td><td class="v">${isFinite(r.gYield) ? f(r.gYield * 1000, 1) + " mm" : "beyond reach"}</td></tr>
    <tr><td>Energy stored at full open</td><td class="v">${f(r.energyOpen * 1000, 1)} N·mm</td></tr>
  </table>
  <p class="pn ${v.cls}">At full open this gate <b>${v.word}</b> — n = ${f(r.SF)}.
  ${r.SF < 1 ? `The U-bend goes past yield before the nose reaches ${f(st.g, 1)} mm: the loop keeps a set, the
  preload fades, and the gate starts to hang open. Open less, soften the loop (longer legs), or shrink the
  crank a.` : `Forcing the gate past <b>${isFinite(r.gYield) ? f(r.gYield * 1000, 1) : "—"} mm</b> of opening is what
  bends it — worth knowing before someone clips it over something thick.`}</p>

  <div class="lab" style="margin-top:16px">SCOPE</div>
  <p class="pn warn">Static check on an idealised gate: <b>frictionless pins, in-plane bending only, small
  swing angles, no fatigue</b>. The swing-to-spread law s = 2a·sin(φ/2) is the worst-case chord — the real
  body's hole geometry decides how much of that chord becomes elastic spread and how much the pin clearances
  absorb, so <b>measure δ₀ and the real spread on the part when it matters</b>. Out-of-plane bending and leg
  torsion are neglected (small for flat loops, growing if the tangs are long). Wire strength values are
  typical for ~2 mm wire; wire has a real size effect (Sut = A/d<sup>m</sup>). A gate is cycled thousands of
  times: for long life keep the working stress well below the static allowable (springs live near 45% of
  tensile for unlimited cycles). And none of this is a strength rating for the hook itself — the 12 kN on a
  carabiner is the frame, not the gate spring.</p>

  <div class="lab" style="margin-top:16px">REFERENCES</div>
  <table class="rep">
    <tr><td>Budynas &amp; Nisbett, <b>Shigley's Mechanical Engineering Design</b> — torsion springs &amp; curved wire, ch. 10; wire size effect, Table 10-4</td></tr>
    <tr><td>Associated Spring / SMI, <b>Handbook of Spring Design</b> — wire forms and flat spring practice</td></tr>
    <tr><td><b>US 4,423,757</b> — offset-hole preload in wire spring snaps; the pinned-end anchorage this model assumes</td></tr>
  </table>
</div>`;
}

/* ── design tips ──────────────────────────────────────────────────────── */
export function tipsHTML(st: WireGateState): string {
  const r = st.r;
  const EI = st.E * 1e9 * wireI(st.d / 1000);
  const csLong = sideCompliance(st.E * 1e9, wireI(st.d / 1000), (Math.max(st.L1, st.L2) + 5) / 1000, r.R);
  const kLonger = 1 / (csLong + (st.L1 >= st.L2 ? r.cs2 : r.cs1));
  const kiWide = kiFactor((st.w + st.d) / st.d);
  void EI;

  return `<div class="tip key"><h4>1 · The crank a is your force knob — the wire is your stress knob</h4>
  <p>Closing torque is k·δ₀·a and opening torque k·δ·a: <b>pin separation multiplies force without touching
  the wire</b>. Stress, meanwhile, only cares about the spread δ the crank imposes. If the gate is too weak,
  move the second pin further from the pivot before you reach for fatter wire — fatter wire stiffens the loop
  as d⁴ and spends your spread budget with it.</p>
  <div class="tipnum">Yours: a = <b>${f(st.a, 0)} mm</b> turns ${f(r.FpinOpen, 1)} N of pin force into
  ${f(r.Topen * 1000, 0)} N·mm of torque — ${f(r.FnoseOpen, 1)} N at the thumb.</div></div>

  <div class="tip"><h4>2 · Soft is the whole point — let every millimetre of wire work</h4>
  <p>Pinned ends put zero moment at the anchors, so the full developed length flexes and the loop spreads at
  a few N/mm where a clamped leg would fight at ten times that. That softness is the spread budget. <b>Longer
  legs buy budget linearly-ish in stress and cubically in compliance</b> — the cheapest fix for a gate that
  yields.</p>
  <div class="tipnum">Yours: k = <b>${Nmm(r.k)} N/mm</b>, budget ${f(r.deltaYield * 1000, 2)} mm. Adding 5 mm
  to the long leg would drop the rate to ~${Nmm(kLonger)} N/mm and grow the budget accordingly.</div></div>

  <div class="tip"><h4>3 · The U-bend is the hot spot — width is relief</h4>
  <p>All the moment lands at the apex, on curved wire. Ki = (4C²−C−1)/(4C(C−1)) with C = w/d, so a wider
  loop relieves the inner fibre twice: bigger C, and a longer arc to share the curvature. Below C ≈ ${C_VALID_MIN}
  the factor climbs steeply and the forming mandrel starts cracking high-tensile wire.</p>
  <div class="tipnum">Yours: w = ${f(st.w, 0)} mm → C = ${f(r.C, 2)}, Ki = <b>${f(r.Ki, 3)}</b>. One wire
  diameter wider: Ki = ${f(kiWide, 3)}.</div></div>

  <div class="tip"><h4>4 · Preload is the snap — and it spends budget before the gate even moves</h4>
  <p>δ₀ is what presses the gate shut: no offset, no snap, and a gate that rattles false-opens. But the loop
  carries k·δ₀ for its entire life, and every millimetre of δ₀ is a millimetre the opening spread can't use.
  <b>Set δ₀ from the shake test, not from caution</b>, then give the rest of the budget to travel.</p>
  <div class="tipnum">Yours: δ₀ = ${f(st.delta0, 2)} mm holds the nose shut at <b>${f(r.Fnose0, 1)} N</b>,
  using ${f((100 * st.delta0) / (r.deltaYield * 1000), 0)}% of the budget at rest.</div></div>

  <div class="tip ${isFinite(r.gYield) && r.gYield * 1000 < st.g * 1.5 ? "warn" : ""}"><h4>5 · Know the opening that bends it</h4>
  <p>Someone will force the gate over something thick. The opening that spends the whole budget,
  g_yield = 2·asin((δ_y−δ₀)/2a)·(L+R), is the number that separates "springs back" from "hangs open forever".
  Design so the body's own geometry stops the gate before g_yield — a mechanical stop is free insurance.</p>
  <div class="tipnum">Yours: designed opening <b>${f(st.g, 1)} mm</b>, yield at
  <b>${isFinite(r.gYield) ? f(r.gYield * 1000, 1) + " mm" : "beyond the kinematics"}</b> —
  ${isFinite(r.gYield) ? f(r.gYield / (st.g / 1000), 1) + "× the working travel" : "the crank can't impose the budget"}.</div></div>

  <div class="tip bad"><h4>6 · A gate is a fatigue part that this page checks statically</h4>
  <p>A gate clicks tens of thousands of times; the U-bend goes from preload stress to full-open stress on
  every cycle. This calculator checks first yield only. <b>For long life keep the full-open stress under
  about 45% of the wire's tensile strength</b>, polish forming marks at the apex, and use stainless where it
  lives outdoors — a corrosion pit at the hot spot is a crack starter. If the duty is safety-critical, test
  to the standard (EN 12275 / EN 362), don't calculate to it.</p></div>`;
}
