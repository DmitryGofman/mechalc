/*
 * SnapFit engine — shared calculation core for the SnapLab design prototypes.
 *
 * Contract (see SNAPLAB_PROJECT_FOUNDATION.md §4, §6, §7):
 *   - Internal units are SI only: mm, N, MPa (N/mm²). Angles are radians in
 *     every function below; degrees exist only at the UI edge.
 *   - Strain is stored as a fraction (0.04 = 4%); the UI formats percent.
 *   - Every result carries a status: "pass" | "fail" | "indeterminate" |
 *     "invalid" — plus the warnings that produced it. A green number with a
 *     silently broken model is the failure mode this file exists to prevent.
 *   - The self-locking wedge singularity (1 − μ·tanα ≤ 0) never yields a
 *     finite force; callers receive { selfLocking: true, W: null }.
 *
 * Sources: BASF Snap-Fit Design Manual; Bayer "Snap-Fit Joints for Plastics".
 *   Uniform cantilever:            P = Es·b·(t/L)³·y / 4,      ε = 1.50·t·y/L²
 *   Thickness taper t → t/2:       P = Es·b·(t/L)³·y / 6.528,  ε = 0.92·t·y/L²
 *   Width taper b → b/4:           P = Es·b·(t/L)³·y / 5.136,  ε = 1.17·t·y/L²
 * The handbook constants are cross-checked at runtime against an independent
 * Castigliano integral (numericCompliance) — see crossCheck().
 */
(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.SnapFit = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const PROFILES = {
    uniform: {
      label: "Uniform section",
      forceDivisor: 4,
      strainCoef: 1.5,
      thicknessAt: (t, u) => t,
      widthAt: (b, u) => b,
      volumeFactor: 1.0,
    },
    taperThickness: {
      label: "Thickness taper t → t/2",
      forceDivisor: 6.528,
      strainCoef: 0.92,
      thicknessAt: (t, u) => t * (1 - u / 2),
      widthAt: (b, u) => b,
      volumeFactor: 0.75,
    },
    taperWidth: {
      label: "Width taper b → b/4",
      forceDivisor: 5.136,
      strainCoef: 1.17,
      thicknessAt: (t, u) => t,
      widthAt: (b, u) => b * (1 - (3 * u) / 4),
      volumeFactor: 0.625,
    },
  };

  /*
   * Engineering policy, not physical constants (§6.1): thresholds are
   * deliberately centralized and overridable so a reviewer can see and
   * change them in one place.
   */
  const POLICY = {
    slendernessOk: 10, //  L/t at or above → standard beam caveats only
    slendernessMin: 5, //  below → indeterminate, model not credible
    deflectionWarn: 0.1, //  y/L above → geometric-nonlinearity warning
    deflectionMax: 0.25, //  y/L above → indeterminate
    strainModelMax: 0.15, //  ε beyond 15% → linear material model not credible
    filletWarnRatio: 0.5, //  R/t below → stress-concentration warning
    muWarnHigh: 1.2, //  μ above → check the friction source
    modulusPlausible: [10, 30000], // MPa — outside → probable unit error
    lengthPlausible: 500, // mm — beyond → probable unit error
    allowableStrainWarn: 0.2, // fraction — beyond → check the basis
  };

  const isPos = (v) => typeof v === "number" && Number.isFinite(v) && v > 0;
  const isNonNeg = (v) => typeof v === "number" && Number.isFinite(v) && v >= 0;

  /*
   * Frictional wedge: W = P·(μ + tanα)/(1 − μ·tanα), valid only while the
   * denominator is positive. α is in radians and must lie in (0°, 90°) for
   * insertion; α = 90° is a permanent (non-releasable) return face.
   */
  function wedgeForce(P, alphaRad, mu) {
    if (!Number.isFinite(P) || !Number.isFinite(alphaRad) || !isNonNeg(mu)) {
      return { W: null, selfLocking: false, invalid: true };
    }
    if (alphaRad >= Math.PI / 2 - 1e-9) {
      return { W: null, selfLocking: true, invalid: false };
    }
    const tanA = Math.tan(alphaRad);
    const denom = 1 - mu * tanA;
    if (denom <= 1e-9) {
      return { W: null, selfLocking: true, invalid: false };
    }
    return { W: (P * (mu + tanA)) / denom, selfLocking: false, invalid: false };
  }

  function validate(inp) {
    const errors = [];
    const need = (cond, field, msg) => {
      if (!cond) errors.push({ field, msg });
    };
    need(isPos(inp.L), "L", "Beam length L must be a positive number (mm).");
    need(isPos(inp.b), "b", "Root width b must be a positive number (mm).");
    need(isPos(inp.t), "t", "Root thickness t must be a positive number (mm).");
    need(isPos(inp.y), "y", "Undercut y must be a positive number (mm).");
    need(isPos(inp.Es), "Es", "Secant modulus Es must be a positive number (MPa).");
    need(isPos(inp.eAllow), "eAllow", "Permissible strain must be a positive fraction (e.g. 0.04).");
    need(isNonNeg(inp.mu), "mu", "Friction coefficient μ must be zero or positive.");
    need(
      Number.isFinite(inp.alphaRad) && inp.alphaRad > 0 && inp.alphaRad < Math.PI / 2,
      "alpha",
      "Entry angle α must lie strictly between 0° and 90°."
    );
    need(
      Number.isFinite(inp.alphaPrimeRad) && inp.alphaPrimeRad >= 0 && inp.alphaPrimeRad <= Math.PI / 2,
      "alphaPrime",
      "Return angle α′ must lie between 0° and 90° (90° = permanent joint)."
    );
    const Kt = inp.Kt === undefined || inp.Kt === null ? 1 : inp.Kt;
    need(
      Number.isFinite(Kt) && Kt >= 1,
      "Kt",
      "Concentration factor Kt must be ≥ 1 (use 1 when no traceable value exists)."
    );
    if (inp.R !== undefined && inp.R !== null) {
      need(isNonNeg(inp.R), "R", "Root fillet radius R must be zero or positive (mm).");
    }
    if (!PROFILES[inp.profile]) {
      errors.push({ field: "profile", msg: "Unknown beam profile: " + inp.profile });
    }
    return errors;
  }

  /*
   * Main entry point. All inputs SI (mm, N, MPa, radians, strain fractions).
   *   { profile, L, b, t, y, Es, eAllow, mu, alphaRad, alphaPrimeRad, Kt?, R? }
   * Returns { status, errors, warnings, values, selfLock } — values is null
   * when status is "invalid".
   */
  function evaluate(inp, policy) {
    const pol = Object.assign({}, POLICY, policy || {});
    const errors = validate(inp);
    if (errors.length) {
      return { status: "invalid", errors, warnings: [], values: null, selfLock: null };
    }

    const prof = PROFILES[inp.profile];
    const Kt = inp.Kt === undefined || inp.Kt === null ? 1 : inp.Kt;
    const warnings = [];
    let indeterminate = false;
    const warn = (code, msg, hard) => {
      warnings.push({ code, msg, level: hard ? "blocking" : "caution" });
      if (hard) indeterminate = true;
    };

    // ── Core closed-form results ──────────────────────────────────────
    const ratio = inp.t / inp.L;
    const P = (inp.Es * inp.b * ratio * ratio * ratio * inp.y) / prof.forceDivisor;
    const k = P / inp.y;
    const eps = (prof.strainCoef * inp.t * inp.y) / (inp.L * inp.L);
    const epsEff = Kt * eps;
    const U = epsEff / inp.eAllow;
    const margin = 1 / U - 1;
    const insert = wedgeForce(P, inp.alphaRad, inp.mu);
    const remove = wedgeForce(P, inp.alphaPrimeRad, inp.mu);
    const volume = prof.volumeFactor * inp.b * inp.t * inp.L;
    const slenderness = inp.L / inp.t;
    const deflectionRatio = inp.y / inp.L;

    // ── Applicability guards (§6) — ordered by severity ─────────────
    if (slenderness < pol.slendernessMin) {
      warn(
        "short-beam",
        `L/t = ${slenderness.toFixed(1)} — far below the beam-theory range. Root/wall compliance dominates; the fixed-root model is not credible. Use FEA or a validated short-beam correction.`,
        true
      );
    } else if (slenderness < pol.slendernessOk) {
      warn(
        "short-beam",
        `L/t = ${slenderness.toFixed(1)} < ${pol.slendernessOk} — short beam. The ideally-fixed root underestimates deflection and misplaces strain; treat results as approximate.`
      );
    }

    if (deflectionRatio > pol.deflectionMax) {
      warn(
        "large-deflection",
        `y/L = ${deflectionRatio.toFixed(2)} — deflection is large relative to length. Small-deflection linear geometry is not credible; a nonlinear (elastica/FEA) model is required.`,
        true
      );
    } else if (deflectionRatio > pol.deflectionWarn) {
      warn(
        "large-deflection",
        `y/L = ${deflectionRatio.toFixed(2)} — approaching the large-rotation regime; the linear model overstates stiffness slightly and the contact point migrates.`
      );
    }

    if (epsEff > pol.strainModelMax) {
      warn(
        "strain-range",
        `Calculated strain ${(epsEff * 100).toFixed(1)}% is beyond any linear-elastic range for thermoplastics; the secant-modulus model no longer applies.`,
        true
      );
    }

    if (insert.selfLocking) {
      warn(
        "self-locking-entry",
        "Entry face is self-locking in the rigid-wedge model (1 − μ·tanα ≤ 0): no finite insertion force exists. Reduce α or μ.",
        true
      );
    }
    if (remove.selfLocking) {
      warnings.push({
        code: "self-locking-return",
        level: "info",
        msg:
          inp.alphaPrimeRad >= Math.PI / 2 - 1e-9
            ? "Return face at 90° — the joint is designed as permanent (non-releasable by sliding)."
            : "Return face is self-locking (1 − μ·tanα′ ≤ 0): the sliding model predicts no finite removal force. Real release is governed by deformation and local contact geometry.",
      });
    }

    // ── Plausibility warnings (unit-blunder tripwires, §7 register) ──
    if (inp.Es < pol.modulusPlausible[0] || inp.Es > pol.modulusPlausible[1]) {
      warn(
        "modulus-range",
        `Es = ${inp.Es} MPa is outside the plausible polymer range (${pol.modulusPlausible[0]}–${pol.modulusPlausible[1]} MPa). Check units: MPa = N/mm², not GPa or psi.`
      );
    }
    if (inp.L > pol.lengthPlausible) {
      warn("length-range", `L = ${inp.L} mm is unusually long for a snap arm — check that inputs are in millimetres.`);
    }
    if (inp.t >= inp.L) {
      warn("geometry-shape", "Thickness t is not smaller than length L — this is not a cantilever beam.", true);
    }
    if (inp.y > inp.t * 5) {
      warn("undercut-range", `Undercut y = ${inp.y} mm exceeds 5·t — verify the undercut and tolerance stack.`);
    }
    if (inp.mu > pol.muWarnHigh) {
      warn("friction-range", `μ = ${inp.mu} is unusually high — confirm the source (texture, lubrication, rate all shift μ).`);
    }
    if (inp.eAllow > pol.allowableStrainWarn) {
      warn(
        "allowable-basis",
        `Permissible strain ${(inp.eAllow * 100).toFixed(0)}% is beyond typical single-event limits — confirm the material basis.`
      );
    }
    if (inp.R !== undefined && inp.R !== null && inp.R / inp.t < pol.filletWarnRatio) {
      warn(
        "root-fillet",
        `R/t = ${(inp.R / inp.t).toFixed(2)} < ${pol.filletWarnRatio} — sharp root. Actual root strain exceeds the beam value; apply a traceable Kt or increase the fillet.`
      );
    }
    if (Kt === 1 && (inp.R === undefined || inp.R === null)) {
      warnings.push({
        code: "kt-default",
        level: "info",
        msg: "Kt = 1 with no fillet specified: root concentration is NOT included. Use a traceable chart/FEA value, never a guess.",
      });
    }

    const status = indeterminate ? "indeterminate" : U > 1 ? "fail" : "pass";

    return {
      status,
      errors: [],
      warnings,
      selfLock: { insert: insert.selfLocking, remove: remove.selfLocking },
      values: {
        P, // transverse deflection force, N
        k, // stiffness, N/mm
        eps, // root strain, fraction (before Kt)
        epsEff, // Kt·eps
        U, // strain utilization
        margin, // 1/U − 1
        W: insert.W, // insertion force, N (null when self-locking)
        Wremove: remove.W, // removal force, N (null when self-locking/permanent)
        volume, // beam volume, mm³
        slenderness, // L/t
        deflectionRatio, // y/L
        RoverT: inp.R !== undefined && inp.R !== null ? inp.R / inp.t : null,
        profileLabel: prof.label,
      },
    };
  }

  /*
   * Independent reference model (§4.3): tip compliance y/P by Simpson
   * integration of Castigliano's ∫ (L−x)² / (Es·I(x)) dx. Deliberately does
   * NOT use the handbook divisors, so it can catch a wrong constant.
   */
  function numericCompliance(profile, L, b, t, Es, n) {
    const prof = PROFILES[profile];
    const N = Math.max(2, Math.ceil((n || 400) / 2) * 2); // even for Simpson
    const h = L / N;
    let sum = 0;
    for (let i = 0; i <= N; i++) {
      const x = i * h;
      const u = x / L;
      const ti = prof.thicknessAt(t, u);
      const bi = prof.widthAt(b, u);
      const I = (bi * ti * ti * ti) / 12;
      const f = ((L - x) * (L - x)) / (Es * I);
      sum += f * (i === 0 || i === N ? 1 : i % 2 ? 4 : 2);
    }
    return (sum * h) / 3; // mm/N
  }

  /* Closed-form vs numeric-integral force for the same deflection. */
  function crossCheck(inp, n) {
    const prof = PROFILES[inp.profile];
    const ratio = inp.t / inp.L;
    const closedP = (inp.Es * inp.b * ratio * ratio * ratio * inp.y) / prof.forceDivisor;
    const numericP = inp.y / numericCompliance(inp.profile, inp.L, inp.b, inp.t, inp.Es, n);
    return { closedP, numericP, diffPct: (100 * (closedP - numericP)) / numericP };
  }

  /* Bending strain-energy integral ∫ M²/(2EsI) dx — must equal P·y/2. */
  function numericStrainEnergy(profile, L, b, t, Es, P, n) {
    const prof = PROFILES[profile];
    const N = Math.max(2, Math.ceil((n || 400) / 2) * 2);
    const h = L / N;
    let sum = 0;
    for (let i = 0; i <= N; i++) {
      const x = i * h;
      const u = x / L;
      const ti = prof.thicknessAt(t, u);
      const bi = prof.widthAt(b, u);
      const I = (bi * ti * ti * ti) / 12;
      const M = P * (L - x);
      const f = (M * M) / (2 * Es * I);
      sum += f * (i === 0 || i === N ? 1 : i % 2 ? 4 : 2);
    }
    return (sum * h) / 3; // N·mm
  }

  /*
   * Surface strain along the beam for a given tip force P:
   * ε(x) = P·(L−x)·(t(x)/2) / (Es·I(x)). Returns n+1 points {u, eps}.
   */
  function strainProfile(inp, P, n) {
    const prof = PROFILES[inp.profile];
    const N = n || 40;
    const pts = [];
    for (let i = 0; i <= N; i++) {
      const u = i / N;
      const x = u * inp.L;
      const ti = prof.thicknessAt(inp.t, u);
      const bi = prof.widthAt(inp.b, u);
      const I = (bi * ti * ti * ti) / 12;
      pts.push({ u, eps: (P * (inp.L - x) * (ti / 2)) / (inp.Es * I) });
    }
    return pts;
  }

  /*
   * Deflected centre-line shape for drawing: uniform end-loaded cantilever
   * shape function v(u) = y·(3u² − u³)/2. For tapered beams this is a
   * visual approximation only — label it as such in the UI.
   */
  function deflectionShape(yTip, n) {
    const N = n || 40;
    const pts = [];
    for (let i = 0; i <= N; i++) {
      const u = i / N;
      pts.push({ u, v: (yTip * (3 * u * u - u * u * u)) / 2 });
    }
    return pts;
  }

  /*
   * Interval (worst/best corner) propagation for the uncertainty mode
   * (§5.4). All outputs are monotonic in each ranged input, so evaluating
   * corners is exact for the linear model:
   *   P  ↑ with Es, y          ε  ↑ with y
   *   U  ↑ with y, ↓ with eAllow    W ↑ with P, μ
   * ranges: { Es:[lo,hi], y:[lo,hi], mu:[lo,hi], eAllow:[lo,hi] } — any subset.
   */
  function evaluateInterval(inp, ranges) {
    const r = ranges || {};
    const pick = (range, nominal) => (range && range.length === 2 ? range : [nominal, nominal]);
    const [EsLo, EsHi] = pick(r.Es, inp.Es);
    const [yLo, yHi] = pick(r.y, inp.y);
    const [muLo, muHi] = pick(r.mu, inp.mu);
    const [eaLo, eaHi] = pick(r.eAllow, inp.eAllow);
    const bad =
      !(isPos(EsLo) && isPos(yLo) && isPos(eaLo) && isNonNeg(muLo)) || EsLo > EsHi || yLo > yHi || muLo > muHi || eaLo > eaHi;
    if (bad) return { ok: false, msg: "Ranges must be ordered [low, high] with positive lower bounds." };

    const prof = PROFILES[inp.profile];
    if (!prof || !isPos(inp.L) || !isPos(inp.b) || !isPos(inp.t)) {
      return { ok: false, msg: "Interval evaluation needs a valid nominal design first." };
    }
    const Kt = inp.Kt === undefined || inp.Kt === null ? 1 : inp.Kt;
    const ratio = inp.t / inp.L;
    const Pof = (Es, y) => (Es * inp.b * ratio * ratio * ratio * y) / prof.forceDivisor;
    const epsOf = (y) => (prof.strainCoef * inp.t * y) / (inp.L * inp.L);

    const Pmin = Pof(EsLo, yLo);
    const Pmax = Pof(EsHi, yHi);
    const Umin = (Kt * epsOf(yLo)) / eaHi;
    const Umax = (Kt * epsOf(yHi)) / eaLo;
    const Wlo = wedgeForce(Pmin, inp.alphaRad, muLo);
    const Whi = wedgeForce(Pmax, inp.alphaRad, muHi);

    return {
      ok: true,
      P: [Pmin, Pmax],
      U: [Umin, Umax],
      W: [Wlo.W, Whi.W],
      selfLockingAnywhere: Wlo.selfLocking || Whi.selfLocking,
      verdict: Umax <= 1 ? "pass" : Umin > 1 ? "fail" : "marginal",
    };
  }

  /* Unit helpers — the ONLY place customary units may appear. */
  const UNITS = {
    mmToIn: (v) => v / 25.4,
    inToMm: (v) => v * 25.4,
    nToLbf: (v) => v / 4.4482216152605,
    lbfToN: (v) => v * 4.4482216152605,
    mpaToKsi: (v) => v / 6.894757293168,
    ksiToMpa: (v) => v * 6.894757293168,
    degToRad: (v) => (v * Math.PI) / 180,
    radToDeg: (v) => (v * 180) / Math.PI,
  };

  /*
   * Curated educational defaults (§6.3): generic handbook-era values for
   * exploring the tool — NOT production allowables. Each entry says so.
   */
  const MATERIALS = [
    { id: "pa66-dam", name: "PA 66 (dry as molded)", Es: 2800, eAllow: 0.04, note: "Generic educational value — unfilled nylon 66, DAM, 23 °C. Not a production allowable." },
    { id: "pa66-cond", name: "PA 66 (conditioned)", Es: 1200, eAllow: 0.06, note: "Generic educational value — moisture-conditioned nylon 66, 23 °C. Not a production allowable." },
    { id: "pc", name: "PC", Es: 2300, eAllow: 0.04, note: "Generic educational value — unfilled polycarbonate, 23 °C. Not a production allowable." },
    { id: "abs", name: "ABS", Es: 2100, eAllow: 0.03, note: "Generic educational value — general-purpose ABS, 23 °C. Not a production allowable." },
    { id: "pom", name: "POM (acetal)", Es: 2600, eAllow: 0.04, note: "Generic educational value — unfilled acetal, 23 °C. Not a production allowable." },
    { id: "pp", name: "PP", Es: 1300, eAllow: 0.05, note: "Generic educational value — unfilled polypropylene, 23 °C. Not a production allowable." },
    { id: "pbt-gf30", name: "PBT-GF30", Es: 8000, eAllow: 0.012, note: "Generic educational value — 30% glass PBT, flow direction, 23 °C. Anisotropy NOT modelled. Not a production allowable." },
    { id: "custom", name: "Custom…", Es: null, eAllow: null, note: "Enter your own grade-specific secant modulus and permissible strain, with source." },
  ];

  return {
    PROFILES,
    POLICY,
    MATERIALS,
    UNITS,
    evaluate,
    wedgeForce,
    evaluateInterval,
    numericCompliance,
    numericStrainEnergy,
    crossCheck,
    strainProfile,
    deflectionShape,
  };
});
