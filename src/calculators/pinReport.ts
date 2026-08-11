// The pin/bolt shear joint, worked line by line — the same typeset-maths
// idiom the clamp and bolted-joint reports use, so the report tab and the
// exported PDF are one document rendered twice.
//
// Every step shows the symbolic form, the numbers substituted into it, and the
// answer. Nothing here recomputes anything: the figures come from the solver,
// so the page and the paper can never disagree with each other.

import * as PM from "./pinMath";
import { figuresHTML } from "./pinDiagrams";
import { FR, V, eqn } from "./typeset";

const f = PM.fmt;
const n2 = (v: number) => (isFinite(v) ? v.toFixed(2) : "∞");
const n0 = (v: number) => (isFinite(v) ? Math.round(v).toLocaleString("en-US") : "∞");
const kN = (v: number) => (isFinite(v) ? `${f(v / 1000, 2)} kN` : "∞");
const sfCls = (sf: number) => (sf >= 2 ? "" : sf >= 1.2 ? "warn" : "bad");

/** SF as a coloured bold figure, for use inside a comment. */
const sfTag = (sf: number) => `<b style="color:${PM.sfColor(sf)}">${n2(sf)}</b>`;

/* ── the given ─────────────────────────────────────────────────────────── */
function givenHTML(inp: PM.PinInput, res: PM.PinResult): string {
  const pm = PM.PIN_MATS[inp.pinMat];
  const row = (k: string, v: string) => `<tr><td>${k}</td><td class="v">${v}</td></tr>`;
  return `<table class="rep"><tr><th>Given</th><th style="text-align:right">Value</th></tr>
    ${row("Configuration", res.double
      ? "3 flanges — clevis, double shear (2 planes)"
      : "2 flanges — lap joint, single shear (1 plane)")}
    ${row("Applied load " + V("F"), `${n0(inp.F)} N = ${f(inp.F / 1000, 2)} kN`)}
    ${row("Pin", inp.hollow
      ? `Ø${f(inp.d, 1)} × ${f(res.wall, 2)} mm wall (bore Ø${f(res.di, 1)}) · ${inp.pinMat}`
      : `Ø${f(inp.d, 1)} solid · ${inp.pinMat}`)}
    ${row("Pin strength", `${V("S")}<sub>y</sub> ${f(pm.Sy, 0)} · ${V("S")}<sub>u</sub> ${f(pm.Su, 0)} · bearing ${f(PM.bearingAllow(pm), 0)} MPa`)}
    ${row("In the shear plane", inp.shank)}
    ${res.members.map((m) =>
      row(m.label.charAt(0).toUpperCase() + m.label.slice(1),
        `${f(m.t, 1)} mm · ${m.matName} (${V("S")}<sub>y</sub> ${f(m.mat.Sy, 0)} · bearing ${f(PM.bearingAllow(m.mat), 0)} MPa)`)).join("")}
    ${row("Flange width " + V("w") + " · edge distance " + V("a"), `${f(inp.w, 1)} · ${f(inp.a, 1)} mm`)}
    ${res.double ? row("Clevis clearance per side", `${f(inp.clr, 2)} mm`) : ""}
    ${row("Target safety factor", n2(inp.SFt))}</table>`;
}

/* ── 1 · the pin's section ─────────────────────────────────────────────── */
function sectionHTML(inp: PM.PinInput, res: PM.PinResult): string {
  const d = inp.d, di = res.di;
  const Asolid = (Math.PI / 4) * d * d;
  const Isolid = (Math.PI / 64) * d ** 4;
  const sh = PM.SHANKS[inp.shank];

  const area = inp.hollow
    ? eqn("1a · Shear area — the annulus", `${V("A")} = ${FR("π", "4")}(${V("d")}² − ${V("d")}ᵢ²)`,
        `${FR("π", "4")}(${f(d, 1)}² − ${f(di, 1)}²)`, `${f(res.Apin, 1)} mm²`, "",
        `A tube keeps <b>${f(100 * (res.Apin / Asolid), 0)}%</b> of the solid bar's area. Shear has no leverage to exploit — it uses plain area — so this is the check a hollow pin actually pays for.`)
    : eqn("1a · Shear area", `${V("A")} = ${FR(`π${V("d")}²`, "4")}`,
        FR(`π × ${f(d, 1)}²`, "4"), `${f(res.Apin, 1)} mm²`);

  const second = inp.hollow
    ? eqn("1b · Second moment and section modulus", `${V("I")} = ${FR("π", "64")}(${V("d")}⁴ − ${V("d")}ᵢ⁴), ${V("Z")} = ${FR(`2${V("I")}`, V("d"))}`,
        `${FR("π", "64")}(${f(d, 1)}⁴ − ${f(di, 1)}⁴)`, `${V("I")} = ${f(res.Ipin, 1)} mm⁴, ${V("Z")} = ${f(res.Zpin, 1)} mm³`, "",
        `And <b>${f(100 * (res.Ipin / Isolid), 0)}%</b> of the solid bar's stiffness, from ${f(100 * (res.Apin / Asolid), 0)}% of the material. Bending stress grows with distance from the axis, so the material taken out of the middle was the material doing the least work — that asymmetry is the whole case for a tube.`)
    : eqn("1b · Section modulus", `${V("Z")} = ${FR(`π${V("d")}³`, "32")}`,
        FR(`π × ${f(d, 1)}³`, "32"), `${f(res.Zpin, 1)} mm³`, "",
        `The solid case of ${V("Z")} = π(${V("d")}⁴−${V("d")}ᵢ⁴)/32${V("d")} with ${V("d")}ᵢ = 0.`);

  const eff = sh.areaFactor !== 1
    ? eqn("1c · What actually crosses the shear plane", `${V("A")}<sub>eff</sub> = ${f(sh.areaFactor, 2)}·${V("A")}`,
        `${f(sh.areaFactor, 2)} × ${f(res.Apin, 1)}`, `${f(res.Ashear, 1)} mm²`, "warn",
        "Threads in the shear plane: only the minor-diameter core carries it. A longer shank or a shoulder bolt puts the full circle back.")
    : "";

  return area + second + eff;
}

/* ── 2 · how the load splits ───────────────────────────────────────────── */
function shareHTML(res: PM.PinResult): string {
  const rows = res.members.map((m) =>
    `<tr><td>${m.label}</td><td class="v">${f(100 * m.share, 0)}%</td><td class="v">${n0(m.Fi)} N</td></tr>`).join("");
  return `<table class="rep"><tr><th>Member</th><th style="text-align:right">share of F</th><th style="text-align:right">carries</th></tr>
    ${rows}</table>
    <p style="font-family:system-ui,sans-serif;font-size:10px;color:#46515c;line-height:1.7;margin:4px 0 0">
    ${res.double
      ? "Symmetry does the splitting: the middle flange carries the whole load, and the two outer flanges take half each. That is also why there are two shear planes rather than one."
      : "Both flanges carry the full load — a lap joint has nothing to split it with, which is the first reason it is the weaker arrangement."}</p>`;
}

/* ── 3 · the pin's own checks ──────────────────────────────────────────── */
function pinHTML(inp: PM.PinInput, res: PM.PinResult): string {
  const pm = PM.PIN_MATS[inp.pinMat];
  const shear = res.modes.find((m) => m.key === "shear")!;
  const bend = res.modes.find((m) => m.key === "bend");
  const bearpin = res.modes.find((m) => m.key === "bearpin")!;

  let out = eqn("3a · Shear stress in the pin (Fig. 8-23c)",
    `${V("τ")} = ${FR(V("F"), `${V("n")}·${V("A")}<sub>eff</sub>`)}`,
    FR(`${n0(inp.F)}`, `${res.nPlanes} × ${f(res.Ashear, 1)}`),
    `${f(res.tau, 1)} MPa`, sfCls(shear.SF),
    `${res.nPlanes} shear plane${res.nPlanes > 1 ? "s" : ""} — the load is split between them before it ever reaches the metal.`);

  out += eqn("3b · Allowable shear — distortion energy",
    `${V("S")}<sub>sy</sub> = 0.577·${V("S")}<sub>y</sub>`,
    `0.577 × ${f(pm.Sy, 0)}`, `${f(res.Ssy, 0)} MPa`, "",
    `SF = ${f(res.Ssy, 0)} / ${f(res.tau, 1)} = ${sfTag(res.SFshear)}. Shear yield is not tensile yield: the von Mises criterion puts it at 0.577 of it, and using ${V("S")}<sub>y</sub> here would overstate the pin by 73%.`);

  if (bend) {
    out += eqn("3c · Bending moment on the pin (Fig. 8-23b)",
      `${V("M")} = ${FR(V("F"), "2")}(${FR(`${V("t")}₂`, "4")} + ${V("c")} + ${FR(`${V("t")}₁`, "2")})`,
      `${FR(n0(inp.F), "2")}(${FR(f(inp.t2, 1), "4")} + ${f(inp.clr, 2)} + ${FR(f(inp.t1, 1), "2")})`,
      `${n0(res.Mpin)} N·mm`, "",
      `The pin is a short simply-supported beam: the middle flange delivers F over its own thickness, the outer flanges react with F/2 each, and the clevis clearance is dead arm between them. Closing that clearance is the cheapest way to cut this moment.`);
    out += eqn("3d · Bending stress",
      `${V("σ")} = ${FR(V("M"), V("Z"))}`,
      FR(n0(res.Mpin), f(res.Zpin, 1)), `${f(res.sigmaBend, 1)} MPa`, sfCls(bend.SF),
      `vs ${V("S")}<sub>y</sub> = ${f(pm.Sy, 0)} MPa, so SF = ${sfTag(res.SFbend)}. On a clevis this is very often the governing check — the shear numbers look comfortable while the pin is quietly bending.`);
  } else {
    out += `<p class="pn warn" style="font-family:system-ui,sans-serif;font-size:11px;line-height:1.75;color:#e6c98a">
      <b>No bending check in single shear.</b> A lap joint has no clean span to bend over: the offset load path makes
      the whole joint tilt, and how much moment the pin then sees depends on how firmly the surrounding structure
      resists that rotation — which this model does not know. Treat a lap joint's numbers as optimistic.</p>`;
  }

  // The pin sees whichever member presses hardest — narrowest bearing strip.
  const worst = res.members.reduce((a, b) => (b.pBear > a.pBear ? b : a));
  out += eqn("3e · Bearing on the pin's own surface (Eq. 8-55)",
    `${V("p")} = ${FR(`${V("F")}ᵢ`, `${V("d")}·${V("t")}`)}`,
    FR(n0(worst.Fi), `${f(inp.d, 1)} × ${f(worst.t, 1)}`),
    `${f(bearpin.stress, 1)} MPa`, sfCls(bearpin.SF),
    `Taken from the ${worst.label}, which presses hardest of the ${res.members.length}. vs ${f(bearpin.allow, 0)} MPa permissible for the pin, SF = ${sfTag(res.SFbearPinAll)}. The same pressure acts on the hole wall and on the pin — whichever material is softer gives first, so both are checked.`);

  return out;
}

/* ── 4 · the flanges ───────────────────────────────────────────────────── */
function memberHTML(inp: PM.PinInput, res: PM.PinResult): string {
  return res.members.map((m) => {
    const pb = PM.bearingAllow(m.mat);
    const SsyM = PM.SHEAR_YIELD * m.mat.Sy;
    return `<div class="lab" style="margin-top:16px">${m.label.toUpperCase()} — ${m.matName}</div>` +
      eqn("Bearing on the hole wall (Eq. 8-55)",
        `${V("σ")}<sub>b</sub> = ${FR(`${V("F")}ᵢ`, `${V("d")}·${V("t")}`)}`,
        FR(n0(m.Fi), `${f(inp.d, 1)} × ${f(m.t, 1)}`), `${f(m.pBear, 1)} MPa`, sfCls(m.SFbearPlate),
        `vs ${f(pb, 0)} MPa, SF = ${sfTag(m.SFbearPlate)}. The contact is a curved surface, so the load is spread over the <em>projected</em> area ${V("d")}·${V("t")} — the flat rectangle you would see looking down the load.`) +
      eqn("Tension across the net section (Eq. 8-54)",
        `${V("σ")} = ${FR(`${V("F")}ᵢ`, `(${V("w")} − ${V("d")})·${V("t")}`)}`,
        FR(n0(m.Fi), `(${f(inp.w, 1)} − ${f(inp.d, 1)}) × ${f(m.t, 1)}`), `${f(m.sigmaNet, 1)} MPa`, sfCls(m.SFnet),
        `vs ${V("S")}<sub>y</sub> = ${f(m.mat.Sy, 0)} MPa, SF = ${sfTag(m.SFnet)}. The hole is simply removed from the width — no stress concentration, which is the right call for a ductile plate under static load and the wrong one for fatigue.`) +
      eqn("Edge tear-out (Fig. 8-25)",
        `${V("τ")} = ${FR(`${V("F")}ᵢ`, `2·${V("t")}·(${V("a")} − ${V("d")}/2)`)}`,
        FR(n0(m.Fi), `2 × ${f(m.t, 1)} × ${f(m.lig, 2)}`), `${f(m.tauTear, 1)} MPa`, sfCls(m.SFtear),
        `vs 0.577·${f(m.mat.Sy, 0)} = ${f(SsyM, 0)} MPa, SF = ${sfTag(m.SFtear)}. Two ligaments run from the hole flanks to the loaded edge, and the tearing length is the <em>net</em> ${V("a")} − ${V("d")}/2 = ${f(m.lig, 2)} mm, not ${V("a")} — the hole eats into it.`);
  }).join("");
}

/* ── 5 · verdict ───────────────────────────────────────────────────────── */
function verdictHTML(inp: PM.PinInput, res: PM.PinResult): string {
  const rows = res.modes.map((m) =>
    `<tr class="${m === res.governing ? "hi" : ""}"><td>${m.label}</td>` +
    `<td class="v">${m.kind} ${f(m.stress, 1)}</td><td class="v">${f(m.allow, 0)}</td>` +
    `<td class="v" style="color:${PM.sfColor(m.SF)}">${n2(m.SF)}</td>` +
    `<td class="v">${kN(m.Fcap)}</td></tr>`).join("");
  const ladder = res.ladder.filter((m) => isFinite(m.Fcap)).map((m, i) =>
    `<tr class="${i === 0 ? "hi" : ""}"><td class="v">${kN(m.Fcap)}</td><td>${m.label}</td>
     <td class="v">${m.kind} reaches ${f(m.allow, 0)} MPa</td></tr>`).join("");
  return `<table class="rep">
      <tr><th>Failure mode</th><th style="text-align:right">stress MPa</th><th style="text-align:right">allowable</th>
      <th style="text-align:right">SF</th><th style="text-align:right">capacity</th></tr>${rows}</table>

    <div class="lab" style="margin-top:16px">CAPACITY LADDER — IN THE ORDER THINGS LET GO</div>
    <table class="rep"><tr><th style="text-align:right">at</th><th>this happens</th><th style="text-align:right">because</th></tr>
      ${ladder}</table>

    <p style="font-family:system-ui,sans-serif;font-size:11px;color:#8b97a3;line-height:1.75;margin:10px 0 0">
      Every check above is <b style="color:#c2ccd4">linear in the load</b>, so each mode's capacity is just its
      allowable divided by what one newton costs it — no search, and the ladder is exact. The joint's capacity is the
      smallest of them: <b style="color:#c2ccd4">${kN(res.Fcap)}</b>, set by
      <b style="color:#c2ccd4">${res.governing.label.toLowerCase()}</b>.
      ${inp.F > 0
        ? `At the applied ${f(inp.F / 1000, 2)} kN that is a safety factor of <b style="color:${PM.sfColor(res.SFjoint)}">${n2(res.SFjoint)}</b>` +
          (res.meetsTarget
            ? ` — clear of your target ${n2(inp.SFt)}.`
            : res.holds
              ? ` — it holds, but short of your target ${n2(inp.SFt)}. Your target is reached at ${kN(res.Fcap / inp.SFt)}.`
              : ` — the joint has already failed. It would hold ${kN(res.Fcap)}, and reach your target SF at ${kN(res.Fcap / inp.SFt)}.`)
        : "No load has been applied, so this is pure capacity."}
    </p>`;
}

/** The full worked calculation — the Report tab, and the body of the PDF. */
export function reportHTML(inp: PM.PinInput, res: PM.PinResult, forPrint = false): string {
  return givenHTML(inp, res) +
    `<div class="lab" style="margin-top:18px">THE FIVE WAYS THIS JOINT CAN LET GO</div>` +
    figuresHTML(inp, res, forPrint) +
    `<div class="lab" style="margin-top:18px">1 · THE PIN'S SECTION</div>` + sectionHTML(inp, res) +
    `<div class="lab" style="margin-top:18px">2 · HOW THE LOAD SPLITS</div>` + shareHTML(res) +
    `<div class="lab" style="margin-top:18px">3 · THE PIN</div>` + pinHTML(inp, res) +
    `<div class="lab" style="margin-top:18px">4 · THE FLANGES</div>` + memberHTML(inp, res) +
    `<div class="lab" style="margin-top:18px">5 · VERDICT</div>` + verdictHTML(inp, res);
}

/** The one-page bench sheet — the headline answer and nothing else. */
export function summaryHTML(inp: PM.PinInput, res: PM.PinResult): string {
  const row = (k: string, v: string) => `<tr><td>${k}</td><td class="v">${v}</td></tr>`;
  const chk = (m: PM.PinMode) =>
    `<tr class="${m === res.governing ? "hi" : ""}"><td>${m.label}</td>` +
    `<td class="v">${m.kind} ${f(m.stress, 1)} / ${f(m.allow, 0)} MPa</td>` +
    `<td class="v" style="color:${PM.sfColor(m.SF)}">${n2(m.SF)}</td></tr>`;
  const atTarget = res.Fcap / Math.max(inp.SFt, 1e-9);
  return `<div class="headline"><span class="n">${kN(res.Fcap)}</span>
      <span class="w">joint capacity · limited by ${res.governing.label.toLowerCase()}<br>
      at your target SF ${n2(inp.SFt)} the working load is ${kN(atTarget)}${inp.F > 0
        ? `<br>applied ${f(inp.F / 1000, 2)} kN ⇒ SF ${n2(res.SFjoint)}${res.holds ? "" : " — <b>FAILS</b>"}`
        : ""}</span></div>

    <h2>The joint</h2><table class="rep">
      ${row("Arrangement", res.double ? "3 flanges — clevis, double shear" : "2 flanges — lap joint, single shear")}
      ${row("Pin", inp.hollow
        ? `Ø${f(inp.d, 1)} × ${f(res.wall, 2)} wall (bore Ø${f(res.di, 1)}) · ${inp.pinMat}`
        : `Ø${f(inp.d, 1)} solid · ${inp.pinMat}`)}
      ${row("Shear plane", inp.shank)}
      ${res.members.map((m) => row(m.label, `${f(m.t, 1)} mm · ${m.matName}`)).join("")}
      ${row("Flange width " + V("w") + " · edge distance " + V("a"), `${f(inp.w, 1)} · ${f(inp.a, 1)} mm`)}
      ${row("Pin section " + V("A") + " · " + V("Z"), `${f(res.Ashear, 1)} mm² · ${f(res.Zpin, 1)} mm³`)}</table>

    <h2>Checks at ${f(inp.F / 1000, 2)} kN</h2><table class="rep">
      <tr><th>Mode</th><th style="text-align:right">stress / allowable</th><th style="text-align:right">SF</th></tr>
      ${res.modes.map(chk).join("")}</table>

    <h2>Capacity, in the order things let go</h2><table class="rep">
      ${res.ladder.filter((m) => isFinite(m.Fcap)).map((m, i) =>
        `<tr class="${i === 0 ? "hi" : ""}"><td class="v">${kN(m.Fcap)}</td><td>${m.label}</td></tr>`).join("")}</table>

    <h2>Governing relations</h2>
    <div class="eqs">
      τ = F/(n·A) = ${f(res.tau, 1)} MPa vs 0.577·Sy = ${f(res.Ssy, 0)} MPa &nbsp;·&nbsp; n = ${res.nPlanes}<br>
      ${res.double ? `M = F/2·(t₂/4 + c + t₁/2) = ${n0(res.Mpin)} N·mm &nbsp;·&nbsp; σ = M/Z = ${f(res.sigmaBend, 1)} MPa<br>` : ""}
      bearing σ = Fᵢ/(d·t) &nbsp;·&nbsp; net section σ = Fᵢ/((w−d)·t) &nbsp;·&nbsp; tear-out τ = Fᵢ/(2t(a−d/2))<br>
      A = ${inp.hollow ? "π(d²−dᵢ²)/4" : "πd²/4"} = ${f(res.Apin, 1)} mm² &nbsp;·&nbsp;
      Z = ${inp.hollow ? "π(d⁴−dᵢ⁴)/32d" : "πd³/32"} = ${f(res.Zpin, 1)} mm³
    </div>
    ${res.warns.filter((w) => w.level !== "info").length
      ? `<h2>Warnings</h2><table class="rep">` +
        res.warns.filter((w) => w.level !== "info").map((w) => `<tr><td>${w.text}</td></tr>`).join("") + `</table>`
      : ""}
    <p style="font-size:9px;color:#666;margin-top:10px">Static checks at yield onset, per Shigley ch. 8
    (Fig. 8-23, Fig. 8-25, Eq. 8-54, Eq. 8-55). No stress concentration — Kt ≈ 2–3 at a loaded hole governs fatigue
    and brittle plates. No preload friction: this is the slipped, bearing state (§8-12). Typical reference values —
    verify against your own data before production use.</p>`;
}
