import { useState } from "react";
import type { Dimension } from "./engine/types";
import { HomeScreen } from "./screens/HomeScreen";
import { CalculatorScreen } from "./screens/CalculatorScreen";
import { RecentScreen } from "./screens/RecentScreen";
import { LibraryScreen } from "./screens/LibraryScreen";
import { ConverterScreen } from "./screens/ConverterScreen";

export type UnitSystem = "metric" | "imperial";
export interface Pending {
  dimension: Dimension;
  siValue: number;
  label: string;
}

type Nav =
  | { screen: "home" }
  | { screen: "calc"; formulaId: string; loadId?: string }
  | { screen: "recent" }
  | { screen: "library" }
  | { screen: "converter" };

const TABS: { id: Nav["screen"]; label: string }[] = [
  { id: "home", label: "Home" },
  { id: "recent", label: "Recent" },
  { id: "library", label: "Library" },
  { id: "converter", label: "Convert" },
];

export default function App() {
  const [nav, setNav] = useState<Nav>({ screen: "home" });
  const [system, setSystem] = useState<UnitSystem>(() => {
    return (localStorage.getItem("mechalc.units") as UnitSystem) || "metric";
  });
  const [pending, setPending] = useState<Pending | null>(null);

  function changeSystem(s: UnitSystem) {
    setSystem(s);
    localStorage.setItem("mechalc.units", s);
  }

  const openCalc = (formulaId: string, loadId?: string) =>
    setNav({ screen: "calc", formulaId, loadId });

  return (
    <div className="app">
      <header className="topbar">
        <button className="brand" onClick={() => setNav({ screen: "home" })}>
          Mechanical Quick Calc
        </button>
        <div className="unit-toggle">
          <button
            className={system === "metric" ? "active" : ""}
            onClick={() => changeSystem("metric")}
          >
            Metric
          </button>
          <button
            className={system === "imperial" ? "active" : ""}
            onClick={() => changeSystem("imperial")}
          >
            Imperial
          </button>
        </div>
      </header>

      {pending && (
        <div className="pending-bar">
          Carrying value: <b>{pending.label}</b>
          <button className="chip" onClick={() => setPending(null)}>clear</button>
        </div>
      )}

      <main className="content">
        {nav.screen === "home" && <HomeScreen onOpen={openCalc} />}
        {nav.screen === "calc" && (
          <CalculatorScreen
            key={`${nav.formulaId}-${nav.loadId ?? ""}`}
            formulaId={nav.formulaId}
            loadId={nav.loadId}
            system={system}
            pending={pending}
            setPending={setPending}
            onSaved={() => { /* stays on screen; Recent reads fresh on open */ }}
          />
        )}
        {nav.screen === "recent" && <RecentScreen onOpen={openCalc} />}
        {nav.screen === "library" && <LibraryScreen onOpen={openCalc} />}
        {nav.screen === "converter" && <ConverterScreen />}
      </main>

      <nav className="tabbar">
        {TABS.map((t) => (
          <button
            key={t.id}
            className={nav.screen === t.id ? "active" : ""}
            onClick={() => setNav({ screen: t.id } as Nav)}
          >
            {t.label}
          </button>
        ))}
      </nav>
    </div>
  );
}
