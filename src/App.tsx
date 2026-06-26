import { useMemo, useState } from "react";
import {
  FIELDS,
  validateAll,
  evaluate,
  type Inputs,
  type FieldKey,
} from "./calc/shearScrew";
import { PREFERRED, convert, fromSI, formatNumber, UNITS, type Dimension } from "./units/units";
import { SCREWS } from "./data/screws";
import { MATERIALS } from "./data/materials";
import { NumberField } from "./components/NumberField";
import { SafetyFactorBadge } from "./components/SafetyFactorBadge";
import { ScrewJointDiagram } from "./components/ScrewJointDiagram";

type System = "metric" | "imperial";

function displayUnit(dim: Dimension, system: System): string {
  return PREFERRED[dim][system];
}

const INITIAL: Inputs = {
  F: { value: "5000", unit: "N" },
  d: { value: "6", unit: "mm" },
  n: { value: "1", unit: "" },
  Sy: { value: "640", unit: "MPa" },
};

export default function App() {
  const [inputs, setInputs] = useState<Inputs>(INITIAL);
  const [system, setSystem] = useState<System>("metric");

  const errors = useMemo(() => validateAll(inputs), [inputs]);
  const result = useMemo(() => evaluate(inputs), [inputs]);
  const errorCount = Object.keys(errors).length;

  const setValue = (key: FieldKey, value: string) =>
    setInputs((s) => ({ ...s, [key]: { ...s[key], value } }));
  const setUnit = (key: FieldKey, unit: string) =>
    setInputs((s) => ({ ...s, [key]: { ...s[key], unit } }));

  function switchSystem(next: System) {
    if (next === system) return;
    setInputs((s) => {
      const out = { ...s };
      for (const spec of FIELDS) {
        if (spec.dimension === "dimensionless") continue;
        const target = displayUnit(spec.dimension, next);
        const cur = s[spec.key];
        const num = Number(cur.value);
        if (cur.value.trim() !== "" && !Number.isNaN(num)) {
          out[spec.key] = { value: formatNumber(convert(num, cur.unit, target)), unit: target };
        } else {
          out[spec.key] = { ...cur, unit: target };
        }
      }
      return out;
    });
    setSystem(next);
  }

  function pickScrew(id: string) {
    const sc = SCREWS.find((x) => x.id === id);
    if (!sc) return;
    const unit = inputs.d.unit;
    setValue("d", formatNumber(convert(sc.dNomMm, "mm", unit)));
  }
  function pickMaterial(id: string) {
    const m = MATERIALS.find((x) => x.id === id);
    if (!m) return;
    const unit = inputs.Sy.unit;
    setValue("Sy", formatNumber(convert(m.SyMPa, "MPa", unit)));
  }

  const outRows: { name: string; symbol: string; dim: Dimension; si: number }[] = result
    ? [
        { name: "Shear area (per screw)", symbol: "A", dim: "area", si: result.A },
        { name: "Shear stress", symbol: "τ", dim: "stress", si: result.tau },
        { name: "Allowable shear (0.577·Sy)", symbol: "τ_allow", dim: "stress", si: result.tauAllow },
      ]
    : [];

  return (
    <div className="app">
      <header className="topbar">
        <div>
          <div className="title">Screw Shear Calculator</div>
          <div className="subtitle">Single shear · two-plate lap joint</div>
        </div>
        <div className="unit-toggle" role="group" aria-label="Unit system">
          <button className={system === "metric" ? "active" : ""} onClick={() => switchSystem("metric")}>
            Metric
          </button>
          <button className={system === "imperial" ? "active" : ""} onClick={() => switchSystem("imperial")}>
            Imperial
          </button>
        </div>
      </header>

      <main className="content">
        <ScrewJointDiagram />
        <p className="explain">
          A screw fastening two overlapping plates carries the pull-apart load across a single shear
          plane. This computes the average shear stress and the safety factor against the screw's
          shear yield (0.577·Sy, distortion-energy theory).
        </p>

        <div className="pickers">
          <label>
            Screw size
            <select defaultValue="" onChange={(e) => pickScrew(e.target.value)}>
              <option value="">fill d…</option>
              {SCREWS.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label} (Ø{s.dNomMm} mm)
                </option>
              ))}
            </select>
          </label>
          <label>
            Screw material
            <select defaultValue="" onChange={(e) => pickMaterial(e.target.value)}>
              <option value="">fill Sy…</option>
              {MATERIALS.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name} ({m.SyMPa} MPa)
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="fields">
          {FIELDS.map((spec) => (
            <NumberField
              key={spec.key}
              spec={spec}
              input={inputs[spec.key]}
              error={errors[spec.key]}
              onValue={(v) => setValue(spec.key, v)}
              onUnit={(u) => setUnit(spec.key, u)}
            />
          ))}
        </div>

        <section className="results" aria-live="polite">
          <h2>Results</h2>
          {!result ? (
            <p className="invalid-note">
              {errorCount === 1 ? "1 field needs attention" : `${errorCount} fields need attention`} —
              fix the highlighted inputs above to see results.
            </p>
          ) : (
            <>
              {outRows.map((r) => {
                const unit = displayUnit(r.dim, system);
                return (
                  <div className="result-row" key={r.symbol}>
                    <span className="result-name">
                      <span className="sym">{r.symbol}</span> {r.name}
                    </span>
                    <span className="result-val">
                      {formatNumber(fromSI(r.si, unit))} <span className="result-unit">{UNITS[unit].label}</span>
                    </span>
                  </div>
                );
              })}
              <div className="result-row sf-row">
                <span className="result-name">Safety factor</span>
                <SafetyFactorBadge sf={result.SF} />
              </div>
            </>
          )}
        </section>

        <p className="footnote">
          Uses the nominal (shank) diameter by default. If the threads fall in the shear plane, enter
          the minor/root diameter for a conservative result. Reference material values — verify before
          production design.
        </p>
      </main>
    </div>
  );
}
