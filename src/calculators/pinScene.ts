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
//   the pin, along its length                        → its own shear and
//                                                      moment diagrams
//
// The pin's colour is a DISTRIBUTION, not one number. Painting it flat was
// wrong twice over: the whole pin reddened when only its mid-span was failing,
// and the exploded view keyed off shear, so a pin governed by bending stayed
// calm exactly where it was giving way.
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
  // The mix must be COMPLETE by the time the check reaches its allowable. It
  // used to keep blending in a fifth of the grey material tone right through
  // failure, and with the painter's shading on top a face angled from the
  // light landed on dark maroon — so "at the limit" read no hotter than
  // "working hard", and only a joint loaded far past failure ever looked red.
  const zoneColor = (tone: [number, number, number], u: number): [number, number, number] => {
    if (!o.stressMode) return tone;
    const hot = PM.utilRGB(u);
    const m = Math.min(1, u / 0.9);
    return [tone[0] + (hot[0] - tone[0]) * m, tone[1] + (hot[1] - tone[1]) * m, tone[2] + (hot[2] - tone[2]) * m];
  };

  const nP = lay.plates.length;
  const plX = lay.plates.map((_, i) => (i - (nP - 1) / 2) * exp);
  const plY = lay.plates.map((p) => (p.dir * slip) / 2);
  // Withdrawing the pin upward would leave the assembly hanging in the top of
  // the frame with dead space beneath, so the whole scene slides down by half
  // the withdrawal and the composition stays centred as it opens.
  const pinLift = o.explode * (lay.L + 0.8 * d);
  const yShift = -pinLift / 2;

  // ── the flanges ──
  // Depth is per polygon, so a big face sorts by one centroid and can win
  // against something genuinely nearer — that is the breakup that appears at
  // particular angles. The cure is the clamp viewer's: keep every face small.
  // The face fan is finer, and the material out to the plate edge is split
  // into RINGS rather than one long quad reaching the rim.
  const NA = 44;
  const RINGS = [0, 0.22, 0.48, 0.74, 1]; // fractions from hole edge to plate edge
  for (let pi = 0; pi < nP; pi++) {
    const p = lay.plates[pi], ox = plX[pi], oy = plY[pi] + yShift;
    // The material tones are picked for flat SVG fills; under the painter's
    // 0.3 ambient a face angled away from the light lands near black and the
    // whole flange reads as a silhouette. Lift them into the range the shading
    // can actually work over.
    const tone = hex2rgb(p.m.mat.tone).map((t) => Math.min(1, t * 1.2 + 0.05)) as [number, number, number];
    const uB = util(p.m.SFbearPlate), uT = util(p.m.SFtear), uN = util(p.m.SFnet);
    const thPress = (-p.dir * Math.PI) / 2; // where the pin presses = the tear-out side
    const P = (x: number, vz: number, vy: number) => [(x + ox) * s, (vy + oy) * s, vz * s];

    // Which check owns this patch of face. Classified by WHERE the patch is,
    // not by the angle it sits at: an angular sector fans out as it goes,
    // so the tear-out zone came out as a widening wedge reaching the rim —
    // wrong as engineering and, on screen, indistinguishable from a rendering
    // fault. The real ligaments are a straight band of the hole's width
    // running to the free edge, and the net section is a band across it.
    const sgn = -p.dir;                       // toward the free edge, in local y
    const bandZ = (d / 2) * 1.25;             // half-width of the tear-out band
    const bandY = Math.max(0.45 * d, 1.6);    // half-height of the net-section band
    // Blend the zones instead of switching between them. A hard test drawn on
    // a polar mesh cannot make a straight-edged band: rays crowd together near
    // the rim, so the cells there are wide and the boundary comes out as a
    // stepped fan that reads as a rendering fault. A smooth falloff has no
    // boundary to alias, and a stress field is what this actually is.
    const fade = (x: number) => { const t = Math.max(0, Math.min(1, 1 - x)); return t * t * (3 - 2 * t); };
    const zoneU = (cz: number, cy: number, ring: 0 | 1) => {
      if (ring === 0) {
        // the collar the pin bears into — hot only on the side it presses
        const off = Math.abs(wrapPi(Math.atan2(cy, cz) - thPress));
        return uB * (0.3 + 0.7 * fade(off / (Math.PI / 2)));
      }
      const wTear = cy * sgn > 0 ? fade(Math.abs(cz) / bandZ) : 0;
      const wNet = Math.abs(cz) > d / 2 ? fade(Math.abs(cy) / bandY) : 0;
      return Math.max(uT * wTear, uN * wNet, 0.22 * Math.max(uT, uN));
    };

    // Angles: a uniform fan plus the exact plate corners, so the outline stays
    // a rectangle rather than a polygon that clips its own corners.
    const corners = [
      [p.ymin, -inp.w / 2], [p.ymin, inp.w / 2], [p.ymax, -inp.w / 2], [p.ymax, inp.w / 2],
    ].map(([vy, vz]) => Math.atan2(vy, vz));
    const angs = [...Array(NA)].map((_, i) => -Math.PI + (2 * Math.PI * i) / NA)
      .concat(corners).sort((x, y) => x - y);

    // Culling reference: the CENTRE OF THE PLATE, never a point on the face
    // being drawn. "Outward" is derived as the direction from this point to
    // the face; put it in the face's own plane and that direction lies flat
    // along the face, the dot against the normal vanishes, and its sign comes
    // out of rounding noise — half the cells then cull and the flange breaks
    // into wedges at particular angles. From mid-thickness the sign is
    // unambiguous for both faces.
    const Oplate = [((p.x0 + p.x1) / 2 + ox) * s, oy * s, 0];
    for (const xf of [p.x0, p.x1]) {
      const front = xf === p.x1;
      const O = Oplate;
      for (let i = 0; i < angs.length; i++) {
        const a0 = angs[i], a1 = i + 1 < angs.length ? angs[i + 1] : angs[0] + 2 * Math.PI;
        if (a1 - a0 < 1e-5) continue;
        const h0: [number, number] = [(d / 2) * Math.cos(a0), (d / 2) * Math.sin(a0)];
        const h1: [number, number] = [(d / 2) * Math.cos(a1), (d / 2) * Math.sin(a1)];
        const b0 = rayRect(a0, -inp.w / 2, inp.w / 2, p.ymin, p.ymax);
        const b1 = rayRect(a1, -inp.w / 2, inp.w / 2, p.ymin, p.ymax);
        // Walk out from the hole edge to the plate edge in rings, so no single
        // face spans the whole flange.
        const at = (t: number, h: [number, number], b: [number, number]) =>
          [h[0] + (b[0] - h[0]) * t, h[1] + (b[1] - h[1]) * t] as [number, number];
        for (let r = 0; r < RINGS.length - 1; r++) {
          const t0 = RINGS[r], t1 = RINGS[r + 1];
          const q0 = at(t0, h0, b0), q1 = at(t0, h1, b1);
          const q2 = at(t1, h1, b1), q3 = at(t1, h0, b0);
          const face = [P(xf, q0[0], q0[1]), P(xf, q1[0], q1[1]), P(xf, q2[0], q2[1]), P(xf, q3[0], q3[1])];
          const cz = (q0[0] + q1[0] + q2[0] + q3[0]) / 4, cy = (q0[1] + q1[1] + q2[1] + q3[1]) / 4;
          // The first ring is the collar the pin bears into; the rest is the
          // body of the flange, where tear-out and net section live.
          S.push({ p: front ? face : face.slice().reverse(), c: zoneColor(tone, zoneU(cz, cy, r === 0 ? 0 : 1)), o: O });
        }
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
  const uShear = util(res.SFshear), uBend = util(res.SFbend);

  // Everything about the pin is reckoned in TRUE coordinates — the joint as
  // built — and only mapped to drawn positions at the end. Exploding the stack
  // must not change the physics: computing the moment diagram from the drawn
  // positions lengthened the bending arm as the view opened, so the colours
  // shifted while the joint stood still.
  //
  // Which flange a point on the pin belongs to, and hence how far it has
  // slipped, and where it is drawn once the stack is opened out.
  const spanOf = (x: number) => {
    for (let i = 0; i < nP; i++) {
      const p = lay.plates[i];
      if (x >= p.x0 - 1e-9 && x <= p.x1 + 1e-9) return { inside: i, prev: i, next: i, t: 0 };
    }
    let prev = -1, next = -1;
    for (let i = 0; i < nP; i++) {
      if (x > lay.plates[i].x1) prev = i;
      if (x < lay.plates[i].x0 && next < 0) next = i;
    }
    if (prev >= 0 && next >= 0) {
      const a = lay.plates[prev].x1, b = lay.plates[next].x0;
      return { inside: -1, prev, next, t: (x - a) / (b - a || 1e-9) };
    }
    const only = prev >= 0 ? prev : next >= 0 ? next : 0;
    return { inside: -1, prev: only, next: only, t: 0 };
  };
  const lerpBy = (x: number, arr: number[]) => {
    const s2 = spanOf(x);
    if (s2.inside >= 0) return arr[s2.inside];
    return arr[s2.prev] + (arr[s2.next] - arr[s2.prev]) * s2.t;
  };
  // Each slice follows whichever flange it is inside, so the pin visibly STEPS
  // at every shear plane instead of staying a straight cylinder.
  //
  // Exploding also WITHDRAWS the pin, fully clear of the stack. Spreading the
  // flanges along the pin can never expose its middle — the peak bending
  // moment is at mid-span, directly under the flange that causes it — so the
  // one place the pin is actually failing stayed hidden. Lifting it right out
  // shows the whole length with its whole distribution, and, since nothing
  // then interpenetrates anything, removes the sorting hazard that let a
  // buried pin punch through a flange. It stays aligned along x, so you can
  // still read which stretch of pin sat in which flange.
  const yPin = (x: number) => lerpBy(x, plY) + pinLift + yShift;
  // True position → where it is drawn once the stack is exploded.
  const xDraw = (x: number) => x + lerpBy(x, plX);

  // ── where along the pin each check actually bites ────────────────────────
  // Painting the pin one flat colour was wrong in both directions: assembled,
  // the whole pin went red when only its mid-span was failing; exploded, the
  // per-slice guess keyed off shear, so a pin governed by BENDING stayed calm
  // exactly where it was giving way. The honest answer is the pin's own shear
  // and moment diagrams.
  //
  // Each flange delivers its share of the load spread over its own thickness:
  // the middle flange pushes one way with F, the outer flanges hold the other
  // with F/2 each. Integrate that once for shear, twice for moment.
  const NS = 240;
  const xa0 = lay.X0, xa1 = lay.X1;           // true, unexploded
  const dxS = (xa1 - xa0) / NS;
  const Vx: number[] = [], Mx: number[] = [];
  {
    let V = 0, M = 0;
    for (let i = 0; i <= NS; i++) {
      const x = xa0 + i * dxS;
      let w = 0; // load per unit length on the pin at x
      for (let j = 0; j < nP; j++) {
        const p = lay.plates[j];
        if (x >= p.x0 && x <= p.x1) w += (p.dir * p.m.share * Math.max(inp.F, 0)) / Math.max(p.x1 - p.x0, 1e-9);
      }
      M += V * dxS;      // moment is the running integral of shear
      V += w * dxS;      // shear is the running integral of load
      Vx.push(V); Mx.push(M);
    }
  }
  const Vpk = Math.max(...Vx.map(Math.abs), 1e-9);
  const Mpk = Math.max(...Mx.map(Math.abs), 1e-9);
  const sampleAt = (arr: number[], x: number) => {
    const t = Math.max(0, Math.min(NS, ((x - xa0) / dxS)));
    const i = Math.min(Math.floor(t), NS - 1);
    return arr[i] + (arr[i + 1] - arr[i]) * (t - i);
  };

  // Local utilization: whichever check is worst AT THIS POINT, scaled by how
  // much of its own peak the pin is carrying here. So a pin failing in bending
  // reddens at mid-span and stays cool at the ends; one failing in shear
  // reddens at the planes; and one being crushed reddens inside the flange
  // doing the crushing.
  const uPin = (x: number) => {
    const uV = uShear * (Math.abs(sampleAt(Vx, x)) / Vpk);
    const uM = res.double ? uBend * (Math.abs(sampleAt(Mx, x)) / Mpk) : 0;
    let uP = 0;
    for (let i = 0; i < nP; i++) {
      const p = lay.plates[i];
      if (x >= p.x0 && x <= p.x1) uP = Math.max(uP, util(p.m.SFbearPin));
    }
    return Math.max(uV, uM, uP);
  };

  // The pin fills its hole, so any slice inside a flange is completely hidden
  // by that flange — and a painter's algorithm can never sort it correctly:
  // at some angles the slice's centroid beats the face's and the pin punches
  // straight through the plate. The clamp viewer solved the same thing the
  // same way: don't emit what cannot be seen. Exploding the stack pulls those
  // slices into the open, and then they are drawn.
  const buried = (x: number) => {
    for (let i = 0; i < nP; i++) {
      const p = lay.plates[i];
      if (x > p.x0 + 1e-6 && x < p.x1 - 1e-6) return true;
    }
    return false;
  };
  const hideBuried = o.explode < 0.06;

  // Walk the pin in TRUE coordinates, draw each slice where the explode
  // transform puts it. Sampling in drawn space instead would stretch the load
  // distribution along with the view.
  const NL = 56, NC = 16;
  for (let k = 0; k < NL; k++) {
    const ta = lay.X0 + ((lay.X1 - lay.X0) * k) / NL, tb = lay.X0 + ((lay.X1 - lay.X0) * (k + 1)) / NL;
    const tm = (ta + tb) / 2;
    if (hideBuried && buried(tm)) continue;
    const xa = xDraw(ta), xb = xDraw(tb);
    const ya = yPin(ta), yb = yPin(tb);
    const c = zoneColor(pinTone, uPin(tm));
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
      const ta = lay.X0 + ((lay.X1 - lay.X0) * k) / NL, tb = lay.X0 + ((lay.X1 - lay.X0) * (k + 1)) / NL;
      const tm = (ta + tb) / 2;
      if (hideBuried && buried(tm)) continue;
      const xa = xDraw(ta), xb = xDraw(tb);
      const ya = yPin(ta), yb = yPin(tb);
      const c = dim(zoneColor(pinTone, uPin(tm)), 0.45);
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
  for (const [te, sgn] of [[lay.X0, -1], [lay.X1, 1]] as const) {
    const xe = xDraw(te), ye = yPin(te), c = zoneColor(dim(pinTone, 0.8), uPin(te));
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
    const yEnd = (p.dir > 0 ? p.ymax : p.ymin) + plY[pi] + yShift;
    const xm = ((p.x0 + p.x1) / 2 + plX[pi]) * s;
    const tail = (yEnd + p.dir * 0.35 * d) * s;
    const tip = tail + p.dir * ARROW_LEN;
    if (p.dir > 0) handles.push([xm, tip, 0]);
    // One neutral colour for every load arrow. They show the load, not a
    // stress — painting the loaded flange's arrow by its own safety factor put
    // a calm green arrow on a joint sitting exactly at failure.
    if (o.forces && inp.F > 0) arrowY(S, xm, 0, tail, tip, (d / 2) * 0.5 * s, ARROW);
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
    ((lay.L + (lay.L + 0.8 * d) / 2 + d) * s) + ARROW_LEN, // incl. the withdrawn pin
    (inp.w / 2) * s,
  );
  return { S, fitR, handles };
}
