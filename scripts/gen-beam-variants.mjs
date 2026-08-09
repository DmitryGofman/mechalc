// Generate the tension/compression variants of the stress-beam logo.
// The beam is a quadratic arc; each variant paints the section with bands
// offset along the curve normals, colored by the app's signed stress scale
// (src/calculators/stressColor.ts): tension red on top, compression blue
// below, green at the neutral axis. Writes public/brand/<name>/icon.svg and
// prints <symbol> fragments for the design-study page to stdout.
//   node scripts/gen-beam-variants.mjs
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

// Center-line quadratic, same as the original beam mark.
const P0 = [60, 196], P1 = [300, 202], P2 = [434, 348];
const N = 16;

function point(t) {
  const a = (1 - t) * (1 - t), b = 2 * (1 - t) * t, c = t * t;
  return [a * P0[0] + b * P1[0] + c * P2[0], a * P0[1] + b * P1[1] + c * P2[1]];
}
function normal(t) {
  const tx = 2 * (1 - t) * (P1[0] - P0[0]) + 2 * t * (P2[0] - P1[0]);
  const ty = 2 * (1 - t) * (P1[1] - P0[1]) + 2 * t * (P2[1] - P1[1]);
  const len = Math.hypot(tx, ty);
  return [ty / len, -tx / len]; // unit normal pointing "up" (toward tension)
}
// Polyline offset d from the center line (d > 0 = up).
function edge(d) {
  const pts = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N, [x, y] = point(t), [nx, ny] = normal(t);
    pts.push([+(x + nx * d).toFixed(1), +(y + ny * d).toFixed(1)]);
  }
  return pts;
}
const line = (pts) => pts.map(([x, y], i) => `${i ? "L" : "M"}${x} ${y}`).join(" ");
// Closed band between offsets d1 (top edge) and d2 (bottom edge).
const band = (d1, d2) => `${line(edge(d1))} ${line(edge(d2).reverse()).replace("M", "L")} Z`;

// Signed stress scale, sampled from stressColor.ts stops (s = +1 top surface
// tension → −1 bottom surface compression, green at 0).
const RED = "#d64545", AMBER = "#d98c38", GREEN = "#4fb477", TEAL = "#3394ad", BLUE = "#4575e6";
const RAMP8 = ["#d75742", "#d87a3b", "#b69648", "#71aa67", "#48ac85", "#3a9ca0", "#378cbb", "#407dd7"];
const FRINGE5 = [RED, AMBER, GREEN, TEAL, BLUE];

// Neutral axis: drawing-convention dash-dot centerline, overshooting the tip.
function axis(color) {
  const [ex, ey] = point(1);
  const [tx, ty] = [2 * (P2[0] - P1[0]), 2 * (P2[1] - P1[1])];
  const len = Math.hypot(tx, ty);
  const over = [+(ex + (tx / len) * 30).toFixed(1), +(ey + (ty / len) * 30).toFixed(1)];
  return `<path d="${line(edge(0))} L${over[0]} ${over[1]}" fill="none" stroke="${color}"
        stroke-width="4.5" stroke-dasharray="20 9 5 9" stroke-linecap="round"/>`;
}

// Bands per variant, as [topFraction, bottomFraction, color] of half-thickness h.
function bands(h, variant) {
  const segs = [];
  if (variant === "beamsplit") {
    segs.push([1, 0.3, RED], [0.3, -0.3, "#0c141c"], [-0.3, -1, BLUE]);
  } else if (variant === "beamramp") {
    RAMP8.forEach((c, i) => segs.push([1 - i / 4, 1 - (i + 1) / 4, c]));
  } else {
    FRINGE5.forEach((c, i) => segs.push([1 - (2 * i) / 5, 1 - (2 * (i + 1)) / 5, c]));
  }
  return segs.map(([a, b, c], i) => ({ d: band(a * h, b * h), color: c, i }));
}

function beamPaint(h, variant, gradPrefix) {
  let defs = "", body = "";
  for (const { d, color, i } of bands(h, variant)) {
    if (variant === "beamfield" && color !== GREEN) {
      // each band relaxes to neutral green as the moment falls off toward the tip
      defs += `<linearGradient id="${gradPrefix}${i}" x1="92" y1="0" x2="420" y2="0" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="${color}"/><stop offset="1" stop-color="${GREEN}"/>
    </linearGradient>\n    `;
      body += `<path d="${d}" fill="url(#${gradPrefix}${i})"/>\n  `;
    } else {
      body += `<path d="${d}" fill="${color}"/>\n  `;
    }
  }
  if (variant === "beamfringe") {
    // contour lines between fringes, like a postprocessor plot
    for (let k = 1; k < 5; k++) {
      body += `<path d="${line(edge((1 - (2 * k) / 5) * h))}" fill="none" stroke="#0c141c" stroke-width="2"/>\n  `;
    }
  }
  body += axis(variant === "beamsplit" ? GREEN : "#dfe6ec");
  return { defs, body };
}

// Shared scaffolding (undeflected line, tip load, wall slab) from the chosen
// stress-beam mark, verbatim.
const SCAFFOLD_PRE = `<path d="M108 196H436" stroke="#3d4954" stroke-width="7" stroke-dasharray="4 22"
        stroke-linecap="round"/>
  <g stroke="#5a95d8" fill="#5a95d8">
    <path d="M436 128V268" stroke-width="13" stroke-linecap="round"/>
    <path d="M436 316 409 268h54z" stroke="none"/>
  </g>`;
const WALL = `<rect x="0" y="96" width="92" height="260" fill="#131b23"/>
  <g stroke="#46515c" stroke-width="6" stroke-linecap="round">
    <path d="M84 128 56 156M84 172 56 200M84 216 56 244M84 260 56 288M84 304 56 332"/>
  </g>
  <path d="M92 96V356" stroke="#6b7884" stroke-width="9" stroke-linecap="round"/>`;

const VARIANTS = ["beamsplit", "beamramp", "beamfringe", "beamfield"];
let symbols = "";

for (const v of VARIANTS) {
  const icon = beamPaint(34, v, `s-${v}-`);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <!-- "${v}" — stress-beam variant painted by signed bending stress:
       tension red above the neutral axis, compression blue below, green at
       zero. Generated by scripts/gen-beam-variants.mjs; edit that, not this. -->
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#0d131a"/>
      <stop offset="1" stop-color="#080c10"/>
    </linearGradient>
    ${icon.defs}</defs>
  <rect width="512" height="512" fill="url(#bg)"/>
  ${SCAFFOLD_PRE}
  ${icon.body}
  ${WALL}
</svg>
`;
  const dir = path.join(root, "public", "brand", v);
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, "icon.svg"), svg);
  console.error(`wrote public/brand/${v}/icon.svg`);

  // study-page fragments: full tile symbol + transparent header-mark symbol
  const tile = beamPaint(34, v, `gi-${v}-`);
  const mark = beamPaint(40, v, `gm-${v}-`);
  symbols += `    <symbol id="ic-${v}" viewBox="0 0 512 512">
      ${tile.defs}<rect width="512" height="512" fill="url(#g-bg)"/>
      ${SCAFFOLD_PRE}
      ${tile.body}
      ${WALL}
    </symbol>
    <symbol id="mk-${v}" viewBox="0 0 512 512">
      ${mark.defs}${SCAFFOLD_PRE.replace('stroke="#3d4954"', 'stroke="#46515c"')}
      ${mark.body}
      <rect x="0" y="96" width="92" height="260" fill="#10161d"/>
      <g stroke="#46515c" stroke-width="11" stroke-linecap="round">
        <path d="M82 130 54 158M82 174 54 202M82 218 54 246M82 262 54 290M82 306 54 334"/>
      </g>
      <path d="M92 96V356" stroke="#8b97a3" stroke-width="15" stroke-linecap="round"/>
    </symbol>
`;
}
console.log(symbols);
