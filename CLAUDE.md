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

**Building or extending one? Read the `new-calculator` skill first** — it carries
the full anatomy. The short version: pure tested math in `<name>Math.ts`, the
tabbed page in `<Name>Calc.tsx` (Model / Theory & report / Design tips), the
long-form prose in `<name>Theory.ts` as HTML built around the user's own numbers,
a grabbable 3D view, a printable worked report, and honest scope notes.

A calculator that ships without its theory tab and its report is not finished.

Wire it into `ROUTES` in `src/App.tsx`, add a card in `src/pages/Home.tsx`
(Refined / In progress / Planned — plus Exploration maps at the bottom, for
things you wander rather than run, like the Materials Map), and add a row plus
a model note to the README. Shared pieces: `ui.tsx` (Field/Select/Readout),
`materials.ts`, `stressColor.ts`, `units.ts`, the `.theory`/`.eqn`/`.tip`/
`table.rep` content classes, and the `flexure-*` and `tab*` CSS classes, which
carry the responsive layout and the print stylesheet for free.

## The catalog evolves itself

`ROADMAP.md` is the goal memory: the selection policy, the queue, the idea
backlog and a journal of what each cycle shipped. The `evolve` skill runs one
cycle — pick the highest-value step, build it via `new-calculator`, then write
lessons back into the skills and the roadmap. When the user says "evolve",
"keep going" or "next calculator" (or a scheduled session fires with no more
specific ask), run that skill; each cycle is self-contained, so a cold session
recovers the full state from those two files.

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
