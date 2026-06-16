import { useState } from "react";
import type { Dimension } from "../engine/types";
import { unitsForDimension } from "../units/registry";
import { convert } from "../units/convert";
import { formatNumber } from "../units/format";

const DIMENSIONS: { id: Dimension; label: string }[] = [
  { id: "length", label: "Length" },
  { id: "area", label: "Area" },
  { id: "second_moment", label: "Moment of inertia (I, J)" },
  { id: "section_modulus", label: "Section modulus (Z)" },
  { id: "force", label: "Force" },
  { id: "stress", label: "Stress / pressure" },
  { id: "moment", label: "Moment / torque" },
  { id: "mass", label: "Mass" },
  { id: "acceleration", label: "Acceleration" },
];

export function ConverterScreen() {
  const [dimension, setDimension] = useState<Dimension>("stress");
  const units = unitsForDimension(dimension);
  const [value, setValue] = useState("1");
  const [fromUnit, setFromUnit] = useState(units[0].id);

  function changeDimension(d: Dimension) {
    setDimension(d);
    setFromUnit(unitsForDimension(d)[0].id);
  }

  const num = Number(value);
  const valid = value.trim() !== "" && !isNaN(num);

  return (
    <div className="converter">
      <h2>Unit Converter</h2>
      <div className="conv-controls">
        <select value={dimension} onChange={(e) => changeDimension(e.target.value as Dimension)}>
          {DIMENSIONS.map((d) => (
            <option key={d.id} value={d.id}>{d.label}</option>
          ))}
        </select>
        <input
          type="number"
          inputMode="decimal"
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
        <select value={fromUnit} onChange={(e) => setFromUnit(e.target.value)}>
          {units.map((u) => (
            <option key={u.id} value={u.id}>{u.label}</option>
          ))}
        </select>
      </div>

      {valid ? (
        <table className="conv-table">
          <tbody>
            {units.map((u) => (
              <tr key={u.id} className={u.id === fromUnit ? "conv-self" : ""}>
                <td className="conv-val">{formatNumber(convert({ value: num, unit: fromUnit }, u.id).value)}</td>
                <td className="conv-unit">{u.label}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="muted">Enter a number to convert.</p>
      )}
    </div>
  );
}
