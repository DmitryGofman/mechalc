# MechCalc — Engineering Calculators

A toolkit of fast closed-form design-check calculators for mechanical engineers.
The home page lists every calculator; each one lives at its own URL and pairs the
numbers with a live 3D model you can grab, colored by how close the part is to
yielding.

## Calculators

| Route | Calculator | Status |
| --- | --- | --- |
| `/flexure-calculator` | **Cantilever Flexure** — stiffness, force, peak bending stress and yield safety factor for a rectangular flexure blade; bend the 3D beam interactively | ready |
| `/bolt-calculator` | **Bolted Joint — Screw Strength** — torque → preload, VDI 2230-style reduced (von Mises) stress, plus the full clamped-sandwich model: per-plate materials, Shigley pressure-cone member stiffness, load sharing, separation and bearing-crush checks; tighten the 3D nut and watch the pressure cones | ready |
| `/beam-calculator` | **Beam on Two Supports** — center-load stiffness, force and peak stress for a span held at both ends, pinned (48EI/L³) or built-in (192EI/L³); press the middle of the 3D beam and the stress colors trace the bending-moment diagram | ready |
| `/buckling-calculator` | **Column Buckling** — Euler critical load for all four classical end conditions (K = 0.5 / 0.7 / 1.0 / 2.0) with the Johnson parabola for short columns; push the 3D column's load platen and watch the initial imperfection amplify by 1/(1−P/Pcr) into the mode shape | ready |
| — | Shaft in Torsion · Helical Coil Spring · Press/Interference Fit · Thin-Wall Pressure Vessel · Bearing Life (L10) | planned |

On GitHub Pages the app is served under `/mechalc/`, so calculator URLs look like
`https://<user>.github.io/mechalc/bolt-calculator`. Deep links work via a
`404.html` fallback; the single-file standalone build falls back to hash routes
(`#/bolt-calculator`) so it still works from `file://`.

## Stack
React + TypeScript + Vite, with [three.js](https://threejs.org/) for the 3D viewers.
No router dependency — a ~70-line history/hash router in `src/router.tsx`.

## Develop
```bash
npm install
npm run dev        # local dev server (serves at /mechalc/)
npm test           # unit tests (vitest)
npm run build      # type-check + production build
npm run preview    # preview the production build
```

## Project layout
```
src/
  main.tsx                  app entry
  App.tsx                   route table + calculator page shell
  router.tsx                minimal history router (hash fallback for file://)
  ui.tsx                    shared Field / Select / Readout controls
  styles.css                global reset + fonts + shared layout
  pages/
    Home.tsx                calculator catalog (ready + planned cards)
  calculators/
    FlexureCalc.tsx         cantilever flexure calculator + 3D beam
    BoltCalc.tsx            bolted-joint calculator + 3D screw/nut
    boltMath.ts             pure bolted-joint math (tested)
    SimpleBeamCalc.tsx      beam-on-two-supports calculator + 3D beam
    simpleBeamMath.ts       pure two-support beam math (tested)
    ColumnCalc.tsx          column-buckling calculator + 3D column
    columnMath.ts           pure buckling math: Euler/Johnson, modes (tested)
    materials.ts            shared beam/flexure material library
    stressColor.ts          shared stress → color ramps for the 3D viewers
```

## Model notes
**Flexure** — linear small-deflection (Euler-Bernoulli) theory for an end-loaded
rectangular cantilever: `k = 3EI/L³`, `σ = 3Etδ/2L²`. Aim for a safety factor ≥ 2
for cyclic / living-hinge duty.

**Bolted joint** — nut-factor model `F = T/(K·d)` on the tensile stress area, with
the ~50% thread-torque split for tightening torsion and the VDI 2230-style reduced
stress `σred = √(σ² + 3τ²)` against proof (torsion relaxes after the wrench lets
go, so the working state is checked on tension vs yield). The clamped members are
modeled per Shigley's 30° pressure-cone frusta — each plate with its own material
and thickness — giving joint stiffness ratio `C = kb/(kb+km)`, external-load
sharing `Fb = Fi + C·P`, separation load, interface pressure, and bearing-pressure
(crushing) checks against per-material permissible pressures pG. Target 60–75% of
proof preload; K scatters ±25% between real joints.

Material and fastener values are typical reference figures — verify before
production use.
