import type { InputVariable } from "../engine/types";
import { UnitSelector } from "./UnitSelector";
import { BOLTS } from "../data/bolts";
import { fromSI } from "../units/convert";
import { formatNumber } from "../units/format";

export interface FieldState {
  value: string;
  unit: string;
}

export function VariableInput({
  variable,
  state,
  onChange,
  error,
  pending,
}: {
  variable: InputVariable;
  state: FieldState;
  onChange: (next: FieldState) => void;
  error?: string;
  pending?: { siValue: number; label: string; onUse: () => void } | null;
}) {
  const isArea = variable.dimension === "area";
  return (
    <div className={`field ${error ? "field-error" : ""}`}>
      <div className="field-head">
        <label title={variable.description}>
          <span className="sym">{variable.symbol}</span> {variable.name}
        </label>
        {pending && (
          <button type="button" className="chip" onClick={pending.onUse} title="Use value from previous result">
            ↪ use {pending.label}
          </button>
        )}
      </div>
      <div className="field-row">
        <input
          type="number"
          inputMode="decimal"
          value={state.value}
          placeholder={variable.defaultValue != null ? String(variable.defaultValue) : "0"}
          onChange={(e) => onChange({ ...state, value: e.target.value })}
        />
        <UnitSelector
          dimension={variable.dimension}
          unit={state.unit}
          onChange={(unit) => onChange({ ...state, unit })}
        />
        {isArea && (
          <select
            className="picker-select"
            value=""
            title="Fill from a bolt tensile area"
            onChange={(e) => {
              const bolt = BOLTS.find((b) => b.id === e.target.value);
              if (bolt) {
                const q = fromSI(bolt.At, state.unit);
                onChange({ ...state, value: formatNumber(q.value) });
              }
            }}
          >
            <option value="">bolt Aₜ…</option>
            {BOLTS.map((b) => (
              <option key={b.id} value={b.id}>
                {b.label}
              </option>
            ))}
          </select>
        )}
      </div>
      {error && <div className="field-msg">{error}</div>}
      {!error && variable.description && <div className="field-desc">{variable.description}</div>}
    </div>
  );
}
