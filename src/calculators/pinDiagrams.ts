// Small figures for the report — one per failure mode, in the spirit of
// Shigley's Fig. 8-23: the point is not to render the joint accurately but to
// show, in one glance, WHICH surface parts and in WHICH direction.
//
// Every diagram is a self-contained <svg> with its colours baked into fill and
// stroke attributes, because a print stylesheet cannot reach inside one — the
// clamp calculator learned that the hard way when its diagram exported as a
// full page of black. So each takes `forPrint` and swaps the palette for ink.
//
// They are drawn to the joint's OWN proportions where that costs nothing (the
// pin diameter against the plate thickness, the edge distance against the
// hole), so the picture in the report is the joint being reported on.

import * as PM from "./pinMath";

type Ink = {
  line: string;   // part outlines
  faint: string;  // dimensions, hidden detail
  fill: string;   // part body
  fail: string;   // the surface that gives way
  load: string;   // force arrows
  text: string;
};

const INK = (forPrint: boolean): Ink =>
  forPrint
    ? { line: "#333", faint: "#888", fill: "#e8e8e8", fail: "#a01d1d", load: "#14459b", text: "#333" }
    : { line: "#8b97a3", faint: "#46515c", fill: "#1b242c", fail: "#d65c5c", load: "#3a78c2", text: "#8b97a3" };

const svg = (vb: string, body: string, label: string) =>
  `<svg viewBox="${vb}" role="img" aria-label="${label}" preserveAspectRatio="xMidYMid meet">${body}</svg>`;

// An arrow along +y or −y, tail to tip.
const arrow = (x: number, y0: number, y1: number, c: string, w = 1.1) => {
  const dir = Math.sign(y1 - y0) || 1, head = 3.4;
  return `<line x1="${x}" y1="${y0}" x2="${x}" y2="${y1 - dir * head}" stroke="${c}" stroke-width="${w}"/>
    <path d="M ${x} ${y1} L ${x - 2} ${y1 - dir * head} L ${x + 2} ${y1 - dir * head} Z" fill="${c}"/>`;
};

const txt = (x: number, y: number, s: string, c: string, size = 4, anchor = "middle") =>
  `<text x="${x}" y="${y}" font-size="${size}" fill="${c}" text-anchor="${anchor}" font-family="monospace">${s}</text>`;

/* ── side elevation: the stack, and where the pin is cut ─────────────────── */
// Used for shear and bending — both are about what happens ALONG the pin.
function stack(inp: PM.PinInput, res: PM.PinResult, k: Ink, mode: "shear" | "bend") {
  const t1 = Math.max(inp.t1, 0.5), t2 = Math.max(inp.t2, 0.5);
  const g = Math.max(inp.clr, 0.3), d = Math.max(inp.d, 1);
  const H = Math.max(2.6 * d, 14); // plate height in the picture
  const plates = res.double
    ? [{ x: -t2 / 2 - g - t1, w: t1, dir: -1 }, { x: -t2 / 2, w: t2, dir: 1 }, { x: t2 / 2 + g, w: t1, dir: -1 }]
    : [{ x: -g - t1, w: t1, dir: -1 }, { x: g, w: t2, dir: 1 }];
  const x0 = plates[0].x, x1 = plates[plates.length - 1].x + plates[plates.length - 1].w;
  const stick = 0.9 * d;

  let body = "";
  // pin first, so the plates sit over it
  body += `<rect x="${x0 - stick}" y="${-d / 2}" width="${x1 - x0 + 2 * stick}" height="${d}" rx="${d / 2}"
    fill="${k.fill}" stroke="${k.line}" stroke-width="0.7"/>`;
  for (const p of plates) {
    const yTop = p.dir > 0 ? -H / 2 : -d / 2 - 1;
    const h = p.dir > 0 ? H / 2 + d / 2 + 1 : H / 2 + d / 2 + 1;
    const y = p.dir > 0 ? -H / 2 : -d / 2;
    body += `<rect x="${p.x}" y="${y}" width="${p.w}" height="${h}" fill="${k.fill}"
      stroke="${k.line}" stroke-width="0.7"/>`;
    void yTop;
    // the load this member carries
    const xm = p.x + p.w / 2;
    const tip = p.dir > 0 ? -H / 2 - 5 : H / 2 + 5;
    const tail = p.dir > 0 ? -H / 2 - 0.5 : H / 2 + 0.5;
    body += arrow(xm, tail, tip, k.load);
  }
  // the pin, drawn over the plates only where it sticks out
  body += `<rect x="${x0 - stick}" y="${-d / 2}" width="${stick}" height="${d}" fill="${k.fill}" stroke="${k.line}" stroke-width="0.7"/>`;
  body += `<rect x="${x1}" y="${-d / 2}" width="${stick}" height="${d}" fill="${k.fill}" stroke="${k.line}" stroke-width="0.7"/>`;

  if (mode === "shear") {
    // the shear planes: where one member slides past the next
    for (let i = 0; i < plates.length - 1; i++) {
      const xs = (plates[i].x + plates[i].w + plates[i + 1].x) / 2;
      body += `<line x1="${xs}" y1="${-d / 2 - 2.5}" x2="${xs}" y2="${d / 2 + 2.5}"
        stroke="${k.fail}" stroke-width="1.3"/>`;
      body += `<path d="M ${xs - 2.4} ${-d / 2 - 3.4} l 4.8 0" stroke="${k.fail}" stroke-width="0.8"/>`;
    }
  } else {
    // the deflected pin: a beam bowing between its supports
    const A = 0.55 * d;
    const bow = `M ${x0 - stick} 0 Q ${(x0 + x1) / 2} ${A * 2} ${x1 + stick} 0`;
    body += `<path d="${bow}" fill="none" stroke="${k.fail}" stroke-width="1.1" stroke-dasharray="2 1.4"/>`;
  }
  const pad = 12;
  return svg(`${x0 - stick - pad} ${-H / 2 - 9} ${x1 - x0 + 2 * stick + 2 * pad} ${H + 24}`, body,
    mode === "shear" ? "Pin shear planes" : "Pin bending");
}

/* ── plan view of one flange: bearing, net section, tear-out ─────────────── */
// Orientation matters and is easy to get backwards. The load pulls the flange
// AWAY from the pin — out of the long end — so the pin reacts by pushing the
// material toward the FREE end, the one sitting at edge distance a. That is
// why the bearing crescent, the tear-out ligaments and the dimension a are all
// on the same side, opposite the arrow.
function face(inp: PM.PinInput, mb: PM.PinMember, k: Ink, mode: "bear" | "net" | "tear") {
  const d = Math.max(inp.d, 1), w = Math.max(inp.w, d + 2), a = Math.max(inp.a, d / 2 + 0.5);
  const L = Math.max(1.5 * a + d, 2.4 * d);
  const yFree = -a, hy = 0, yTail = yFree + L; // free end above, plate runs down

  let body = `<rect x="${-w / 2}" y="${yFree}" width="${w}" height="${L}" rx="0.8"
    fill="${k.fill}" stroke="${k.line}" stroke-width="0.7"/>`;

  if (mode === "bear") {
    // the pin crushing the half of the hole it presses into
    body += `<path d="M ${-d / 2} ${hy} A ${d / 2} ${d / 2} 0 0 1 ${d / 2} ${hy} Z" fill="${k.fail}" opacity="0.85"/>`;
    body += `<circle cx="0" cy="${hy}" r="${d / 2}" fill="none" stroke="${k.line}" stroke-width="0.7"/>`;
    // radial ticks showing the pressure spread over the contact
    for (const th of [-2.4, -1.9, -Math.PI / 2, -1.24, -0.74]) {
      const r0 = d / 2 + 3.2, r1 = d / 2 + 0.6;
      body += `<line x1="${r0 * Math.cos(th)}" y1="${r0 * Math.sin(th)}" x2="${r1 * Math.cos(th)}" y2="${r1 * Math.sin(th)}"
        stroke="${k.fail}" stroke-width="0.7"/>`;
    }
  } else if (mode === "net") {
    // the section that tears right across, hole removed from the width
    body += `<circle cx="0" cy="${hy}" r="${d / 2}" fill="none" stroke="${k.line}" stroke-width="0.7"/>`;
    for (const sx of [-1, 1]) {
      body += `<rect x="${sx > 0 ? d / 2 : -w / 2}" y="${hy - 1.1}" width="${(w - d) / 2}" height="2.2"
        fill="${k.fail}" opacity="0.85"/>`;
    }
  } else {
    // the two ligaments punched out, and the plug of material between them
    body += `<path d="M ${-d / 2} ${hy} L ${-d / 2} ${yFree} L ${d / 2} ${yFree} L ${d / 2} ${hy}"
      fill="${k.fail}" opacity="0.16" stroke="none"/>`;
    body += `<circle cx="0" cy="${hy}" r="${d / 2}" fill="none" stroke="${k.line}" stroke-width="0.7"/>`;
    for (const sx of [-1, 1]) {
      body += `<rect x="${sx * (d / 2) - 1.1}" y="${yFree}" width="2.2" height="${mb.lig}"
        fill="${k.fail}" opacity="0.9"/>`;
    }
  }

  // The pull: applied to the far end of the flange, dragging it off the pin.
  body += arrow(0, yTail - 1, yTail + 6, k.load);
  // Edge distance, the dimension the tear-out modes turn on.
  if (mode !== "net") {
    body += `<line x1="${w / 2 + 2.5}" y1="${yFree}" x2="${w / 2 + 2.5}" y2="${hy}" stroke="${k.faint}" stroke-width="0.4"/>`;
    body += txt(w / 2 + 4.5, (yFree + hy) / 2 + 1.4, "a", k.faint, 3.8, "start");
  } else {
    // Above the free end, clear of the pull arrow at the other end.
    body += `<line x1="${-w / 2}" y1="${yFree - 3}" x2="${w / 2}" y2="${yFree - 3}" stroke="${k.faint}" stroke-width="0.4"/>`;
    body += txt(0, yFree - 4.5, "w", k.faint, 3.8);
  }

  const pad = 11;
  return svg(`${-w / 2 - pad} ${yFree - 10} ${w + 2 * pad} ${L + 24}`, body, "Flange failure mode");
}

export type Figure = { key: string; caption: string; svg: string };

/** One figure per failure mode, in the order the report works through them. */
export function modeFigures(inp: PM.PinInput, res: PM.PinResult, forPrint = false): Figure[] {
  const k = INK(forPrint);
  const mb = res.members[res.members.length - 1]; // the member carrying all of F
  const figs: Figure[] = [
    {
      key: "shear",
      caption: res.double
        ? `<b>Pin shear</b> — cut on two planes at once, so each carries half the load. τ = ${PM.fmt(res.tau, 1)} MPa.`
        : `<b>Pin shear</b> — one plane carries everything, and the offset load path tries to rotate the joint. τ = ${PM.fmt(res.tau, 1)} MPa.`,
      svg: stack(inp, res, k, "shear"),
    },
  ];
  if (res.double)
    figs.push({
      key: "bend",
      caption: `<b>Pin bending</b> — a short beam: the middle flange pushes one way, the outer flanges hold the other. Closing the clevis gap shortens the arm. σ = ${PM.fmt(res.sigmaBend, 1)} MPa.`,
      svg: stack(inp, res, k, "bend"),
    });
  figs.push(
    {
      key: "bear",
      caption: `<b>Bearing</b> — the pin presses on the projected area d·t and the hole yields into an oval. p = ${PM.fmt(mb.pBear, 1)} MPa on the ${mb.label}.`,
      svg: face(inp, mb, k, "bear"),
    },
    {
      key: "net",
      caption: `<b>Net-section tension</b> — the flange tears straight across what is left of the width once the hole is taken out: w − d = ${PM.fmt(inp.w - inp.d, 1)} mm.`,
      svg: face(inp, mb, k, "net"),
    },
    {
      key: "tear",
      caption: `<b>Edge tear-out</b> — two ligaments shear and the plug in front of the pin is pushed out of the plate. Each ligament is a − d/2 = ${PM.fmt(mb.lig, 1)} mm.`,
      svg: face(inp, mb, k, "tear"),
    },
  );
  return figs;
}

/** The figures as a report block — a labelled grid, print-safe. */
export function figuresHTML(inp: PM.PinInput, res: PM.PinResult, forPrint = false): string {
  const k = INK(forPrint);
  return `<div class="pinfigs">` +
    modeFigures(inp, res, forPrint).map((fg) =>
      `<figure class="pinfig"><div class="pinfig-art">${fg.svg}</div>
        <figcaption style="color:${k.text}">${fg.caption}</figcaption></figure>`).join("") +
    `</div>`;
}
