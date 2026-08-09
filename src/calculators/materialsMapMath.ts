// Materials Map math: log-space geometry and Ashby performance indices.
// Pure functions, no React, no rendering. The chart works in log10 units —
// a property range [lo, hi] becomes an ellipse centered on the geometric
// mean, and a minimum-mass guideline becomes a straight line whose slope is
// set by the index exponent.

import type { MapMaterial, PropKey, Range } from "./materialsMapData";

// Geometric mean — the midpoint of a range on a log axis.
export const logMid = (r: Range): number => Math.sqrt(r[0] * r[1]);

export type LogEllipse = { cx: number; cy: number; rx: number; ry: number };

// A material's [lo,hi] × [lo,hi] box as an ellipse in log10 coordinates.
// minR keeps near-point ranges visible (and hoverable) on the chart.
export function logEllipse(xr: Range, yr: Range, minR = 0.02): LogEllipse {
  const lg = Math.log10;
  return {
    cx: (lg(xr[0]) + lg(xr[1])) / 2,
    cy: (lg(yr[0]) + lg(yr[1])) / 2,
    rx: Math.max((lg(xr[1]) - lg(xr[0])) / 2, minR),
    ry: Math.max((lg(yr[1]) - lg(yr[0])) / 2, minR),
  };
}

// ── Performance indices ────────────────────────────────────────────────
// Minimum-mass design: for a component with one free dimension, the mass of
// the lightest material that still does the job scales inversely with
// M = y^a / x  (y = E or σ, x = ρ). The exponent a comes from which
// dimension is free: a=1 for a tie (area free), a=1/2 or 2/3 for a beam
// (bending, depth free), a=1/3 or 1/2 for a panel (thickness free).
// On log-log axes, lines of constant M have slope 1/a.

export type DesignCase = {
  id: string;
  name: string;
  detail: string;
  y: PropKey;
  a: number;
  label: string;
};

export const DESIGN_CASES: DesignCase[] = [
  { id: "stiff-tie", name: "Stiff tie", detail: "tension rod", y: "E", a: 1, label: "E/ρ" },
  { id: "stiff-beam", name: "Stiff beam", detail: "bending", y: "E", a: 1 / 2, label: "E½/ρ" },
  { id: "stiff-panel", name: "Stiff panel", detail: "plate", y: "E", a: 1 / 3, label: "E⅓/ρ" },
  { id: "strong-tie", name: "Strong tie", detail: "tension rod", y: "sig", a: 1, label: "σ/ρ" },
  { id: "strong-beam", name: "Strong beam", detail: "bending", y: "sig", a: 2 / 3, label: "σ⅔/ρ" },
  { id: "strong-panel", name: "Strong panel", detail: "plate", y: "sig", a: 1 / 2, label: "σ½/ρ" },
];

// Index value M = y^a / x for one material (midpoint of its ranges).
export function indexValue(y: number, x: number, a: number): number {
  return Math.pow(y, a) / x;
}

// The guideline through log-log space: log y = (log M + log x) / a.
export function guidelineLogY(logX: number, a: number, M: number): number {
  return (Math.log10(M) + logX) / a;
}

// Invert: the M whose guideline passes through a given log-log point —
// this is what dragging the line computes.
export function indexFromPoint(logX: number, logY: number, a: number): number {
  return Math.pow(10, a * logY - logX);
}

// Slope of the guideline on log-log axes.
export const guidelineSlope = (a: number): number => 1 / a;

// Materials at or above the guideline, best first. xProp defaults to density
// (the classic Ashby indices), but the custom-slope tool ranks against
// whatever pair of axes is on screen.
export type Ranked = { m: MapMaterial; idx: number };

export function rankQualifiers(
  materials: MapMaterial[],
  yProp: PropKey,
  a: number,
  M: number,
  xProp: PropKey = "rho",
): Ranked[] {
  const out: Ranked[] = [];
  for (const m of materials) {
    const yr = m[yProp] as Range | null;
    const xr = m[xProp] as Range | null;
    if (!yr || !xr) continue;
    const idx = indexValue(logMid(yr), logMid(xr), a);
    if (idx >= M) out.push({ m, idx });
  }
  return out.sort((p, q) => q.idx - p.idx);
}

// A sensible starting threshold: the index value that lets roughly the top
// third of the candidates qualify.
export function defaultThreshold(values: number[]): number {
  if (values.length === 0) return 1;
  const sorted = [...values].sort((p, q) => q - p);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length / 3))];
}

// ── Convex hull (Andrew monotone chain) — family blob outlines ─────────
export type Pt = readonly [number, number];

export function convexHull(points: Pt[]): Pt[] {
  const pts = [...points].sort((p, q) => p[0] - q[0] || p[1] - q[1]);
  if (pts.length < 3) return pts;
  const cross = (o: Pt, p: Pt, q: Pt) =>
    (p[0] - o[0]) * (q[1] - o[1]) - (p[1] - o[1]) * (q[0] - o[0]);
  const half = (list: Pt[]): Pt[] => {
    const out: Pt[] = [];
    for (const p of list) {
      while (out.length >= 2 && cross(out[out.length - 2], out[out.length - 1], p) <= 0) out.pop();
      out.push(p);
    }
    out.pop();
    return out;
  };
  return [...half(pts), ...half([...pts].reverse())];
}

// Compact number formatting for axis ticks and readouts.
export function fmtVal(v: number): string {
  if (!isFinite(v)) return "∞";
  if (v >= 100) return Math.round(v).toLocaleString("en-US");
  if (v >= 1) return String(+v.toPrecision(3));
  return String(+v.toPrecision(2));
}
