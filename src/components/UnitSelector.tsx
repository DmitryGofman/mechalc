import type { Dimension } from "../engine/types";
import { unitsForDimension } from "../units/registry";

export function UnitSelector({
  dimension,
  unit,
  onChange,
}: {
  dimension: Dimension;
  unit: string;
  onChange: (unit: string) => void;
}) {
  const options = unitsForDimension(dimension);
  if (dimension === "dimensionless") return <span className="unit-static">—</span>;
  return (
    <select className="unit-select" value={unit} onChange={(e) => onChange(e.target.value)}>
      {options.map((u) => (
        <option key={u.id} value={u.id}>
          {u.label}
        </option>
      ))}
    </select>
  );
}
