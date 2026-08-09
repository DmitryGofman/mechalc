import { useEffect, useMemo, useRef, useState } from "react";
import {
  FAMILIES,
  FAM_BY_ID,
  MATERIALS,
  PROPS,
  PROP_KEYS,
  type MapMaterial,
  type PropKey,
  type Range,
} from "./materialsMapData";
import {
  convexHull,
  DESIGN_CASES,
  defaultThreshold,
  fmtVal,
  guidelineLogY,
  guidelineSlope,
  indexFromPoint,
  indexValue,
  logEllipse,
  logMid,
  rankQualifiers,
  type Pt,
} from "./materialsMapMath";
import { Select } from "../ui";

// Materials Map — an interactive Ashby chart. Any two properties on the
// axes, materials drawn as class-range ellipses on log-log paper, and the
// minimum-mass guidelines from materials selection: pick a design case,
// drag the line, and read the shortlist.

const M = "var(--mono)";
const lg = Math.log10;
const f = fmtVal;

const fmtRange = (r: Range | null, unit: string) =>
  r ? `${f(r[0])} – ${f(r[1])} ${unit}` : "—";

type CaseId = "free" | "custom" | (typeof DESIGN_CASES)[number]["id"];

type View = { k: number; tx: number; ty: number };

const PAD = { l: 52, r: 14, t: 12, b: 34 };
const K_MIN = 0.6;
const K_MAX = 40;

// Smooth closed Catmull-Rom-ish path through screen-space hull points.
function smoothClosed(pts: number[][]): string {
  const n = pts.length;
  if (n < 3) return "";
  let d = `M ${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}`;
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n];
    const p1 = pts[i];
    const p2 = pts[(i + 1) % n];
    const p3 = pts[(i + 2) % n];
    d += ` C ${(p1[0] + (p2[0] - p0[0]) / 6).toFixed(1)} ${(p1[1] + (p2[1] - p0[1]) / 6).toFixed(1)}, ${(p2[0] - (p3[0] - p1[0]) / 6).toFixed(1)} ${(p2[1] - (p3[1] - p1[1]) / 6).toFixed(1)}, ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`;
  }
  return d + " Z";
}

export default function MaterialsMapCalc() {
  const [xProp, setXProp] = useState<PropKey>("rho");
  const [yProp, setYProp] = useState<PropKey>("E");
  const [caseId, setCaseId] = useState<CaseId>("stiff-beam");
  const [slopeStr, setSlopeStr] = useState("2");
  const [mVal, setMVal] = useState<number | null>(null);
  const [view, setView] = useState<View>({ k: 1, tx: 0, ty: 0 });
  const [hovered, setHovered] = useState<MapMaterial | null>(null);
  const [selected, setSelected] = useState<MapMaterial | null>(null);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [size, setSize] = useState({ w: 900, h: 520 });

  const svgRef = useRef<SVGSVGElement>(null);

  // The active guideline, if any. Classic cases lock the axes to the pair
  // the index is derived for; the custom slope plays on whatever is shown.
  const classic = DESIGN_CASES.find((c) => c.id === caseId) ?? null;
  const slope = Math.max(0.1, Math.min(10, parseFloat(slopeStr) || 2));
  const guide =
    caseId === "free"
      ? null
      : classic
        ? { y: classic.y, x: "rho" as PropKey, a: classic.a, label: classic.label }
        : {
            y: yProp,
            x: xProp,
            a: 1 / slope,
            label: `${PROPS[yProp].symbol}^${+(1 / slope).toFixed(2)}/${PROPS[xProp].symbol}`,
          };
  const effX = classic ? "rho" : xProp;
  const effY = classic ? classic.y : yProp;

  // ── chart geometry in log10 units ─────────────────────────────────────
  const items = useMemo(() => {
    const out: { m: MapMaterial; cx: number; cy: number; rx: number; ry: number }[] = [];
    for (const m of MATERIALS) {
      const xr = m[effX] as Range | null;
      const yr = m[effY] as Range | null;
      if (!xr || !yr) continue;
      out.push({ m, ...logEllipse(xr, yr) });
    }
    return out;
  }, [effX, effY]);

  const domain = useMemo(() => {
    const xs = items.flatMap((i) => [i.cx - i.rx, i.cx + i.rx]);
    const ys = items.flatMap((i) => [i.cy - i.ry, i.cy + i.ry]);
    return {
      x: [Math.min(...xs) - 0.15, Math.max(...xs) + 0.15],
      y: [Math.min(...ys) - 0.2, Math.max(...ys) + 0.2],
    };
  }, [items]);

  const base = useMemo(() => {
    const sx = (size.w - PAD.l - PAD.r) / (domain.x[1] - domain.x[0]);
    const sy = -(size.h - PAD.t - PAD.b) / (domain.y[1] - domain.y[0]);
    return { sx, sy, ox: PAD.l - domain.x[0] * sx, oy: size.h - PAD.b - domain.y[0] * sy };
  }, [domain, size]);

  const SX = (v: number) => (v * base.sx + base.ox) * view.k + view.tx;
  const SY = (v: number) => (v * base.sy + base.oy) * view.k + view.ty;
  const invX = (px: number) => ((px - view.tx) / view.k - base.ox) / base.sx;
  const invY = (py: number) => ((py - view.ty) / view.k - base.oy) / base.sy;

  // Family blobs from the hulls of member ellipses (log space, then mapped).
  const hulls = useMemo(() => {
    return FAMILIES.map((fam) => {
      const pts: Pt[] = [];
      for (const it of items) {
        if (it.m.fam !== fam.id) continue;
        for (let s = 0; s < 12; s++) {
          const th = (s / 12) * 2 * Math.PI;
          pts.push([it.cx + Math.cos(th) * (it.rx + 0.06), it.cy + Math.sin(th) * (it.ry + 0.07)]);
        }
      }
      return { fam, hull: convexHull(pts) };
    });
  }, [items]);

  // ── guideline threshold ────────────────────────────────────────────────
  const indices = useMemo(() => {
    if (!guide) return [];
    return items
      .filter((it) => !hidden.has(it.m.fam))
      .map((it) => ({ m: it.m, idx: indexValue(10 ** it.cy, 10 ** it.cx, guide.a) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, caseId, slope, hidden]);

  // Reset the threshold to "top third qualify" whenever the index changes.
  useEffect(() => {
    if (guide) setMVal(defaultThreshold(indices.map((r) => r.idx)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caseId, slope, effX, effY]);

  const mCur = mVal ?? 1;
  const ranked = useMemo(() => {
    if (!guide) return [];
    return rankQualifiers(
      MATERIALS.filter((m) => !hidden.has(m.fam)),
      guide.y,
      guide.a,
      mCur,
      guide.x,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [guide?.y, guide?.a, guide?.x, mCur, hidden]);
  const rankedSet = useMemo(() => new Set(ranked.map((r) => r.m)), [ranked]);
  const labeled = useMemo(() => new Set(ranked.slice(0, 6).map((r) => r.m)), [ranked]);

  // ── interaction ────────────────────────────────────────────────────────
  const live = useRef({ base, view, items, guide, mCur, hidden });
  live.current = { base, view, items, guide, mCur, hidden };

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const ro = new ResizeObserver(() =>
      setSize({ w: svg.clientWidth, h: svg.clientHeight }),
    );
    ro.observe(svg);
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = svg.getBoundingClientRect();
      const px = e.clientX - r.left;
      const py = e.clientY - r.top;
      setView((v) => {
        const k = Math.max(K_MIN, Math.min(K_MAX, v.k * Math.exp(-e.deltaY * 0.0016)));
        const s = k / v.k;
        return { k, tx: px - (px - v.tx) * s, ty: py - (py - v.ty) * s };
      });
    };
    svg.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      ro.disconnect();
      svg.removeEventListener("wheel", onWheel);
    };
  }, []);

  const pick = (px: number, py: number): MapMaterial | null => {
    const L = live.current;
    let best: MapMaterial | null = null;
    let bestD = Infinity;
    for (const it of L.items) {
      if (L.hidden.has(it.m.fam)) continue;
      const cx = (it.cx * L.base.sx + L.base.ox) * L.view.k + L.view.tx;
      const cy = (it.cy * L.base.sy + L.base.oy) * L.view.k + L.view.ty;
      const rx = Math.max(it.rx * Math.abs(L.base.sx) * L.view.k, 6);
      const ry = Math.max(it.ry * Math.abs(L.base.sy) * L.view.k, 6);
      const d = ((px - cx) / rx) ** 2 + ((py - cy) / ry) ** 2;
      if (d < 1.2 && d < bestD) {
        bestD = d;
        best = it.m;
      }
    }
    return best;
  };

  const lineScreenY = (px: number): number | null => {
    const g = live.current.guide;
    if (!g) return null;
    return SY(guidelineLogY(invX(px), g.a, live.current.mCur));
  };

  const drag = useRef<{
    mode: "pan" | "line" | null;
    x: number;
    y: number;
    tx: number;
    ty: number;
  }>({ mode: null, x: 0, y: 0, tx: 0, ty: 0 });
  const pinch = useRef<{ d: number; cx: number; cy: number; k: number; tx: number; ty: number } | null>(null);
  const pointers = useRef(new Map<number, [number, number]>());

  const localXY = (e: React.PointerEvent): [number, number] => {
    const r = svgRef.current!.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  };

  const onPointerDown = (e: React.PointerEvent) => {
    svgRef.current!.setPointerCapture(e.pointerId);
    const [px, py] = localXY(e);
    pointers.current.set(e.pointerId, [px, py]);
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      pinch.current = {
        d: Math.hypot(a[0] - b[0], a[1] - b[1]),
        cx: (a[0] + b[0]) / 2,
        cy: (a[1] + b[1]) / 2,
        k: view.k,
        tx: view.tx,
        ty: view.ty,
      };
      drag.current.mode = null;
      return;
    }
    const hit = pick(px, py);
    if (hit) {
      setSelected((s) => (s === hit ? null : hit));
      return;
    }
    const ly = lineScreenY(px);
    drag.current =
      ly !== null && Math.abs(py - ly) < 16
        ? { mode: "line", x: px, y: py, tx: view.tx, ty: view.ty }
        : { mode: "pan", x: px, y: py, tx: view.tx, ty: view.ty };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const [px, py] = localXY(e);
    if (pointers.current.has(e.pointerId)) pointers.current.set(e.pointerId, [px, py]);
    if (pinch.current && pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      const p = pinch.current;
      const s = Math.max(K_MIN, Math.min(K_MAX, (p.k * Math.hypot(a[0] - b[0], a[1] - b[1])) / p.d)) / p.k;
      setView({ k: p.k * s, tx: p.cx - (p.cx - p.tx) * s, ty: p.cy - (p.cy - p.ty) * s });
      return;
    }
    if (drag.current.mode === "line" && guide) {
      setMVal(indexFromPoint(invX(px), invY(py), guide.a));
      return;
    }
    if (drag.current.mode === "pan") {
      setView((v) => ({ ...v, tx: drag.current.tx + (px - drag.current.x), ty: drag.current.ty + (py - drag.current.y) }));
      return;
    }
    const hit = pick(px, py);
    setHovered(hit);
    if (svgRef.current) {
      const ly = lineScreenY(px);
      svgRef.current.style.cursor =
        hit ? "pointer" : ly !== null && Math.abs(py - ly) < 16 ? "ns-resize" : "grab";
    }
  };

  const onPointerUp = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
    if (pointers.current.size === 0) drag.current.mode = null;
  };

  const resetView = () => setView({ k: 1, tx: 0, ty: 0 });

  // ── render helpers ─────────────────────────────────────────────────────
  const gridLines: React.ReactNode[] = [];
  {
    const x0 = invX(PAD.l);
    const x1 = invX(size.w - PAD.r);
    const y0 = invY(size.h - PAD.b);
    const y1 = invY(PAD.t);
    const decPx = Math.abs(base.sx) * view.k;
    const decPy = Math.abs(base.sy) * view.k;
    for (let d = Math.floor(x0); d <= Math.ceil(x1); d++) {
      for (const mul of decPx > 90 ? [1, 2, 5] : [1]) {
        const v = d + lg(mul);
        if (v < x0 || v > x1) continue;
        const px = SX(v);
        gridLines.push(
          <line key={`vx${d}-${mul}`} x1={px} y1={PAD.t} x2={px} y2={size.h - PAD.b} stroke={mul === 1 ? "#16212b" : "#111a22"} />,
        );
        if (mul === 1 || decPx > 160)
          gridLines.push(
            <text key={`vt${d}-${mul}`} x={px} y={size.h - PAD.b + 15} textAnchor="middle" fill="#6b7884" fontSize={10.5} fontFamily={M}>
              {f(10 ** v)}
            </text>,
          );
      }
    }
    for (let d = Math.floor(y0); d <= Math.ceil(y1); d++) {
      for (const mul of decPy > 90 ? [1, 2, 5] : [1]) {
        const v = d + lg(mul);
        if (v < y0 || v > y1) continue;
        const py = SY(v);
        gridLines.push(
          <line key={`hy${d}-${mul}`} x1={PAD.l} y1={py} x2={size.w - PAD.r} y2={py} stroke={mul === 1 ? "#16212b" : "#111a22"} />,
        );
        if (mul === 1 || decPy > 160)
          gridLines.push(
            <text key={`ht${d}-${mul}`} x={PAD.l - 5} y={py + 3.5} textAnchor="end" fill="#6b7884" fontSize={10.5} fontFamily={M}>
              {f(10 ** v)}
            </text>,
          );
      }
    }
  }

  const guideGeom = guide
    ? (() => {
        const gy = (x: number) => guidelineLogY(x, guide.a, mCur);
        return {
          x1: SX(domain.x[0]),
          y1: SY(gy(domain.x[0])),
          x2: SX(domain.x[1]),
          y2: SY(gy(domain.x[1])),
          labelX: SX((domain.x[0] + domain.x[1]) / 2),
          labelY: SY(gy((domain.x[0] + domain.x[1]) / 2)) - 9,
        };
      })()
    : null;

  const showName = (m: MapMaterial) =>
    view.k > 1.8 || hovered === m || selected === m || (guide != null && labeled.has(m));

  const card = hovered ?? selected;

  // ── page ───────────────────────────────────────────────────────────────
  return (
    <div
      className="flexure-shell"
      style={{
        ["--mono" as string]: "'JetBrains Mono', 'SF Mono', Menlo, monospace",
        ["--sans" as string]: "'Inter', system-ui, sans-serif",
        background: "#080c10",
        minHeight: "100vh",
        color: "#e8edf1",
        fontFamily: "var(--sans)",
      }}
    >
      <div style={{ maxWidth: 1080, margin: "0 auto" }}>
        {/* Header */}
        <div className="flexure-header" style={{ borderBottom: "1px solid #1f2a33", paddingBottom: 14, marginBottom: 16 }}>
          <div>
            <div style={{ fontFamily: M, fontSize: 10, letterSpacing: "0.25em", color: "#3a78c2" }}>
              MATERIALS SELECTION · ASHBY CHART
            </div>
            <h1 className="flexure-title" style={{ margin: "6px 0 0", fontSize: 24, fontWeight: 600, letterSpacing: "-0.02em" }}>
              Materials Map
            </h1>
          </div>
          <div style={{ fontFamily: M, fontSize: 11, color: "#6b7884", textAlign: "right", lineHeight: 1.7 }}>
            M = σᵃ/ρ, Eᵃ/ρ — minimum-mass index
            <br />
            scroll to zoom · drag to pan · drag the line
          </div>
        </div>

        {/* Controls */}
        <div className="matmap-controls">
          <Select
            label="Y axis"
            value={effY}
            onChange={(v) => {
              setYProp(v as PropKey);
              if (classic) setCaseId(v === "E" || v === "sig" ? caseId : "free");
            }}
          >
            {PROP_KEYS.map((k) => (
              <option key={k} value={k} disabled={!!classic && k !== effY}>
                {PROPS[k].name} ({PROPS[k].unit})
              </option>
            ))}
          </Select>
          <Select
            label="X axis"
            value={effX}
            onChange={(v) => setXProp(v as PropKey)}
          >
            {PROP_KEYS.map((k) => (
              <option key={k} value={k} disabled={!!classic && k !== "rho"}>
                {PROPS[k].name} ({PROPS[k].unit})
              </option>
            ))}
          </Select>
          <Select label="Guideline" value={caseId} onChange={(v) => setCaseId(v as CaseId)}>
            <option value="free">None — free explore</option>
            {DESIGN_CASES.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} — {c.label} (slope {+(1 / c.a).toFixed(1)})
              </option>
            ))}
            <option value="custom">Custom slope…</option>
          </Select>
          {caseId === "custom" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <label style={{ fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: "#6b7884", fontFamily: M }}>
                Slope (log-log)
              </label>
              <input
                type="number"
                value={slopeStr}
                step="0.5"
                min="0.1"
                max="10"
                onChange={(e) => setSlopeStr(e.target.value)}
                style={{
                  background: "#0e1419", border: "1px solid #1f2a33", borderRadius: 2, color: "#e8edf1",
                  padding: "9px 11px", fontFamily: M, fontSize: 15, width: 110,
                }}
              />
            </div>
          )}
          <div className="matmap-chips">
            {FAMILIES.map((fam) => {
              const off = hidden.has(fam.id);
              return (
                <button
                  key={fam.id}
                  onClick={() =>
                    setHidden((h) => {
                      const n = new Set(h);
                      if (n.has(fam.id)) n.delete(fam.id);
                      else n.add(fam.id);
                      return n;
                    })
                  }
                  style={{
                    display: "inline-flex", alignItems: "center", gap: 6, fontFamily: "var(--sans)",
                    fontSize: 11.5, color: off ? "#46515c" : "#c2ccd4", background: "#0e1419",
                    border: "1px solid #1f2a33", borderRadius: 999, padding: "4px 10px 4px 7px",
                    cursor: "pointer", opacity: off ? 0.55 : 1,
                  }}
                >
                  <span style={{ width: 9, height: 9, borderRadius: "50%", background: off ? "#2a3540" : fam.color }} />
                  {fam.name}
                </button>
              );
            })}
          </div>
        </div>

        {/* Chart + rail */}
        <div className="matmap-grid" style={{ marginTop: 14 }}>
          <div style={{ position: "relative", background: "#0a0f14", border: "1px solid #1f2a33", borderRadius: 3, overflow: "hidden" }}>
            <svg
              ref={svgRef}
              className="matmap-chart"
              style={{ display: "block", width: "100%", touchAction: "none", cursor: "grab" }}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
              onPointerLeave={() => setHovered(null)}
              onDoubleClick={resetView}
            >
              {gridLines}
              <defs>
                <clipPath id="matmap-plot">
                  <rect x={PAD.l} y={PAD.t} width={size.w - PAD.l - PAD.r} height={size.h - PAD.t - PAD.b} />
                </clipPath>
              </defs>
              <g clipPath="url(#matmap-plot)">
                {/* the "wins" half-plane above the guideline */}
                {guideGeom && (
                  <path
                    d={`M ${guideGeom.x1} ${guideGeom.y1} L ${guideGeom.x2} ${guideGeom.y2} L ${guideGeom.x2} ${-size.h} L ${guideGeom.x1} ${-size.h} Z`}
                    fill="rgba(58,120,194,0.07)"
                  />
                )}
                {/* family blobs */}
                {hulls.map(({ fam, hull }) => {
                  if (hidden.has(fam.id) || hull.length < 3) return null;
                  const d = smoothClosed(hull.map((p) => [SX(p[0]), SY(p[1])]));
                  return <path key={fam.id} d={d} fill={fam.color} fillOpacity={0.07} stroke={fam.color} strokeOpacity={0.3} strokeWidth={1.1} />;
                })}
                {/* material ellipses */}
                {items.map((it) => {
                  if (hidden.has(it.m.fam)) return null;
                  const cx = SX(it.cx);
                  const cy = SY(it.cy);
                  const rx = Math.max(it.rx * Math.abs(base.sx) * view.k, 4);
                  const ry = Math.max(it.ry * Math.abs(base.sy) * view.k, 4);
                  if (cx + rx < PAD.l || cx - rx > size.w - PAD.r || cy + ry < PAD.t || cy - ry > size.h - PAD.b) return null;
                  const color = FAM_BY_ID[it.m.fam].color;
                  const hot = hovered === it.m || selected === it.m;
                  const dimmed = guide != null && !rankedSet.has(it.m) && !hot;
                  return (
                    <ellipse
                      key={it.m.name}
                      cx={cx} cy={cy} rx={rx} ry={ry}
                      fill={color} fillOpacity={hot ? 0.7 : dimmed ? 0.1 : 0.42}
                      stroke={hot ? "#e8edf1" : color} strokeOpacity={dimmed ? 0.25 : 1}
                      strokeWidth={hot ? 1.6 : 1}
                    />
                  );
                })}
                {/* labels on top */}
                {items.map((it) => {
                  if (hidden.has(it.m.fam) || !showName(it.m)) return null;
                  const cx = SX(it.cx);
                  const cy = SY(it.cy);
                  if (cx < PAD.l - 60 || cx > size.w || cy < PAD.t || cy > size.h - PAD.b) return null;
                  const hot = hovered === it.m || selected === it.m;
                  return (
                    <text
                      key={`l-${it.m.name}`}
                      x={cx} y={cy - 5} textAnchor="middle"
                      fill="#e8edf1" fontSize={hot ? 12 : 10.5} fontWeight={hot ? 700 : 500}
                      fontFamily="var(--sans)" paintOrder="stroke" stroke="#0a0f14" strokeWidth={3}
                    >
                      {it.m.name}
                    </text>
                  );
                })}
                {/* the guideline */}
                {guideGeom && guide && (
                  <>
                    <line x1={guideGeom.x1} y1={guideGeom.y1} x2={guideGeom.x2} y2={guideGeom.y2} stroke="#3a78c2" strokeWidth={2} strokeDasharray="7 5" />
                    <text
                      x={guideGeom.labelX} y={guideGeom.labelY} textAnchor="middle"
                      fill="#5f9bd8" fontSize={11.5} fontWeight={650} fontFamily={M}
                      paintOrder="stroke" stroke="#0a0f14" strokeWidth={4}
                    >
                      {guide.label} = {f(mCur)} · slope {+guidelineSlope(guide.a).toFixed(2)} — drag
                    </text>
                  </>
                )}
              </g>
              {/* axis titles */}
              <text x={(PAD.l + size.w - PAD.r) / 2} y={size.h - 6} textAnchor="middle" fill="#8b97a3" fontSize={11.5} fontFamily={M}>
                {PROPS[effX].name}
                {PROPS[effX].symbol !== PROPS[effX].unit ? ` ${PROPS[effX].symbol}` : ""}, {PROPS[effX].unit} (log)
              </text>
              <text
                x={13} y={(PAD.t + size.h - PAD.b) / 2} textAnchor="middle"
                fill="#8b97a3" fontSize={11.5} fontFamily={M}
                transform={`rotate(-90 13 ${(PAD.t + size.h - PAD.b) / 2})`}
              >
                {PROPS[effY].name}
                {PROPS[effY].symbol !== PROPS[effY].unit ? ` ${PROPS[effY].symbol}` : ""}, {PROPS[effY].unit} (log)
              </text>
            </svg>
            <div style={{ position: "absolute", right: 8, top: 8, fontFamily: M, fontSize: 9.5, color: "#46515c", pointerEvents: "none" }}>
              ×{view.k.toFixed(1)} · double-click resets
            </div>
          </div>

          {/* Rail */}
          <div style={{ display: "flex", flexDirection: "column", gap: 12, minWidth: 0 }}>
            {guide && (
              <div style={{ background: "#0e1419", border: "1px solid #1f2a33", borderRadius: 3, padding: "12px 14px" }}>
                <div style={{ fontFamily: M, fontSize: 10, letterSpacing: "0.15em", color: "#6b7884", marginBottom: 8 }}>
                  SHORTLIST · {guide.label} ≥ {f(mCur)}
                </div>
                <div style={{ fontSize: 11.5, color: "#8b97a3", marginBottom: 8 }}>
                  {ranked.length} of {indices.length} shown materials qualify — drag the dashed line to tighten or relax.
                </div>
                <ol style={{ margin: 0, padding: 0, listStyle: "none", maxHeight: 300, overflowY: "auto" }}>
                  {ranked.map((r, i) => (
                    <li
                      key={r.m.name}
                      onClick={() => setSelected(r.m)}
                      style={{
                        display: "flex", alignItems: "center", gap: 8, padding: "5px 2px",
                        borderBottom: "1px solid #141c22", fontSize: 12.5, cursor: "pointer",
                        color: selected === r.m ? "#e8edf1" : "#c2ccd4",
                      }}
                    >
                      <span style={{ fontFamily: M, fontSize: 10, color: "#46515c", width: 18 }}>{i + 1}</span>
                      <span style={{ width: 8, height: 8, borderRadius: "50%", background: FAM_BY_ID[r.m.fam].color, flex: "none" }} />
                      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.m.name}</span>
                      <span style={{ marginLeft: "auto", fontFamily: M, fontSize: 11.5, color: "#8b97a3", fontVariantNumeric: "tabular-nums" }}>
                        {f(r.idx)}
                      </span>
                    </li>
                  ))}
                </ol>
              </div>
            )}

            <div style={{ background: "#0e1419", border: "1px solid #1f2a33", borderRadius: 3, padding: "12px 14px" }}>
              <div style={{ fontFamily: M, fontSize: 10, letterSpacing: "0.15em", color: "#6b7884", marginBottom: 8 }}>
                MATERIAL PASSPORT
              </div>
              {card ? (
                <>
                  <div style={{ fontSize: 15, fontWeight: 600 }}>{card.name}</div>
                  <div style={{ fontFamily: M, fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: FAM_BY_ID[card.fam].color, margin: "2px 0 8px" }}>
                    {FAM_BY_ID[card.fam].name}
                  </div>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <tbody>
                      {PROP_KEYS.map((k) => (
                        <tr key={k}>
                          <td style={{ padding: "3px 0", fontSize: 11.5, color: "#8b97a3", borderBottom: "1px solid #141c22" }}>
                            {PROPS[k].name}
                          </td>
                          <td style={{ padding: "3px 0", fontSize: 11.5, color: "#c2ccd4", borderBottom: "1px solid #141c22", textAlign: "right", fontFamily: M, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>
                            {fmtRange(card[k] as Range | null, PROPS[k].unit)}
                          </td>
                        </tr>
                      ))}
                      {DESIGN_CASES.map((c) => {
                        const yr = card[c.y] as Range | null;
                        if (!yr) return null;
                        return (
                          <tr key={c.id}>
                            <td style={{ padding: "3px 0", fontSize: 11.5, color: "#5a6773", borderBottom: "1px solid #141c22" }}>
                              {c.name} · {c.label}
                            </td>
                            <td style={{ padding: "3px 0", fontSize: 11.5, color: "#8b97a3", borderBottom: "1px solid #141c22", textAlign: "right", fontFamily: M, fontVariantNumeric: "tabular-nums" }}>
                              {f(indexValue(logMid(yr), logMid(card.rho), c.a))}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  <div style={{ fontSize: 10.5, color: "#46515c", marginTop: 8 }}>
                    {selected === card ? "Pinned — click the ellipse again to unpin." : "Click the ellipse to pin."}
                  </div>
                </>
              ) : (
                <div style={{ fontSize: 12, color: "#6b7884", lineHeight: 1.6 }}>
                  Hover a material for its full property card; click to pin it. Ranges are class envelopes — the
                  spread of the family, not one datasheet.
                </div>
              )}
            </div>
          </div>
        </div>

        <Theory />
      </div>
    </div>
  );
}

// ── theory ────────────────────────────────────────────────────────────────
const P: React.CSSProperties = { fontSize: 12.5, color: "#8b97a3", lineHeight: 1.75, margin: "0 0 12px" };
const B: React.CSSProperties = { color: "#c2ccd4", fontWeight: 600 };
const H3: React.CSSProperties = {
  fontFamily: "var(--mono)", fontSize: 11, fontWeight: 700, letterSpacing: "0.15em",
  textTransform: "uppercase", color: "#c2ccd4", margin: "22px 0 8px",
};

function Theory() {
  return (
    <div style={{ marginTop: 26, borderTop: "1px solid #1f2a33", paddingTop: 18, maxWidth: 760 }}>
      <div style={{ fontFamily: "var(--mono)", fontSize: 10, letterSpacing: "0.25em", color: "#3a78c2", marginBottom: 4 }}>
        THEORY
      </div>

      <div style={H3}>Why materials live on log-log paper</div>
      <p style={P}>
        Engineering materials span <b style={B}>five to six decades</b> in almost every property: stiffness runs from
        ~0.0003 GPa (flexible foam) to ~700 GPa (tungsten carbide). On linear axes everything but the extremes
        collapses into a smear; on log axes each material class occupies its own readable island, and — the real
        trick — <b style={B}>merit indices become straight lines</b>. This presentation is due to Michael Ashby, and
        charts like this one are the standard first pass of materials selection.
      </p>

      <div style={H3}>Where the guideline slopes come from</div>
      <p style={P}>
        Take the classic case: the lightest <b style={B}>beam of fixed length and width</b> that must not deflect more
        than a target under a load. Bending stiffness needs E·I; with the depth h free, I ∝ h³, so h ∝ (1/E)<sup>1/3</sup>.
        Mass is ρ·h per unit area, so m ∝ ρ/E<sup>1/3</sup>… solving the same way for each geometry gives a family of
        indices <span style={{ fontFamily: "var(--mono)" }}>M = Eᵃ/ρ</span> (or σᵃ/ρ for strength-limited design):
        a = 1 when the section area is free (a tie), a = ½ (stiffness) or ⅔ (strength) for a beam, a = ⅓ or ½ for a
        panel. Rearranged on log axes, all materials with equal M sit on the line{" "}
        <span style={{ fontFamily: "var(--mono)" }}>log y = (log M + log x)/a</span> — slope 1/a. Slide the line up and
        the surviving materials are, in order, the lightest ways to do that job. That is exactly what dragging the
        dashed line does, and the shortlist is the rank by M.
      </p>
      <p style={P}>
        This is why <b style={B}>wood and CFRP embarrass steel in bending</b> (slope-2 line: √E/ρ) while barely beating
        it in pure tension (slope-1 line: E/ρ): a beam gets stiffness from depth cheaply, so low density buys more than
        high modulus. The chart makes that argument visually in one glance.
      </p>

      <div style={H3}>Reading the map</div>
      <p style={P}>
        Each ellipse is a <b style={B}>material class</b>, spanning the range from weak annealed grades to strong
        treated ones — aluminum alloys stretch from ~30 MPa (soft 1000-series) to ~550 MPa (7075-T6). The tinted blobs
        group families. "Strength" means yield for metals and polymers, modulus of rupture for ceramics and glasses,
        and tensile strength for composites and elastomers — the convention Ashby charts use, because ceramics in
        tension and metals in shear fail by different physics. Zoom in to separate the crowded polymer island;
        properties fade in as labels when there is room.
      </p>

      <div style={H3}>Where this map stops being right</div>
      <p style={P}>
        <b style={B}>1 · Class envelopes, not datasheets.</b> The ranges are textbook-typical spans for each class
        (Ashby-style), good for choosing between families and shortlisting. The moment a candidate is chosen, switch to
        the supplier's datasheet for the actual grade, temper and process.
      </p>
      <p style={P}>
        <b style={B}>2 · Room temperature, no time.</b> Every number is ~20 °C and short-term. Polymers creep, their
        moduli fall fast with temperature; the max-service-temperature column is a rough continuous-use bound, not a
        design allowable.
      </p>
      <p style={P}>
        <b style={B}>3 · Isotropic averages.</b> Wood ∥/⊥ grain get separate rows precisely because anisotropy is
        huge; CFRP is shown quasi-isotropic — a unidirectional layup roughly doubles E along the fibers and collapses
        it across them.
      </p>
      <p style={P}>
        <b style={B}>4 · Minimum mass is not the only objective.</b> The indices here optimize weight. Cost, energy
        content, toughness at minimum temperature, fatigue, corrosion and manufacturability all constrain real
        selections — Ashby's method handles those too, with other indices this map does not draw yet.
      </p>

      <div style={H3}>References</div>
      <p style={{ ...P, marginBottom: 0 }}>
        Ashby, <b style={B}>Materials Selection in Mechanical Design</b> — ch. 4 (property charts), ch. 5–6 (indices
        and selection); the strength–density and modulus–density charts this page reproduces are Ashby's figures.
        Property ranges are typical published class envelopes, assembled for comparison — verify anything critical
        against supplier data.
      </p>
      <p style={{ ...P, marginTop: 10 }}>
        <b style={B}>In short:</b> materials plotted on log-log axes form a map, and "lightest material for the job"
        is a straight line across it. Pick the design case, drag the line until few enough materials survive, and read
        the shortlist — then go get real datasheets for the survivors.
      </p>
    </div>
  );
}
