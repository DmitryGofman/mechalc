import { formatNumber } from "../units/format";

// Thresholds: red < 1, amber 1–1.5, green ≥ 1.5.
export function sfColor(sf: number): string {
  if (!isFinite(sf)) return "#64748b";
  if (sf < 1) return "#dc2626";
  if (sf < 1.5) return "#d97706";
  return "#16a34a";
}

export function SafetyFactorBadge({ sf }: { sf: number }) {
  const color = sfColor(sf);
  const label = sf < 1 ? "FAIL" : sf < 1.5 ? "MARGINAL" : "OK";
  return (
    <span className="sf-badge" style={{ background: color }}>
      SF {formatNumber(sf)} · {label}
    </span>
  );
}
