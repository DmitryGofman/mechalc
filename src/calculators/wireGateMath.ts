// Wire-gate clip spring: the bent-wire gate on wire-gate carabiners, snap-hook
// clasps and spring buckle hooks. A U-shaped loop of spring wire whose two
// ends are bent into tangs that seat as PINS in holes in the body — they
// rotate freely, so the ends carry no moment and the spring is the loop
// itself, not a pair of clamped cantilevers.
//
// How it actually springs: the gate swings about the long-leg pin. The second
// pin sits a distance `a` away from that pivot, so a swing of angle φ tries to
// move one pinned end relative to the other by the chord 2·a·sin(φ/2). Both
// pins are held by the body, so the loop must absorb that mismatch by flexing
// in its own plane — the legs bow, every part of the wire moves a little, the
// bending moment grows from zero at the pins to its maximum at the U-bend.
// Assembly already imposes a preload spread δ0 (the offset between where the
// holes are and where the free wire wants to sit — that is what snaps the
// gate shut), and opening adds the swing mismatch on top.
//
// Everything here is SI: metres, newtons, pascals, radians. The page converts
// at the edges.

/** Second moment of a round wire, I = πd⁴/64. */
export const wireI = (dM: number) => (Math.PI * Math.pow(dM, 4)) / 64;

// ── Curved-wire correction at the U-bend ────────────────────────────
// The full bending moment arrives at the U-bend, where the wire is curved to
// mean radius w/2, and a curved beam carries more on the inside of the bend
// than Mc/I admits. This is the standard inner-fibre factor for helical
// torsion springs in bending (Shigley eq. 10-43), C = D/d = w/d.
export function kiFactor(C: number): number {
  const c = Math.max(C, 1.05); // C → 1 is a bend tighter than the wire itself
  return (4 * c * c - c - 1) / (4 * c * (c - 1));
}

/** Bend index below which spring practice says the bend is too tight to trust. */
export const C_VALID_MIN = 3;

/**
 * In-plane spread compliance of one half of the loop — one leg plus its
 * quarter of the U-bend, from the pinned tang (moment-free) to the apex
 * (symmetry midpoint). Castigliano on bending only:
 *
 *   δ/F = [ L³/3 + πRL²/2 + 2LR² + πR³/4 ] / EI
 *
 * with M(x) = F·x along the leg and M = F·(L + R·sinθ) around the quarter
 * bend. Torsion doesn't enter — spread is an in-plane load case.
 */
export function sideCompliance(EPa: number, I: number, Lm: number, Rm: number): number {
  const L = Math.max(Lm, 1e-9);
  const R = Math.max(Rm, 0);
  return (
    (Math.pow(L, 3) / 3 +
      (Math.PI * R * L * L) / 2 +
      2 * L * R * R +
      (Math.PI * Math.pow(R, 3)) / 4) /
    (EPa * I)
  );
}

export type WireGateResults = {
  I: number; // wire second moment, m⁴
  c: number; // outer-fibre distance d/2, m
  R: number; // U-bend mean radius w/2, m
  k: number; // in-plane spread rate of the whole loop, N/m
  cs1: number; // side compliances, m/N — the long side is the softer one
  cs2: number;
  C: number; // U-bend index w/d
  Ki: number; // curved-wire inner-fibre factor at the U-bend
  armNose: number; // pivot → nose apex, m (the lever your thumb works)
  phiMax: number; // swing angle at full open, rad
  s: number; // spread the swing imposes, 2a·sin(φ/2), m
  delta: number; // total elastic spread at full open, δ0 + s, m
  Fpin0: number; // pin force closed, k·δ0, N
  FpinOpen: number; // pin force at full open, N
  T0: number; // closing torque about the pivot at rest, k·δ0·a, N·m
  Topen: number; // torque your thumb fights at full open, N·m
  Fnose0: number; // those torques felt at the nose, N
  FnoseOpen: number;
  sigma1: number; // peak bending stress approaching the apex from side 1, Pa
  sigma2: number; // …and side 2; the longer side carries the bigger arm
  sigmaPeak: number; // Ki · max — what the U-bend inner fibre sees, Pa
  hotSide: 1 | 2;
  SF: number; // σ_allow / σ_peak at full open
  deltaYield: number; // spread budget: total spread at first yield, m
  gYield: number; // nose opening that spends the budget, m (Infinity if unreachable)
  budgetUsed: number; // delta / deltaYield
  energyOpen: number; // elastic energy stored at full open, J
};

/**
 * The whole gate, from geometry, material and its working cycle.
 *
 * `L1m`/`L2m` are the flexing leg lengths, tang bend to U-bend. `wM` is the
 * U-bend width across the loop (mean, so R = w/2). `aM` is the distance
 * between the two pins — the crank that turns swing into spread. `delta0M` is
 * the assembly preload spread, `gM` how far the nose must open.
 *
 * Load path: pins are moment-free, so each half of the loop bends under the
 * pin force with M(x) = F·x — zero at the pins, maximum at the U-bend, where
 * Ki multiplies it. The stress check lives at the apex, not the tangs.
 */
export function wireGateResults(
  EPa: number,
  sigmaYPa: number,
  dM: number,
  L1m: number,
  L2m: number,
  wM: number,
  aM: number,
  delta0M: number,
  gM: number,
): WireGateResults {
  const d = Math.max(dM, 1e-6);
  const L1 = Math.max(L1m, d);
  const L2 = Math.max(L2m, d);
  const R = Math.max(wM, d) / 2;
  const a = Math.max(aM, 1e-6);
  const c = d / 2;
  const I = wireI(d);

  const cs1 = sideCompliance(EPa, I, L1, R);
  const cs2 = sideCompliance(EPa, I, L2, R);
  const k = 1 / (cs1 + cs2); // the two half-loops flex in series along the load path

  const C = (2 * R) / d;
  const Ki = kiFactor(C);

  const Lmax = Math.max(L1, L2);
  const armNose = Lmax + R;

  const delta0 = Math.max(delta0M, 0);
  const g = Math.max(gM, 0);
  const phiMax = g / armNose;
  const s = 2 * a * Math.sin(phiMax / 2);
  const delta = delta0 + s;

  const Fpin0 = k * delta0;
  const FpinOpen = k * delta;

  // Torque from the energy gradient: U = ½kδ², δ(φ) = δ0 + 2a·sin(φ/2),
  // T = dU/dφ = k·δ·a·cos(φ/2). At rest that is k·δ0·a — the snap-shut torque.
  const T0 = k * delta0 * a;
  const Topen = k * delta * a * Math.cos(phiMax / 2);
  const Fnose0 = T0 / armNose;
  const FnoseOpen = Topen / armNose;

  // Peak bending at the apex, reached through each side's arm L + R.
  const sigma1 = (FpinOpen * (L1 + R) * c) / I;
  const sigma2 = (FpinOpen * (L2 + R) * c) / I;
  const hotSide: 1 | 2 = sigma1 >= sigma2 ? 1 : 2;
  const sigmaPeak = Ki * Math.max(sigma1, sigma2);

  const SF = sigmaPeak > 0 ? sigmaYPa / sigmaPeak : Infinity;

  // Spread budget: σ = Ki·(Lmax+R)·c·k·δ / I, so first yield sits at
  const deltaYield = (sigmaYPa * I) / (Ki * (Lmax + R) * c * k);
  // …and the nose opening that spends it (preload eats its share first):
  const sYield = deltaYield - delta0;
  const gYield =
    sYield <= 0
      ? 0
      : sYield >= 2 * a
        ? Infinity
        : 2 * Math.asin(sYield / (2 * a)) * armNose;

  return {
    I,
    c,
    R,
    k,
    cs1,
    cs2,
    C,
    Ki,
    armNose,
    phiMax,
    s,
    delta,
    Fpin0,
    FpinOpen,
    T0,
    Topen,
    Fnose0,
    FnoseOpen,
    sigma1,
    sigma2,
    sigmaPeak,
    hotSide,
    SF,
    deltaYield,
    gYield,
    budgetUsed: deltaYield > 0 ? delta / deltaYield : Infinity,
    energyOpen: 0.5 * k * delta * delta,
  };
}

/**
 * The spread is millimetres on a centimetre-wide loop — often visible at ×1,
 * which is the honest default. Magnify only when the budget is genuinely
 * subtle (stiff loops), so first yield always reads as a clear bow.
 */
export function spreadMagnification(deltaYieldM: number, wM: number): number {
  if (!isFinite(deltaYieldM) || deltaYieldM <= 0) return 1;
  return Math.max(1, Math.min(40, (0.45 * wM) / deltaYieldM));
}

/**
 * In-plane bow of one side under the pin force, as a fraction of that side's
 * share of the spread: 0 at the apex (symmetry midpoint, zero slope), 1 at
 * the pinned tang. Same cubic as a tip-loaded cantilever measured from its
 * root — the apex is the root here, the pin is the free-moving end.
 */
export const spreadShape = (tFromApex: number) => {
  const t = Math.max(0, Math.min(1, tFromApex));
  return 0.5 * t * t * (3 - t);
};

/** Bending-moment fraction at distance x from the pin, on a side of arm L+R. */
export const momentFraction = (xFromPin: number, armM: number) =>
  Math.max(0, Math.min(1, armM > 0 ? xFromPin / armM : 0));
