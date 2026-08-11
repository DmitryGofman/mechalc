// Theory, worked report and design tips for the shaft-torsion calculator.
//
// Same split the bolted-joint page uses: the maths lives in shaftMath.ts, the
// page lives in ShaftCalc.tsx, and the long-form prose lives here as HTML
// strings built around the user's own numbers. Two reasons it is strings and
// not JSX: the report is a document rather than a component tree, and the same
// markup has to render on screen and into the print document without being
// written twice.

import type { ShaftResults, StressRaiser } from "./shaftMath";
import { KTS_EXPONENT, RD_VALID, SHEAR_YIELD_FACTOR, ktsFor, powerFromTorque } from "./shaftMath";

export type ShaftState = {
  matKey: string;
  E: number; // GPa
  sigmaY: number; // MPa
  nu: number;
  dOut: number; // mm
  dIn: number; // mm — 0 when solid
  L: number; // mm
  hollow: boolean;
  T: number; // N·m
  rpm: number;
  raiserKey: string;
  raiser: StressRaiser;
  featR: number; // mm — the machined radius
  Kts: number;
  r: ShaftResults;
};

const f = (v: number, d = 2) => (isFinite(v) ? v.toFixed(d) : "∞");
const MPa = (pa: number, d = 1) => f(pa / 1e6, d);

const verdict = (sf: number) =>
  sf >= 2 ? { cls: "", word: "holds with margin" } : sf >= 1 ? { cls: "warn", word: "holds, but only just" } : { cls: "bad", word: "yields" };

/* ── the worked calculation ───────────────────────────────────────────── */
export function reportHTML(s: ShaftState): string {
  const r = s.r;
  const v = verdict(r.SF);
  const rd = s.featR / Math.max(s.dOut, 1e-9);
  const outOfRange = s.raiser.rdRef && (rd < RD_VALID[0] || rd > RD_VALID[1]);
  const kW = powerFromTorque(s.T, s.rpm) / 1000;

  return `<div class="theory">
  <div class="lab">1 · THE SECTION</div>
  <p>Torsion of a circular shaft is the one case where the elementary theory is
  exact: plane sections stay plane and round, so each cross-section simply rotates.
  Everything follows from the polar second moment.</p>
  <div class="eqn">
    <div class="lead">POLAR SECOND MOMENT</div>
    <span class="mth">J = π(d⁴ − dᵢ⁴) / 32 = π(${f(s.dOut, 1)}⁴ ${s.hollow ? `− ${f(s.dIn, 1)}⁴` : "− 0"}) / 32 =
    <span class="res">${f(r.J * 1e12, 0)} mm⁴</span></span>
    <span class="cmt">Section modulus Z<sub>p</sub> = J/c = ${f(r.Zp * 1e9, 0)} mm³, with c = d/2 = ${f(s.dOut / 2, 2)} mm.</span>
  </div>
  ${
    s.hollow
      ? `<p><b>The bore is nearly free.</b> J falls as the fourth power of diameter but area only as the
      square, so removing the lazy core costs little: this tube keeps <b>${f(100 * r.JFrac, 0)}%</b> of the
      solid shaft's J for <b>${f(100 * r.AFrac, 0)}%</b> of the metal.</p>`
      : `<p>Solid section. A Ø${f(s.dOut, 0)} shaft bored to Ø${f(0.6 * s.dOut, 0)} would keep 87% of this J
      for 64% of the weight — worth a thought if mass matters.</p>`
  }

  <div class="lab" style="margin-top:16px">2 · THE STRESS THAT MATTERS IS LOCAL</div>
  <div class="eqn">
    <div class="lead">NOMINAL SURFACE SHEAR</div>
    <span class="mth">τ = T·c / J = ${f(s.T, 1)} × ${f(s.dOut / 2000, 4)} / ${(r.J).toExponential(3)} =
    <span class="res">${MPa(r.tauNom)} MPa</span></span>
    <span class="cmt">Zero on the axis, linear with radius, maximum at the surface — which is why only the
    outer fibres are doing real work.</span>
  </div>
  <div class="eqn">
    <div class="lead">PEAK SHEAR AT THE FEATURE</div>
    <span class="mth">τ<sub>max</sub> = K<sub>ts</sub>·τ = ${f(s.Kts, 2)} × ${MPa(r.tauNom)} =
    <span class="res ${v.cls}">${MPa(r.tauPeak)} MPa</span></span>
    <span class="cmt">${s.raiserKey}${s.raiser.rdRef ? `, r = ${f(s.featR, 2)} mm on Ø${f(s.dOut, 1)} → r/d = ${f(rd, 3)}` : ""}.</span>
  </div>
  ${
    s.raiser.rdRef
      ? `<p><b>Where that K<sub>ts</sub> comes from.</b> A concentration factor is not a property of the feature,
      it is a property of how sharp the feature is — a table entry has to name an r/d to mean anything.
      Shigley Table 7-1 gives a shoulder fillet in torsion at two radii, K<sub>ts</sub> 2.2 at r/d = 0.02 and
      1.5 at r/d = 0.1. Two points fix a power law:</p>
      <div class="eqn"><span class="mth">K<sub>ts</sub>(r/d) = K<sub>ref</sub> · (r/d ÷ ${f(s.raiser.rdRef, 3)})<sup>−${f(KTS_EXPONENT, 3)}</sup></span>
      <span class="cmt">Exact through both fillet anchors; for the keyseat and groove it is an interpolation
      anchored on their handbook figure at the standard radius, borrowing the fillet's curve shape on the
      grounds that all of them are the same physics — a notch in torsion. Honest between r/d
      ${RD_VALID[0]} and ${RD_VALID[1]}.</span></div>
      ${outOfRange ? `<p class="pn warn"><b>You are outside that range</b> at r/d = ${f(rd, 3)}. The number still moves the
      right way, but treat it as a trend, not a figure to sign off on — go to Peterson's charts.</p>` : ""}`
      : `<p>No feature, so K<sub>ts</sub> = 1 and the nominal stress is the real one. Worth knowing what a
      plain shaft is worth, but almost no shaft stays plain — something has to drive the torque in.</p>`
  }

  <div class="lab" style="margin-top:16px">3 · THE CHECK</div>
  <p>Pure torsion is pure shear, and the distortion-energy criterion puts shear yield at
  ${SHEAR_YIELD_FACTOR}·σ<sub>y</sub> — the single most useful number on this page. A shaft that is
  comfortable in tension gives way at a little over half that stress in torsion.</p>
  <table class="rep">
    <tr><th>Quantity</th><th style="text-align:right">Value</th></tr>
    <tr><td>Material</td><td class="v">${s.matKey}</td></tr>
    <tr><td>Shear modulus G = E / 2(1+ν)</td><td class="v">${f(r.G / 1e9, 1)} GPa</td></tr>
    <tr><td>Allowable shear ${SHEAR_YIELD_FACTOR}·σ<sub>y</sub></td><td class="v">${MPa(r.tauAllow, 0)} MPa</td></tr>
    <tr><td>Peak shear at ${f(s.T, 1)} N·m</td><td class="v">${MPa(r.tauPeak)} MPa</td></tr>
    <tr class="hi"><td>Safety factor n = τ<sub>allow</sub> / τ<sub>max</sub></td><td class="v">${f(r.SF)}</td></tr>
    <tr><td>Torque at n = 1</td><td class="v">${f(r.Tyield, 1)} N·m</td></tr>
    <tr><td>Power at ${f(s.rpm, 0)} rpm</td><td class="v">${f(kW, 2)} kW</td></tr>
  </table>
  <p class="pn ${v.cls}">At ${f(s.T, 1)} N·m this shaft <b>${v.word}</b> — n = ${f(r.SF)}.
  ${r.SF < 1 ? "The surface at the feature is past shear yield; the shaft will take a permanent set and unwind crooked." : ""}
  ${s.Kts > 1 ? `Without the ${s.raiser.kind === "keyseat" ? "keyseat" : "feature"} the same shaft would read
  n = ${f(r.SF * s.Kts)} — the feature is costing you a factor of ${f(s.Kts, 2)}.` : ""}</p>

  <div class="lab" style="margin-top:16px">4 · WIND-UP</div>
  <div class="eqn">
    <div class="lead">ANGLE OF TWIST</div>
    <span class="mth">θ = T·L / G·J = ${f(s.T, 1)} × ${f(s.L / 1000, 3)} / (${f(r.G / 1e9, 1)}e9 × ${(r.J).toExponential(3)}) =
    <span class="res ${r.twistUtil > 1 ? "warn" : ""}">${f(Math.abs(r.thetaDeg))}°</span></span>
    <span class="cmt">${f(Math.abs(r.degPerM))}°/m · torsional stiffness GJ/L = ${f(r.ktDeg, 1)} N·m per degree.</span>
  </div>
  <p>Strength is rarely the only limit. Wind-up puts a driveshaft's timing out, loses a leadscrew its
  position, and stores energy that comes back as torsional vibration. The workshop rule of thumb is
  <b>1° per 20 diameters</b> of length — here ${f(r.twistLimitDeg)}°, and you are at
  <b>${f(Math.abs(r.thetaDeg))}°</b>.</p>
  ${
    r.twistUtil > 1
      ? `<p class="pn warn"><b>Over the wind-up rule</b> by ${f(r.twistUtil, 2)}×, even though the stress check
      ${r.SF >= 1 ? "passes" : "also fails"}. Long slender shafts fail on stiffness long before they get near
      shear yield, and no amount of better steel fixes it — G barely varies between steels. Diameter does:
      J goes as d⁴, so 20% more diameter halves the twist.</p>`
      : `<p>Comfortably inside the rule, at ${f(100 * r.twistUtil, 0)}% of it.</p>`
  }

  <div class="lab" style="margin-top:16px">SCOPE</div>
  <p class="pn warn">Static torque only, on a prismatic circular section of isotropic material. <b>No bending,
  no axial load, no combined-stress envelope, and no fatigue.</b> A real drive shaft sees all of them: a
  rotating shaft carrying a steady bending load is in fully reversed bending, where the fatigue limit and the
  fatigue notch factor K<sub>f</sub> — not K<sub>ts</sub> — govern. Treat this as the first sizing pass and
  apply a service factor for shock loads. A keyway also removes section, which is folded into K<sub>ts</sub>
  here rather than into J. Non-circular sections warp out of plane and obey none of this.</p>

  <div class="lab" style="margin-top:16px">REFERENCES</div>
  <table class="rep">
    <tr><td>Budynas &amp; Nisbett, <b>Shigley's Mechanical Engineering Design</b> — torsion, ch. 3; K<sub>t</sub> estimates, Table 7-1</td></tr>
    <tr><td>Pilkey, <b>Peterson's Stress Concentration Factors</b> — shafts in torsion, keyseats and shoulder fillets</td></tr>
    <tr><td><b>ANSI B17.1</b> — keys and keyseats, standard proportions w = d/4, h = d/8</td></tr>
  </table>
</div>`;
}

/* ── design tips ──────────────────────────────────────────────────────── */
export function tipsHTML(s: ShaftState): string {
  const r = s.r;
  const rd = s.featR / Math.max(s.dOut, 1e-9);
  const doubled = ktsFor(s.raiser, rd * 2);
  const bigger = s.dOut * 1.26;

  return `<div class="tip key"><h4>1 · Size the feature, not the section</h4>
  <p>The nominal stress almost never governs — the keyseat does. A profiled keyway triples the surface shear
  at its bottom corners, so a shaft with a comfortable safety factor on plain section is at yield the moment
  you cut the keyway for the pulley. <b>Run the check at the feature and nowhere else.</b></p>
  <div class="tipnum">Yours: plain section would be <b>n = ${f(r.SF * s.Kts)}</b>, at the feature it is
  <b>n = ${f(r.SF)}</b> — K<sub>ts</sub> ${f(s.Kts, 2)}.</div></div>

  <div class="tip"><h4>2 · The radius is the cheapest strength you can buy</h4>
  <p>Doubling a fillet radius costs a different tool and nothing else, and it buys back real capacity. Going
  the other way — letting the shop leave a sharp corner because the drawing didn't say — quietly spends it.
  <b>Put the radius on the drawing and inspect it.</b></p>
  <div class="tipnum">Yours: r = <b>${f(s.featR, 2)} mm</b> (r/d ${f(rd, 3)}) → K<sub>ts</sub> ${f(s.Kts, 2)}.
  At double the radius K<sub>ts</sub> would be <b>${f(doubled, 2)}</b>, worth
  <b>${f(100 * (s.Kts / doubled - 1), 0)}%</b> more torque.</div></div>

  <div class="tip"><h4>3 · Diameter beats material, every time</h4>
  <p>Torsional capacity goes as d³ and stiffness as d⁴, while swapping steel for better steel changes σ<sub>y</sub>
  and leaves G essentially alone. <b>A 26% bigger shaft is twice as strong and 2.5× as stiff</b> — reach for
  size before you reach for an alloy, unless weight is the binding constraint.</p>
  <div class="tipnum">Yours: Ø${f(s.dOut, 1)} → Ø${f(bigger, 1)} would take
  <b>${f(2 * r.Tyield, 0)} N·m</b> instead of ${f(r.Tyield, 0)}, and twist ${f(Math.abs(r.thetaDeg) / 2.52)}°
  instead of ${f(Math.abs(r.thetaDeg))}°.</div></div>

  <div class="tip"><h4>4 · Bore the middle out before you shave the outside</h4>
  <p>Stress grows with radius, so the metal near the axis carries almost nothing and weighs just as much as
  the metal at the surface. <b>A tube beats a solid bar of the same mass every time.</b> It is also why the
  winner in bending loses in torsion: an open section like an I-beam has no closed shear path, and a slit
  tube is orders of magnitude softer in twist than the same tube intact.</p>
  <div class="tipnum">${
    s.hollow
      ? `Yours: Ø${f(s.dOut, 0)}×Ø${f(s.dIn, 0)} keeps <b>${f(100 * r.JFrac, 0)}%</b> of J for <b>${f(100 * r.AFrac, 0)}%</b> of the metal.`
      : `A Ø${f(0.6 * s.dOut, 0)} bore here would keep <b>87%</b> of J for <b>64%</b> of the metal.`
  }</div></div>

  <div class="tip ${r.twistUtil > 1 ? "warn" : ""}"><h4>5 · Check the wind-up before you sign off</h4>
  <p>Long shafts fail the twist limit long before the stress limit, and the failure is not dramatic — it is a
  machine that loses its timing, a leadscrew that lags its command, a drivetrain that rings. <b>1° per 20
  diameters</b> is the usual ceiling; instrument drives and indexing shafts want far less.</p>
  <div class="tipnum">Yours: <b>${f(Math.abs(r.thetaDeg))}°</b> over ${f(s.L, 0)} mm, limit ${f(r.twistLimitDeg)}° —
  ${r.twistUtil > 1 ? `<b>${f(r.twistUtil, 2)}× over</b>.` : `${f(100 * r.twistUtil, 0)}% used.`}</div></div>

  <div class="tip bad"><h4>6 · A rotating shaft is a fatigue problem, not a static one</h4>
  <p>This page checks static yield. Put a pulley on that shaft and the belt tension bends it; spin it, and
  every fibre goes through fully reversed bending once per revolution. <b>That is where shafts actually
  break</b> — at the keyway, in fatigue, at a stress the static check called comfortable. Size statically
  here, then run the fatigue check with K<sub>f</sub>, surface finish and size factors before it turns.</p></div>`;
}
