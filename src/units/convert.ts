import type { Quantity } from "../engine/types";
import { UNITS } from "./registry";

export function toSI(q: Quantity): number {
  const u = UNITS[q.unit];
  if (!u) throw new Error(`Unknown unit: ${q.unit}`);
  return q.value * u.toSI;
}

export function fromSI(siValue: number, unit: string): Quantity {
  const u = UNITS[unit];
  if (!u) throw new Error(`Unknown unit: ${unit}`);
  return { value: siValue / u.toSI, unit };
}

// Convert a quantity to another unit of the SAME dimension. Mixing dimensions
// (e.g. mm -> N) throws by construction, so unit bugs are impossible.
export function convert(q: Quantity, targetUnit: string): Quantity {
  const from = UNITS[q.unit];
  const to = UNITS[targetUnit];
  if (!from) throw new Error(`Unknown unit: ${q.unit}`);
  if (!to) throw new Error(`Unknown unit: ${targetUnit}`);
  if (from.dimension !== to.dimension) {
    throw new Error(`Cannot convert ${from.label} (${from.dimension}) to ${to.label} (${to.dimension})`);
  }
  return fromSI(toSI(q), targetUnit);
}
