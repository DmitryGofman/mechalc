// MechCalc brand mark — "Moment Field": the cantilever painted by SIGNED
// bending stress (tension red above the neutral axis, compression blue below,
// both relaxing to neutral green at the free end where the moment vanishes),
// emerging from a hatched fixed wall.
//
// Every candidate from the study that chose it is still here; the one named by
// ACTIVE_DESIGN is what the header shows and what the icon script copies to the
// site root (favicon + home-screen icons). To rebrand:
//   1. change ACTIVE_DESIGN below
//   2. run `node scripts/render-icons.mjs`
// Full-tile previews of all eight: public/designs/brand/index.html
export type BrandDesign =
  | "blueprint"
  | "beam"
  | "hexm"
  | "gauge"
  | "beamsplit"
  | "beamramp"
  | "beamfringe"
  | "beamfield";
export const ACTIVE_DESIGN: BrandDesign = "beamfield";

// ── Stress-beam tension/compression variants ────────────────────────────
// Bands offset along the beam's quadratic centerline, painted by SIGNED
// bending stress on the app's own scale (src/calculators/stressColor.ts):
// tension red above the neutral axis, compression blue below, green at zero.
// Mirrors scripts/gen-beam-variants.mjs, which generates the icon tiles.
const RED = "#d64545";
const GREEN = "#4fb477";
const BLUE = "#4575e6";
const RAMP8 = ["#d75742", "#d87a3b", "#b69648", "#71aa67", "#48ac85", "#3a9ca0", "#378cbb", "#407dd7"];
const FRINGE5 = [RED, "#d98c38", GREEN, "#3394ad", BLUE];
const H = 40; // half-thickness of the header-mark beam

const bPoint = (t: number) => {
  const a = (1 - t) * (1 - t), b = 2 * (1 - t) * t, c = t * t;
  return [a * 60 + b * 300 + c * 434, a * 196 + b * 202 + c * 348];
};
const bNormal = (t: number) => {
  const tx = 2 * (1 - t) * 240 + 2 * t * 134;
  const ty = 2 * (1 - t) * 6 + 2 * t * 146;
  const len = Math.hypot(tx, ty);
  return [ty / len, -tx / len]; // unit normal pointing up, toward tension
};
const bEdge = (d: number) =>
  Array.from({ length: 17 }, (_, i) => {
    const t = i / 16, [x, y] = bPoint(t), [nx, ny] = bNormal(t);
    return [x + nx * d, y + ny * d];
  });
const bLine = (pts: number[][]) =>
  pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
const bBand = (d1: number, d2: number) =>
  `${bLine(bEdge(d1))} ${bLine(bEdge(d2).reverse()).replace("M", "L")} Z`;
// dash-dot neutral-axis centerline, overshooting the tip per drawing convention
const bAxisD = (() => {
  const [ex, ey] = bPoint(1), len = Math.hypot(268, 292);
  return `${bLine(bEdge(0))} L${(ex + (268 / len) * 30).toFixed(1)} ${(ey + (292 / len) * 30).toFixed(1)}`;
})();
// The neutral axis. At icon sizes it is a proper dash-dot drawing centerline;
// inline at text size those dashes shrink below a pixel and read as speckle
// through the color bands, so the compact mark states it as a plain hairline.
const bAxis = (color: string, compact: boolean) => (
  <path
    d={bAxisD}
    fill="none"
    stroke={color}
    strokeWidth={compact ? 3.5 : 4.5}
    strokeDasharray={compact ? undefined : "20 9 5 9"}
    strokeOpacity={compact ? 0.8 : 1}
    strokeLinecap="round"
  />
);

// Scaffolding shared by every beam mark: undeflected line + tip load before
// the beam, wall slab over its root after. The load arrow stands off the
// deflected tip by ~10% of the tile so the arrowhead reads as a separate
// object rather than merging into the beam's top surface.
const beamScaffold = (
  <>
    <path d="M108 196H436" stroke="#46515c" strokeWidth="12" strokeDasharray="4 30" strokeLinecap="round" />
    <g stroke="#5a95d8" fill="#5a95d8">
      <path d="M436 71V203" strokeWidth="22" strokeLinecap="round" />
      <path d="M436 265 401 203h70z" stroke="none" />
    </g>
  </>
);
// Support hatching is the other detail that muddies at text size; the compact
// wall carries the slab and its brighter face instead, which still reads as
// "built in".
const beamWall = (compact: boolean) => (
  <>
    <rect x="0" y="96" width="92" height="260" fill="#10161d" />
    {!compact && (
      <g stroke="#46515c" strokeWidth="11" strokeLinecap="round">
        <path d="M82 130 54 158M82 174 54 202M82 218 54 246M82 262 54 290M82 306 54 334" />
      </g>
    )}
    <path d="M92 96V356" stroke="#8b97a3" strokeWidth={compact ? 18 : 15} strokeLinecap="round" />
  </>
);

// Transparent-background header marks, as functions of `compact` — true when
// the mark renders at text size, where the finest details are dropped. Same
// geometry as the icon tiles in public/brand/<design>/icon.svg, minus the tile,
// grid and captions so they sit directly on the page background.
const MARKS: Record<BrandDesign, (compact: boolean) => JSX.Element> = {
  blueprint: () => (
    <>
      <g stroke="#3a78c2" strokeWidth="10" opacity="0.6" strokeDasharray="34 12 6 12">
        <path d="M256 30V482" />
        <path d="M30 256H482" />
      </g>
      <path
        d="M405.7 229.6 A152 152 0 1 1 282.4 106.3"
        fill="none"
        stroke="#5a95d8"
        strokeWidth="22"
        strokeLinecap="round"
      />
      <circle cx="256" cy="256" r="112" fill="none" stroke="#e8edf1" strokeWidth="30" />
    </>
  ),
  beam: (compact) => (
    <>
      <defs>
        <linearGradient id="lg-stress" x1="92" y1="0" x2="436" y2="0" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#d65c5c" />
          <stop offset="0.45" stopColor="#d9a441" />
          <stop offset="1" stopColor="#4fb477" />
        </linearGradient>
      </defs>
      {beamScaffold}
      <path d="M60 196 Q 300 202 434 348" fill="none" stroke="url(#lg-stress)" strokeWidth="62" strokeLinecap="round" />
      {beamWall(compact)}
    </>
  ),
  beamsplit: (compact) => (
    <>
      {beamScaffold}
      <path d={bBand(H, 0.3 * H)} fill={RED} />
      <path d={bBand(0.3 * H, -0.3 * H)} fill="#0c141c" />
      <path d={bBand(-0.3 * H, -H)} fill={BLUE} />
      {bAxis(GREEN, compact)}
      {beamWall(compact)}
    </>
  ),
  beamramp: (compact) => (
    <>
      {beamScaffold}
      {RAMP8.map((c, i) => (
        <path key={c} d={bBand((1 - i / 4) * H, (1 - (i + 1) / 4) * H)} fill={c} />
      ))}
      {bAxis("#dfe6ec", compact)}
      {beamWall(compact)}
    </>
  ),
  beamfringe: (compact) => (
    <>
      {beamScaffold}
      {FRINGE5.map((c, i) => (
        <path key={c} d={bBand((1 - (2 * i) / 5) * H, (1 - (2 * (i + 1)) / 5) * H)} fill={c} />
      ))}
      {!compact &&
        [1, 2, 3, 4].map((k) => (
          <path key={k} d={bLine(bEdge((1 - (2 * k) / 5) * H))} fill="none" stroke="#0c141c" strokeWidth="2" />
        ))}
      {bAxis("#dfe6ec", compact)}
      {beamWall(compact)}
    </>
  ),
  beamfield: (compact) => (
    <>
      <defs>
        {FRINGE5.map(
          (c, i) =>
            c !== GREEN && (
              <linearGradient key={c} id={`lg-field-${i}`} x1="92" y1="0" x2="420" y2="0" gradientUnits="userSpaceOnUse">
                <stop offset="0" stopColor={c} />
                <stop offset="1" stopColor={GREEN} />
              </linearGradient>
            ),
        )}
      </defs>
      {beamScaffold}
      {FRINGE5.map((c, i) => (
        <path
          key={c}
          d={bBand((1 - (2 * i) / 5) * H, (1 - (2 * (i + 1)) / 5) * H)}
          fill={c === GREEN ? GREEN : `url(#lg-field-${i})`}
        />
      ))}
      {bAxis("#dfe6ec", compact)}
      {beamWall(compact)}
    </>
  ),
  hexm: () => (
    <>
      <polygon
        points="434,256 345,101.8 167,101.8 78,256 167,410.2 345,410.2"
        fill="none"
        stroke="#3a78c2"
        strokeWidth="34"
        strokeLinejoin="round"
      />
      <polyline
        points="186,336 186,178 256,284 326,178 326,336"
        fill="none"
        stroke="#e8edf1"
        strokeWidth="37"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </>
  ),
  gauge: () => (
    <>
      <g fill="none" strokeWidth="44" strokeLinecap="round">
        <path d="M119.2 379 A158 158 0 0 1 228.6 144.4" stroke="#4fb477" />
        <path d="M245.0 142.4 A158 158 0 0 1 377.0 198.4" stroke="#d9a441" />
        <path d="M387.0 211.6 A158 158 0 0 1 392.8 379" stroke="#d65c5c" />
      </g>
      <path d="M256 300 152.1 240" stroke="#e8edf1" strokeWidth="24" strokeLinecap="round" />
      <circle cx="256" cy="300" r="32" fill="#e8edf1" />
      <circle cx="256" cy="300" r="13" fill="#080c10" />
    </>
  ),
};

// Below this the 512-unit artwork is drawn into fewer than ~48 device pixels,
// where the dash-dot centerline and support hatching stop resolving.
const COMPACT_BELOW = 56;

export function LogoMark({ size = 34, design = ACTIVE_DESIGN }: { size?: number; design?: BrandDesign }) {
  return (
    <svg
      viewBox="0 0 512 512"
      width={size}
      height={size}
      aria-hidden="true"
      style={{ display: "block", flexShrink: 0 }}
    >
      {MARKS[design](size < COMPACT_BELOW)}
    </svg>
  );
}
