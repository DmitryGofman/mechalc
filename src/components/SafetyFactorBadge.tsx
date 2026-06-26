import { gradeSF } from "../calc/shearScrew";
import { formatNumber } from "../units/units";

const COLORS = { fail: "#dc2626", marginal: "#d97706", ok: "#16a34a" };
const LABELS = { fail: "FAILS", marginal: "MARGINAL", ok: "OK" };

export function SafetyFactorBadge({ sf }: { sf: number }) {
  const grade = gradeSF(sf);
  return (
    <span className="sf-badge" style={{ background: COLORS[grade] }}>
      SF {formatNumber(sf)} · {LABELS[grade]}
    </span>
  );
}
