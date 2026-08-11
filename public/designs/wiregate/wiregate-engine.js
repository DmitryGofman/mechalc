/*
 * WireGate engine — shared calculation core for the wire-gate spring design
 * prototypes. The production calculator has its own TS twin
 * (src/calculators/wireGateMath.ts); both are tested against the same
 * textbook identities so they cannot drift apart silently.
 *
 * The device: the bent-wire gate on wire-gate carabiners, snap-hook clasps
 * and spring buckle hooks. A U-loop of spring wire whose two ends are bent
 * into tangs seated as PINS in holes in the body — they rotate freely, so
 * the ends carry no moment and the spring is the loop itself.
 *
 * How it springs: the gate swings about the long-leg pin. The second pin
 * sits a distance `a` from that pivot, so a swing φ tries to move one pinned
 * end relative to the other by the chord 2a·sin(φ/2). Both pins are held by
 * the body, so the loop absorbs the mismatch by flexing in its plane — every
 * part of the wire moves a little, moment zero at the pins, maximum at the
 * U-bend. Assembly preload δ0 (offset holes) is what snaps the gate shut.
 *
 * Model (bending only, in-plane, Castigliano):
 *   I = πd⁴/64            R = w/2
 *   side compliance  cs(L) = [L³/3 + πRL²/2 + 2LR² + πR³/4] / EI
 *   loop spread rate k = 1 / (cs(L1) + cs(L2))     — the halves in series
 *   φ = g/(Lmax+R)        s = 2a·sin(φ/2)          δ = δ0 + s
 *   F_pin = k·δ           T = k·δ·a·cos(φ/2)       F_nose = T/(Lmax+R)
 *   σ_peak = Ki·F_pin·(Lmax+R)·c/I     Ki = (4C²−C−1)/(4C(C−1)), C = w/d
 *   δ_yield = σ_allow·I / (Ki·(Lmax+R)·c·k)
 *
 * Units: mm, N, MPa throughout (E in MPa = N/mm²; torques in N·mm).
 *
 * Sources: Shigley ch. 10 (torsion springs / curved wire); Associated Spring
 * SMI handbook (wire forms); US 4,423,757 (offset-hole preload mechanism).
 */
(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.WireGate = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  // Spring-wire materials, typical at ~2 mm diameter. Wire strength carries a
  // real size effect (Sut = A/d^m, Shigley Table 10-4) — thin wire runs
  // stronger, thick wire weaker. sigmaAllow is a static bending allowable.
  const MATERIALS = [
    { id: "music", name: "Music Wire (ASTM A228)", E: 207000, sigmaAllow: 1590 },
    { id: "ss302", name: "Stainless 302/304 (spring wire)", E: 193000, sigmaAllow: 1150 },
    { id: "steel1095", name: "Spring Steel (1095)", E: 205000, sigmaAllow: 1200 },
    { id: "ti", name: "Ti-6Al-4V", E: 114000, sigmaAllow: 880 },
    { id: "custom", name: "Custom…", E: null, sigmaAllow: null },
  ];

  const C_VALID_MIN = 3;

  function kiFactor(C) {
    const c = Math.max(C, 1.05);
    return (4 * c * c - c - 1) / (4 * c * (c - 1));
  }

  function sideCompliance(E, I, L, R) {
    const l = Math.max(L, 1e-9);
    const r = Math.max(R, 0);
    return (
      (Math.pow(l, 3) / 3 + (Math.PI * r * l * l) / 2 + 2 * l * r * r + (Math.PI * Math.pow(r, 3)) / 4) /
      (E * I)
    );
  }

  /**
   * params: { d, L1, L2, w, a, delta0, g, E, sigmaAllow }  — mm / MPa
   * returns { status, warnings[], values }
   */
  function evaluate(p) {
    const warnings = [];
    const d = +p.d, L1 = +p.L1, L2 = +p.L2, w = +p.w, a = +p.a;
    const delta0 = +p.delta0, g = +p.g, E = +p.E, sigmaAllow = +p.sigmaAllow;

    if (!(d > 0) || !(L1 > 0) || !(L2 > 0) || !(w > 0) || !(a > 0) || !(E > 0) || !(sigmaAllow > 0)) {
      return { status: "invalid", warnings: ["d, L1, L2, w, a, E and σ_allow must all be positive"], values: null };
    }
    if (delta0 < 0 || g < 0) {
      return { status: "invalid", warnings: ["preload and opening cannot be negative"], values: null };
    }

    const c = d / 2;
    const I = (Math.PI * Math.pow(d, 4)) / 64;
    const R = w / 2;
    const cs1 = sideCompliance(E, I, L1, R);
    const cs2 = sideCompliance(E, I, L2, R);
    const k = 1 / (cs1 + cs2);

    const C = w / d;
    const Ki = kiFactor(C);
    if (C < C_VALID_MIN) {
      warnings.push(
        "U-bend index C = " + C.toFixed(2) + " is below " + C_VALID_MIN +
        " — tighter than spring practice; Ki is steep and forming may crack the wire",
      );
    }

    const Lmax = Math.max(L1, L2);
    const armNose = Lmax + R;
    const phiMax = g / armNose;
    const s = 2 * a * Math.sin(phiMax / 2);
    const delta = delta0 + s;

    const Fpin0 = k * delta0;
    const FpinOpen = k * delta;
    const T0 = k * delta0 * a;
    const Topen = k * delta * a * Math.cos(phiMax / 2);

    const sigma1 = (FpinOpen * (L1 + R) * c) / I;
    const sigma2 = (FpinOpen * (L2 + R) * c) / I;
    const hotSide = sigma1 >= sigma2 ? 1 : 2;
    const sigmaPeak = Ki * Math.max(sigma1, sigma2);
    const SF = sigmaPeak > 0 ? sigmaAllow / sigmaPeak : Infinity;

    const deltaYield = (sigmaAllow * I) / (Ki * (Lmax + R) * c * k);
    const sYield = deltaYield - delta0;
    const gYield = sYield <= 0 ? 0 : sYield >= 2 * a ? Infinity : 2 * Math.asin(sYield / (2 * a)) * armNose;
    const budgetUsed = deltaYield > 0 ? delta / deltaYield : Infinity;

    if (phiMax > 0.5) {
      warnings.push("swing angle " + ((phiMax * 180) / Math.PI).toFixed(0) + "° — beyond the small-swing kinematics, treat as a trend");
    }

    const status = SF >= 1 ? "pass" : "fail";
    return {
      status,
      warnings,
      values: {
        I, c, R, k, cs1, cs2, C, Ki, armNose, phiMax, s, delta,
        Fpin0, FpinOpen, T0, Topen,
        Fnose0: T0 / armNose, FnoseOpen: Topen / armNose,
        sigma1, sigma2, sigmaPeak, hotSide, SF,
        deltaYield, gYield, budgetUsed,
        energyOpen: 0.5 * k * delta * delta, // N·mm
      },
    };
  }

  /** In-plane bow of one side: 0 at the apex, 1 at the pinned tang. */
  function spreadShape(tFromApex) {
    const t = Math.max(0, Math.min(1, tFromApex));
    return 0.5 * t * t * (3 - t);
  }

  /** Bending-moment fraction at distance x from the pin, arm L+R. */
  function momentFraction(xFromPin, arm) {
    return Math.max(0, Math.min(1, arm > 0 ? xFromPin / arm : 0));
  }

  return { MATERIALS, C_VALID_MIN, kiFactor, sideCompliance, evaluate, spreadShape, momentFraction };
});
