// 3D viewer for the pin/bolt shear joint — the geometry half. The painter
// (projection, culling, depth sorting, shading) is shared in scene3d.ts.
//
// Axes: X along the pin, Y along the load (each flange pulls its own way),
// Z across the plate width.
//
// The picture has one job the numbers cannot do: show WHERE each mode lives.
// So the plates are not painted a single flat colour — each face is split into
// zones and every zone carries its own check:
//
//   the crescent around the loaded half of the hole  → bearing
//   the ligament between hole and the loaded edge    → tear-out
//   the flanks either side of the hole               → net section
//   the pin at each shear plane                      → shear
//   the pin between the planes (clevis)              → bending
//
// Deformation is exaggerated: the flanges slide apart and the pin steps at the
// shear planes, so a joint heading for failure visibly comes apart.

import * as PM from "./pinMath";
import { arrowY, dim, hex2rgb, type BuiltScene, type Poly } from "./scene3d";

export { drawScene, type Poly, type View, type DrawOpts, type BuiltScene } from "./scene3d";

export type PinSceneOpts = {
  ex: number;        // deformation × — how far the slip is magnified
  explode: number;   // 0..1 — pulls the stack apart along the pin
  stressMode: boolean;
  forces: boolean;
};

const ARROW_LEN = 0.7; // constant, so the camera never re-fits with load
const ARROW: [number, number, number] = [0.29, 0.55, 0.82];

const wrapPi = (x: number) => Math.atan2(Math.sin(x), Math.cos(x));

// Ray from the hole centre out to the plate outline, in plate-local (z, y).
function rayRect(th: number, zmin: number, zmax: number, ymin: number, ymax: number): [number, number] {
  const c = Math.cos(th), s = Math.sin(th);
  let t = Infinity;
  if (c > 1e-9) t = Math.min(t, zmax / c);
  if (c < -1e-9) t = Math.min(t, zmin / c);
  if (s > 1e-9) t = Math.min(t, ymax / s);
  if (s < -1e-9) t = Math.min(t, ymin / s);
  return [c * t, s * t];
}

type PlateLayout = {
  x0: number; x1: number;      // extent along the pin
  dir: 1 | -1;                 // which way this flange is pulled
  m: PM.PinMember;
  ymin: number; ymax: number;  // plate outline in local Y
};

export function layoutPlates(inp: PM.PinInput, res: PM.PinResult) {
  const t1 = Math.max(inp.t1, 0.1), t2 = Math.max(inp.t2, 0.1), g = Math.max(inp.clr, 0);
  // How far each flange runs on past the hole. Only enough to read as a plate —
  // a longer tail buys nothing and squeezes the joint itself down in frame.
  const L = Math.max(2 * inp.d, inp.a + inp.d, 0.5 * inp.w);
  // The loaded edge sits at a from the hole on the side the flange pulls FROM;
  // the plate runs away the other way.
  const mk = (x0: number, x1: number, m: PM.PinMember, dir: 1 | -1): PlateLayout => ({
    x0, x1, m, dir,
    ymin: dir > 0 ? -inp.a : -L,
    ymax: dir > 0 ? L : inp.a,
  });
  const plates: PlateLayout[] = res.double
    ? [
        mk(-t2 / 2 - g - t1, -t2 / 2 - g, res.members[0], -1),
        mk(-t2 / 2, t2 / 2, res.members[1], 1),
        mk(t2 / 2 + g, t2 / 2 + g + t1, res.members[0], -1),
      ]
    : [mk(-g - t1, -g, res.members[0], -1), mk(0, t2, res.members[1], 1)];
  const stick = 1.15 * inp.d; // pin overhang past the stack
  return { plates, L, stick, X0: plates[0].x0 - stick, X1: plates[plates.length - 1].x1 + stick };
}

export function buildScene(inp: PM.PinInput, res: PM.PinResult, o: PinSceneOpts): BuiltScene {
  const S: Poly[] = [];
  const handles: number[][] = [];
  const d = Math.max(inp.d, 0.1);
  const lay = layoutPlates(inp, res);
  const maxDim = Math.max(lay.X1 - lay.X0, 2 * lay.L, inp.w);
  const s = 3.3 / maxDim;

  // Utilization, not safety factor: it stays finite and linear as load → 0, so
  // the picture fades to neutral at zero load instead of dividing by zero.
  const util = (sf: number) => (isFinite(sf) ? 1 / sf : 0);
  const uJoint = Math.min(util(res.SFjoint), 1.35);
  const slip = 0.16 * d * Math.min(uJoint, 1.2) * (o.ex / 40); // exaggerated relative slide
  const exp = o.explode * 1.1 * d;

  // Zone colour: the material's own tone, warmed toward the ramp as its check
  // approaches the allowable. Scaled against the ALLOWABLE, never the live
  // peak — every stress is linear in load, so normalising by the current
  // maximum would divide the load back out and freeze the picture.
  const zoneColor = (tone: [number, number, number], u: number): [number, number, number] => {
    if (!o.stressMode) return tone;
    const hot = PM.utilRGB(Math.min(u, 1.35));
    const m = Math.min(1, 0.1 + (0.9 * Math.min(u, 1.3)) / 1.3);
    return [tone[0] + (hot[0] - tone[0]) * m, tone[1] + (hot[1] - tone[1]) * m, tone[2] + (hot[2] - tone[2]) * m];
  };

  const nP = lay.plates.length;
  const plX = lay.plates.map((_, i) => (i - (nP - 1) / 2) * exp);
  const plY = lay.plates.map((p) => (p.dir * slip) / 2);

  // ── the flanges ──
  const NA = 26;
  for (let pi = 0; pi < nP; pi++) {
    const p = lay.plates[pi], ox = plX[pi], oy = plY[pi];
    // The material tones are picked for flat SVG fills; under the painter's
    // 0.3 ambient a face angled away from the light lands near black and the
    // whole flange reads as a silhouette. Lift them into the range the shading
    // can actually work over.
    const tone = hex2rgb(p.m.mat.tone).map((t) => Math.min(1, t * 1.45 + 0.1)) as [number, number, number];
    const uB = util(p.m.SFbearPlate), uT = util(p.m.SFtear), uN = util(p.m.SFnet);
    const thPress = (-p.dir * Math.PI) / 2; // where the pin presses = the tear-out side
    const P = (x: number, vz: number, vy: number) => [(x + ox) * s, (vy + oy) * s, vz * s];

    // Which check owns this patch of face. ring 0 is the collar around the
    // hole, ring 1 the material out to the plate edge.
    const zoneU = (thMid: number, ring: 0 | 1) => {
      const dPress = Math.abs(wrapPi(thMid - thPress));
      if (ring === 0) return dPress < Math.PI / 3 ? uB : 0.35 * uB;
      if (dPress < 0.62) return uT;                          // ligament to the loaded edge
      if (Math.abs(Math.cos(thMid)) > 0.82) return uN;       // flanks: the net section
      return 0.3 * Math.max(uT, uN);
    };

    // Angles: a uniform fan plus the exact plate corners, so the outline stays
    // a rectangle rather than a polygon that clips its own corners.
    const corners = [
      [p.ymin, -inp.w / 2], [p.ymin, inp.w / 2], [p.ymax, -inp.w / 2], [p.ymax, inp.w / 2],
    ].map(([vy, vz]) => Math.atan2(vy, vz));
    const angs = [...Array(NA)].map((_, i) => -Math.PI + (2 * Math.PI * i) / NA)
      .concat(corners).sort((x, y) => x - y);

    for (const xf of [p.x0, p.x1]) {
      const front = xf === p.x1;
      const O = [(xf + ox) * s, oy * s, 0]; // face reference for culling
      for (let i = 0; i < angs.length; i++) {
        const a0 = angs[i], a1 = i + 1 < angs.length ? angs[i + 1] : angs[0] + 2 * Math.PI;
        if (a1 - a0 < 1e-5) continue;
        const am = (a0 + a1) / 2;
        const h0: [number, number] = [(d / 2) * Math.cos(a0), (d / 2) * Math.sin(a0)];
        const h1: [number, number] = [(d / 2) * Math.cos(a1), (d / 2) * Math.sin(a1)];
        const b0 = rayRect(a0, -inp.w / 2, inp.w / 2, p.ymin, p.ymax);
        const b1 = rayRect(a1, -inp.w / 2, inp.w / 2, p.ymin, p.ymax);
        const m0 = [h0[0] + (b0[0] - h0[0]) * 0.42, h0[1] + (b0[1] - h0[1]) * 0.42];
        const m1 = [h1[0] + (b1[0] - h1[0]) * 0.42, h1[1] + (b1[1] - h1[1]) * 0.42];
        const inner = [P(xf, h0[0], h0[1]), P(xf, h1[0], h1[1]), P(xf, m1[0], m1[1]), P(xf, m0[0], m0[1])];
        const outer = [P(xf, m0[0], m0[1]), P(xf, m1[0], m1[1]), P(xf, b1[0], b1[1]), P(xf, b0[0], b0[1])];
        S.push({ p: front ? inner : inner.slice().reverse(), c: zoneColor(tone, zoneU(am, 0)), o: O });
        S.push({ p: front ? outer : outer.slice().reverse(), c: zoneColor(tone, zoneU(am, 1)), o: O });
      }
    }

    // Plate edges. The one facing the load is the tear-out edge — the surface
    // that would actually be pushed out of the plate.
    const O = [((p.x0 + p.x1) / 2 + ox) * s, oy * s, 0];
    const edges: Array<[[number, number], [number, number]]> = [
      [[-inp.w / 2, p.ymin], [inp.w / 2, p.ymin]],
      [[inp.w / 2, p.ymin], [inp.w / 2, p.ymax]],
      [[inp.w / 2, p.ymax], [-inp.w / 2, p.ymax]],
      [[-inp.w / 2, p.ymax], [-inp.w / 2, p.ymin]],
    ];
    for (const [[za, ya], [zb, yb]] of edges) {
      const isTear = (p.dir > 0 && ya === p.ymin && yb === p.ymin) || (p.dir < 0 && ya === p.ymax && yb === p.ymax);
      S.push({
        p: [P(p.x0, za, ya), P(p.x0, zb, yb), P(p.x1, zb, yb), P(p.x1, za, ya)],
        c: zoneColor(tone, isTear ? uT : 0.25 * util(p.m.worst)),
        o: O,
      });
    }

    // Hole bore — the surface the pin actually bears on.
    for (let i = 0; i < NA; i++) {
      const a0 = -Math.PI + (2 * Math.PI * i) / NA, a1 = -Math.PI + (2 * Math.PI * (i + 1)) / NA;
      const am = (a0 + a1) / 2, rr = (d / 2) * 1.02;
      const c0 = [rr * Math.cos(a0), rr * Math.sin(a0)], c1 = [rr * Math.cos(a1), rr * Math.sin(a1)];
      const u = Math.abs(wrapPi(am - thPress)) < Math.PI / 2 ? uB : 0.15;
      S.push({
        p: [P(p.x0, c0[0], c0[1]), P(p.x0, c1[0], c1[1]), P(p.x1, c1[0], c1[1]), P(p.x1, c0[0], c0[1])],
        c: zoneColor(dim(tone, 0.55), u),
      });
    }
  }

  // ── the pin ──
  // Brightened against the flanges so it reads as the separate machined part.
  const pinTone = hex2rgb(res.pinTone).map((t) => Math.min(1, t * 1.6 + 0.14)) as [number, number, number];
  const uShear = util(res.SFshear), uBend = util(res.SFbend), uBearPin = util(res.SFbearPinAll);

  // Each slice follows whichever flange it is inside, so the pin visibly STEPS
  // at every shear plane instead of staying a straight cylinder.
  const yPin = (x: number) => {
    for (let i = 0; i < nP; i++) {
      const p = lay.plates[i];
      if (x >= p.x0 + plX[i] - 1e-9 && x <= p.x1 + plX[i] + 1e-9) return plY[i];
    }
    let prev: { x: number; y: number } | null = null, next: { x: number; y: number } | null = null;
    for (let i = 0; i < nP; i++) {
      const x0 = lay.plates[i].x0 + plX[i], x1 = lay.plates[i].x1 + plX[i];
      if (x > x1 && (!prev || x1 > prev.x)) prev = { x: x1, y: plY[i] };
      if (x < x0 && (!next || x0 < next.x)) next = { x: x0, y: plY[i] };
    }
    if (prev && next) {
      const t = (x - prev.x) / (next.x - prev.x || 1e-9);
      return prev.y + (next.y - prev.y) * t;
    }
    return prev ? prev.y : next ? next.y : 0;
  };

  const uPin = (x: number) => {
    for (let i = 0; i < nP - 1; i++) {
      const xs = (lay.plates[i].x1 + plX[i] + lay.plates[i + 1].x0 + plX[i + 1]) / 2;
      if (Math.abs(x - xs) < Math.max(d / 3, 0.8)) return uShear;
    }
    for (let i = 0; i < nP; i++) {
      const p = lay.plates[i];
      if (x >= p.x0 + plX[i] && x <= p.x1 + plX[i]) return Math.max(0.9 * uBearPin, p.dir > 0 ? uBend : 0);
    }
    return 0.12;
  };

  const XP0 = lay.X0 - ((nP - 1) / 2) * exp, XP1 = lay.X1 + ((nP - 1) / 2) * exp;
  const NL = 34, NC = 16;
  for (let k = 0; k < NL; k++) {
    const xa = XP0 + ((XP1 - XP0) * k) / NL, xb = XP0 + ((XP1 - XP0) * (k + 1)) / NL;
    const ya = yPin(xa), yb = yPin(xb);
    const c = zoneColor(pinTone, uPin((xa + xb) / 2));
    const O = [((xa + xb) / 2) * s, ((ya + yb) / 2) * s, 0];
    for (let i = 0; i < NC; i++) {
      const b0 = (2 * Math.PI * i) / NC, b1 = (2 * Math.PI * (i + 1)) / NC;
      S.push({
        p: [
          [xa * s, (ya + (d / 2) * Math.sin(b0)) * s, ((d / 2) * Math.cos(b0)) * s],
          [xa * s, (ya + (d / 2) * Math.sin(b1)) * s, ((d / 2) * Math.cos(b1)) * s],
          [xb * s, (yb + (d / 2) * Math.sin(b1)) * s, ((d / 2) * Math.cos(b1)) * s],
          [xb * s, (yb + (d / 2) * Math.sin(b0)) * s, ((d / 2) * Math.cos(b0)) * s],
        ],
        c, o: O,
      });
    }
  }
  // A hollow pin gets its bore drawn: the inner wall, darkened, plus annular
  // end caps instead of discs — so "tube" is visible rather than just a number.
  const ri = res.di / 2;
  if (ri > 0) {
    for (let k = 0; k < NL; k++) {
      const xa = XP0 + ((XP1 - XP0) * k) / NL, xb = XP0 + ((XP1 - XP0) * (k + 1)) / NL;
      const ya = yPin(xa), yb = yPin(xb);
      const c = dim(zoneColor(pinTone, uPin((xa + xb) / 2)), 0.45);
      for (let i = 0; i < NC; i++) {
        const b0 = (2 * Math.PI * i) / NC, b1 = (2 * Math.PI * (i + 1)) / NC;
        // Wound the other way round: this surface faces the axis, and it must
        // never be culled — it is the only thing that reads as a bore.
        S.push({
          p: [
            [xa * s, (ya + ri * Math.sin(b1)) * s, (ri * Math.cos(b1)) * s],
            [xa * s, (ya + ri * Math.sin(b0)) * s, (ri * Math.cos(b0)) * s],
            [xb * s, (yb + ri * Math.sin(b0)) * s, (ri * Math.cos(b0)) * s],
            [xb * s, (yb + ri * Math.sin(b1)) * s, (ri * Math.cos(b1)) * s],
          ],
          c,
        });
      }
    }
  }
  // End caps — a full disc for a solid pin, an annulus for a tube.
  for (const [xe, sgn] of [[XP0, -1], [XP1, 1]] as const) {
    const ye = yPin(xe), c = zoneColor(dim(pinTone, 0.8), 0.12);
    const ring = (r: number, b: number) => [xe * s, (ye + r * Math.sin(b)) * s, (r * Math.cos(b)) * s];
    if (ri <= 0) {
      const cap: number[][] = [];
      for (let i = 0; i < NC; i++) cap.push(ring(d / 2, (2 * Math.PI * i) / NC));
      S.push({ p: sgn > 0 ? cap : cap.slice().reverse(), c });
    } else {
      for (let i = 0; i < NC; i++) {
        const b0 = (2 * Math.PI * i) / NC, b1 = (2 * Math.PI * (i + 1)) / NC;
        const q = [ring(ri, b0), ring(d / 2, b0), ring(d / 2, b1), ring(ri, b1)];
        S.push({ p: sgn > 0 ? q : q.slice().reverse(), c });
      }
    }
  }

  // ── force arrows, and the pull handle ──
  // The handle is the tip of the loaded flange's arrow: grab it and drag to
  // pull the joint. It is published in scene space and comes back projected.
  for (let pi = 0; pi < nP; pi++) {
    const p = lay.plates[pi];
    const yEnd = (p.dir > 0 ? p.ymax : p.ymin) + plY[pi];
    const xm = ((p.x0 + p.x1) / 2 + plX[pi]) * s;
    const tail = (yEnd + p.dir * 0.35 * d) * s;
    const tip = tail + p.dir * ARROW_LEN;
    if (p.dir > 0) handles.push([xm, tip, 0]);
    if (o.forces && inp.F > 0) {
      const c = hex2rgb(PM.sfColor(p.m.worst));
      arrowY(S, xm, 0, tail, tip, (d / 2) * 0.5 * s, p.dir > 0 ? c : ARROW);
    }
  }

  // Camera bound from the STATIC envelope — including the FULL explode travel,
  // so opening the stack pans nothing. Deriving it from the live polygons would
  // re-fit the frame on every load change, which reads as jumping.
  const explodeMax = ((nP - 1) / 2) * 1.1 * d; // what plX reaches at explode = 1
  // The envelope is a box bound on a cross-shaped object, so its corner
  // diagonal sits well outside the actual silhouette; 0.8 frames what you see
  // rather than the empty corners.
  const fitR = 0.8 * Math.hypot(
    (Math.max(Math.abs(lay.X0), Math.abs(lay.X1)) + explodeMax) * s,
    lay.L * s + ARROW_LEN,
    (inp.w / 2) * s,
  );
  return { S, fitR, handles };
}
