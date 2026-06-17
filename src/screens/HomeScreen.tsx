import { useState } from "react";
import { searchFormulas, CATEGORIES, FORMULAS } from "../formulas";

export function HomeScreen({ onOpen }: { onOpen: (formulaId: string) => void }) {
  const [query, setQuery] = useState("");
  const results = searchFormulas(query);
  const grouped = CATEGORIES.map((cat) => ({
    cat,
    items: results.filter((f) => f.category === cat),
  })).filter((g) => g.items.length > 0);

  return (
    <div className="home">
      <input
        className="search"
        placeholder="Search formulas (e.g. tension, von mises, bolt, shear)…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        autoFocus
      />
      <p className="muted small">{FORMULAS.length} calculators · {CATEGORIES.length} categories</p>
      {grouped.map((g) => (
        <div key={g.cat} className="cat-group">
          <h3 className="cat-title">{g.cat}</h3>
          <div className="formula-grid">
            {g.items.map((f) => (
              <button key={f.id} className="formula-card" onClick={() => onOpen(f.id)}>
                <div className="fc-name">{f.name}</div>
                <div className="fc-eq">{f.equation}</div>
              </button>
            ))}
          </div>
        </div>
      ))}
      {grouped.length === 0 && <p className="muted">No formulas match “{query}”.</p>}
    </div>
  );
}
