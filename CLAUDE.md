# MechCalc — working notes

Closed-form design-check calculators. Each one pairs numbers with a live 3D
model you can grab, and says honestly what it does not cover.

## Commands

```bash
npm test               # vitest — the pure math modules
npm run build          # tsc -b + vite build (type-check runs here)
npm run dev            # dev server at /mechalc/
npm run build:standalone   # one self-contained index.html
```

## Shape of a calculator

Three files, every time:

- `src/calculators/<name>Math.ts` — pure functions, SI in and out, no React,
  no three.js. All the physics lives here.
- `src/calculators/<name>Math.test.ts` — tests the closed forms against their
  textbook identities, not against last run's output.
- `src/calculators/<Name>Calc.tsx` — the page: inputs, readouts, the 3D
  viewer, and a theory section that ends with a plain-language "In short".

Then wire it into `ROUTES` in `src/App.tsx`, add a card in `src/pages/Home.tsx`
(Refined / In progress / Planned), and add a row plus a model note to the
README. Shared pieces: `ui.tsx` (Field/Select/Readout), `materials.ts`,
`stressColor.ts`, and the `flexure-*` CSS classes, which carry the responsive
layout for free.

## Branding

The logo lives in `src/brand.tsx` — `LogoMark` draws it inline (with a reduced
detail level below 56px, where hatching and dash-dot centerlines stop
resolving), and `ACTIVE_DESIGN` names which of the candidates in
`public/brand/` is current. **The favicon and home-screen icons are committed
PNGs, not generated at build time**: after touching any `public/brand/*/icon.svg`
or switching `ACTIVE_DESIGN`, run `node scripts/render-icons.mjs` or the site
keeps serving the old icon.

## After you change anything: publish a preview

The user wants to **use** the app after a change, not read about it, and has
asked not to have to request this each time. So at the end of the work, run the
`preview` skill: it builds the standalone bundle and publishes it as a live
Artifact, and you hand over the link (deep-linked to the calculator you
changed). Screenshots are evidence, not delivery.

Merged work also deploys to <https://dmitrygofman.github.io/mechalc/> via
`.github/workflows/deploy-pages.yml`.
