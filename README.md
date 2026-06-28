# Compliant Mechanism Toolkit

Design-check calculators for flexures and compliant mechanisms. The first tool is
a **cantilever flexure** calculator: pick a material, enter the beam geometry and a
target deflection, and get stiffness, required force, peak bending stress, and a
yield safety factor — alongside a live 3D view of the deflected beam drawn to true
L : t : w proportions.

More calculators will be added to the toolkit over time.

## Stack
React + TypeScript + Vite, with [three.js](https://threejs.org/) for the 3D beam viewer.

## Develop
```bash
npm install
npm run dev        # local dev server
npm run build      # type-check + production build
npm run preview    # preview the production build
```

## Project layout
```
src/
  main.tsx                  app entry
  App.tsx                   root component
  styles.css                global reset + fonts
  calculators/
    FlexureCalc.tsx         cantilever flexure calculator + 3D viewer
```

## Model notes
Linear small-deflection (Euler-Bernoulli) theory for an end-loaded rectangular
cantilever:

- `k = 3EI / L³` (stiffness)
- `σ = 3Etδ / 2L²` (peak surface stress)

Aim for a safety factor ≥ 2 for cyclic / living-hinge duty. Material values
(especially the 3D-printed ones) are typical reference figures — verify before
production use.
