# Phase 1 — Prototype guide

The prototype round exists to answer one question cheaply: **which way of
meeting the numbers fits this mechanism best?** Physics is settled before it
starts; variants must differ in interaction concept, never in arithmetic.

Exemplar to study before building: `public/designs/cylinderclamp/` — engine,
six variants, picker page. Also `public/designs/snapfit/` for a prototype
family that includes a standalone theory page.

## Folder layout

```
public/designs/shared/materials.js   the material library, generated (shared)
public/designs/<slug>/
  <slug>-engine.js     one shared physics engine (plain JS, no build step)
  index.html           picker page linking the variants
  design-a-<name>.html
  design-b-<name>.html
  design-c-<name>.html
  design-d-<name>.html  (3–4 variants; letter + short concept name)
```

Everything self-contained: inline CSS and JS, no imports beyond the shared
material library and the engine (`<script src="../shared/materials.js">` then
`<script src="…-engine.js">`), no CDNs and no three.js — the existing 3D
variants hand-roll their projection on a plain 2D canvas (see
`design-f-3d.html`), and the real three.js scene arrives at promotion. Each
page must open from `file://` and from GitHub Pages unchanged.

## The engine

`clamp-engine.js` is the model to copy:

- A header comment drawing the **dependency chain** of the whole model
  (input → intermediate → each check), with units and scope caveats. This
  comment later becomes the documentation seed for the promoted math module.
- One global namespace (`window.<SLUG> = (() => { … })()`) exposing the data
  tables (threads, materials, classes…) and one `solve(input) → results`
  entry point plus small helpers.
- **Material properties come from the shared library, never a local table.**
  Every prototype page loads `<script src="../shared/materials.js"></script>`
  before the engine, and the engine builds its picker with
  `MECHMAT.menu([[label, id], …], project)` — see `clamp-engine.js`. A missing
  property is asserted with `MECHMAT.requireProps(...)` rather than defaulted.
  New materials go into `src/materials/library.ts`, then
  `npm run gen:materials`; the test suite fails if that generated mirror
  drifts from the library.
- Internal units strictly metric: mm, N, MPa, N·m. Prototypes may show
  metric only — the imperial toggle is promotion-phase work.
- Reference-quality typical values with a "verify before production use"
  note. Name sources in comments (ISO 898-1, Shigley table x.y…).

The engine is disposable-quality code with non-disposable physics: it will be
re-typed and re-tested in TypeScript at promotion, so correctness and clear
structure matter far more than JS elegance.

## Variant archetypes

Pick 3–4 that genuinely fit the mechanism — each one a different answer to
"how does the user meet the numbers?". The menu, from variants that have
already worked (letters are historical, reuse freely):

- **Control panel** — dense inputs left / live readouts + safety-factor cards
  right, a 2D schematic below. The baseline; almost always include it.
- **Drag the tool** — the user performs the shop action directly: drag a
  wrench arc, pull a lever, twist a shaft. Torque/force is the drag; numbers
  chase the hand. Strongest when the calculator's key input is an action.
- **Advisor / recommendation-first** — the tool leads with the derived answer
  ("use 4× M6 at 9 N·m") and lets the user unfold the checks behind it.
  Strongest when the user's real question is "what should I do?".
- **Cross-section** — a cut view painted with the stress/pressure field,
  slider-driven. Strongest when the interesting physics is distribution
  (pressure cones, hoop stress, shear flow).
- **Free-body diagram** — force arrows and moment balance as a live figure
  (the "see-saw" statics view). Strongest for load-path intuition and
  teaching-flavored calculators.
- **3D assembly** — the grabbable three.js scene, closest to the promoted
  form. Include when 3D reveals something flat views can't (assembly
  relationships, mode shapes, where the hot spots live).

Invent new archetypes when the mechanism suggests one; name the variant after
its concept, not its letter.

## Per-variant requirements

- Full design language compliance (`design-language.md`) — tokens, kicker +
  title header, back link to the picker, scope-honesty footer.
- Live recompute on every input, no "calculate" button, ever.
- Verdict colors (green/amber/red) on safety factors; warnings appear only
  when true.
- Phone-first, per the "Mobile compatibility" section of
  `design-language.md`: `viewport` meta, Pointer Events +
  `touch-action: none` on any draggable canvas, CSS-driven canvas sizing,
  no horizontal scroll at 390px, fingertip-sized targets. Prototypes are
  reviewed from a phone via the Pages link — a desktop-only prototype
  loses the comparison unfairly.
- A **no-JS banner** that self-diagnoses: a visible warning `<div>` that an
  inline script immediately removes — so it shows precisely when scripts are
  blocked (chat-app file previews are the usual culprit) and tells the user
  how to open the file properly. Copy the wording from any cylinderclamp
  prototype; it is battle-tested.
- Empty/zero load inputs report *capacity* and stay neutral rather than
  inventing a safety factor.

## Picker page

`index.html` in the family folder: same design language, one card per variant
with its letter, concept name, and a one-line pitch of what it explores.
Order cards by how strongly you recommend them, and say so in the pitches —
the user chooses, but a recommendation is part of the deliverable.

## Wiring into the site

Add one Home card in the **In progress** tier of `src/pages/Home.tsx`:
`href: \`${import.meta.env.BASE_URL}designs/<slug>/\``, badge override (e.g.
`badge: "PROTOTYPES"`), tag from the catalog, and a description that says the
variants are up for comparison. This makes the deployed Pages site the review
venue — the user can try every variant on their phone.

## Handing over (the checkpoint)

End the prototype phase with a short summary for the user:

- One line per variant: concept, what it uniquely explores, your take.
- Where to try them: local (`npm run dev` → `/mechalc/designs/<slug>/`) and
  the Pages URL once merged.
- The explicit ask: pick a winner, name grafts from the losers, flag any
  physics that felt wrong while playing.

Then STOP. Promotion starts only after the user chooses.
