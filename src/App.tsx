import { useEffect } from "react";
import type { ReactNode } from "react";
import { usePath, Link } from "./router";
import Home from "./pages/Home";
import FlexureCalc from "./calculators/FlexureCalc";
import BoltCalc from "./calculators/BoltCalc";
import SimpleBeamCalc from "./calculators/SimpleBeamCalc";
import ColumnCalc from "./calculators/ColumnCalc";
import ClampCalc from "./calculators/ClampCalc";
import ShaftCalc from "./calculators/ShaftCalc";

// Route table: every calculator lives at its own path under the site base,
// e.g. /mechalc/flexure-calculator on GitHub Pages.
const ROUTES: Record<string, { title: string; el: ReactNode }> = {
  "/flexure-calculator": { title: "Cantilever Flexure — MechCalc", el: <FlexureCalc /> },
  "/bolt-calculator": { title: "Bolted Joint — MechCalc", el: <BoltCalc /> },
  "/beam-calculator": { title: "Beam on Two Supports — MechCalc", el: <SimpleBeamCalc /> },
  "/buckling-calculator": { title: "Column Buckling — MechCalc", el: <ColumnCalc /> },
  "/clamp-calculator": { title: "Cylinder Clamp — MechCalc", el: <ClampCalc /> },
  "/shaft-calculator": { title: "Shaft in Torsion — MechCalc", el: <ShaftCalc /> },
};

export default function App() {
  const path = usePath();
  const route = ROUTES[path];

  useEffect(() => {
    document.title = route ? route.title : "MechCalc — Engineering Calculators";
  }, [route]);

  if (!route) return <Home />; // home, plus fallback for unknown paths

  return (
    // Classed so the print stylesheet can neutralise them: an inline dark
    // background paints straight over @media print's white page, which is what
    // turned exported PDFs into black slabs.
    <div className="app-shell" style={{ background: "#080c10", minHeight: "100vh" }}>
      <div className="app-crumb" style={{ maxWidth: 760, margin: "0 auto", padding: "16px 16px 0" }}>
        <Link
          to="/"
          style={{
            fontFamily: "'JetBrains Mono', 'SF Mono', Menlo, monospace",
            fontSize: 10,
            letterSpacing: "0.15em",
            textTransform: "uppercase",
            color: "#6b7884",
            textDecoration: "none",
          }}
        >
          ← MechCalc · All calculators
        </Link>
      </div>
      {route.el}
    </div>
  );
}
