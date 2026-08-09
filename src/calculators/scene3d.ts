// Shared 3D painter for the toolkit's viewers — dependency-free canvas, no CDN,
// works offline. Extracted from the cylinder-clamp viewer so every 3D
// calculator draws through the same renderer instead of reimplementing the
// subtle parts.
//
// Two things a painter's algorithm gets wrong unless you handle them, and both
// showed up in testing:
//   · Winding is not uniform across swept profiles and revolved solids, so
//     back-face culling cannot trust it. Each face is oriented from its parent
//     solid's centroid instead (the optional `o` reference point).
//   · Depth is per polygon, so one large face can sort in front of something
//     genuinely nearer. Keep every face small, and don't emit geometry buried
//     inside an opaque body at all.

export type Poly = { p: number[][]; c: [number, number, number]; o?: number[] };
export type View = { yaw: number; pitch: number; dist: number };

// `handles` are scene-space points a calculator wants back in screen space, so
// it can hit-test a draggable feature (a bolt head, a loaded flange).
export type BuiltScene = { S: Poly[]; fitR: number; handles: number[][] };

export const hex2rgb = (h: string): [number, number, number] => {
  const n = parseInt(h.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
};

export const dim = (c: [number, number, number], f: number): [number, number, number] =>
  [c[0] * f, c[1] * f, c[2] * f];

// A tube/cone along Y. `noCull` skips the centroid reference for open shapes
// (arrows) that should stay visible from either side.
export function frustumY(
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

export function arrowY(S: Poly[], cx: number, cz: number, yTail: number, yTip: number, r: number, c: [number, number, number]) {
  const dir = Math.sign(yTip - yTail) || 1;
  const headL = Math.abs(yTip - yTail) * 0.34;
  frustumY(S, cx, cz, yTail, yTip - dir * headL, r, r, c, 8, true);
  frustumY(S, cx, cz, yTip - dir * headL, yTip, r * 2.3, 0, c, 10, true);
}

// Keep every face small so per-polygon depth is a good stand-in for per-pixel.
export function densify(p: number[][], maxLen: number): number[][] {
  const out: number[][] = [];
  for (let i = 0; i < p.length; i++) {
    const a = p[i], b = p[(i + 1) % p.length];
    out.push(a);
    const n = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / maxLen);
    for (let k = 1; k < n; k++) out.push([a[0] + (b[0] - a[0]) * (k / n), a[1] + (b[1] - a[1]) * (k / n)]);
  }
  return out;
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

// `opts` exists for report snapshots: an offscreen canvas has no layout box to
// measure and no successive frames to ease the camera into, so size, pixel
// density, paper background and an immediate camera settle all have to be
// stated rather than inferred.
export type DrawOpts = {
  width?: number;
  height?: number;
  scale?: number; // device pixels per CSS pixel — raise it for print
  background?: string;
  settle?: boolean; // snap the camera home instead of easing toward it
};

export function drawScene(
  cv: HTMLCanvasElement, scene: BuiltScene, view: View, alpha: number, opts?: DrawOpts,
): number[][] {
  const wrap = cv.parentElement;
  const Wp = opts?.width ?? ((wrap?.clientWidth ?? cv.clientWidth) || 300);
  const Hp = opts?.height ?? ((wrap?.clientHeight ?? cv.clientHeight) || 300);
  const ctx = cv.getContext("2d");
  if (!ctx) return [];
  const dpr = opts?.scale ?? Math.min(window.devicePixelRatio || 1, 2);
  if (cv.width !== Wp * dpr || cv.height !== Hp * dpr) { cv.width = Wp * dpr; cv.height = Hp * dpr; }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = opts?.background ?? "#0b1015";
  ctx.fillRect(0, 0, Wp, Hp);

  const fl = Math.min(Wp, Hp) * 0.92;
  const want = Math.max(2.6, (scene.fitR * fl) / (0.34 * Math.min(Wp, Hp)));
  view.dist = opts?.settle ? want : view.dist + (want - view.dist) * 0.18;

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
      const rx = fc[0] - ov[0], ry2 = fc[1] - ov[1], rz2 = fc[2] - ov[2];
      // Compare as a cosine, not a raw dot: a face lying edge-on to its own
      // reference point gives a vanishing dot whose sign is pure noise, and
      // flipping on that is what speckles a flat surface. Below the threshold
      // keep the winding the builder authored.
      const den = Math.hypot(nx, ny, nz) * Math.hypot(rx, ry2, rz2);
      if (den > 0 && (nx * rx + ny * ry2 + nz * rz2) / den < -1e-6) { nx = -nx; ny = -ny; nz = -nz; }
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

  return scene.handles.map((b) => { const p = project(b); return [p[0], p[1]]; });
}
