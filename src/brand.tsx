// MechCalc brand mark. Four candidate designs live side by side; the one named
// by ACTIVE_DESIGN is what the header shows and what the icon script copies to
// the site root (favicon + home-screen icons). To rebrand:
//   1. change ACTIVE_DESIGN below
//   2. run `node scripts/render-icons.mjs`
// Full-tile previews of all four: public/designs/brand/index.html
export type BrandDesign = "blueprint" | "beam" | "hexm" | "gauge";
export const ACTIVE_DESIGN: BrandDesign = "beam";

// Transparent-background header marks. Same geometry as the icon tiles in
// public/brand/<design>/icon.svg, minus the tile, grid and captions so they
// sit directly on the page background at text size.
const MARKS: Record<BrandDesign, JSX.Element> = {
  blueprint: (
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
  beam: (
    <>
      <defs>
        <linearGradient id="lg-stress" x1="92" y1="0" x2="436" y2="0" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#d65c5c" />
          <stop offset="0.45" stopColor="#d9a441" />
          <stop offset="1" stopColor="#4fb477" />
        </linearGradient>
      </defs>
      <g stroke="#6b7884" strokeWidth="16" strokeLinecap="round">
        <path d="M88 118V330" />
        <path d="M88 140 62 166M88 186 62 212M88 232 62 258M88 278 62 304M88 324 62 350" strokeWidth="12" />
      </g>
      <path d="M108 196H436" stroke="#46515c" strokeWidth="12" strokeDasharray="4 30" strokeLinecap="round" />
      <g stroke="#5a95d8" fill="#5a95d8">
        <path d="M436 122V254" strokeWidth="22" strokeLinecap="round" />
        <path d="M436 316 401 254h70z" stroke="none" />
      </g>
      <path d="M92 196 Q 300 202 434 348" fill="none" stroke="url(#lg-stress)" strokeWidth="62" strokeLinecap="round" />
    </>
  ),
  hexm: (
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
  gauge: (
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

export function LogoMark({ size = 34, design = ACTIVE_DESIGN }: { size?: number; design?: BrandDesign }) {
  return (
    <svg
      viewBox="0 0 512 512"
      width={size}
      height={size}
      aria-hidden="true"
      style={{ display: "block", flexShrink: 0 }}
    >
      {MARKS[design]}
    </svg>
  );
}
