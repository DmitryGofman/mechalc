// 3D viewer for the zip tie — the geometry half. The painter (projection,
// culling, depth sorting, shading) is the shared scene3d.ts.
//
// The scene is the configuration the loop-tensile rating is measured in, and
// the one everyone actually asks about: the tie looped over a rod, a cable
// bundle hanging in the loop. Pull the bundle down and the loop-apart force
// is exactly the load — the same force the rating limits.
//
// Axes: X along the rod and cables, Y up, Z across the loop plane.

import * as ZM from "./zipTieMath";
import { arrowY, dim, hex2rgb, type BuiltScene, type Poly } from "./scene3d";
import { rampColor, TENSION_STOPS } from "./stressColor";

export { drawScene, type Poly, type View, type DrawOpts, type BuiltScene } from "./scene3d";

export type SceneOpts = {
  ex: number; // STRETCH × — magnifies the loop's elastic elongation
  stressMode: boolean;
  forces: boolean;
  opaque: boolean;
};

const ARROW_LEN = 0.62; // scene units — constant so the camera never re-fits

type V3 = [number, number, number];
const mixTone = (c: { r: number; g: number; b: number }, tone: V3, f = 0.24): V3 =>
  [c.r * (1 - f) + tone[0] * f, c.g * (1 - f) + tone[1] * f, c.b * (1 - f) + tone[2] * f];

// The loop's centerline: a belt over two "pulleys" — rod above, bundle below.
// Each station carries a point (z, y) and the outward normal in the loop
// plane; the band is extruded ±w/2 along X and ±t/2 along the normal.
type Station = { z: number; y: number; nz: number; ny: number; leg: "top" | "side" | "bottom" };

function loopPath(Rt: number, Rb: number, h: number): Station[] {
  const st: Station[] = [];
  const NT = 16, NS = 7, NB = 20;
  const yT = h / 2, yB = -h / 2;
  for (let i = 0; i <= NT; i++) {
    // over the rod: from (+Rt, yT) across the top to (−Rt, yT)
    const a = (i / NT) * Math.PI;
    st.push({ z: Rt * Math.cos(a), y: yT + Rt * Math.sin(a), nz: Math.cos(a), ny: Math.sin(a), leg: "top" });
  }
  for (let i = 1; i < NS; i++) {
    // left side, slanting if the radii differ
    const f = i / NS;
    st.push({ z: -(Rt + (Rb - Rt) * f), y: yT - h * f, nz: -1, ny: 0, leg: "side" });
  }
  for (let i = 0; i <= NB; i++) {
    // under the bundle: from (−Rb, yB) around the bottom to (+Rb, yB)
    const a = Math.PI + (i / NB) * Math.PI;
    st.push({ z: Rb * Math.cos(a), y: yB + Rb * Math.sin(a), nz: Math.cos(a), ny: Math.sin(a), leg: "bottom" });
  }
  for (let i = 1; i < NS; i++) {
    // right side, back up to the rod
    const f = i / NS;
    st.push({ z: Rb + (Rt - Rb) * f, y: yB + h * f, nz: 1, ny: 0, leg: "side" });
  }
  return st;
}

export function buildScene(inp: ZM.ZipInput, res: ZM.ZipResult, o: SceneOpts): BuiltScene {
  const S: Poly[] = [];
  const { w, t } = res.size;
  const rb = Math.max(inp.bundle / 2, 1.5);
  const rr = Math.min(Math.max(0.45 * rb, 3), 9); // the rod it hangs from
  const Rt = rr + t / 2, Rb = rb + t / 2;

  // Free length between rod and bundle, stretched by the magnified elastic
  // strain — the honest exaggeration, its factor printed in the caption.
  const strain = ZM.loopStrain(res);
  const h0 = rr + rb + Math.max(16, 1.1 * rb);
  const h = h0 * (1 + Math.min(strain * o.ex, 0.3));

  const cableL = Math.max(3.4 * rb, 26);
  const rodL = cableL + 4 * rr + 14;
  const maxDim = Math.max(rodL, h + 2 * (Rt + Rb) + 8, 2.4 * Rb);
  const s = 3.1 / maxDim;

  const tone = hex2rgb(res.m.tone);
  const STEEL: V3 = [0.6, 0.64, 0.68];

  // Colour: how close each part is to ITS OWN letting-go point, in the
  // conditions on the panel. The head carries the loop rating (it is the
  // rating); the strap's own break is higher, which is why the head always
  // reads hotter — the picture is the head-efficiency lesson.
  const utilHead = Math.min(res.util, 1.35);
  const utilStrap = res.m.metal || res.strapBreak <= 0
    ? utilHead
    : Math.min(res.Ftie / res.strapBreak, 1.35);
  const strapC: V3 = o.stressMode ? mixTone(rampColor(TENSION_STOPS, utilStrap), tone) : tone;
  const headC: V3 = o.stressMode
    ? mixTone(rampColor(TENSION_STOPS, utilHead), tone, 0.18)
    : dim(tone, 0.82);

  // ── the strap loop ──
  const path = loopPath(Rt, Rb, h);
  const wx = (w / 2) * s;
  for (let i = 0; i < path.length; i++) {
    const a = path[i], b = path[i + 1] ?? path[0];
    const closing = i === path.length - 1; // the segment back to the start runs through the head
    const mid = { z: (a.z + b.z) / 2, y: (a.y + b.y) / 2 };
    const O = [0, mid.y * s, mid.z * s];
    // serration stripes on the inside of the strap, like the molded teeth
    const stripe = i % 2 === 0 ? 1 : 0.86;
    const co = strapC, ci = dim(strapC, 0.8 * stripe);
    const pt = (st: Station, x: number, out: boolean): number[] => [
      x, (st.y + (out ? 1 : -1) * (t / 2) * st.ny) * s, (st.z + (out ? 1 : -1) * (t / 2) * st.nz) * s,
    ];
    if (closing) continue; // the head occupies the seam — no bare segment there
    S.push({ p: [pt(a, -wx, true), pt(b, -wx, true), pt(b, wx, true), pt(a, wx, true)], c: co, o: O });
    S.push({ p: [pt(a, wx, false), pt(b, wx, false), pt(b, -wx, false), pt(a, -wx, false)], c: ci, o: O });
    S.push({ p: [pt(a, wx, true), pt(b, wx, true), pt(b, wx, false), pt(a, wx, false)], c: dim(co, 0.9), o: O });
    S.push({ p: [pt(a, -wx, false), pt(b, -wx, false), pt(b, -wx, true), pt(a, -wx, true)], c: dim(co, 0.9), o: O });
  }

  // ── the head, straddling the seam station ──
  // A box with the strap channel through it, oriented by the seam's tangent
  // and normal. The seam sits where loopPath begins: on the rod's +Z side.
  const seam = path[0];
  const nx: V3 = [0, seam.ny, seam.nz]; // outward normal
  const tx: V3 = [0, -seam.nz, seam.ny]; // tangent, pointing "up" the path... sign checked in test drive
  const hw = 0.95 * w, hl = 1.05 * w, hd = 2.6 * t; // half-width-ish head proportions
  const cornH = (u: number, v: number, q: number): number[] => [
    u * (hw / 2) * 1.0 * s + 0, // x
    (seam.y + nx[1] * (q * hd - t * 0.4) + tx[1] * v * hl) * s,
    (seam.z + nx[2] * (q * hd - t * 0.4) + tx[2] * v * hl) * s,
  ];
  {
    const OH = [0, (seam.y + nx[1] * hd * 0.3) * s, (seam.z + nx[2] * hd * 0.3) * s];
    const c000 = cornH(-1, -1, 0), c100 = cornH(1, -1, 0), c110 = cornH(1, 1, 0), c010 = cornH(-1, 1, 0);
    const c001 = cornH(-1, -1, 1), c101 = cornH(1, -1, 1), c111 = cornH(1, 1, 1), c011 = cornH(-1, 1, 1);
    const q = (p: number[][]) => S.push({ p, c: headC, o: OH });
    q([c001, c101, c111, c011]); // outer face
    q([c100, c000, c010, c110]); // inner face (against the mandrel side)
    q([c000, c100, c101, c001]);
    q([c110, c010, c011, c111]);
    q([c010, c000, c001, c011]);
    q([c100, c110, c111, c101]);
  }

  // ── the tail, exiting the head outward with a slight droop ──
  {
    let pz = seam.z + (hd - t * 0.4), py = seam.y;
    let dz = nx[2], dy = nx[1];
    const segs = 6, segL = Math.max(2.6 * w, 10) / segs;
    const tailC = dim(strapC, 0.94);
    for (let i = 0; i < segs; i++) {
      // rotate the direction a little toward −Y each step: molded set + gravity
      const rot = 0.16;
      const ndz = dz * Math.cos(rot) - -dy * Math.sin(rot);
      const ndy = dy * Math.cos(rot) - dz * Math.sin(rot) * 0.9;
      const qz = pz + dz * segL, qy = py + dy * segL;
      const taper = 1 - (i / segs) * 0.35;
      const O = [0, ((py + qy) / 2) * s, ((pz + qz) / 2) * s];
      // band cross-section perpendicular to travel in the zy-plane
      const nzz = -dy, nyy = dz; // path normal
      const p4 = (z: number, y: number, x: number, out: 1 | -1): number[] =>
        [x * wx * taper, (y + out * nyy * (t / 2) * 0.9) * s, (z + out * nzz * (t / 2) * 0.9) * s];
      S.push({ p: [p4(pz, py, -1, 1), p4(qz, qy, -1, 1), p4(qz, qy, 1, 1), p4(pz, py, 1, 1)], c: tailC, o: O });
      S.push({ p: [p4(pz, py, 1, -1), p4(qz, qy, 1, -1), p4(qz, qy, -1, -1), p4(pz, py, -1, -1)], c: dim(tailC, 0.8), o: O });
      S.push({ p: [p4(pz, py, 1, 1), p4(qz, qy, 1, 1), p4(qz, qy, 1, -1), p4(pz, py, 1, -1)], c: dim(tailC, 0.88), o: O });
      S.push({ p: [p4(pz, py, -1, -1), p4(qz, qy, -1, -1), p4(qz, qy, -1, 1), p4(pz, py, -1, 1)], c: dim(tailC, 0.88), o: O });
      pz = qz; py = qy; dz = ndz; dy = ndy;
      const dn = Math.hypot(dz, dy) || 1; dz /= dn; dy /= dn;
    }
  }

  // ── the rod it hangs from ──
  {
    const cy = (h / 2) * s, r = rr * s;
    const seg = 14;
    const x0 = (-rodL / 2) * s, x1 = (rodL / 2) * s;
    // draw in slices so depth sorting can interleave the strap over it
    const NSL = 10;
    for (let k = 0; k < NSL; k++) {
      const xa = x0 + ((x1 - x0) * k) / NSL, xb = x0 + ((x1 - x0) * (k + 1)) / NSL;
      tubeXs(S, cy, 0, xa, xb, r, STEEL, seg);
    }
    capX(S, cy, 0, x0, r, dim(STEEL, 0.75), seg, true);
    capX(S, cy, 0, x1, r, dim(STEEL, 0.75), seg, false);
  }

  // ── the bundle: seven cables packed in the classic 7-wire pattern ──
  {
    const cy = (-h / 2) * s;
    const rcs = rb >= 4.5 ? rb / 3 : rb; // 7-pack only when it resolves
    const centers: [number, number][] = rb >= 4.5
      ? [[0, 0], ...Array.from({ length: 6 }, (_, k) => {
          const a = (k / 6) * 2 * Math.PI + Math.PI / 6;
          return [Math.sin(a) * 2 * rcs, Math.cos(a) * 2 * rcs] as [number, number];
        })]
      : [[0, 0]];
    const tones: V3[] = [
      [0.16, 0.17, 0.19], [0.42, 0.2, 0.18], [0.18, 0.28, 0.42], [0.2, 0.36, 0.24],
      [0.4, 0.36, 0.2], [0.32, 0.32, 0.34], [0.36, 0.26, 0.38],
    ];
    const x0 = (-cableL / 2) * s, x1 = (cableL / 2) * s;
    centers.forEach(([dz, dy], i) => {
      const NSL = 6;
      for (let k = 0; k < NSL; k++) {
        const xa = x0 + ((x1 - x0) * k) / NSL, xb = x0 + ((x1 - x0) * (k + 1)) / NSL;
        tubeXs(S, cy + dy * s, dz * s, xa, xb, rcs * 0.98 * s, tones[i % tones.length], 10);
      }
      capX(S, cy + dy * s, dz * s, x0, rcs * 0.98 * s, [0.72, 0.6, 0.4], 10, true); // copper
      capX(S, cy + dy * s, dz * s, x1, rcs * 0.98 * s, [0.72, 0.6, 0.4], 10, false);
    });
  }

  // ── force arrows ──
  if (o.forces && inp.F > 0) {
    const LOAD: V3 = [0.29, 0.55, 0.82];
    const REACT: V3 = [0.31, 0.71, 0.47];
    const yB = (-h / 2 - rb) * s;
    arrowY(S, 0, 0, yB - 0.06, yB - 0.06 - ARROW_LEN, 0.05, LOAD); // weight, down
    const yT = (h / 2 + rr) * s;
    arrowY(S, 0, 0, yT + 0.06, yT + 0.06 + ARROW_LEN, 0.05, REACT); // rod reaction, up
  }

  // The bundle is the handle — grab it and pull down.
  const handles = [[0, (-h / 2) * s, 0]];
  const fitR = Math.hypot(rodL / 2, h / 2 + Math.max(Rt, Rb) + rb + ARROW_LEN + 4) * s;
  return { S, fitR, handles };
}

// Cylinders along X, drawn in short slices with per-slice reference points so
// the painter's per-polygon depth can interleave the strap over and under them.
function tubeXs(S: Poly[], cy: number, cz: number, x0: number, x1: number, r: number, c: V3, n: number) {
  const O = [(x0 + x1) / 2, cy, cz];
  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * 2 * Math.PI, a1 = ((i + 1) / n) * 2 * Math.PI;
    S.push({
      p: [
        [x0, cy + r * Math.cos(a0), cz + r * Math.sin(a0)],
        [x1, cy + r * Math.cos(a0), cz + r * Math.sin(a0)],
        [x1, cy + r * Math.cos(a1), cz + r * Math.sin(a1)],
        [x0, cy + r * Math.cos(a1), cz + r * Math.sin(a1)],
      ],
      c, o: O,
    });
  }
}
function capX(S: Poly[], cy: number, cz: number, x: number, r: number, c: V3, n: number, rev: boolean) {
  const cap: number[][] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * 2 * Math.PI;
    cap.push([x, cy + r * Math.cos(a), cz + r * Math.sin(a)]);
  }
  S.push({ p: rev ? cap.reverse() : cap, c, o: [x + (rev ? -0.2 : 0.2), cy, cz] });
}
