# Mechanical Quick Calc

Fast design-check calculator for mechanical engineers — G-loads, stress, bending,
shear, torsion, von Mises, deflection, and section properties. Every value is
unit-aware (metric ⇄ imperial), each formula shows a diagram, and calculations
auto-save to history. See [`ARCHITECTURE.md`](./ARCHITECTURE.md) for the full design.

## Stack
React + TypeScript + Vite (web-first PWA-ready). Pure SI calculation engine with a
units layer at the boundary, so formulas are unit-bug-free.

## Develop
```bash
npm install
npm run dev        # local dev server
npm test           # run the test suite (calculators + unit/dimensional guards)
npm run build      # type-check + production build
```

## Project layout
```
src/
  engine/      domain types (FormulaDef, Quantity, …)
  units/       unit registry, convert (toSI/fromSI), formatting
  formulas/    one file per calculator + registry/search
  data/        materials, bolts (metric + ANSI), tap drills
  storage/     localStorage history
  components/  VariableInput, UnitSelector, DiagramViewer, SafetyFactorBadge
  screens/     Home, Calculator, Recent, Library, Converter
  diagrams/    SVG diagrams (+ reference/ from Wikimedia, see CREDITS.md)
```

## MVP scope
G-load, axial stress, single/double shear, cantilever & simply-supported bending,
torsion, von Mises, cantilever deflection, section properties (rect/round/tube),
material & bolt pickers, unit converter, safety-factor badge, recent calculations,
result export. Reference values in `data/` should be verified before production use.
