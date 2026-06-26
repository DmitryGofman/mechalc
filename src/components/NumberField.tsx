import type { FieldSpec, RawInput } from "../calc/shearScrew";
import { unitsFor } from "../units/units";

export function NumberField({
  spec,
  input,
  error,
  onValue,
  onUnit,
}: {
  spec: FieldSpec;
  input: RawInput;
  error?: string;
  onValue: (value: string) => void;
  onUnit: (unit: string) => void;
}) {
  const units = unitsFor(spec.dimension);
  return (
    <div className={`field ${error ? "field-error" : ""}`}>
      <label htmlFor={`f-${spec.key}`}>
        <span className="sym">{spec.symbol}</span> {spec.name}
      </label>
      <div className="field-row">
        <input
          id={`f-${spec.key}`}
          type="number"
          inputMode="decimal"
          value={input.value}
          aria-invalid={!!error}
          onChange={(e) => onValue(e.target.value)}
        />
        {spec.dimension === "dimensionless" ? (
          <span className="unit-static">×</span>
        ) : (
          <select aria-label={`${spec.symbol} unit`} value={input.unit} onChange={(e) => onUnit(e.target.value)}>
            {units.map((u) => (
              <option key={u.id} value={u.id}>
                {u.label}
              </option>
            ))}
          </select>
        )}
      </div>
      {error ? <div className="field-msg">{error}</div> : <div className="field-desc">{spec.description}</div>}
    </div>
  );
}
