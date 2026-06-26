# Screw Shear Calculator

A focused, fully-validated calculator for one common check: the **shear stress on a
screw connecting two plates** (a lap joint → single shear), with a safety factor
against the screw's shear yield.

- **Units handled for you** — per-field unit selectors and a global Metric ⇄ Imperial
  toggle that converts the values on screen. Calculations run in SI internally.
- **Validates everything** — every field is checked for presence, numeric format,
  positivity (and whole-number screw count); results only appear when all inputs are valid.
- **Diagram + explanations** — shows the joint and explains each variable.
- **Pickers** — fill the screw diameter and material yield strength from built-in tables.

## Engineering

```
A        = π·d² / 4          shear area of one screw
τ        = F / (n · A)       average shear stress (n screws share the load)
τ_allow  = 0.577 · Sy        distortion-energy shear yield
SF       = τ_allow / τ       safety factor
```

## Develop

```bash
npm install
npm run dev        # local dev server
npm test           # unit + calculation + validation tests
npm run build      # type-check + production build
```

## Layout

```
src/
  units/     unit registry + convert/format (+ tests)
  calc/      shearScrew.ts — model, computation, validation (+ tests)
  data/      screws, materials (for the pickers)
  components/ NumberField, SafetyFactorBadge, ScrewJointDiagram
  App.tsx    single-screen calculator
```

Reference material/screw values should be verified before relying on them for production design.
