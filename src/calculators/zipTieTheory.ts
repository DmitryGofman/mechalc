// Zip-tie theory, report, data-tab and tips content — HTML-string builders
// around the user's own numbers, rendered in the tab AND inside the print
// document (which is why this is not JSX in the page file).

import * as ZM from "./zipTieMath";
import { FR, V, eqn } from "./typeset";

const f = ZM.fmt;
const nlb = (N: number) => `${f(N, 0)} N (${f(ZM.lbf(N), 0)} lbf)`;

/* ── the ratchet head, in section ─────────────────────────────────────────
   The cutaway everyone has seen on a vendor sheet, drawn from the same parts:
   housing, channel, pawl on its pivot, the engagement tip in the strap teeth.
   Colours are baked into the SVG so the print stylesheet can't turn it into a
   black slab — `forPrint` swaps the palette for ink. */
export function headSVG(forPrint = false): string {
  const INK = forPrint ? "#333" : "#8b97a3";
  const DIMC = forPrint ? "#777" : "#46515c";
  const ACC = forPrint ? "#14459b" : "#3a78c2";
  const HOT = forPrint ? "#a01d1d" : "#d65c5c";
  const GRN = forPrint ? "#0a6b3d" : "#4fb477";
  const BODY = forPrint ? "#e8e8e8" : "#1a222b";
  const STRAP = forPrint ? "#cfcfcf" : "#242e38";
  const txt = (x: number, y: number, s: string, c = INK, size = 8.5, anc = "middle") =>
    `<text x="${x}" y="${y}" font-size="${size}" fill="${c}" text-anchor="${anc}" font-family="monospace">${s}</text>`;
  const lead = (x1: number, y1: number, x2: number, y2: number) =>
    `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${DIMC}" stroke-width=".5"/>`;
  const arr = (x: number, y: number, dx: number, dy: number, L: number, c: string, wd = 1.4) => {
    const n = Math.hypot(dx, dy) || 1; dx /= n; dy /= n;
    const tx = x + dx * L, ty = y + dy * L, hx = -dy, hy = dx;
    return `<line x1="${x}" y1="${y}" x2="${tx - dx * 4}" y2="${ty - dy * 4}" stroke="${c}" stroke-width="${wd}"/>
      <path d="M ${tx} ${ty} L ${tx - dx * 5 + hx * 2.4} ${ty - dy * 5 + hy * 2.4} L ${tx - dx * 5 - hx * 2.4} ${ty - dy * 5 - hy * 2.4} Z" fill="${c}"/>`;
  };
  // strap teeth: sawtooth on the top surface, leaning so pull-back locks
  let teeth = "";
  for (let x = 30; x < 390; x += 9) {
    if (x > 176 && x < 268) continue; // hidden inside the head / under the pawl
    teeth += `M ${x} 146 L ${x + 4.5} 140 L ${x + 9} 146 `;
  }
  return `<svg viewBox="0 0 420 232" role="img" aria-label="Zip-tie ratchet head, cross-section">
    <!-- strap through the channel -->
    <rect x="10" y="146" width="400" height="14" fill="${STRAP}" stroke="${INK}" stroke-width="1"/>
    <path d="${teeth}" fill="none" stroke="${INK}" stroke-width="1" stroke-linejoin="round"/>
    <!-- head housing, sectioned -->
    <path d="M 178 170 L 178 96 Q 178 84 192 84 L 252 84 Q 266 84 266 96 L 266 170 Q 266 180 254 180 L 190 180 Q 178 180 178 170 Z"
      fill="${BODY}" stroke="${INK}" stroke-width="1.4"/>
    <!-- channel cut through it -->
    <rect x="178" y="143" width="88" height="20" fill="${forPrint ? "#fff" : "#0b1015"}" stroke="${INK}" stroke-width="1"/>
    <rect x="178" y="146" width="88" height="14" fill="${STRAP}"/>
    <!-- pawl: pivots at the top, tip biting the teeth; flexes as a hinge -->
    <circle cx="234" cy="103" r="7" fill="${forPrint ? "#bbb" : "#39434e"}" stroke="${INK}" stroke-width="1.2"/>
    <path d="M 228 108 L 205 138 L 214 146 L 224 141 L 240 110 Q 236 104 228 108 Z"
      fill="${forPrint ? "#999" : "#4a525a"}" stroke="${INK}" stroke-width="1.2"/>
    <!-- engagement tip -->
    <path d="M 205 138 L 214 146 L 202 146 Z" fill="${HOT}"/>
    <!-- locking force fan at the tip -->
    ${[-40, -15, 12, 38].map((a) => {
      const r = (a * Math.PI) / 180;
      return arr(208, 143, Math.sin(r), -Math.cos(r), 16, HOT, 1);
    }).join("")}
    <!-- load and motion arrows -->
    ${arr(96, 153, -1, 0, 46, GRN, 2.2)}
    ${txt(96, 132, "tensile load F", GRN, 9, "start")}
    ${arr(300, 170, 1, 0, 36, ACC, 1.4)}
    ${txt(300, 181, "insertion (tail)", ACC, 8, "start")}
    <!-- labels -->
    ${lead(222, 84, 222, 46)}${txt(222, 40, "head housing", INK)}
    ${lead(234, 103, 296, 58)}${txt(412, 55, "pawl pivot / hinge root", INK, 8.5, "end")}
    ${lead(216, 128, 300, 92)}${txt(412, 90, "pawl (molded-in)", INK, 8.5, "end")}
    ${lead(206, 144, 296, 114)}${txt(412, 112, "engagement tip +", HOT, 8.5, "end")}
    ${txt(412, 123, "locking force fan", HOT, 8.5, "end")}
    ${lead(268, 155, 330, 143)}${txt(412, 140, "tie channel", INK, 8.5, "end")}
    ${lead(120, 143, 96, 190)}${txt(96, 202, "serrated teeth,", INK)}
    ${txt(96, 212, "leaning to lock", INK)}
    ${txt(210, 226, "pull tightens — pull-back drives the teeth INTO the pawl: that asymmetry is the lock", DIMC, 7.5)}
  </svg>`;
}

/* ── theory: what the rating means and how the check works ───────────────── */
export function theoryHTML(inp: ZM.ZipInput, r: ZM.ZipResult): string {
  const env = ZM.ENVS[inp.env];
  return `<p><b>One number rules everything: minimum loop tensile strength.</b> A tie is not rated by its strap —
    it is rated by pulling the <em>closed loop</em> apart on two half-round mandrels (UL 62275 / SAE AS23190 test)
    until something lets go. What lets go is almost always the <b>head</b>: the pawl tooth shears, or the housing
    stretches enough for the teeth to skip. The class name — an <b>${r.size.ratedLb} lb tie</b> — is that loop-apart
    force, ${nlb(r.size.rated)}, for plain PA66 at 23 °C, conditioned. Hanging a bundle in the loop, as in the model,
    loads it exactly the way the test does.</p>

    <h3>The capacity chain</h3>
    <p>Everything this page does is four multiplications on that rating — each one a real, documented loss, not a
    fudge:</p>` +
    eqn("1 · Material", `${V("F")}<sub>23</sub> = ${V("F")}<sub>rated</sub> · ${V("k")}<sub>mat</sub>`,
      `${f(r.size.rated, 0)} × ${r.m.factor.toFixed(2)}`, nlb(r.rated), "",
      r.m.factor === 1
        ? `${inp.mat} carries the class rating as-is.`
        : `${inp.mat} at the same cross-section: ${r.m.factor < 1 ? "weaker resin" : "steel band and ball lock"} — factor ${r.m.factor.toFixed(2)} on the PA66 class rating.`) +
    eqn("2 · Temperature", `${V("F")}<sub>T</sub> = ${V("F")}<sub>23</sub> · ${V("k")}<sub>T</sub>`,
      `${f(r.rated, 0)} × ${r.fTemp.toFixed(2)}`, r.outOfRange ? "OUT OF RANGE" : nlb(r.rated * r.fTemp), r.outOfRange ? "bad" : "",
      r.outOfRange
        ? `${f(inp.temp, 0)} °C is outside the ${r.m.tMin}…${r.m.tMax} °C continuous window — there is no honest number to give.`
        : `Retention at ${f(inp.temp, 0)} °C from the derating anchors for ${inp.mat}. Polymer strength is a strong function of temperature: standard nylon keeps only ~55% at 85 °C.`) +
    eqn("3 · Environment", `${V("F")}<sub>cap</sub> = ${V("F")}<sub>T</sub> · ${V("k")}<sub>env</sub>`,
      `${f(r.rated * r.fTemp, 0)} × ${r.fEnv.toFixed(2)}`, nlb(r.capacity), "",
      `${inp.env}: ${env.blurb}.`) +
    eqn(inp.n > 1 ? `4 · ${inp.n} ties, shared imperfectly` : "4 · One tie", `${V("F")}<sub>all</sub> = ${V("n")} · ${V("s")} · ${V("F")}<sub>cap</sub>`,
      `${inp.n} × ${(inp.n > 1 ? ZM.SHARE : 1).toFixed(2)} × ${f(r.capacity, 0)}`, nlb(r.capacityAll), "",
      inp.n > 1
        ? `Parallel ties never share evenly — lengths, seating and installed tension all scatter, so each tie past the first counts at ${f(ZM.SHARE * 100, 0)}%.`
        : "A single tie carries it alone; add ties below and each extra one is counted at 80%.") +
    eqn("Verdict", `SF = ${FR(`${V("F")}<sub>all</sub>`, V("F"))}`,
      `${f(r.capacityAll, 0)} / ${f(inp.F, 0)}`,
      isFinite(r.SF) ? r.SF.toFixed(2) : "∞",
      r.SF < 1 ? "bad" : r.SF < inp.SFt ? "warn" : "",
      `Against your ${f(inp.SFt, 1)}× target for “${inp.nature}”. The trade's rule: 2× static, 4× sustained (creep), 5× vibration.`) +

    `<h3>The strap is not the weak link — and that is worth seeing</h3>
    ${r.m.metal
      ? `<p>A stainless tie is a smooth steel band with a ball bearing wedged in a tapered head pocket — there are no
        molded teeth to shear, and the band itself would carry far more than the listed rating. The mechanism (ball
        seating, band slip) is the rating, which is why the strap-stress check is moot for metal ties.</p>`
      : `<p>The strap's own break force is its tensile strength times its cross-section:</p>` +
      eqn("Strap break (same conditions)", `${V("F")}<sub>strap</sub> = ${V("σ")}<sub>t</sub> · ${V("w")} · ${V("t")} · ${V("k")}<sub>T</sub>${V("k")}<sub>env</sub>`,
        `${f(r.m.tens, 0)} × ${r.size.w} × ${r.size.t} × ${(r.fTemp * r.fEnv).toFixed(2)}`, nlb(r.strapBreak), "",
        `Under your ${f(r.Ftie, 0)} N per tie the strap runs at σ = ${f(r.sigma, 1)} MPa — ` +
        `${f((r.strapBreak > 0 ? (r.Ftie / r.strapBreak) : 0) * 100, 0)}% of its own break.`) +
      `<p>So the loop rating is only <b>${f(r.headEff * 100, 0)}%</b> of what the strap could carry — the head gives
      up first, by design and by test. That is the <b>head efficiency</b>, and it is why the 3D model paints the head
      hotter than the strap at the same load: each part is coloured by closeness to <em>its own</em> letting-go
      point. It is also why damaging the head (over-flush cutting, prying the pawl to reuse a tie) costs you the
      rating entirely.</p>`}

    <h3>Where this model stops being right</h3>
    <p class="pn warn"><b>Ratings are minimums from the catalog, not certified allowables.</b> Real production ties
    typically exceed the printed loop tensile by 10–15%, but the scatter belongs to the vendor's process, not to you.
    The derating anchors here are typical published curves (HellermannTyton / Panduit / T&B class data) — the tie you
    buy has its own datasheet; for anything that matters, use it.</p>
    <p class="pn warn"><b>Sharp edges are outside the model.</b> The rating is measured on Ø smooth mandrels. Looped
    over an edge or a thin flange, the bend concentrates load at one tooth root and capacity falls well below rating
    — radius the edge or use a saddle mount.</p>
    <p class="pn bad"><b>Never overhead, never over people, never life-safety.</b> A molded pawl and friction are not
    a lifting sling, whatever the safety factor says.</p>`;
}

/* ── the worked report ────────────────────────────────────────────────────── */
export function reportHTML(inp: ZM.ZipInput, r: ZM.ZipResult): string {
  const sfc = ZM.sfColor(r.SF * (2 / Math.max(inp.SFt, 0.5)));
  return `<table class="rep"><tr><th>Given</th><th style="text-align:right">Value</th></tr>
    <tr><td>Tie class</td><td class="v">${inp.size}</td></tr>
    <tr><td>Strap section ${V("w")} × ${V("t")}</td><td class="v">${r.size.w} × ${r.size.t} mm</td></tr>
    <tr><td>Material</td><td class="v">${inp.mat}</td></tr>
    <tr><td>Load · ties sharing it</td><td class="v">${f(inp.F, 0)} N · ${inp.n}</td></tr>
    <tr><td>Service temperature</td><td class="v">${f(inp.temp, 0)} °C</td></tr>
    <tr><td>Environment · duty</td><td class="v">${inp.env} · ${inp.nature}</td></tr>
    <tr><td>Bundle Ø</td><td class="v">${f(inp.bundle, 0)} mm</td></tr></table>` +
    eqn("Rating → capacity", `${V("F")}<sub>cap</sub> = ${V("F")}<sub>rated</sub>·${V("k")}<sub>mat</sub>·${V("k")}<sub>T</sub>·${V("k")}<sub>env</sub>`,
      `${f(r.size.rated, 0)} × ${r.m.factor.toFixed(2)} × ${r.fTemp.toFixed(2)} × ${r.fEnv.toFixed(2)}`,
      nlb(r.capacity), r.outOfRange ? "bad" : "", "Per tie, in your conditions.") +
    eqn("Load per tie", `${V("F")}<sub>tie</sub> = ${FR(V("F"), `${V("n")}·${V("s")}`)}`,
      `${f(inp.F, 0)} / (${inp.n} × ${(inp.n > 1 ? ZM.SHARE : 1).toFixed(2)})`, `${f(r.Ftie, 0)} N`) +
    eqn("Safety factor", `SF = ${FR(`${V("F")}<sub>cap</sub>`, `${V("F")}<sub>tie</sub>`)}`,
      `${f(r.capacity, 0)} / ${f(r.Ftie, 0)}`, isFinite(r.SF) ? r.SF.toFixed(2) : "∞",
      r.SF < 1 ? "bad" : r.SF < inp.SFt ? "warn" : "",
      `Target ${f(inp.SFt, 1)} for “${inp.nature}” — <b style="color:${sfc}">${r.ok ? "met" : "NOT met"}</b>.`) +
    eqn("Recommended working load", `${V("F")}<sub>work</sub> = ${FR(`${V("F")}<sub>all</sub>`, `SF<sub>t</sub>`)}`,
      `${f(r.capacityAll, 0)} / ${f(inp.SFt, 1)}`, `${nlb(r.maxWork)} ≈ ${f(r.maxWorkKg, 1)} kg`, "",
      "The most this arrangement should be asked to hold, day in, day out.") +
    eqn("Tie length for the bundle", `${V("L")} ≥ π(Ø + ${V("t")}) + head + grip`,
      `π(${f(inp.bundle, 0)} + ${r.size.t}) + ${f(2.2 * r.size.w, 0)} + ${ZM.TAIL_GRIP}`, `${f(r.minLen, 0)} mm`, "",
      `Wrap at mid-thickness, the head's own length, and ${ZM.TAIL_GRIP} mm of tail to grip while tensioning. Commonly sold lengths for this class: ${r.size.lengths}.`) +
    `<div class="lab" style="margin-top:16px">VERDICT</div>
    <table class="rep"><tr><th>Check</th><th style="text-align:right">Value</th><th style="text-align:right">Status</th></tr>
      <tr class="hi"><td>Loop tensile vs load</td><td class="v">SF ${isFinite(r.SF) ? r.SF.toFixed(2) : "∞"} vs ${f(inp.SFt, 1)}</td>
        <td class="v" style="color:${sfc}">${r.outOfRange ? "OUT OF RANGE" : r.SF < 1 ? "FAILS" : r.ok ? "OK" : "THIN"}</td></tr>
      <tr><td>Temperature window</td><td class="v">${f(inp.temp, 0)} °C in ${r.m.tMin}…${r.m.tMax} °C</td>
        <td class="v" style="color:${r.outOfRange ? "#d65c5c" : "#4fb477"}">${r.outOfRange ? "OUTSIDE" : "inside"}</td></tr>
      ${r.m.metal ? "" : `<tr><td>Strap stress (info — head governs)</td><td class="v">${f(r.sigma, 1)} MPa · ${f((r.strapBreak > 0 ? r.Ftie / r.strapBreak : 0) * 100, 0)}% of break</td><td class="v" style="color:#4fb477">head first</td></tr>`}
    </table>`;
}

/* ── the DATA & MATERIALS tab ─────────────────────────────────────────────── */
export function dataHTML(inp: ZM.ZipInput, r: ZM.ZipResult, forPrint = false): string {
  // Every material row worked at the USER's size, temperature and environment,
  // so the table answers "what if I bought the other one" rather than quoting
  // a generic datasheet.
  const matRows = Object.entries(ZM.TIE_MATS).map(([name, m]) => {
    const rr = ZM.solve({ ...inp, mat: name });
    const here = name === inp.mat;
    const cap = rr.outOfRange ? `<span style="color:#d65c5c">out of range</span>` : `${f(rr.capacity, 0)}`;
    return `<tr${here ? ' class="hi"' : ""}><td>${here ? `<b>${name}</b>` : name}</td>
      <td class="v">${m.factor.toFixed(2)}×</td>
      <td class="v">${m.tMin}…${m.tMax}</td>
      <td class="v">${m.uv === "immune" ? "immune" : m.uv === "good" ? "✓" : "✗"}</td>
      <td class="v">${m.ul94}</td>
      <td class="v">${m.moist === 0 ? "—" : m.moist < 1 ? "<1%" : `${f(m.moist, 1)}%`}</td>
      <td class="v">${cap}</td></tr>`;
  }).join("");

  const sizeRows = Object.entries(ZM.TIE_SIZES).map(([name, s]) => {
    const here = name === inp.size;
    return `<tr${here ? ' class="hi"' : ""}><td>${here ? `<b>${name}</b>` : name}</td>
      <td class="v">${s.w} × ${s.t}</td>
      <td class="v">${s.ratedLb} lb · ${f(s.rated, 0)} N</td>
      <td class="v">${f(s.rated / ZM.G, 1)} kg</td>
      <td class="v">${s.lengths}</td>
      <td class="v">${s.ms3367}</td></tr>`;
  }).join("");

  return `<h3 style="margin-top:0">How the ratchet head works</h3>
    <div class="theory-fig${forPrint ? " print" : ""}">${headSVG(forPrint)}</div>
    <p><b>The whole mechanism is one asymmetry.</b> The strap carries molded <b>serrated teeth</b>; the head carries a
    <b>pawl</b> — a stubby cantilever molded into the housing, angled into the channel. Pushing the tail through
    (<span style="color:#3a78c2">insertion</span>) cams the pawl up and it clicks over each tooth. Pulling back does
    the opposite: the tooth face, leaning the locking way, drives the <b>engagement tip</b> deeper into the strap —
    the harder the load pulls, the harder the pawl bites. There is no spring to weaken and nothing to unlatch; the
    <span style="color:#d65c5c">locking force</span> is the load's own reaction, fanned into the tooth root and the
    housing walls.</p>
    <p><b>Where it finally fails</b> — in the loop-tensile test and in the field — is that same joint: the pawl tooth
    shears, the pawl hinge tears at its root, or the housing opens enough for one tooth to skip and the rest follow.
    All three live in the head, which is why the loop rating is a head number (${f(r.headEff * 100, 0)}% of your
    strap's own break force), and why one-piece molded ties are single-use: prying the pawl to release it damages the
    root it locks with.</p>
    <p><b>Two other lock designs exist.</b> Aerospace-style ties (Ty-Rap pattern) hold a tiny <b>stainless-steel barb</b>
    in the head instead of a molded pawl — the strap is smooth, the barb digs in anywhere along it, so tension is
    infinitely adjustable and the lock is immune to tooth tolerance. <b>Stainless ball-lock ties</b> go further: a
    bearing ball wedges the smooth steel band into a tapered pocket — the pull seats the ball tighter, same asymmetry,
    no polymer anywhere.</p>

    <h3>Size classes — the numbers behind the names</h3>
    <table class="rep"><tr><th>Class</th><th style="text-align:right">w × t mm</th>
      <th style="text-align:right">min loop tensile</th><th style="text-align:right">≈ hang*</th>
      <th style="text-align:right">common lengths</th><th style="text-align:right">MIL dash</th></tr>${sizeRows}</table>
    <p>*straight conversion of the rating to kilograms — a <em>break</em> figure, not a working load; divide by your
    safety factor before trusting it with anything. The MIL dash is the usual MS3367 size code for the class
    (final digit is the colour/material code, e.g. −9 weather-resistant black, −0 natural) — always confirm the exact
    part against the AS23190 QPL.</p>

    <h3>Materials — worked at your conditions</h3>
    <p>The last column is the loop-tensile capacity of a <b>${inp.size.toLowerCase()}</b> tie in each material at
    <b>${f(inp.temp, 0)} °C, ${inp.env.toLowerCase()}</b> — the same chain the calculator runs, one row per material,
    so the comparison is your comparison, not a generic one:</p>
    <table class="rep"><tr><th>Material</th><th style="text-align:right">× rating</th>
      <th style="text-align:right">°C window</th><th style="text-align:right">UV</th>
      <th style="text-align:right">UL 94</th><th style="text-align:right">water sat.</th>
      <th style="text-align:right">here, N</th></tr>${matRows}</table>
    <table class="rep">${Object.entries(ZM.TIE_MATS).map(([name, m]) =>
      `<tr><td style="white-space:nowrap">${name === inp.mat ? `<b>${name}</b>` : name}</td><td>${m.note}</td></tr>`).join("")}
    </table>
    <p class="pn warn"><b>Nylon and water is not a defect — it is the design basis.</b> PA66 saturates to ~2.5% water
    in normal air (8.5% immersed) and the <em>rating assumes it</em>: loop tensile is quoted conditioned. A
    dry-as-molded tie is ~20% stronger in tension but brittle — it snaps when flexed during install. That is why ties
    ship in sealed bags, why old opened bags of ties crack, and why the fix is re-conditioning (24 h in water), not a
    stronger tie.</p>

    <h3>Standards worth knowing</h3>
    <table class="rep">
      <tr><td style="white-space:nowrap"><b>SAE AS23190</b></td><td>The aerospace procurement spec — successor to
        <b>MIL-S-23190E</b>. Covers plastic and metal straps and mounts for wire bundles in airframes; parts qualify
        onto its QPL. Dimensions come from the companion sheets (<b>AS33671</b> for adjustable plastic straps).</td></tr>
      <tr><td><b>MS3367 / MS3368</b></td><td>The military part-number sheets the trade still quotes: MS3367-<i>size</i>-<i>colour</i>
        for straps (see the size table above), MS3368 for the mount bases. A “MIL-spec tie” properly means one of these,
        bought through the QPL — not just a black tie.</td></tr>
      <tr><td><b>UL 62275 / IEC 62275</b></td><td>The electrical-industry listing (replaced UL 1565 “cable positioning
        devices”). A listed tie declares a minimum loop tensile <em>after</em> conditioning, and a Type: <b>Type 2</b>
        general indoor, <b>Type 21</b> UV-resistant outdoor, <b>Type 21S</b> outdoor plus higher mechanical security.
        The declared strength on the listing card is the number to design to.</td></tr>
      <tr><td><b>UL 94</b></td><td>Flammability of the resin itself: standard nylon ties are <b>V-2</b> (self-extinguishing,
        flaming drips allowed); ETFE and PEEK reach <b>V-0</b>. Plenum and rolling-stock work will also ask for
        low-smoke-zero-halogen (LSZH) grades.</td></tr>
      <tr><td><b>NASA / airframe practice</b></td><td>Chafe is the enemy: ties never bear on a wire bundle over an edge,
        never replace proper clamps at supports, and the cut tail must be flush — a proud stub is a documented
        hand-injury and FOD hazard in every wiring manual.</td></tr>
    </table>

    <h3>Aging, fatigue and the slow failures</h3>
    <table class="rep"><tr><th>Mechanism</th><th>What happens</th><th style="text-align:right">Design answer</th></tr>
      <tr><td><b>Creep / stress relaxation</b></td><td>Polymer under standing load stretches; tension bleeds off, the
        pawl walks a tooth, grip loosens. Accelerates hot and wet.</td><td class="v">sustained ≤ ~25% of rating (the 4×)</td></tr>
      <tr><td><b>UV embrittlement</b></td><td>Surface chain scission → chalking and micro-cracks → the strap snaps at a
        flex. Months for natural nylon in sun.</td><td class="v">carbon-black UV grade, PA12, ETFE or steel</td></tr>
      <tr><td><b>Hydrolysis</b></td><td>Hot + wet slowly cuts the polymer chains themselves; thermal-cycling tests at
        90 °C show double-digit % strength loss per 1000 h.</td><td class="v">heat-stabilized grade, or metal past 85 °C</td></tr>
      <tr><td><b>Vibration fatigue</b></td><td>Cyclic load works the pawl-tooth contact microscopically and fatigues the
        tooth roots; ties on engines and panels loosen first.</td><td class="v">the 5× factor + a mount that stops motion</td></tr>
      <tr><td><b>Cold impact</b></td><td>Below about −10 °C nylon's toughness drops; installing (flexing) cold ties
        snaps them even though static strength is fine.</td><td class="v">warm the ties, or impact-modified grade</td></tr>
      <tr><td><b>Edge cutting</b></td><td>A sharp edge under load concentrates everything at one tooth root — capacity
        falls far below rating regardless of class.</td><td class="v">radius the edge; saddle or cradle mounts</td></tr>
    </table>
    <p class="pn"><b>In short:</b> the printed pound-rating is a 23 °C, indoor, fresh-out-of-the-bag, minutes-long
    number. Every real installation is some distance from all four of those, and the factors on the Model tab are the
    map of that distance.</p>`;
}

/* ── design tips ──────────────────────────────────────────────────────────── */
export function tipsHTML(inp: ZM.ZipInput, r: ZM.ZipResult): string {
  const kg = (N: number) => f(N / ZM.G, 1);
  return `<div class="tip key"><h4>1 · Buy the rating for the duty, not the load</h4>
    <p>The pound-class is a break figure measured warm, indoors, for seconds. Multiply your load by <b>2×</b> for a
    static hold, <b>4×</b> for anything left loaded for weeks (creep), <b>5×</b> for vibration — then pick the class
    that clears it. Weight is cheap; the next class up usually costs cents.</p>
    <div class="tipnum">Yours: ${f(inp.F, 0)} N (${kg(inp.F)} kg) × ${f(inp.SFt, 1)} → needs ${f(inp.F * inp.SFt, 0)} N ·
      this arrangement gives <b>${f(r.capacityAll, 0)} N</b> → SF <b>${isFinite(r.SF) ? r.SF.toFixed(2) : "∞"}</b></div></div>

    <div class="tip"><h4>2 · Tension by feel is over-tension</h4>
    <p>Hand-pulling to “good and tight” routinely reaches half the rating before the load even arrives, and crushes
    soft cables besides (data pairs and coax care: snug, never tight). A <b>tension tool</b> set to the class both
    tensions repeatably and <b>cuts flush</b> in the same squeeze. Comms bundles prefer hook-and-loop entirely.</p></div>

    <div class="tip warn"><h4>3 · Cut flush, always</h4>
    <p>A tail cut at an angle with side-cutters leaves a molded knife at hand height — the single most common cable-tie
    injury in maintenance bays, and standard wiring manuals call it out by name. Flush-cut, then run a thumb over it:
    if you can feel the edge, so will the next person's forearm.</p></div>

    <div class="tip"><h4>4 · Outdoors means carbon black or steel</h4>
    <p>“Black” is not a UV rating — UV grades carry ≥2% carbon black <em>through the resin</em> (or are PA12, ETFE, or
    stainless). Natural nylon in sunlight chalks, crazes and lets go in months. Damp or marine, remember nylon runs
    conditioned-wet and weaker; salt spray specifically wants 316 over 304.</p>
    <div class="tipnum">Yours: ${inp.mat}, ${inp.env.toLowerCase()} → environment factor <b>${r.fEnv.toFixed(2)}</b>${
      r.m.uv === "poor" && inp.env === "Outdoor — sunlight (UV)" ? ' · <b style="color:#d65c5c">wrong material for sunlight</b>' : ""}</div></div>

    <div class="tip"><h4>5 · Heat halves nylon — plan for the hottest hour</h4>
    <p>Strength follows the derating curve, not the room where you installed it. An engine bay, a black enclosure in
    sun, a ceiling void above lights — rate the tie at the <em>hottest</em> service temperature it will ever see, and
    past 85 °C move to heat-stabilized nylon, PEEK or steel.</p>
    <div class="tipnum">Yours: at ${f(inp.temp, 0)} °C, ${inp.mat} keeps <b>${f(r.fTemp * 100, 0)}%</b> of its 23 °C rating
      (window ${r.m.tMin}…${r.m.tMax} °C)</div></div>

    <div class="tip"><h4>6 · More ties, spread out, beat one big tie</h4>
    <p>Two ties halve the load each (near enough), double the failure count needed, and spread bearing on the bundle.
    Space them so the load can't lever one tie loose first, and never trust ties in series — each link adds a head.
    Count extras at 80%, not 100%: they never share evenly.</p>
    <div class="tipnum">Yours: ${inp.n} tie${inp.n > 1 ? "s" : ""} → ${f(r.Ftie, 0)} N on the worst tie</div></div>

    <div class="tip warn"><h4>7 · Respect the head</h4>
    <p>Everything the tie is rated for lives in the pawl: don't pry it to reuse a tie (the hinge root is damaged the
    first time), don't paint or solvent-wipe the head, don't bend the strap sharply as it exits — the first tooth at
    the head is the most loaded one. Releasable-head ties exist for things you'll revisit; they trade rating for it.</p></div>

    <div class="tip bad"><h4>8 · Know what a tie is not</h4>
    <p>A cable tie positions and bundles. It is <b>not</b> a lifting sling, a fall-arrest, a hose clamp under pressure,
    or a guard against a spinning part — and nothing overhead should depend on one where letting go finds a person.
    Where slipping or letting go is dangerous, the tie holds position and a <em>mechanical</em> feature (hook, saddle,
    clamp, shoulder) holds the consequence.</p>
    <div class="tipnum">Yours: recommended working load for this arrangement — <b>${f(r.maxWork, 0)} N ≈ ${kg(r.maxWork)} kg</b>
      at SF ${f(inp.SFt, 1)}</div></div>`;
}

/* ── one-page bench sheet (print only) ────────────────────────────────────── */
export function summaryHTML(inp: ZM.ZipInput, r: ZM.ZipResult): string {
  const row = (k: string, v: string) => `<tr><td>${k}</td><td class="v">${v}</td></tr>`;
  const sfc = ZM.sfColor(r.SF * (2 / Math.max(inp.SFt, 0.5)));
  return `<div class="headline"><span class="n">${f(r.maxWork, 0)} N ≈ ${f(r.maxWorkKg, 1)} kg</span>
      <span class="w">recommended working load · ${inp.n} × ${inp.size} in ${inp.mat}<br>
      capacity ${nlb(r.capacityAll)} at ${f(inp.temp, 0)} °C, ${inp.env.toLowerCase()} · SF target ${f(inp.SFt, 1)} (${inp.nature.toLowerCase()})
      ${r.outOfRange ? "<br><b>OUT OF TEMPERATURE RANGE — capacity zero as reported</b>" : r.SF < 1 ? "<br><b>FAILS — load exceeds capacity</b>" : r.ok ? "" : `<br><b>Margin thin</b> — SF ${r.SF.toFixed(2)} vs ${f(inp.SFt, 1)} target`}</span></div>

    <h2>Selection</h2><table class="rep">
      ${row("Tie", `${inp.size} — ${r.size.w} × ${r.size.t} mm strap`)}
      ${row("Material", `${inp.mat} (${r.m.tMin}…${r.m.tMax} °C, UL 94 ${r.m.ul94})`)}
      ${row("Rated loop tensile (this material, 23 °C)", nlb(r.rated))}
      ${row("Min length for Ø" + f(inp.bundle, 0) + " mm bundle", `${f(r.minLen, 0)} mm · sold ${r.size.lengths}`)}
      ${row("MIL dash (verify vs QPL)", r.size.ms3367)}</table>

    <h2>Check at ${f(inp.F, 0)} N (${f(inp.F / ZM.G, 1)} kg), ${inp.n} tie${inp.n > 1 ? "s" : ""}</h2><table class="rep">
      <tr><th></th><th style="text-align:right">factor</th><th style="text-align:right">N</th></tr>
      <tr><td>Class rating (PA66 baseline)</td><td class="v">—</td><td class="v">${f(r.size.rated, 0)}</td></tr>
      <tr><td>Material</td><td class="v">× ${r.m.factor.toFixed(2)}</td><td class="v">${f(r.rated, 0)}</td></tr>
      <tr><td>Temperature ${f(inp.temp, 0)} °C</td><td class="v">× ${r.fTemp.toFixed(2)}</td><td class="v">${f(r.rated * r.fTemp, 0)}</td></tr>
      <tr><td>Environment — ${inp.env.toLowerCase()}</td><td class="v">× ${r.fEnv.toFixed(2)}</td><td class="v">${f(r.capacity, 0)}</td></tr>
      <tr><td>${inp.n} tie${inp.n > 1 ? `s × ${(ZM.SHARE * 100).toFixed(0)}% sharing` : ""}</td><td class="v">× ${inp.n > 1 ? `${inp.n}·${ZM.SHARE.toFixed(2)}` : "1"}</td><td class="v">${f(r.capacityAll, 0)}</td></tr>
      <tr class="hi"><td><b>Safety factor vs ${f(inp.F, 0)} N</b></td><td class="v" style="color:${sfc}"><b>${isFinite(r.SF) ? r.SF.toFixed(2) : "∞"}</b></td>
        <td class="v" style="color:${sfc}">${r.outOfRange ? "OUT OF RANGE" : r.SF < 1 ? "FAILS" : r.ok ? "OK" : "below target"}</td></tr></table>

    <h2>Governing relations</h2>
    <div class="eqs">
      F_cap = F_rated · k_mat · k_T · k_env = ${f(r.capacity, 0)} N per tie<br>
      SF = n·s·F_cap / F = ${isFinite(r.SF) ? r.SF.toFixed(2) : "∞"} &nbsp;·&nbsp; F_work = capacity / ${f(inp.SFt, 1)} = ${f(r.maxWork, 0)} N<br>
      strap σ = F_tie/(w·t) = ${f(r.sigma, 1)} MPa &nbsp;·&nbsp; head efficiency = ${r.m.metal ? "n/a (ball-lock)" : f(r.headEff * 100, 0) + "% of strap break"}<br>
      L_min = π(Ø + t) + head + ${ZM.TAIL_GRIP} mm grip = ${f(r.minLen, 0)} mm
    </div>
    ${r.warns.filter((w) => w.level !== "info").length
      ? `<h2>Warnings</h2><table class="rep">` +
        r.warns.filter((w) => w.level !== "info").map((w) => `<tr><td>${w.text}</td></tr>`).join("") + `</table>`
      : ""}
    <p style="font-size:9px;color:#666;margin-top:10px">Typical catalog class minimums and published derating curves
    (UL 62275 / SAE AS23190 basis) — not certified allowables. Loop rating assumes smooth mandrels: sharp edges,
    damaged heads and reused ties fall below it. Never overhead, never over people, never life-safety.</p>`;
}
