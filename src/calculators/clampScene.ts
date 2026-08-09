// 3D viewer for the cylinder clamp — the geometry half. The painter itself
// (projection, culling, depth sorting, shading) lives in scene3d.ts and is
// shared with the toolkit's other 3D views.
//
// Axes: X along the cylinder, Y up (cap above base), Z across (the ears).

import * as CM from "./clampMath";
import { arrowY, densify, dim, frustumY, hex2rgb, type BuiltScene, type Poly } from "./scene3d";

export { drawScene, type Poly, type View, type DrawOpts, type BuiltScene } from "./scene3d";

export type SceneOpts = {
  ex: number; // SPLIT × — magnifies the gap and every deflection together
  stressMode: boolean;
  contrast: boolean; // √ transfer, so the weak field is still readable
  forces: boolean;
  cut: boolean; // half section
  opaque: boolean;
};

const ARROW_LEN = 0.8; // constant, so the camera never re-fits with load

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

  // Orientation reference for back-face culling: the centroid of the half as
  // actually built. Half section trims it to x ∈ [0, W/2], so the centroid
  // moves to W/4 — leave it at 0 and the cut face lies exactly in the plane
  // through its own reference point, "outward" degenerates to a 0·0 dot, and
  // the sign falls out of rounding error. Half the cells then cull and the
  // face reads as scattered holes onto the background.
  const xMid = ((x0 + W / 2) / 2) * s;
  for (const up of [true, false]) {
    const O = [xMid, (up ? 1 : -1) * (lift + H / 2) * s, 0];
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
  return { S, fitR, handles: boltHeads };
}
