import { FORMULAS } from "../formulas";
import { UNITS } from "../units/registry";

export function LibraryScreen({ onOpen }: { onOpen: (formulaId: string) => void }) {
  return (
    <div className="library">
      <h2>Formula Library</h2>
      {FORMULAS.map((f) => (
        <div key={f.id} className="lib-card">
          <div className="lib-head">
            <h3>{f.name}</h3>
            <button className="btn small" onClick={() => onOpen(f.id)}>Open</button>
          </div>
          <div className="equation">{f.equation}</div>
          <p className="explain">{f.explanation}</p>
          <table className="var-table">
            <thead>
              <tr><th>Symbol</th><th>Variable</th><th>Default unit</th><th>Description</th></tr>
            </thead>
            <tbody>
              {f.inputs.map((i) => (
                <tr key={i.symbol}>
                  <td className="sym">{i.symbol}</td>
                  <td>{i.name}</td>
                  <td>{UNITS[i.defaultUnit]?.label}</td>
                  <td>{i.description}</td>
                </tr>
              ))}
              {f.outputs.map((o) => (
                <tr key={o.symbol} className="out-row">
                  <td className="sym">{o.symbol}</td>
                  <td>{o.name}</td>
                  <td>{UNITS[o.preferredUnit]?.label}</td>
                  <td>{o.description}{o.isSafetyFactor ? " (safety factor)" : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {f.references && <p className="muted small">Ref: {f.references.join("; ")}</p>}
        </div>
      ))}
    </div>
  );
}
