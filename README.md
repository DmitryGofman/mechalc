# MechCalc — Engineering Calculators

A toolkit of fast closed-form design-check calculators for mechanical engineers.
The home page lists every calculator; each one lives at its own URL and pairs the
numbers with a live 3D model you can grab, colored by how close the part is to
yielding.

## Calculators

| Route | Calculator | Status |
| --- | --- | --- |
| `/flexure-calculator` | **Cantilever Flexure** — stiffness, force, peak bending stress and yield safety factor for a rectangular flexure blade; bend the 3D beam interactively | ready |
| `/bolt-calculator` | **Bolted Joint — Screw Strength** — torque → preload, tension + tightening torsion, von Mises vs proof strength; tighten the 3D nut and watch the shank load up | ready |
| — | Shaft in Torsion · Column Buckling · Helical Coil Spring · Press/Interference Fit · Thin-Wall Pressure Vessel · Bearing Life (L10) | planned |

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
    stressColor.ts          shared stress → color ramps for the 3D viewers
```

## Model notes
**Flexure** — linear small-deflection (Euler-Bernoulli) theory for an end-loaded
rectangular cantilever: `k = 3EI/L³`, `σ = 3Etδ/2L²`. Aim for a safety factor ≥ 2
for cyclic / living-hinge duty.

**Bolted joint** — short-form nut-factor model `F = T/(K·d)` on the tensile stress
area, with the standard ~50% thread-torque split for tightening torsion and a von
Mises check against proof strength. Target 60–75% of proof preload; K scatters
±25% between real joints.

Material and fastener values are typical reference figures — verify before
production use.
