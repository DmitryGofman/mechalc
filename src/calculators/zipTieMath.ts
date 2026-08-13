// Zip-tie (cable-tie) math: will this tie hold that load, in that place?
//
// The one number a tie is sold by is its MINIMUM LOOP TENSILE STRENGTH — the
// force that pulls the closed loop apart in the UL 62275 / SAE AS23190 test,
// where the head (the pawl, not the strap) is almost always what lets go.
// Everything here hangs off that rating:
//
//   rated loop tensile (size class, PA66 baseline)
//     × material factor        (PP is half a nylon tie; stainless is double)
//     × temperature factor     (nylon at 85 °C keeps barely half its strength)
//     × environment factor     (UV / moisture aging allowance)
//   = CAPACITY in your conditions
//     ÷ your target safety factor (2 static … 5 vibrating)
//   = max recommended working load
//
// The strap's own break force (σ_tensile · w · t) is computed alongside — not
// because it governs (it doesn't; the head does), but because the ratio
// rated/strap-break is the head efficiency, and seeing it ≈ 0.4–0.6 is what
// makes the rating make sense.
//
// Units: N, mm, MPa, °C. Ratings are quoted in lbf because the trade does.
// Typical catalog reference values (Panduit / HellermannTyton / T&B class
// minimums, UL 62275, SAE AS23190) — verify against the datasheet of the tie
// you actually buy.

export const N_PER_LBF = 4.4482216152605;
export const G = 9.80665; // N per kg — for "how much weight" readouts

// ── Size classes ──────────────────────────────────────────────────────────
// The trade's six standard strength classes. Width/thickness are typical
// commercial dimensions; `rated` is the class-minimum loop tensile for plain
// PA66, which is what the lbf name of the class means.
export type TieSize = {
  ratedLb: number; // the name of the class
  rated: number; // N — minimum loop tensile, PA66 baseline
  w: number; // strap width, mm
  t: number; // strap thickness, mm
  lengths: string; // lengths the class is commonly sold in
  bundleMax: number; // largest bundle Ø the longest common length closes on, mm
  ms3367: string; // the usual MIL/MS dash size for this class ("—" if none)
};

export const TIE_SIZES: Record<string, TieSize> = {
  "Miniature — 18 lb": {
    ratedLb: 18, rated: 80, w: 2.5, t: 1.0,
    lengths: "71–203 mm (3–8″)", bundleMax: 51, ms3367: "MS3367-4 / -3",
  },
  "Intermediate — 40 lb": {
    ratedLb: 40, rated: 178, w: 3.6, t: 1.2,
    lengths: "140–368 mm (5.5–14.5″)", bundleMax: 102, ms3367: "MS3367-5",
  },
  "Standard — 50 lb": {
    ratedLb: 50, rated: 222, w: 4.8, t: 1.3,
    lengths: "99–991 mm (4–39″)", bundleMax: 254, ms3367: "MS3367-1",
  },
  "Light-heavy — 120 lb": {
    ratedLb: 120, rated: 534, w: 7.6, t: 1.8,
    lengths: "203–991 mm (8–39″)", bundleMax: 254, ms3367: "MS3367-2",
  },
  "Heavy — 175 lb": {
    ratedLb: 175, rated: 778, w: 8.9, t: 2.0,
    lengths: "229–1219 mm (9–48″)", bundleMax: 330, ms3367: "MS3367-7",
  },
  "Extra-heavy — 250 lb": {
    ratedLb: 250, rated: 1112, w: 12.7, t: 2.3,
    lengths: "356–1219 mm (14–48″)", bundleMax: 330, ms3367: "—",
  },
};

// ── Materials ─────────────────────────────────────────────────────────────
// `factor` scales the size class's PA66 rating to this material at 23 °C.
// `derate` is the loop-tensile retention vs temperature, piecewise-linear
// anchors from typical vendor derating charts; outside [tMin, tMax] the tie
// is out of its continuous rating and capacity is reported as zero.
// `tens` (MPa) is the strap material's tensile strength (conditioned, RT) for
// the strap-break cross-check; `E` (MPa) feeds the stretch in the 3D view.
export type TieMaterial = {
  factor: number;
  tens: number;
  E: number;
  tMin: number;
  tMax: number; // continuous, °C
  derate: [number, number][];
  uv: "immune" | "good" | "poor";
  moist: number; // % water absorption at saturation
  ul94: string;
  metal?: boolean;
  tone: string; // 3D strap color
  note: string;
};

const PA66_DERATE: [number, number][] = [
  [-40, 1.05], [23, 1.0], [40, 0.87], [60, 0.72], [85, 0.55], [105, 0.42], [125, 0.3],
];

export const TIE_MATS: Record<string, TieMaterial> = {
  "PA66 nylon (standard)": {
    factor: 1.0, tens: 80, E: 1400, tMin: -40, tMax: 85, derate: PA66_DERATE,
    uv: "poor", moist: 8.5, ul94: "V-2", tone: "#d8d4c8",
    note: "The default tie — natural or dyed black. Indoor use; UV breaks it down in months outdoors.",
  },
  "PA66 UV / weather-resistant": {
    factor: 1.0, tens: 80, E: 1400, tMin: -40, tMax: 85, derate: PA66_DERATE,
    uv: "good", moist: 8.5, ul94: "V-2", tone: "#2e3236",
    note: "≥2% carbon black through the resin, not just dye — the only nylon tie that belongs in sunlight.",
  },
  "PA66 heat-stabilized": {
    factor: 1.0, tens: 80, E: 1400, tMin: -40, tMax: 105, derate: PA66_DERATE,
    uv: "poor", moist: 8.5, ul94: "V-2", tone: "#4a4238",
    note: "Copper-iodide stabilizer package; rated 105 °C continuous for engine bays and hot enclosures.",
  },
  "PA66 impact-modified (HIR)": {
    factor: 0.85, tens: 70, E: 1100, tMin: -40, tMax: 85, derate: PA66_DERATE,
    uv: "poor", moist: 8.0, ul94: "HB", tone: "#c8ccd0",
    note: "Rubber-toughened for cold installs and vibration; trades ~15% of the rating for ductility.",
  },
  "PA12 / PA11 nylon": {
    factor: 0.8, tens: 45, E: 1300, tMin: -40, tMax: 85,
    derate: [[-40, 1.05], [23, 1.0], [40, 0.85], [60, 0.68], [85, 0.5]],
    uv: "good", moist: 1.5, ul94: "HB", tone: "#c4c8b8",
    note: "Absorbs almost no water, so its strength barely moves with humidity — solar and marine favourite.",
  },
  Polypropylene: {
    factor: 0.5, tens: 33, E: 1300, tMin: -40, tMax: 85,
    derate: [[-40, 1.1], [23, 1.0], [40, 0.78], [60, 0.55], [85, 0.35]],
    uv: "poor", moist: 0.03, ul94: "HB", tone: "#c8d8cc",
    note: "Half the strength, but shrugs off acids, bases and salt water, and it floats. Chemical plants.",
  },
  "ETFE (Tefzel)": {
    factor: 0.63, tens: 45, E: 800, tMin: -80, tMax: 170,
    derate: [[-80, 1.1], [23, 1.0], [85, 0.68], [125, 0.5], [150, 0.38], [170, 0.3]],
    uv: "immune", moist: 0.03, ul94: "V-0", tone: "#7a8894",
    note: "Fluoropolymer: radiation-, chemical- and UV-immune, −80…+170 °C. Nuclear and plating lines.",
  },
  PEEK: {
    factor: 0.9, tens: 100, E: 3600, tMin: -55, tMax: 240,
    derate: [[-55, 1.05], [23, 1.0], [100, 0.8], [150, 0.65], [200, 0.5], [240, 0.4]],
    uv: "good", moist: 0.45, ul94: "V-0", tone: "#8a7a5c",
    note: "240 °C continuous, V-0, aerospace-grade — and priced like it.",
  },
  "Stainless 304 (ball-lock)": {
    factor: 2.0, tens: 620, E: 193000, tMin: -80, tMax: 538,
    derate: [[-80, 1.0], [23, 1.0], [100, 0.95], [300, 0.8], [538, 0.5]],
    uv: "immune", moist: 0, ul94: "n/a", metal: true, tone: "#9aa7b4",
    note: "Smooth steel band, ball bearing in the head does the locking. No creep, no UV, no fire load.",
  },
  "Stainless 316 (ball-lock, marine)": {
    factor: 2.0, tens: 620, E: 193000, tMin: -80, tMax: 538,
    derate: [[-80, 1.0], [23, 1.0], [100, 0.95], [300, 0.8], [538, 0.5]],
    uv: "immune", moist: 0, ul94: "n/a", metal: true, tone: "#a2adb8",
    note: "Same tie in 316 — molybdenum buys chloride resistance for salt spray, chemical and offshore work.",
  },
};

// ── Environment ───────────────────────────────────────────────────────────
// A long-term aging allowance on top of the temperature derate, plus the
// suitability rules the warnings enforce (plain nylon in sunlight, 304 in
// salt spray). Metals skip the polymer aging factors.
export type TieEnv = { f: number; fMetal: number; blurb: string };
export const ENVS: Record<string, TieEnv> = {
  "Indoor, dry": { f: 1.0, fMetal: 1.0, blurb: "the conditions the rating is quoted at" },
  "Outdoor — sunlight (UV)": {
    f: 0.85, fMetal: 1.0,
    blurb: "UV embrittles polymer surfaces over years even in stabilized grades — 15% aging allowance",
  },
  "Damp / humid / marine": {
    f: 0.9, fMetal: 1.0,
    blurb: "nylon saturates to ~2.5% water: more ductile but weaker, and hot-wet drives slow hydrolysis",
  },
  "Chemical / washdown": {
    f: 0.85, fMetal: 1.0,
    blurb: "generic allowance — check the material's own chemical table, it moves more than any factor here",
  },
};

// ── Load nature → the safety factor the trade recommends ─────────────────
// Vendors quote "apply 2–5× on the rating"; this is where each number belongs.
export type LoadNature = { sf: number; blurb: string };
export const NATURES: Record<string, LoadNature> = {
  "Static, short-term": { sf: 2, blurb: "hang it, check it, take it down" },
  "Sustained (weeks to years)": {
    sf: 4,
    blurb: "polymers creep under standing load — hold long-term loads near 25% of the rating",
  },
  "Dynamic / vibration / shock": {
    sf: 5,
    blurb: "vibration works the pawl and fatigues the strap — the trade's 5× case",
  },
};

// Parallel ties never share evenly — lengths, tension and seating scatter, so
// the extras are derated to 80% of a lone tie each.
export const SHARE = 0.8;

// Tail you need beyond the head to grip and tension by hand or tool, mm.
export const TAIL_GRIP = 38;

export const sfColor = (sf: number) => (sf >= 2 ? "#4fb477" : sf >= 1.2 ? "#d9a441" : "#d65c5c");

export function fmt(v: number, digits = 1): string {
  if (!isFinite(v)) return "∞";
  const a = Math.abs(v);
  const d = a >= 100 ? 0 : a >= 10 ? 1 : digits + 1;
  return v.toLocaleString("en-US", { maximumFractionDigits: d, minimumFractionDigits: 0 });
}

export const lbf = (N: number) => N / N_PER_LBF;

// Loop-tensile retention at temperature T — piecewise linear between the
// anchors, zero outside the material's continuous window.
export function tempFactor(mat: TieMaterial, T: number): number {
  if (T < mat.tMin || T > mat.tMax) return 0;
  const a = mat.derate;
  if (T <= a[0][0]) return a[0][1];
  for (let i = 1; i < a.length; i++) {
    if (T <= a[i][0]) {
      const [t0, f0] = a[i - 1], [t1, f1] = a[i];
      return f0 + ((f1 - f0) * (T - t0)) / (t1 - t0 || 1);
    }
  }
  return a[a.length - 1][1];
}

export type ZipInput = {
  size: string;
  mat: string;
  F: number; // total load to hold, N
  n: number; // ties sharing it
  temp: number; // service temperature, °C
  env: string;
  nature: string;
  SFt: number; // target safety factor
  bundle: number; // bundle Ø, mm — sets required length and the 3D model
};

export function defaults(): ZipInput {
  return {
    size: "Standard — 50 lb", mat: "PA66 nylon (standard)",
    F: 80, n: 1, temp: 23, env: "Indoor, dry",
    nature: "Sustained (weeks to years)", SFt: 4, bundle: 20,
  };
}

export type ZipWarning = { level: "bad" | "warn" | "info"; text: string };

export type ZipResult = {
  size: TieSize; m: TieMaterial;
  rated: number; // this material's loop tensile at 23 °C, N
  fTemp: number; fEnv: number;
  capacity: number; // per tie, in your conditions, N
  capacityAll: number; // all n ties with the sharing derate, N
  Ftie: number; // load the worst tie sees, N
  SF: number; // capacityAll / F  (== capacity / Ftie)
  ok: boolean;
  util: number; // Ftie / capacity — drives the 3D color
  maxWork: number; // recommended working load, all ties, N
  maxWorkKg: number;
  strapArea: number; // w·t, mm²
  strapBreak: number; // strap's own tensile break in your conditions, N (0 for metal)
  sigma: number; // strap stress under Ftie, MPa
  headEff: number; // rated / strap break at 23 °C — why the head is the rating
  minLen: number; // shortest tie that closes on the bundle with grip to spare, mm
  outOfRange: boolean;
  warns: ZipWarning[];
};

export function solve(inp: ZipInput): ZipResult {
  const size = TIE_SIZES[inp.size], m = TIE_MATS[inp.mat];
  const env = ENVS[inp.env];
  const n = Math.max(1, Math.round(inp.n));
  const F = Math.max(0, inp.F);

  const rated = size.rated * m.factor;
  const fTemp = tempFactor(m, inp.temp);
  const fEnv = m.metal ? env.fMetal : env.f;
  const outOfRange = fTemp === 0;

  const capacity = rated * fTemp * fEnv;
  const share = n > 1 ? SHARE : 1;
  const capacityAll = capacity * n * share;
  const Ftie = n > 0 ? F / (n * share) : F;
  const SF = F > 0 ? capacityAll / F : Infinity;
  const util = capacity > 0 ? Ftie / capacity : Infinity;
  const maxWork = inp.SFt > 0 ? capacityAll / inp.SFt : capacityAll;

  // Strap cross-check. For molded ties both the strap and the head derate
  // with the same resin, so the strap break carries the same factors. Metal
  // ties are head-mechanism-limited by construction; the band check is moot.
  const strapArea = size.w * size.t;
  const strapBreak23 = m.tens * strapArea;
  const strapBreak = m.metal ? 0 : strapBreak23 * fTemp * fEnv;
  const sigma = strapArea > 0 ? Ftie / strapArea : Infinity;
  const headEff = m.metal ? 0 : (size.rated * m.factor) / strapBreak23;

  // Length: wrap the bundle at the strap's mid-thickness, plus the head and
  // the tail you need to grip. Rounded up — nobody mourns a longer tail.
  const minLen = Math.ceil(Math.PI * (inp.bundle + size.t) + 2.2 * size.w + TAIL_GRIP);

  const warns: ZipWarning[] = [];
  if (outOfRange)
    warns.push({
      level: "bad",
      text: `${fmt(inp.temp, 0)} °C is outside this material's continuous window (${m.tMin}…${m.tMax} °C) — capacity is reported as zero. Change material, not safety factor.`,
    });
  else if (inp.temp > m.tMax - 15)
    warns.push({ level: "warn", text: `${fmt(inp.temp, 0)} °C is within 15 °C of the ${m.tMax} °C continuous limit — retention is already down to ${fmt(fTemp * 100, 0)}% and short excursions will finish the margin.` });
  if (!outOfRange && SF < 1)
    warns.push({ level: "bad", text: `The load exceeds capacity — ${fmt(F, 0)} N against ${fmt(capacityAll, 0)} N. This tie lets go.` });
  else if (!outOfRange && SF < inp.SFt)
    warns.push({ level: "warn", text: `SF ${isFinite(SF) ? SF.toFixed(2) : "∞"} is below your ${fmt(inp.SFt, 1)}× target — size up, add ties, or accept the thinner margin knowingly.` });
  if (inp.env === "Outdoor — sunlight (UV)" && m.uv === "poor")
    warns.push({
      level: "bad",
      text: `${inp.mat} does not belong in sunlight — surface UV attack crazes and embrittles it within months. Use the UV/weather-resistant grade (carbon-black through the resin), PA12, ETFE or stainless.`,
    });
  if (inp.env === "Damp / humid / marine" && inp.mat === "Stainless 304 (ball-lock)")
    warns.push({ level: "warn", text: "304 pits in chlorides — for salt spray or washdown chemistry step up to 316." });
  if (inp.env === "Damp / humid / marine" && !m.metal && m.moist > 3)
    warns.push({ level: "info", text: `Saturated nylon (~2.5% water by weight) is tougher but ~10–15% weaker than the conditioned rating — the ${fmt((1 - fEnv) * 100, 0)}% environment factor carries that.` });
  if (inp.nature === "Sustained (weeks to years)" && !m.metal)
    warns.push({ level: "info", text: "Creep is the quiet failure: a polymer tie under standing load stretches and lets the pawl walk. Keep sustained loads near 25% of the rating — that is what the 4× factor does." });
  if (inp.nature === "Dynamic / vibration / shock" && inp.SFt < 5)
    warns.push({ level: "warn", text: `Vibration duty with SF target ${fmt(inp.SFt, 1)} — the trade runs 5× here, because the pawl ratchets microscopically under cyclic load.` });
  if (inp.temp < -10 && !m.metal)
    warns.push({ level: "info", text: `At ${fmt(inp.temp, 0)} °C the tensile numbers hold, but impact toughness falls — a cold nylon tie snaps when flexed during install. Warm ties before installing below −10 °C.` });
  if (n > 1)
    warns.push({ level: "info", text: `${n} ties never share evenly — each extra tie is counted at ${fmt(SHARE * 100, 0)}% (lengths, seating and tension all scatter).` });
  if (inp.bundle > size.bundleMax)
    warns.push({ level: "warn", text: `Ø${fmt(inp.bundle, 0)} mm is past the largest bundle this class is commonly sold for (Ø${fmt(size.bundleMax, 0)} mm) — check the length exists before designing around it.` });
  warns.push({ level: "info", text: "Never hang anything over people, and never carry a safety-critical load on friction and a molded pawl alone — a tie positions and bundles; it is not a lifting sling." });

  return {
    size, m, rated, fTemp, fEnv, capacity, capacityAll, Ftie, SF,
    ok: SF >= inp.SFt, util, maxWork, maxWorkKg: maxWork / G,
    strapArea, strapBreak, sigma, headEff, minLen, outOfRange, warns,
  };
}

// Elastic stretch of the loop under load — only for the 3D view's honest
// exaggeration. Loop tension is F/2 per leg around the bundle.
export function loopStrain(r: ZipResult): number {
  const A = r.strapArea;
  if (A <= 0 || r.m.E <= 0) return 0;
  return r.Ftie / 2 / (A * r.m.E);
}
