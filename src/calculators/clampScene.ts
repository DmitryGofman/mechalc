// 3D viewer for the cylinder clamp — a dependency-free canvas painter, the
// same idiom as the toolkit's other 3D views (no CDN, works offline).
//
// Axes: X along the cylinder, Y up (cap above base), Z across (the ears).
//
// Two things a painter's algorithm gets wrong unless you handle them, and both
// showed up in testing:
//   · Winding is not uniform across swept profiles and revolved solids, so
//     back-face culling cannot trust it. Each face is oriented from its parent
//     solid's centroid instead.
//   · Depth is per polygon, so one large face can sort in front of something
//     genuinely nearer. Every face is kept small, and geometry buried inside an
//     opaque body is simply not emitted.

import * as CM from "./clampMath";

export type Poly = { p: number[][]; c: [number, number, number]; o?: number[] };
export type View = { yaw: number; pitch: number; dist: number };
export type SceneOpts = {
  ex: number; // SPLIT × — magnifies the gap and every deflection together
  stressMode: boolean;
  contrast: boolean; // √ transfer, so the weak field is still readable
  forces: boolean;
  cut: boolean; // half section
  opaque: boolean;
};

const ARROW_LEN = 0.8; // constant, so the camera never re-fits with load

const hex2rgb = (h: string): [number, number, number] => {
  const n = parseInt(h.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
};

function frustumY(
  S: Poly[], cx: number, cz: number, y0: number, y1: number,
  r0: number, r1: number, c: [number, number, number], n: number, noCull?: boolean,
) {
  const O = noCull ? undefined : [cx, (y0 + y1) / 2, cz];
  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * 2 * Math.PI, a1 = ((i + 1) / n) * 2 * Math.PI;
    const A = [cx + r0 * Math.cos(a0), y0, cz + r0 * Math.sin(a0)];
    const B = [cx + r0 * Math.cos(a1), y0, cz + r0 * Math.sin(a1)];
    const C = [cx + r1 * Math.cos(a1), y1, cz + r1 * Math.sin(a1)];
    const D = [cx + r1 * Math.cos(a0), y1, cz + r1 * Math.sin(a0)];
    S.push({ p: r1 === 0 ? [A, B, C] : r0 === 0 ? [A, C, D] : [A, B, C, D], c, o: O });
  }
  if (r1 > 0) {
    const t: number[][] = [];
    for (let i = 0; i < n; i++) { const a = (i / n) * 2 * Math.PI; t.push([cx + r1 * Math.cos(a), y1, cz + r1 * Math.sin(a)]); }
    S.push({ p: t, c, o: O });
  }
  if (r0 > 0) {
    const b: number[][] = [];
    for (let i = n - 1; i >= 0; i--) { const a = (i / n) * 2 * Math.PI; b.push([cx + r0 * Math.cos(a), y0, cz + r0 * Math.sin(a)]); }
    S.push({ p: b, c, o: O });
  }
}

function arrowY(S: Poly[], cx: number, cz: number, yTail: number, yTip: number, r: number, c: [number, number, number]) {
  const dir = Math.sign(yTip - yTail) || 1;
  const headL = Math.abs(yTip - yTail) * 0.34;
  frustumY(S, cx, cz, yTail, yTip - dir * headL, r, r, c, 8, true);
  frustumY(S, cx, cz, yTip - dir * headL, yTip, r * 2.3, 0, c, 10, true);
}

// Keep every face small so per-polygon depth is a good stand-in for per-pixel.
function densify(p: number[][], maxLen: number): number[][] {
  const out: number[][] = [];
  for (let i = 0; i < p.length; i++) {
    const a = p[i], b = p[(i + 1) % p.length];
    out.push(a);
    const n = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / maxLen);
    for (let k = 1; k < n; k++) out.push([a[0] + (b[0] - a[0]) * (k / n), a[1] + (b[1] - a[1]) * (k / n)]);
  }
  return out;
}

// One half in local (z, y): flange face at y = 0, bore centre at y = −g2.
// The bore is IN CONTACT with the cylinder, so it takes the cylinder's
// deformed radii — leaving it a perfect circle is what made it look rigid.
function halfProfile(half: number, g2: number, H: number, arcN: number, rz: number, ry: number) {
  const zb = Math.sqrt(Math.max(rz * rz * (1 - (g2 / ry) ** 2), 1e-6));
  const phi0 = Math.asin(Math.max(-1, Math.min(g2 / ry, 1)));
  const p: number[][] = [[half, 0], [zb, 0]];
  for (let i = 0; i <= arcN; i++) {
    const phi = phi0 + (Math.PI - 2 * phi0) * (i / arcN);
    p.push([rz * Math.cos(phi), -g2 + ry * Math.sin(phi)]);
  }
  p.push([-zb, 0], [-half, 0], [-half, H], [-rz, H], [rz, H], [half, H]);
  return p;
}

export type BuiltScene = { S: Poly[]; fitR: number; boltHeads: number[][] };

export function buildScene(inp: CM.ClampInput, res: CM.ClampResult, o: SceneOpts): BuiltScene {
  const S: Poly[] = [];
  const boltHeads: number[][] = [];
  const R = inp.D / 2, dB = res.d, g2 = res.g2, H = res.H, W = inp.W;
  const half = R + inp.e + 1.7 * dB;
  const maxDim = Math.max(2 * half, W, 2 * (g2 + H));
  const s = 3.3 / maxDim;

  // Only the SPLIT is magnified. The body keeps true proportions; each half is
  // lifted clear by the magnified remaining gap, so separation reads
  // (gap − closure) × ex and hits zero exactly when the joint bottoms out.
  const oval = Math.min(res.dOval * o.ex, R * 0.3);
  const lift = Math.max(0, g2 - oval / 2) * o.ex;
  const bend = Math.min(res.dFl * o.ex, lift * 0.995);

  const nSide = Math.max(inp.N / 2, 1);
  const bolts: number[] = [];
  for (let i = 0; i < nSide; i++) bolts.push(-W / 2 + (W * (i + 0.5)) / nSide);
  const spacing = W / nSide;
  const unev = Math.max(0, Math.min((spacing - 4 * H) / (6 * H), 0.55));
  const xMult = (x: number) => {
    let dmin = Infinity;
    for (const bx of bolts) dmin = Math.min(dmin, Math.abs(x - bx));
    return 1 - unev * Math.min(dmin / (spacing / 2 || 1), 1);
  };

  const tone = hex2rgb(CM.CLAMP_MATS[inp.mat].tone);
  const earC = hex2rgb(CM.sfColor(res.SFflange)), crownC = hex2rgb(CM.sfColor(res.SFcrown));
  const STEEL: [number, number, number] = [0.62, 0.66, 0.7];
  const ARROW: [number, number, number] = [0.29, 0.55, 0.82];
  const REACT: [number, number, number] = [0.31, 0.71, 0.47];
  const steely = (c: [number, number, number]): [number, number, number] =>
    [c[0] * 0.55 + STEEL[0] * 0.45, c[1] * 0.55 + STEEL[1] * 0.45, c[2] * 0.55 + STEEL[2] * 0.45];
  const mix = (c: [number, number, number]): [number, number, number] =>
    [c[0] * 0.78 + tone[0] * 0.22, c[1] * 0.78 + tone[1] * 0.22, c[2] * 0.78 + tone[2] * 0.22];

  // Colour is ALWAYS scaled against yield, never the live peak: every stress is
  // linear in torque, so normalising by the current maximum divides the torque
  // back out and the picture would freeze however hard you tighten. Readability
  // is handled separately by an optional √ transfer.
  const curve = (r: number) => (o.contrast ? Math.sign(r) * Math.sqrt(Math.abs(r)) : r);
  const stressAt = (z: number, y: number) => CM.stressRGB(curve(CM.bodyStressRatio(inp, res, z, y)));
  const govC = mix(res.SFflange <= res.SFcrown ? earC : crownC);
  const shade = (z: number, y: number) => (o.stressMode ? stressAt(z, y) : Math.abs(z) > R ? mix(earC) : mix(crownC));

  const cvt = (r: number) => (o.contrast ? Math.sqrt(Math.min(r, 1.9)) : Math.min(r, 1.4));
  const cylC = o.stressMode
    ? CM.stressRGB(-cvt(res.sigmaCyl / (CM.CYL_MATS[inp.cyl].sy || 1)))
    : hex2rgb(CM.sfColor(res.SFcyl));
  const boltC = steely(o.stressMode ? CM.stressRGB(cvt(res.vm / (CM.CLASSES[inp.cls].sp || 1))) : hex2rgb(CM.sfColor(res.SFbolt)));
  const bearC = steely(o.stressMode ? CM.stressRGB(cvt(res.pHead / (CM.CLAMP_MATS[inp.mat].pG || 1))) : hex2rgb(CM.sfColor(res.SFbear)));

  // ── the two halves ──
  const prof = densify(halfProfile(half, g2, H, 20, R + oval / 2, R - oval / 2), Math.max(1.6, (half + H) / 26));
  const NX = unev > 0 ? 10 : 4; // geometry varies along X only when the ears sag
  const x0 = o.cut ? 0 : -W / 2;
  const ptAt = (z: number, ly: number, xi: number, up: boolean) => {
    const x = x0 + ((W / 2 - x0) * xi) / NX;
    const m = xMult(x);
    // Full beam kinematics: the neutral axis follows δ(z) and each section
    // ROTATES about it by θ(z) — that rotation is what takes the bore out of
    // round. Displacements scale with SPLIT ×; an angle cannot, so it is
    // magnified gently and clamped, and applied as a true rotation.
    const drop = bend * res.dfShape(Math.abs(z)) * m;
    const yn = res.dfNA(z), eta = ly - yn;
    const PHI_MAX = 0.085;
    const phi = Math.max(-PHI_MAX, Math.min(PHI_MAX, Math.sqrt(o.ex) * res.dfSlope(z) * m));
    const zz = z - eta * Math.sin(phi);
    const y = lift + yn + eta * Math.cos(phi) - drop;
    return [x * s, (up ? y : -y) * s, zz * s];
  };
  const pt = (zi: number, xi: number, up: boolean) => ptAt(prof[zi][0], prof[zi][1], xi, up);

  for (const up of [true, false]) {
    const O = [0, (up ? 1 : -1) * (lift + H / 2) * s, 0];
    for (let i = 0; i < prof.length; i++) {
      const j = (i + 1) % prof.length;
      let c = shade((prof[i][0] + prof[j][0]) / 2, (prof[i][1] + prof[j][1]) / 2);
      // mating flange face: darker so the split reads, but still its own stress
      if (Math.abs(prof[i][1]) < 1e-9 && Math.abs(prof[j][1]) < 1e-9)
        c = [c[0] * 0.62, c[1] * 0.62, c[2] * 0.62];
      for (let k = 0; k < NX; k++) {
        const A = pt(i, k, up), B = pt(j, k, up), C = pt(j, k + 1, up), D = pt(i, k + 1, up);
        S.push({ p: up ? [A, B, C, D] : [D, C, B, A], c, o: O });
      }
    }
    // End faces carry the whole cross-section, so mesh them and colour each
    // cell — this is where the gradient through the section is visible. The
    // mesh follows the bore contour instead of voxelising it.
    const NZ = 36, NY = 9;
    const yBore = (z: number) => (Math.abs(z) < R ? Math.max(Math.sqrt(Math.max(R * R - z * z, 0)) - g2, 0) : 0);
    for (const k of [0, NX]) {
      if (!o.stressMode) {
        const face = prof.map((_, i) => pt(i, k, up));
        S.push({ p: (k === 0) === up ? face : face.slice().reverse(), c: govC, o: O });
        continue;
      }
      for (let i = 0; i < NZ; i++) {
        const z0 = -half + (2 * half * i) / NZ, z1 = -half + (2 * half * (i + 1)) / NZ;
        const a0 = yBore(z0), a1 = yBore(z1);
        if (a0 >= H - 1e-6 && a1 >= H - 1e-6) continue;
        for (let j = 0; j < NY; j++) {
          const t0 = j / NY, t1 = (j + 1) / NY;
          const q = [
            ptAt(z0, a0 + (H - a0) * t0, k, up), ptAt(z1, a1 + (H - a1) * t0, k, up),
            ptAt(z1, a1 + (H - a1) * t1, k, up), ptAt(z0, a0 + (H - a0) * t1, k, up),
          ];
          const zc = (z0 + z1) / 2, ac = (a0 + a1) / 2;
          S.push({ p: (k === 0) === up ? q : q.slice().reverse(), c: stressAt(zc, ac + (H - ac) * ((t0 + t1) / 2)), o: O });
        }
      }
    }
  }

  // ── the clamped cylinder ──
  const ry = (R - oval / 2) * s, rz = (R + oval / 2) * s, tw = Math.min(inp.tw, R - 0.2);
  const xa = -W * 0.78 * s, xb = W * 0.78 * s, NA = 28, NL = 10;
  const ring = (rY: number, rZ: number, x: number) => {
    const out: number[][] = [];
    for (let i = 0; i < NA; i++) { const a = (i / NA) * 2 * Math.PI; out.push([x, rY * Math.sin(a), rZ * Math.cos(a)]); }
    return out;
  };
  const xs: number[] = [];
  for (let k = 0; k <= NL; k++) xs.push(xa + ((xb - xa) * k) / NL);
  const outer = xs.map((x) => ring(ry, rz, x));
  for (let k = 0; k < NL; k++)
    for (let i = 0; i < NA; i++) {
      const j = (i + 1) % NA;
      const xm = Math.abs((xs[k] + xs[k + 1]) / 2), ym = Math.abs((outer[k][i][1] + outer[k + 1][j][1]) / 2);
      if (o.opaque && xm < (W / 2) * s && ym > lift * s) continue; // buried in the body
      S.push({ p: [outer[k][i], outer[k][j], outer[k + 1][j], outer[k + 1][i]], c: cylC, o: [(xs[k] + xs[k + 1]) / 2, 0, 0] });
    }
  const dim = (c: [number, number, number], f: number): [number, number, number] => [c[0] * f, c[1] * f, c[2] * f];
  if (inp.hollow) {
    const inner = xs.map((x) => ring(ry - tw * s, rz - tw * s, x));
    for (let k = 0; k < NL; k++)
      for (let i = 0; i < NA; i++) {
        const j = (i + 1) % NA;
        S.push({ p: [inner[k][j], inner[k][i], inner[k + 1][i], inner[k + 1][j]], c: dim(cylC, 0.5) });
      }
    const a0 = outer[0], b0 = outer[NL], ia = inner[0], ib = inner[NL];
    for (let i = 0; i < NA; i++) {
      const j = (i + 1) % NA;
      S.push({ p: [a0[j], a0[i], ia[i], ia[j]], c: dim(cylC, 0.78) });
      S.push({ p: [b0[i], b0[j], ib[j], ib[i]], c: dim(cylC, 0.78) });
    }
  } else {
    S.push({ p: outer[0].slice().reverse(), c: dim(cylC, 0.78), o: [0, 0, 0] });
    S.push({ p: outer[NL], c: dim(cylC, 0.78), o: [0, 0, 0] });
  }

  // ── bolts ──
  const yTop = lift + H, rSh = (dB / 2) * s;
  const rHd = (inp.washer ? 1.05 : 0.9) * dB * s, hHd = 0.6 * dB * s;
  for (const bx of bolts) {
    if (o.cut && bx < 0) continue;
    for (const zs of [1, -1]) {
      const cz = zs * (R + inp.e) * s, cx = bx * s;
      const drop = bend * res.dfShape(R + inp.e) * xMult(bx) * s;
      const yT = yTop * s - drop, yB = -yTop * s + drop;
      // Only the slices you could actually see: a shank buried in an opaque
      // body can never be depth-sorted correctly, so it is not drawn.
      for (let k = 0; k < 8; k++) {
        const ya = yB + ((yT - yB) * k) / 8, yb2 = yB + ((yT - yB) * (k + 1)) / 8;
        const ym = Math.abs((ya + yb2) / 2);
        if (o.opaque && ym > lift * s && ym < (lift + H) * s) continue;
        frustumY(S, cx, cz, ya, yb2, rSh, rSh, boltC, 12);
      }
      frustumY(S, cx, cz, yT, yT + hHd, rHd, rHd, bearC, 6);
      frustumY(S, cx, cz, yB - hHd * 1.15, yB, rHd, rHd, bearC, 6);
      boltHeads.push([cx, yT + hHd, cz]);
    }
  }

  // ── force arrows ──
  if (o.forces && res.Fb > 0) {
    for (const bx of bolts) {
      if (o.cut && bx < 0) continue;
      for (const zs of [1, -1]) {
        const cz = zs * (R + inp.e) * s, cx = bx * s;
        const drop = bend * res.dfShape(R + inp.e) * xMult(bx) * s;
        const yT = yTop * s - drop + hHd;
        arrowY(S, cx, cz, yT + ARROW_LEN, yT + 0.06, rSh * 0.75, ARROW);
        arrowY(S, cx, cz, -yT - ARROW_LEN, -yT - 0.06, rSh * 0.75, ARROW);
      }
    }
    for (const zs of [1, -1])
      for (const bx of bolts) {
        if (o.cut && bx < 0) continue;
        arrowY(S, bx * s, 0, zs > 0 ? ry * 0.1 : -ry * 0.1, zs > 0 ? ry + ARROW_LEN * 0.55 : -(ry + ARROW_LEN * 0.55), rSh * 0.6, REACT);
      }
  }

  // Camera bound from the STATIC envelope: deriving it from the live polygons
  // made the frame re-fit on every torque change, which read as jumping.
  const fitR = Math.hypot(W * 0.78, g2 * o.ex + H + ARROW_LEN, half) * s;
  return { S, fitR, boltHeads };
}

// Newell's method — a reliable normal for any polygon, including the many-sided
// end caps where three points can be collinear.
function newell(p: number[][]) {
  let nx = 0, ny = 0, nz = 0;
  for (let i = 0; i < p.length; i++) {
    const a = p[i], b = p[(i + 1) % p.length];
    nx += (a[1] - b[1]) * (a[2] + b[2]);
    ny += (a[2] - b[2]) * (a[0] + b[0]);
    nz += (a[0] - b[0]) * (a[1] + b[1]);
  }
  return [nx, ny, nz];
}

const LIGHT = (() => {
  const l = [-0.4, 0.66, 0.64];
  const n = Math.hypot(l[0], l[1], l[2]);
  return l.map((v) => v / n);
})();

export function drawScene(
  cv: HTMLCanvasElement, scene: BuiltScene, view: View, alpha: number,
): number[][] {
  const wrap = cv.parentElement;
  const Wp = (wrap?.clientWidth ?? cv.clientWidth) || 300;
  const Hp = (wrap?.clientHeight ?? cv.clientHeight) || 300;
  const ctx = cv.getContext("2d");
  if (!ctx) return [];
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  if (cv.width !== Wp * dpr || cv.height !== Hp * dpr) { cv.width = Wp * dpr; cv.height = Hp * dpr; }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = "#0b1015";
  ctx.fillRect(0, 0, Wp, Hp);

  const fl = Math.min(Wp, Hp) * 0.92;
  const want = Math.max(2.6, (scene.fitR * fl) / (0.34 * Math.min(Wp, Hp)));
  view.dist += (want - view.dist) * 0.18;

  const cy = Math.cos(view.yaw), sy = Math.sin(view.yaw);
  const cp = Math.cos(view.pitch), sp = Math.sin(view.pitch);
  const rot = (p: number[]) => {
    const x1 = p[0] * cy + p[2] * sy, z1 = -p[0] * sy + p[2] * cy;
    return [x1, p[1] * cp - z1 * sp, p[1] * sp + z1 * cp];
  };
  const project = (p: number[]) => {
    const r = rot(p);
    const zc = view.dist - r[2];
    return [Wp / 2 + (r[0] * fl) / zc, Hp / 2 - (r[1] * fl) / zc, zc, r[0], r[1], r[2]];
  };

  const solid = alpha >= 0.995;
  const items: { pp: number[][]; c: [number, number, number]; sh: number; z: number }[] = [];
  for (const q of scene.S) {
    const pp = q.p.map(project);
    if (pp.some((p) => p[2] <= 0.25)) continue;
    let [nx, ny, nz] = newell(pp.map((p) => [p[3], p[4], p[5]]));
    if (solid && q.o) {
      // Winding is not uniform, so derive "outward" geometrically: away from
      // the parent solid's centroid. A face pointing away from the camera is
      // then a back face, and dropping it removes the see-through flicker.
      const fc = [0, 1, 2].map((k) => pp.reduce((t, p) => t + p[3 + k], 0) / pp.length);
      const ov = rot(q.o);
      if (nx * (fc[0] - ov[0]) + ny * (fc[1] - ov[1]) + nz * (fc[2] - ov[2]) < 0) { nx = -nx; ny = -ny; nz = -nz; }
      if (nx * fc[0] + ny * fc[1] + nz * (fc[2] - view.dist) > 0) continue;
    } else if (nz < 0) { nx = -nx; ny = -ny; nz = -nz; }
    const nl = Math.hypot(nx, ny, nz) || 1;
    const sh = 0.3 + 0.7 * Math.max(0, (nx * LIGHT[0] + ny * LIGHT[1] + nz * LIGHT[2]) / nl);
    items.push({ pp, c: q.c, sh, z: pp.reduce((t, p) => t + p[2], 0) / pp.length });
  }
  items.sort((a, b) => b.z - a.z);

  ctx.globalAlpha = alpha;
  for (const it of items) {
    const col = `rgb(${it.c.map((v) => Math.round(Math.min(1, v * it.sh) * 255)).join(",")})`;
    ctx.fillStyle = col;
    ctx.strokeStyle = col;
    ctx.lineWidth = 0.4;
    ctx.beginPath();
    ctx.moveTo(it.pp[0][0], it.pp[0][1]);
    for (let i = 1; i < it.pp.length; i++) ctx.lineTo(it.pp[i][0], it.pp[i][1]);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  return scene.boltHeads.map((b) => { const p = project(b); return [p[0], p[1]]; });
}
