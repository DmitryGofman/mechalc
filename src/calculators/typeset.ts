// CSS-typeset maths for the theory pages — no library, no MathML.
//
// Lifted out of the cylinder-clamp calculator so the bolted-joint theory tabs
// render identically instead of growing a second, slightly-different copy.
// The markup pairs with the .mth / .mi / .frac / .eqn rules in styles.css.

/** A variable, set in italics the way a symbol should be. */
export const V = (x: string) => `<span class="mi">${x}</span>`;

/** A built-up fraction: numerator over denominator with a rule between. */
export const FR = (n: string, d: string) => `<span class="frac"><span>${n}</span><span>${d}</span></span>`;

/**
 * One worked step: what is being computed, the symbolic form, the numbers
 * substituted into it, and the answer — plus an optional note underneath.
 * `cls` tints the result ("" | "warn" | "bad").
 */
export const eqn = (lead: string, sym: string, sub: string, res: string, cls = "", cmt = "") =>
  `<div class="eqn"><span class="lead">${lead}</span><span class="mth">${sym} <span class="sub">= ${sub}</span> = ` +
  `<span class="res ${cls}">${res}</span></span>${cmt ? `<span class="cmt">${cmt}</span>` : ""}</div>`;
