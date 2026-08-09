import { describe, it, expect } from "vitest";
import {
  shaftResults,
  shearModulus,
  shearYield,
  torqueFromPower,
  powerFromTorque,
  twistMagnification,
  shearAtRadius,
  STRESS_RAISERS,
  VIEW_TWIST_AT_YIELD,
} from "./shaftMath";

// Steel shaft: Ø25 mm × 500 mm, 200 GPa, ν = 0.29, σy = 350 MPa.
const E = 200e9;
const NU = 0.29;
const SY = 350e6;
const D = 0.025;
const L = 0.5;

describe("shaftResults — solid section", () => {
  it("reproduces τ = 16T / πd³", () => {
    const T = 200;
    const r = shaftResults(E, SY, NU, D, 0, L, T, 1);
    expect(r.tauNom).toBeCloseTo((16 * T) / (Math.PI * Math.pow(D, 3)), 3);
    expect(r.tauNom / 1e6).toBeCloseTo(65.2, 1); // ≈65 MPa
  });

  it("reproduces J = πd⁴/32 and Zp = πd³/16", () => {
    const r = shaftResults(E, SY, NU, D, 0, L, 0, 1);
    expect(r.J).toBeCloseTo((Math.PI * Math.pow(D, 4)) / 32, 15);
    expect(r.Zp).toBeCloseTo((Math.PI * Math.pow(D, 3)) / 16, 12);
    expect(r.JFrac).toBeCloseTo(1, 12);
    expect(r.AFrac).toBeCloseTo(1, 12);
  });

  it("twists by θ = TL/GJ", () => {
    const T = 200;
    const r = shaftResults(E, SY, NU, D, 0, L, T, 1);
    const G = shearModulus(E, NU);
    expect(r.G).toBeCloseTo(G, 6);
    expect(r.theta).toBeCloseTo((T * L) / (G * r.J), 12);
    expect(r.thetaDeg).toBeCloseTo((r.theta * 180) / Math.PI, 12);
    expect(r.degPerM).toBeCloseTo(r.thetaDeg / L, 12);
    // Stiffness is the inverse of that twist.
    expect(r.kt).toBeCloseTo(T / r.theta, 6);
  });

  it("follows the sign of the torque in twist but not in stress", () => {
    const a = shaftResults(E, SY, NU, D, 0, L, 150, 1);
    const b = shaftResults(E, SY, NU, D, 0, L, -150, 1);
    expect(b.theta).toBeCloseTo(-a.theta, 12);
    expect(b.tauNom).toBeCloseTo(a.tauNom, 6);
    expect(b.SF).toBeCloseTo(a.SF, 6);
  });

  it("checks the safety factor against the 0.577·σy shear yield", () => {
    const T = 200;
    const r = shaftResults(E, SY, NU, D, 0, L, T, 1);
    expect(r.tauAllow).toBeCloseTo(shearYield(SY), 6);
    expect(r.SF).toBeCloseTo(r.tauAllow / r.tauPeak, 9);
    // A shaft that would be fine in tension is already marginal in torsion.
    expect(r.tauAllow).toBeLessThan(SY);
  });

  it("reports the torque that puts the surface exactly at yield", () => {
    const r = shaftResults(E, SY, NU, D, 0, L, 10, 1);
    const atYield = shaftResults(E, SY, NU, D, 0, L, r.Tyield, 1);
    expect(atYield.SF).toBeCloseTo(1, 9);
    expect(Math.abs(atYield.theta)).toBeCloseTo(atYield.thetaYield, 9);
  });

  it("scales the torque capacity with the cube of the diameter", () => {
    const a = shaftResults(E, SY, NU, D, 0, L, 0, 1).Tyield;
    const b = shaftResults(E, SY, NU, 2 * D, 0, L, 0, 1).Tyield;
    expect(b / a).toBeCloseTo(8, 9);
  });
});

describe("shaftResults — hollow section", () => {
  // Ø25 with a Ø15 bore: 64% of the metal removed from the lazy middle...
  const r = shaftResults(E, SY, NU, D, 0.015, L, 200, 1);
  const solid = shaftResults(E, SY, NU, D, 0, L, 200, 1);

  it("subtracts the bore from J and A", () => {
    expect(r.J).toBeCloseTo((Math.PI * (Math.pow(D, 4) - Math.pow(0.015, 4))) / 32, 15);
    expect(r.A).toBeCloseTo((Math.PI * (D * D - 0.015 * 0.015)) / 4, 12);
  });

  it("keeps most of the strength for much less metal", () => {
    expect(r.JFrac).toBeCloseTo(1 - Math.pow(0.6, 4), 9); // 0.8704
    expect(r.AFrac).toBeCloseTo(1 - Math.pow(0.6, 2), 9); // 0.64
    expect(r.JFrac).toBeGreaterThan(r.AFrac); // the whole point of a tube
  });

  it("raises stress and twist over the solid shaft in the same proportion", () => {
    expect(r.tauNom / solid.tauNom).toBeCloseTo(1 / r.JFrac, 9);
    expect(r.theta / solid.theta).toBeCloseTo(1 / r.JFrac, 9);
  });

  it("clamps a bore that would swallow the shaft", () => {
    const thin = shaftResults(E, SY, NU, D, D * 5, L, 200, 1);
    expect(thin.J).toBeGreaterThan(0);
    expect(isFinite(thin.tauNom)).toBe(true);
    expect(isFinite(thin.theta)).toBe(true);
  });
});

describe("stress raisers", () => {
  it("multiply the surface stress and divide the capacity", () => {
    const plain = shaftResults(E, SY, NU, D, 0, L, 200, 1);
    const keyed = shaftResults(E, SY, NU, D, 0, L, 200, 3);
    expect(keyed.tauNom).toBeCloseTo(plain.tauNom, 9); // nominal is geometry only
    expect(keyed.tauPeak).toBeCloseTo(3 * plain.tauNom, 9);
    expect(keyed.SF).toBeCloseTo(plain.SF / 3, 9);
    expect(keyed.Tyield).toBeCloseTo(plain.Tyield / 3, 6);
    // The concentration is local: it does not soften the shaft.
    expect(keyed.theta).toBeCloseTo(plain.theta, 12);
    expect(keyed.kt).toBeCloseTo(plain.kt, 6);
  });

  it("never lets a Kts below 1 flatter the shaft", () => {
    const r = shaftResults(E, SY, NU, D, 0, L, 200, 0.2);
    const plain = shaftResults(E, SY, NU, D, 0, L, 200, 1);
    expect(r.tauPeak).toBeCloseTo(plain.tauPeak, 9);
  });

  it("ships a catalogue that is ordered the way the handbook is", () => {
    expect(STRESS_RAISERS["None — plain shaft"].Kts).toBe(1);
    expect(STRESS_RAISERS["End-milled keyseat (profiled)"].Kts).toBeGreaterThan(
      STRESS_RAISERS["Sled-runner keyseat"].Kts,
    );
    expect(STRESS_RAISERS["Shoulder fillet — sharp (r/d 0.02)"].Kts).toBeGreaterThan(
      STRESS_RAISERS["Shoulder fillet — well rounded (r/d 0.1)"].Kts,
    );
    for (const [name, sr] of Object.entries(STRESS_RAISERS)) {
      expect(sr.Kts, name).toBeGreaterThanOrEqual(1);
      expect(sr.Kts, name).toBeLessThanOrEqual(4);
    }
  });
});

describe("power ⇄ torque", () => {
  it("matches the T = 9549·kW/rpm shop formula", () => {
    expect(torqueFromPower(1000, 1500)).toBeCloseTo((9549 * 1) / 1500, 2);
    expect(torqueFromPower(7500, 1450)).toBeCloseTo((9549 * 7.5) / 1450, 1);
  });

  it("round-trips through power", () => {
    const T = torqueFromPower(5500, 2900);
    expect(powerFromTorque(T, 2900)).toBeCloseTo(5500, 6);
    expect(powerFromTorque(-T, 2900)).toBeCloseTo(5500, 6); // direction is not power
  });

  it("returns zero torque at a standstill rather than infinity", () => {
    expect(torqueFromPower(1000, 0)).toBe(0);
    expect(powerFromTorque(100, 0)).toBe(0);
  });
});

describe("twist rule of thumb", () => {
  it("allows 1° per 20 diameters", () => {
    const r = shaftResults(E, SY, NU, D, 0, 20 * D, 0, 1);
    expect(r.twistLimitDeg).toBeCloseTo(1, 9);
  });

  it("flags a long slender shaft that passes on stress but not on wind-up", () => {
    const r = shaftResults(E, SY, NU, 0.01, 0, 1.2, 8, 1);
    expect(r.SF).toBeGreaterThan(1);
    expect(r.twistUtil).toBeGreaterThan(1);
  });
});

describe("view helpers", () => {
  it("magnifies a stiff shaft's twist to a readable turn", () => {
    const r = shaftResults(E, SY, NU, D, 0, L, 0, 1);
    const mag = twistMagnification(r.thetaYield);
    expect(mag).toBeGreaterThan(1);
    expect(r.thetaYield * mag).toBeCloseTo(VIEW_TWIST_AT_YIELD, 9);
  });

  it("leaves an already-visible twist alone", () => {
    expect(twistMagnification(2)).toBe(1); // 2 rad at yield needs no help
    expect(twistMagnification(0)).toBe(1);
    expect(twistMagnification(NaN)).toBe(1);
  });

  it("draws shear linearly from zero on the axis", () => {
    expect(shearAtRadius(100, 0, 0.0125)).toBe(0);
    expect(shearAtRadius(100, 0.00625, 0.0125)).toBeCloseTo(50, 9);
    expect(shearAtRadius(100, 0.0125, 0.0125)).toBeCloseTo(100, 9);
  });
});
