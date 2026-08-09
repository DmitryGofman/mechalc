// Helpers for reading the shared material library.
//
// The pattern every calculator follows: declare a MENU — an ordered list of
// [display label, material id] pairs — and project each entry into whatever
// local shape that calculator's math already expects. Two things fall out of
// this that a plain shared table would not give you:
//
//   · Display labels stay under each calculator's control. The clamp calls
//     something "Steel (S355 / 4140N)" and the bolted joint calls it
//     "Alloy steel (S355 / 4140)"; both point at one set of numbers, and
//     renaming a label never silently repoints it at a different material.
//   · Missing data fails loudly. `requireProps` turns "this material has no
//     permissible bearing pressure" into an error at module load and in the
//     test suite, instead of a safety factor quietly computed against zero.

import { MATERIALS } from "./library";
import type { Material, MaterialGroup, MaterialId } from "./types";

export { MATERIALS, MATERIAL_IDS } from "./library";
export { GROUPS } from "./types";
export type { Material, MaterialGroup, MaterialId, Process } from "./types";

/** Look up by id. Throws rather than returning undefined — a typo'd id is a bug. */
export function material(id: MaterialId): Material {
  const m = MATERIALS[id];
  if (!m) throw new Error(`Unknown material id "${id}". Add it to src/materials/library.ts.`);
  return m;
}

/**
 * Assert that a material carries the properties a calculator needs, and return
 * them narrowed to numbers. Call it inside a menu projection so the failure
 * surfaces the moment the menu is built.
 *
 *   const { pG } = requireProps(m, ["pG"], "bolted-joint plates");
 */
export function requireProps<K extends keyof Material>(
  m: Material,
  keys: K[],
  usedBy: string,
): { [P in K]: NonNullable<Material[P]> } {
  const missing = keys.filter((k) => m[k] === undefined || m[k] === null);
  if (missing.length) {
    throw new Error(
      `Material "${m.id}" (${m.name}) is missing ${missing.join(", ")}, required by ${usedBy}. ` +
        `Either source the value into src/materials/library.ts or drop this material from that menu — ` +
        `do not substitute a placeholder.`,
    );
  }
  return Object.fromEntries(keys.map((k) => [k, m[k]])) as { [P in K]: NonNullable<Material[P]> };
}

/** One entry of a calculator's material menu: the label the UI shows, and what it points at. */
export type MenuEntry = [label: string, id: MaterialId];

/**
 * Build a calculator-local table keyed by display label. Preserves the order
 * given, which is the order the dropdown shows.
 */
export function menu<T>(entries: MenuEntry[], project: (m: Material, label: string) => T): Record<string, T> {
  const out: Record<string, T> = {};
  for (const [label, id] of entries) {
    if (out[label] !== undefined) throw new Error(`Duplicate menu label "${label}".`);
    out[label] = project(material(id), label);
  }
  return out;
}

/** Young's modulus in MPa, for the calculators whose math works in N/mm². */
export const E_MPa = (m: Material) => m.E * 1000;

/** Secant modulus in MPa — the unit plastics design tables quote it in. */
export const Es_MPa = (m: Material) => (m.Es === undefined ? undefined : m.Es * 1000);

/** All materials in a group, in library order. */
export const byGroup = (g: MaterialGroup) => Object.values(MATERIALS).filter((m) => m.group === g);

/**
 * Find a material by its canonical name or any alias it has been known by.
 * Useful when reading a name that was persisted before ids existed.
 */
export function resolveName(name: string): Material | undefined {
  return Object.values(MATERIALS).find((m) => m.name === name || m.aliases?.includes(name));
}
