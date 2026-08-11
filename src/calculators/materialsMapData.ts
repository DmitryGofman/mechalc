// Ashby-style material property dataset for the Materials Map.
// Every property is a [low, high] range so a material draws as an ellipse on
// log axes, the way Ashby charts show class spread. Values are
// textbook-typical class envelopes (Ashby, "Materials Selection in Mechanical
// Design"; CES-style ranges) — right for comparing classes on a map, not a
// substitute for a datasheet.
//
// Units: rho Mg/m³ · E GPa · sig MPa (yield for metals/polymers, MOR for
// ceramics, tensile for composites/elastomers) · hv Vickers · k W/m·K ·
// cte µm/m·K · maxT °C · kic MPa·√m. null = not meaningful for the class.

export type Range = readonly [number, number];

export type PropKey = "rho" | "E" | "sig" | "hv" | "k" | "cte" | "maxT" | "kic";

export type MapMaterial = {
  name: string;
  fam: string;
  rho: Range;
  E: Range;
  sig: Range;
  hv: Range | null;
  k: Range;
  cte: Range;
  maxT: Range;
  kic: Range | null;
};

export type Family = { id: string; name: string; color: string };

// Colors picked for the app's dark slate surface (validated categorical set).
export const FAMILIES: Family[] = [
  { id: "metal", name: "Metals", color: "#3987e5" },
  { id: "ceramic", name: "Ceramics", color: "#d95926" },
  { id: "polymer", name: "Polymers", color: "#1baf7a" },
  { id: "elastomer", name: "Elastomers", color: "#c98500" },
  { id: "composite", name: "Composites", color: "#d55181" },
  { id: "natural", name: "Natural", color: "#5da832" },
  { id: "foam", name: "Foams", color: "#9085e9" },
];

export const FAM_BY_ID: Record<string, Family> = Object.fromEntries(
  FAMILIES.map((f) => [f.id, f]),
);

export const PROPS: Record<PropKey, { name: string; unit: string; symbol: string }> = {
  rho: { name: "Density", unit: "Mg/m³", symbol: "ρ" },
  E: { name: "Young's modulus", unit: "GPa", symbol: "E" },
  sig: { name: "Strength", unit: "MPa", symbol: "σ" },
  hv: { name: "Hardness", unit: "HV", symbol: "HV" },
  k: { name: "Thermal conductivity", unit: "W/m·K", symbol: "λ" },
  cte: { name: "Thermal expansion", unit: "µm/m·K", symbol: "α" },
  maxT: { name: "Max service temp", unit: "°C", symbol: "Tmax" },
  kic: { name: "Fracture toughness", unit: "MPa·√m", symbol: "K1c" },
};

export const PROP_KEYS = Object.keys(PROPS) as PropKey[];

export const MATERIALS: MapMaterial[] = [
  // — Metals —
  { name: "Low-carbon steel", fam: "metal", rho: [7.8, 7.9], E: [200, 215], sig: [250, 395], hv: [110, 170], k: [45, 55], cte: [11.5, 13], maxT: [350, 500], kic: [40, 80] },
  { name: "Alloy steel", fam: "metal", rho: [7.8, 7.9], E: [205, 217], sig: [400, 1500], hv: [200, 500], k: [34, 45], cte: [11, 13.5], maxT: [400, 550], kic: [30, 100] },
  { name: "Stainless steel", fam: "metal", rho: [7.6, 8.1], E: [189, 210], sig: [170, 1000], hv: [130, 480], k: [12, 24], cte: [13, 20], maxT: [750, 820], kic: [60, 150] },
  { name: "Cast iron (ductile)", fam: "metal", rho: [7.05, 7.25], E: [165, 180], sig: [250, 680], hv: [150, 320], k: [29, 44], cte: [10, 12.5], maxT: [350, 550], kic: [22, 54] },
  { name: "Aluminum alloys", fam: "metal", rho: [2.5, 2.9], E: [68, 82], sig: [30, 550], hv: [20, 160], k: [76, 240], cte: [21, 24], maxT: [120, 200], kic: [22, 35] },
  { name: "Magnesium alloys", fam: "metal", rho: [1.74, 1.95], E: [42, 47], sig: [70, 400], hv: [35, 90], k: [50, 156], cte: [24.6, 28], maxT: [120, 200], kic: [12, 18] },
  { name: "Titanium alloys", fam: "metal", rho: [4.4, 4.8], E: [90, 120], sig: [250, 1245], hv: [100, 380], k: [5, 12], cte: [8.9, 9.6], maxT: [450, 500], kic: [55, 70] },
  { name: "Copper alloys", fam: "metal", rho: [8.2, 8.95], E: [112, 148], sig: [30, 500], hv: [45, 190], k: [160, 400], cte: [16.9, 18], maxT: [120, 250], kic: [30, 90] },
  { name: "Brass", fam: "metal", rho: [8.4, 8.7], E: [96, 110], sig: [95, 500], hv: [55, 190], k: [110, 135], cte: [19, 21], maxT: [120, 200], kic: [25, 70] },
  { name: "Bronze", fam: "metal", rho: [8.5, 8.9], E: [95, 120], sig: [125, 450], hv: [60, 200], k: [42, 70], cte: [17, 18.5], maxT: [150, 250], kic: [30, 60] },
  { name: "Nickel superalloys", fam: "metal", rho: [8.1, 8.95], E: [190, 220], sig: [300, 1200], hv: [150, 450], k: [9, 17], cte: [12, 14], maxT: [900, 1100], kic: [80, 110] },
  { name: "Zinc alloys", fam: "metal", rho: [5.5, 7.1], E: [68, 95], sig: [80, 450], hv: [60, 130], k: [100, 125], cte: [23, 28], maxT: [80, 120], kic: [10, 40] },
  { name: "Lead alloys", fam: "metal", rho: [10, 11.4], E: [12.5, 15], sig: [8, 14], hv: [4, 6], k: [22, 36], cte: [18, 32], maxT: [80, 100], kic: [5, 15] },
  { name: "Tungsten alloys", fam: "metal", rho: [17, 19.3], E: [310, 380], sig: [550, 1450], hv: [260, 450], k: [90, 170], cte: [4.4, 5], maxT: [800, 1000], kic: [12, 20] },

  // — Technical & structural ceramics —
  { name: "Alumina (Al₂O₃)", fam: "ceramic", rho: [3.5, 3.98], E: [300, 400], sig: [280, 550], hv: [1200, 2060], k: [20, 30], cte: [7, 8.9], maxT: [1000, 1700], kic: [3.3, 4.8] },
  { name: "Silicon carbide", fam: "ceramic", rho: [3.0, 3.21], E: [380, 450], sig: [300, 550], hv: [2200, 2800], k: [80, 200], cte: [4, 4.5], maxT: [1400, 1600], kic: [3, 4.6] },
  { name: "Silicon nitride", fam: "ceramic", rho: [3.0, 3.29], E: [280, 320], sig: [500, 1000], hv: [1400, 1600], k: [22, 30], cte: [3.2, 3.6], maxT: [1000, 1200], kic: [4, 6.7] },
  { name: "Boron carbide", fam: "ceramic", rho: [2.35, 2.55], E: [400, 472], sig: [300, 500], hv: [2700, 3800], k: [30, 42], cte: [4.5, 5.6], maxT: [700, 800], kic: [2.5, 3.5] },
  { name: "Zirconia (ZrO₂)", fam: "ceramic", rho: [5.7, 6.1], E: [200, 250], sig: [800, 1600], hv: [1100, 1300], k: [1.7, 2.7], cte: [8.9, 10.6], maxT: [900, 1200], kic: [6, 12] },
  { name: "Tungsten carbide", fam: "ceramic", rho: [14.5, 15.9], E: [550, 700], sig: [1000, 2000], hv: [1300, 2200], k: [60, 110], cte: [4.5, 6], maxT: [500, 800], kic: [8, 13] },
  { name: "Soda-lime glass", fam: "ceramic", rho: [2.44, 2.49], E: [68, 72], sig: [30, 70], hv: [400, 600], k: [0.7, 1.3], cte: [8.5, 9.5], maxT: [350, 450], kic: [0.55, 0.7] },
  { name: "Borosilicate glass", fam: "ceramic", rho: [2.2, 2.3], E: [61, 64], sig: [25, 70], hv: [400, 500], k: [1.0, 1.3], cte: [3.2, 4.0], maxT: [450, 500], kic: [0.5, 0.7] },
  { name: "Concrete", fam: "ceramic", rho: [2.2, 2.6], E: [25, 38], sig: [1, 6], hv: null, k: [0.8, 2.4], cte: [6, 13], maxT: [400, 600], kic: [0.35, 0.45] },
  { name: "Brick", fam: "ceramic", rho: [1.6, 2.1], E: [10, 34], sig: [7, 14], hv: null, k: [0.46, 0.73], cte: [5, 8], maxT: [900, 1000], kic: [1, 2] },
  { name: "Granite", fam: "ceramic", rho: [2.5, 3.0], E: [40, 70], sig: [5, 20], hv: null, k: [1.7, 4], cte: [5.4, 8.5], maxT: [400, 500], kic: [0.7, 1.5] },

  // — Polymers —
  { name: "HDPE", fam: "polymer", rho: [0.94, 0.965], E: [0.6, 1.0], sig: [20, 32], hv: [5, 7], k: [0.4, 0.44], cte: [106, 198], maxT: [90, 110], kic: [1.5, 2.0] },
  { name: "Polypropylene", fam: "polymer", rho: [0.89, 0.92], E: [1.0, 1.6], sig: [27, 41], hv: [6, 9], k: [0.11, 0.17], cte: [122, 180], maxT: [100, 115], kic: [3, 4.5] },
  { name: "Polystyrene", fam: "polymer", rho: [1.04, 1.05], E: [2.3, 3.3], sig: [30, 55], hv: [14, 20], k: [0.12, 0.13], cte: [90, 150], maxT: [70, 90], kic: [0.7, 1.1] },
  { name: "Rigid PVC", fam: "polymer", rho: [1.3, 1.58], E: [2.4, 4.1], sig: [41, 52], hv: [10, 15], k: [0.15, 0.29], cte: [50, 100], maxT: [60, 70], kic: [1.4, 3.9] },
  { name: "PMMA (acrylic)", fam: "polymer", rho: [1.16, 1.22], E: [2.2, 3.8], sig: [53, 72], hv: [18, 22], k: [0.08, 0.25], cte: [72, 162], maxT: [70, 90], kic: [0.7, 1.6] },
  { name: "Polycarbonate", fam: "polymer", rho: [1.14, 1.21], E: [2.0, 2.4], sig: [59, 70], hv: [15, 18], k: [0.19, 0.22], cte: [120, 137], maxT: [115, 130], kic: [2.1, 4.6] },
  { name: "Nylon (PA6/66)", fam: "polymer", rho: [1.12, 1.14], E: [2.6, 3.2], sig: [50, 95], hv: [8, 12], k: [0.23, 0.25], cte: [80, 110], maxT: [110, 140], kic: [2.2, 5.6] },
  { name: "Acetal (POM)", fam: "polymer", rho: [1.39, 1.43], E: [2.5, 3.5], sig: [49, 72], hv: [12, 16], k: [0.22, 0.35], cte: [85, 120], maxT: [90, 110], kic: [1.7, 4.2] },
  { name: "PET", fam: "polymer", rho: [1.29, 1.4], E: [2.8, 4.1], sig: [56, 72], hv: [12, 17], k: [0.14, 0.15], cte: [60, 95], maxT: [66, 86], kic: [4.5, 5.5] },
  { name: "PTFE", fam: "polymer", rho: [2.14, 2.2], E: [0.4, 0.55], sig: [15, 25], hv: [3, 5], k: [0.24, 0.26], cte: [112, 135], maxT: [250, 270], kic: [1.3, 1.8] },
  { name: "PEEK", fam: "polymer", rho: [1.3, 1.32], E: [3.5, 3.9], sig: [87, 100], hv: [25, 30], k: [0.24, 0.26], cte: [40, 60], maxT: [240, 260], kic: [2.7, 4.3] },
  { name: "ABS", fam: "polymer", rho: [1.01, 1.21], E: [1.1, 2.9], sig: [29, 45], hv: [9, 15], k: [0.19, 0.34], cte: [85, 160], maxT: [60, 90], kic: [1.2, 4.3] },
  { name: "Epoxy (cast)", fam: "polymer", rho: [1.11, 1.4], E: [2.4, 3.1], sig: [36, 72], hv: [16, 20], k: [0.18, 0.5], cte: [58, 117], maxT: [120, 180], kic: [0.4, 2.2] },
  { name: "Phenolic", fam: "polymer", rho: [1.24, 1.32], E: [2.8, 4.8], sig: [27, 50], hv: [25, 35], k: [0.14, 0.35], cte: [30, 45], maxT: [150, 180], kic: [0.8, 1.2] },

  // — Elastomers —
  { name: "Natural rubber", fam: "elastomer", rho: [0.92, 0.93], E: [0.0015, 0.0025], sig: [20, 30], hv: null, k: [0.13, 0.16], cte: [590, 670], maxT: [60, 90], kic: null },
  { name: "Butyl rubber", fam: "elastomer", rho: [0.9, 0.92], E: [0.001, 0.002], sig: [2, 10], hv: null, k: [0.09, 0.1], cte: [570, 620], maxT: [100, 120], kic: null },
  { name: "Neoprene", fam: "elastomer", rho: [1.23, 1.25], E: [0.0007, 0.002], sig: [7, 20], hv: null, k: [0.19, 0.21], cte: [575, 610], maxT: [90, 110], kic: null },
  { name: "Silicone elastomer", fam: "elastomer", rho: [1.1, 1.55], E: [0.005, 0.02], sig: [2.4, 5.5], hv: null, k: [0.2, 0.5], cte: [250, 300], maxT: [200, 300], kic: null },
  { name: "Polyurethane elast.", fam: "elastomer", rho: [1.02, 1.25], E: [0.002, 0.03], sig: [20, 50], hv: null, k: [0.22, 0.3], cte: [150, 200], maxT: [80, 110], kic: null },
  { name: "EVA", fam: "elastomer", rho: [0.93, 0.96], E: [0.01, 0.04], sig: [12, 19], hv: null, k: [0.3, 0.34], cte: [160, 190], maxT: [55, 70], kic: null },

  // — Composites —
  { name: "CFRP (quasi-iso)", fam: "composite", rho: [1.5, 1.6], E: [69, 150], sig: [550, 1050], hv: null, k: [1.3, 5], cte: [1, 4], maxT: [140, 220], kic: [6, 20] },
  { name: "GFRP", fam: "composite", rho: [1.75, 1.97], E: [15, 28], sig: [110, 260], hv: null, k: [0.4, 0.55], cte: [9, 30], maxT: [140, 220], kic: [7, 23] },
  { name: "Al-SiC MMC", fam: "composite", rho: [2.8, 2.9], E: [81, 100], sig: [280, 324], hv: [90, 150], k: [120, 180], cte: [10, 15], maxT: [150, 300], kic: [15, 25] },

  // — Natural materials —
  { name: "Wood ∥ grain", fam: "natural", rho: [0.3, 0.98], E: [6, 20], sig: [30, 100], hv: null, k: [0.2, 0.5], cte: [2, 11], maxT: [100, 140], kic: [3.5, 6.5] },
  { name: "Wood ⊥ grain", fam: "natural", rho: [0.3, 0.98], E: [0.3, 1.5], sig: [2, 8], hv: null, k: [0.1, 0.2], cte: [30, 45], maxT: [100, 140], kic: [0.5, 1.5] },
  { name: "Plywood", fam: "natural", rho: [0.5, 0.8], E: [6.9, 13], sig: [15, 40], hv: null, k: [0.13, 0.17], cte: [6, 12], maxT: [100, 140], kic: [1.5, 3] },
  { name: "Bamboo", fam: "natural", rho: [0.6, 0.8], E: [15, 20], sig: [100, 160], hv: null, k: [0.15, 0.3], cte: [3, 10], maxT: [100, 130], kic: [5, 7] },
  { name: "Cork", fam: "natural", rho: [0.12, 0.24], E: [0.013, 0.05], sig: [0.5, 2], hv: null, k: [0.035, 0.048], cte: [130, 180], maxT: [110, 130], kic: [0.05, 0.1] },
  { name: "Leather", fam: "natural", rho: [0.81, 1.05], E: [0.1, 0.5], sig: [8, 25], hv: null, k: [0.15, 0.17], cte: [40, 50], maxT: [60, 90], kic: [3, 5] },

  // — Foams —
  { name: "Rigid foam (LD)", fam: "foam", rho: [0.036, 0.07], E: [0.023, 0.08], sig: [0.3, 1.2], hv: null, k: [0.023, 0.04], cte: [20, 70], maxT: [70, 110], kic: [0.005, 0.02] },
  { name: "Rigid foam (HD)", fam: "foam", rho: [0.11, 0.47], E: [0.2, 0.98], sig: [1, 12], hv: null, k: [0.027, 0.06], cte: [22, 70], maxT: [80, 110], kic: [0.02, 0.09] },
  { name: "Flexible foam", fam: "foam", rho: [0.016, 0.115], E: [0.0003, 0.01], sig: [0.01, 0.12], hv: null, k: [0.036, 0.08], cte: [115, 220], maxT: [70, 110], kic: null },
  { name: "Aluminum foam", fam: "foam", rho: [0.17, 0.5], E: [0.4, 1.0], sig: [2, 10], hv: null, k: [3, 30], cte: [19, 23], maxT: [150, 300], kic: [0.3, 1.6] },
];
