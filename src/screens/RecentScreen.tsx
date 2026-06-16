import { useState } from "react";
import { recentStore } from "../storage/recentCalculations";
import { UNITS } from "../units/registry";
import { formatNumber } from "../units/format";
import { SafetyFactorBadge } from "../components/SafetyFactorBadge";

export function RecentScreen({ onOpen }: { onOpen: (formulaId: string, loadId: string) => void }) {
  const [, force] = useState(0);
  const list = recentStore.list();

  if (list.length === 0) {
    return <div className="recent"><p className="muted">No saved calculations yet. Run a calc and press Save.</p></div>;
  }

  return (
    <div className="recent">
      <div className="recent-head">
        <h2>Recent Calculations</h2>
        <button className="btn small" onClick={() => { recentStore.clear(); force((n) => n + 1); }}>
          Clear all
        </button>
      </div>
      {list.map((c) => {
        const firstOut = Object.entries(c.outputs).find(([k]) => k !== "SF");
        return (
          <div key={c.id} className="recent-card">
            <div className="rc-main">
              <div className="rc-title">{c.formulaName}</div>
              <div className="rc-meta">
                {new Date(c.createdAt).toLocaleString()} · {c.category}
              </div>
              <div className="rc-result">
                {firstOut && (
                  <span>
                    {firstOut[0]} = {formatNumber(firstOut[1].value)} {UNITS[firstOut[1].unit]?.label}
                  </span>
                )}
                {c.safetyFactor != null && <SafetyFactorBadge sf={c.safetyFactor} />}
              </div>
            </div>
            <div className="rc-actions">
              <button className="btn small" onClick={() => onOpen(c.formulaId, c.id)}>Open</button>
              <button className="btn small" onClick={() => { recentStore.duplicate(c.id); force((n) => n + 1); }}>Duplicate</button>
              <button className="btn small danger" onClick={() => { recentStore.delete(c.id); force((n) => n + 1); }}>Delete</button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
