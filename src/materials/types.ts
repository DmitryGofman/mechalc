// The shape of one material in the shared library.
//
// UNITS — one internal system for the whole library, matching the rest of the
// toolkit (see units.ts): moduli in GPa, strengths and pressures in MPa,
// everything else SI. Calculators that want other units convert in their own
// adapter, so a conversion error can only ever affect one calculator instead
// of silently poisoning the table.
//
// OPTIONALITY IS DELIBERATE. A property is present only when a single typical
// number is genuinely meaningful for that material. Fatigue strength of an
// unfilled polymer, for instance, depends so heavily on grade, temperature and
// cycle rate that quoting one figure would be worse than quoting none — so
// those entries simply have no `Se`, and a calculator that needs it will say
// so instead of computing with a fabricated value. Use `requireProps` at the
// point of consumption to turn a missing property into a loud error.

/** Stable identifier — never shown to users, never renamed once shipped. */
export type MaterialId = string;

/** Broad family, used to group the pickers. */
export type MaterialGroup = "Metal" | "Composite" | "Plastic" | "FDM" | "Powder-bed" | "Elastomer";

/**
 * How the part was made. This is not cosmetic: a printed PA12 and a molded
 * PA12 have different anisotropy, different creep, and different honest
 * allowables, so they are separate entries rather than one entry with a flag.
 */
export type Process = "wrought" | "cast" | "molded" | "laminate" | "fdm" | "mjf" | "sls";

export type Material = {
  id: MaterialId;
  /** Display name — the canonical one. Calculators may relabel locally. */
  name: string;
  group: MaterialGroup;
  process: Process;

  // ── Mechanical core ────────────────────────────────────────────────────
  /** Young's modulus [GPa]. For anisotropic printed stock this is in-plane (XY). */
  E: number;
  /** Poisson's ratio [–]. */
  nu?: number;
  /** Yield strength [MPa]. For plastics, the tensile strength at yield. */
  sigmaY: number;
  /** Ultimate tensile strength [MPa]. */
  sigmaU?: number;
  /**
   * Permissible surface pressure under a bolt head or nut [MPa] — VDI 2230
   * Table A9 for metals. The limit that stops a joint being crushed rather
   * than the bolt being overloaded.
   */
  pG?: number;
  /**
   * Fully-reversed endurance strength [MPa], polished-specimen basis. Metals
   * only — apply your own Marin-style surface/size/reliability factors.
   */
  Se?: number;

  // ── Polymer design properties ──────────────────────────────────────────
  /**
   * Secant modulus at the design strain [GPa]. Plastics are non-linear well
   * before yield, so snap-fit and living-hinge design uses the secant slope,
   * not the initial tangent modulus `E`. Expect Es < E.
   */
  Es?: number;
  /** Permissible design strain [–, e.g. 0.04 = 4%] for a one-time assembly. */
  eAllow?: number;
  /**
   * Fraction of bolt preload still present after days under load [–].
   * 1 = no measurable relaxation (metals); 0.45 = keeps 45% (printed PLA).
   */
  creep?: number;

  // ── Physical & thermal ─────────────────────────────────────────────────
  /** Density [kg/m³]. */
  rho?: number;
  /** Coefficient of thermal expansion [µm/(m·K)] = 1e-6/K. */
  alpha?: number;
  /** Thermal conductivity [W/(m·K)]. */
  k?: number;
  /** Specific heat capacity [J/(kg·K)]. */
  cp?: number;

  // ── Presentation ───────────────────────────────────────────────────────
  /** Light swatch colour, for 2D schematics and material chips. */
  color: string;
  /** Dark 3D tone, for the lit three.js scenes. */
  tone: string;

  // ── Provenance ─────────────────────────────────────────────────────────
  /**
   * Where these numbers come from and what they are NOT. Every entry carries
   * one: a number without a source is not an engineering value, and this text
   * is what a calculator quotes when the user asks "says who?".
   */
  note: string;
  /** Legacy or alternate names this material has been called in the app. */
  aliases?: string[];
};

/** Order the groups appear in pickers. */
export const GROUPS: MaterialGroup[] = ["Metal", "Composite", "Plastic", "FDM", "Powder-bed", "Elastomer"];
