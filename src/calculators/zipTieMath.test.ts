import { describe, it, expect } from "vitest";
import {
  defaults, solve, tempFactor, loopStrain, lbf,
  TIE_SIZES, TIE_MATS, ENVS, NATURES, SHARE, TAIL_GRIP, N_PER_LBF, G,
  type ZipInput,
} from "./zipTieMath";

const at = (over: Partial<ZipInput> = {}) => solve({ ...defaults(), ...over });

describe("size classes — the ratings mean what the class name says", () => {
  it("keeps every class's newton rating equal to its lbf name", () => {
    for (const s of Object.values(TIE_SIZES)) {
      expect(s.rated / N_PER_LBF).toBeCloseTo(s.ratedLb, 0);
    }
  });

  it("orders the classes by strength, width and thickness together", () => {
    const sizes = Object.values(TIE_SIZES);
    for (let i = 1; i < sizes.length; i++) {
      expect(sizes[i].rated).toBeGreaterThan(sizes[i - 1].rated);
      expect(sizes[i].w).toBeGreaterThanOrEqual(sizes[i - 1].w);
      expect(sizes[i].t).toBeGreaterThanOrEqual(sizes[i - 1].t);
    }
  });

  it("reports lbf back through the display helper", () => {
    expect(lbf(222)).toBeCloseTo(49.9, 1);
  });
});

describe("temperature derating", () => {
  const pa66 = TIE_MATS["PA66 nylon (standard)"];

  it("returns exactly 1.0 at the 23 °C rating point", () => {
    expect(tempFactor(pa66, 23)).toBe(1.0);
  });

  it("interpolates linearly between anchors", () => {
    // Between (40, 0.87) and (60, 0.72): midpoint 50 °C → 0.795.
    expect(tempFactor(pa66, 50)).toBeCloseTo(0.795, 6);
  });

  it("hits the published anchor at 85 °C — nylon keeps barely half", () => {
    expect(tempFactor(pa66, 85)).toBeCloseTo(0.55, 6);
  });

  it("is zero outside the continuous window, both ends", () => {
    expect(tempFactor(pa66, 86)).toBe(0);
    expect(tempFactor(pa66, -41)).toBe(0);
  });

  it("lets the heat-stabilized grade keep going where standard PA66 stops", () => {
    const hs = TIE_MATS["PA66 heat-stabilized"];
    expect(tempFactor(hs, 100)).toBeGreaterThan(0);
    expect(tempFactor(pa66, 100)).toBe(0);
  });

  it("never exceeds the coldest anchor when colder than it", () => {
    const etfe = TIE_MATS["ETFE (Tefzel)"];
    expect(tempFactor(etfe, -80)).toBeCloseTo(1.1, 6);
  });
});

describe("the capacity chain", () => {
  it("multiplies rated × material × temperature × environment", () => {
    const r = at({ size: "Standard — 50 lb", mat: "PA66 nylon (standard)", temp: 60, env: "Damp / humid / marine" });
    expect(r.capacity).toBeCloseTo(222 * 1.0 * 0.72 * 0.9, 6);
  });

  it("gives polypropylene half a nylon tie's rating", () => {
    const pa = at({ mat: "PA66 nylon (standard)" });
    const pp = at({ mat: "Polypropylene" });
    expect(pp.rated / pa.rated).toBeCloseTo(0.5, 6);
  });

  it("skips the polymer aging factor for stainless outdoors", () => {
    const ss = at({ mat: "Stainless 304 (ball-lock)", env: "Outdoor — sunlight (UV)" });
    expect(ss.fEnv).toBe(1.0);
    const pa = at({ mat: "PA66 UV / weather-resistant", env: "Outdoor — sunlight (UV)" });
    expect(pa.fEnv).toBeCloseTo(ENVS["Outdoor — sunlight (UV)"].f, 6);
  });

  it("zeroes capacity out of the temperature window and flags it", () => {
    const r = at({ temp: 120 });
    expect(r.outOfRange).toBe(true);
    expect(r.capacity).toBe(0);
    expect(r.warns.some((w) => w.level === "bad")).toBe(true);
  });
});

describe("safety factor, sharing and the working load", () => {
  it("SF = capacity / load for a single tie", () => {
    const r = at({ F: 111, n: 1, temp: 23, env: "Indoor, dry" });
    expect(r.SF).toBeCloseTo(222 / 111, 6);
  });

  it("derates parallel ties to 80% each — 2 ties ≠ 2× one tie", () => {
    const one = at({ F: 100, n: 1 });
    const two = at({ F: 100, n: 2 });
    expect(two.capacityAll / one.capacityAll).toBeCloseTo(2 * SHARE, 6);
    expect(two.Ftie).toBeCloseTo(100 / (2 * SHARE), 6);
  });

  it("keeps SF consistent between the all-ties and per-tie views", () => {
    const r = at({ F: 100, n: 3 });
    expect(r.SF).toBeCloseTo(r.capacity / r.Ftie, 6);
  });

  it("zero load means infinite SF, no verdict panic", () => {
    const r = at({ F: 0 });
    expect(r.SF).toBe(Infinity);
    expect(r.ok).toBe(true);
  });

  it("recommends the working load as capacity over the target SF, in N and kg", () => {
    const r = at({ F: 80, SFt: 4, temp: 23, env: "Indoor, dry" });
    expect(r.maxWork).toBeCloseTo(222 / 4, 6);
    expect(r.maxWorkKg).toBeCloseTo(222 / 4 / G, 6);
  });

  it("matches the trade's worked example: 2–5× on the rating", () => {
    // "To hang 10 lb outdoors use ≥3× → a 40–50 lb tie."
    const need = 10 * N_PER_LBF * 3;
    expect(TIE_SIZES["Standard — 50 lb"].rated).toBeGreaterThan(need);
    expect(TIE_SIZES["Miniature — 18 lb"].rated).toBeLessThan(need);
  });
});

describe("strap vs head — why the loop rating is the number", () => {
  it("keeps head efficiency below 1 for every polymer size — the head, not the strap, is the rating", () => {
    for (const size of Object.keys(TIE_SIZES)) {
      const r = at({ size, mat: "PA66 nylon (standard)" });
      expect(r.headEff).toBeGreaterThan(0.2);
      expect(r.headEff).toBeLessThan(1);
    }
  });

  it("computes strap stress as load over w·t", () => {
    const r = at({ F: 100, n: 1 });
    expect(r.sigma).toBeCloseTo(100 / (4.8 * 1.3), 6);
  });

  it("skips the strap check for metal ties", () => {
    const r = at({ mat: "Stainless 304 (ball-lock)" });
    expect(r.strapBreak).toBe(0);
    expect(r.headEff).toBe(0);
  });
});

describe("length and the loop", () => {
  it("wraps the bundle at mid-thickness plus head and tail grip", () => {
    const r = at({ bundle: 20 });
    expect(r.minLen).toBe(Math.ceil(Math.PI * (20 + 1.3) + 2.2 * 4.8 + TAIL_GRIP));
  });

  it("grows the length with the bundle", () => {
    expect(at({ bundle: 40 }).minLen).toBeGreaterThan(at({ bundle: 10 }).minLen);
  });

  it("strains the loop by F/2 legs over EA, zero at zero load", () => {
    const inp = { ...defaults(), F: 100, n: 1 };
    expect(loopStrain(solve(inp))).toBeCloseTo(100 / 2 / (4.8 * 1.3 * 1400), 9);
    expect(loopStrain(solve({ ...inp, F: 0 }))).toBe(0);
  });
});

describe("warnings that must fire", () => {
  it("plain nylon in sunlight is a hard no", () => {
    const r = at({ mat: "PA66 nylon (standard)", env: "Outdoor — sunlight (UV)" });
    expect(r.warns.some((w) => w.level === "bad" && /sunlight/i.test(w.text))).toBe(true);
  });

  it("the UV grade in sunlight is fine", () => {
    const r = at({ mat: "PA66 UV / weather-resistant", env: "Outdoor — sunlight (UV)", F: 10 });
    expect(r.warns.some((w) => w.level === "bad")).toBe(false);
  });

  it("304 gets a chloride warning where 316 does not", () => {
    const a = at({ mat: "Stainless 304 (ball-lock)", env: "Damp / humid / marine" });
    const b = at({ mat: "Stainless 316 (ball-lock, marine)", env: "Damp / humid / marine" });
    expect(a.warns.some((w) => /316/.test(w.text) && w.level === "warn")).toBe(true);
    expect(b.warns.some((w) => /316/.test(w.text) && w.level === "warn")).toBe(false);
  });

  it("overload is bad, under-target is warn", () => {
    expect(at({ F: 500 }).warns.some((w) => w.level === "bad" && /lets go/.test(w.text))).toBe(true);
    expect(at({ F: 80, SFt: 4 }).warns.some((w) => w.level === "warn" && /target/.test(w.text))).toBe(true);
  });

  it("every nature maps to the trade's 2 / 4 / 5 factors", () => {
    expect(NATURES["Static, short-term"].sf).toBe(2);
    expect(NATURES["Sustained (weeks to years)"].sf).toBe(4);
    expect(NATURES["Dynamic / vibration / shock"].sf).toBe(5);
  });
});
