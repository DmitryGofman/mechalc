import { useMemo, useState, useEffect } from "react";
import type { FormulaDef, Quantity, SavedCalculation } from "../engine/types";
import { FORMULA_BY_ID } from "../formulas";
import { PREFERRED } from "../units/registry";
import { toSI, fromSI } from "../units/convert";
import { formatNumber } from "../units/format";
import { UNITS } from "../units/registry";
import { MATERIALS } from "../data/materials";
import { VariableInput, type FieldState } from "../components/VariableInput";
import { DiagramViewer } from "../components/DiagramViewer";
import { SafetyFactorBadge } from "../components/SafetyFactorBadge";
import { recentStore, newId } from "../storage/recentCalculations";
import type { UnitSystem, Pending } from "../App";

function displayUnit(dimension: string, system: UnitSystem, fallback: string): string {
  const p = PREFERRED[dimension as keyof typeof PREFERRED];
  return p ? p[system] : fallback;
}

// Output display unit honours a per-output imperial override (e.g. bending moment
// in lbf·in rather than the generic lbf·ft), falling back to the system preferred.
function outputUnit(
  out: { dimension: string; preferredUnit: string; preferredUnitImperial?: string },
  system: UnitSystem,
): string {
  if (system === "imperial") {
    return out.preferredUnitImperial ?? displayUnit(out.dimension, system, out.preferredUnit);
  }
  return out.preferredUnit;
}

function initFields(formula: FormulaDef, system: UnitSystem): Record<string, FieldState> {
  const out: Record<string, FieldState> = {};
  for (const inp of formula.inputs) {
    out[inp.symbol] = {
      value: inp.defaultValue != null ? String(inp.defaultValue) : "",
      unit: displayUnit(inp.dimension, system, inp.defaultUnit),
    };
  }
  return out;
}

export function CalculatorScreen({
  formulaId,
  loadId,
  system,
  pending,
  setPending,
  onSaved,
}: {
  formulaId: string;
  loadId?: string;
  system: UnitSystem;
  pending: Pending | null;
  setPending: (p: Pending | null) => void;
  onSaved: () => void;
}) {
  const formula = FORMULA_BY_ID[formulaId];
  const [fields, setFields] = useState<Record<string, FieldState>>(() => initFields(formula, system));
  const [savedFlash, setSavedFlash] = useState(false);

  useEffect(() => {
    if (loadId) {
      const saved = recentStore.get(loadId);
      if (saved && saved.formulaId === formulaId) {
        const next: Record<string, FieldState> = {};
        for (const inp of formula.inputs) {
          const q = saved.inputs[inp.symbol];
          next[inp.symbol] = q
            ? { value: formatNumber(q.value), unit: q.unit }
            : { value: "", unit: displayUnit(inp.dimension, system, inp.defaultUnit) };
        }
        setFields(next);
        return;
      }
    }
    setFields(initFields(formula, system));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formulaId, loadId]);

  const setField = (symbol: string, next: FieldState) =>
    setFields((f) => ({ ...f, [symbol]: next }));

  // Build SI inputs; track which fields are blank/invalid.
  const { si, complete } = useMemo(() => {
    const si: Record<string, number> = {};
    let complete = true;
    for (const inp of formula.inputs) {
      const fs = fields[inp.symbol];
      const raw = fs?.value?.trim();
      if (raw === "" || raw == null || isNaN(Number(raw))) {
        complete = false;
        si[inp.symbol] = NaN;
      } else {
        si[inp.symbol] = toSI({ value: Number(raw), unit: fs.unit });
      }
    }
    return { si, complete };
  }, [fields, formula]);

  const issues = complete && formula.validate ? formula.validate(si) : [];
  const errorByField: Record<string, string> = {};
  for (const it of issues) if (it.level === "error") errorByField[it.field] = it.message;
  const hasError = Object.keys(errorByField).length > 0;
  const warnings = issues.filter((it) => it.level === "warning");

  const results = useMemo(() => {
    if (!complete || hasError) return null;
    try {
      return formula.calculate(si);
    } catch {
      return null;
    }
  }, [si, complete, hasError, formula]);

  const sfOutput = formula.outputs.find((o) => o.isSafetyFactor);

  function applyMaterial(materialId: string) {
    const mat = MATERIALS.find((m) => m.id === materialId);
    if (!mat) return;
    setFields((f) => {
      const next = { ...f };
      for (const inp of formula.inputs) {
        if (inp.fillFrom === "material" && inp.materialKey) {
          const siVal = mat[inp.materialKey];
          const q = fromSI(siVal, next[inp.symbol].unit);
          next[inp.symbol] = { ...next[inp.symbol], value: formatNumber(q.value) };
        }
      }
      return next;
    });
  }

  function buildSaved(): SavedCalculation {
    const inputs: Record<string, Quantity> = {};
    for (const inp of formula.inputs) {
      inputs[inp.symbol] = { value: Number(fields[inp.symbol].value), unit: fields[inp.symbol].unit };
    }
    const outputs: Record<string, Quantity> = {};
    if (results) {
      for (const out of formula.outputs) {
        outputs[out.symbol] = fromSI(results[out.symbol], outputUnit(out, system));
      }
    }
    return {
      id: newId(),
      formulaId: formula.id,
      formulaName: formula.name,
      category: formula.category,
      inputs,
      outputs,
      safetyFactor: results && sfOutput ? results[sfOutput.symbol] : undefined,
      createdAt: new Date().toISOString(),
    };
  }

  function save() {
    if (!results) return;
    recentStore.save(buildSaved());
    setSavedFlash(true);
    setTimeout(() => setSavedFlash(false), 1800);
    onSaved();
  }

  function exportText() {
    const saved = buildSaved();
    const lines = [
      `Mechanical Quick Calc — ${formula.name}`,
      `Equation: ${formula.equation}`,
      "",
      "Inputs:",
      ...formula.inputs.map((i) => `  ${i.symbol} = ${saved.inputs[i.symbol].value} ${UNITS[saved.inputs[i.symbol].unit].label}`),
      "",
      "Results:",
      ...formula.outputs.map((o) => {
        const q = saved.outputs[o.symbol];
        return `  ${o.symbol} = ${q ? `${formatNumber(q.value)} ${UNITS[q.unit].label}` : "—"}`;
      }),
      "",
      new Date().toLocaleString(),
    ];
    const text = lines.join("\n");
    navigator.clipboard?.writeText(text).catch(() => {});
    const blob = new Blob([text], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${formula.id}-result.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="calc">
      <h2>{formula.name}</h2>
      <div className="equation">{formula.equation}</div>
      <DiagramViewer diagramId={formula.diagramId} title={formula.name} />
      <p className="explain">{formula.explanation}</p>

      {formula.inputs.some((i) => i.fillFrom === "material") && (
        <div className="material-bar">
          <span>Material:</span>
          <select defaultValue="" onChange={(e) => applyMaterial(e.target.value)}>
            <option value="">pick to fill Sy / E…</option>
            {MATERIALS.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="fields">
        {formula.inputs.map((inp) => {
          const usable =
            pending && pending.dimension === inp.dimension
              ? {
                  siValue: pending.siValue,
                  label: pending.label,
                  onUse: () => {
                    const q = fromSI(pending.siValue, fields[inp.symbol].unit);
                    setField(inp.symbol, { ...fields[inp.symbol], value: formatNumber(q.value) });
                  },
                }
              : null;
          return (
            <VariableInput
              key={inp.symbol}
              variable={inp}
              state={fields[inp.symbol]}
              onChange={(next) => setField(inp.symbol, next)}
              error={errorByField[inp.symbol]}
              pending={usable}
              system={system}
            />
          );
        })}
      </div>

      {warnings.length > 0 && (
        <div className="warnings">
          {warnings.map((w, i) => (
            <div key={i} className="warn-row">⚠ {w.message}</div>
          ))}
        </div>
      )}

      <div className="results">
        <h3>Results</h3>
        {!complete && <p className="muted">Enter all inputs to see results.</p>}
        {complete && hasError && <p className="muted">Fix the highlighted inputs above.</p>}
        {results &&
          formula.outputs.map((out) => {
            const unit = outputUnit(out, system);
            const q = fromSI(results[out.symbol], unit);
            if (out.isSafetyFactor) {
              return (
                <div key={out.symbol} className="result-row">
                  <span className="result-name">{out.name}</span>
                  <SafetyFactorBadge sf={results[out.symbol]} />
                </div>
              );
            }
            return (
              <div key={out.symbol} className="result-row">
                <span className="result-name">{out.name}</span>
                <span className="result-val">
                  {formatNumber(q.value)} <span className="result-unit">{UNITS[unit].label}</span>
                  <button
                    type="button"
                    className="chip use-chip"
                    title="Use this value as input to another calc"
                    onClick={() =>
                      setPending({
                        dimension: out.dimension,
                        siValue: results[out.symbol],
                        label: `${formatNumber(q.value)} ${UNITS[unit].label}`,
                      })
                    }
                  >
                    use →
                  </button>
                </span>
              </div>
            );
          })}
      </div>

      <div className="actions">
        <button className="btn primary" disabled={!results} onClick={save}>
          {savedFlash ? "Saved ✓" : "Save"}
        </button>
        <button className="btn" disabled={!results} onClick={exportText}>
          Export / Copy
        </button>
      </div>
    </div>
  );
}
