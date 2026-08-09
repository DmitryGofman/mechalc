# Phase 2 — Promotion guide

Turning the winning prototype into a first-class toolkit calculator. The
exemplars to read before each step are named inline — reading them is not
optional; they ARE the spec, and they will have evolved past this document.

Target file set for a calculator with slug `<slug>` / component `<Slug>Calc`:

```
src/calculators/<slug>Math.ts        pure physics (typed, documented)
src/calculators/<slug>Math.test.ts   vitest suite
src/calculators/<Slug>Calc.tsx       page component + 3D scene
src/calculators/<slug>Theory.ts      theory/tips content (only if it outgrows
                                     the component — BoltCalc pattern)
```

Plus edits to: `src/App.tsx` (route), `src/pages/Home.tsx` (card),
`README.md` (table row + model notes), and possibly `src/styles.css`,
`src/calculators/materials.ts` / `fasteners.ts` (shared tables).

## 1. Math module

Exemplars: `boltMath.ts` (structure, doc comments), `clampMath.ts` (a
recommendation solver), `columnMath.ts` (regime switching).

- Port the prototype engine to TypeScript: exported input/result types, one
  main solve function, small pure helpers. No DOM, no React, no formatting —
  numbers in, numbers out, internal units metric (mm, N, MPa, N·m).
- Carry over the engine's dependency-chain header comment, upgraded with
  anything learned during prototyping.
- Shared data lives in shared modules: if the calculator needs materials or
  fasteners that overlap the existing tables, extend `materials.ts` /
  `fasteners.ts` rather than forking a private copy.
- If the calculator recommends (a torque, a bolt count, a wall), make the
  recommendation a pure function too, and make it survive its own checks —
  see "recommended torque now survives its own crush check" in git history
  for why: a recommendation the checks then flag is a bug.

## 2. Tests

Exemplars: `boltMath.test.ts`, `clampMath.test.ts`, `columnMath.test.ts`.
House test style, in rough order of value:

- **Handbook cross-checks** — reproduce published worked examples / table
  values with the source cited in the test name or comment ("≈9 N·m for M6
  class 8.8 dry, per handbook tables"). These are the tests that make the
  tool trustworthy.
- **Invariant sweeps** — sweep inputs across realistic ranges asserting
  monotonicity, continuity at regime boundaries (Euler↔Johnson style),
  symmetry, and that recommendations always pass their own checks (see the
  "full invariant sweep" commits).
- **Limiting cases** — degenerate geometry, zero load (capacity mode), the
  validity-range edges, both unit-system round trips if any conversion is
  touched.

Run `npm test` — everything green before the component work starts.

## 3. Component + 3D scene

Exemplars: `BoltCalc.tsx` (most complete idiom), `ColumnCalc.tsx` (readable
scene wiring), `ClampCalc.tsx` + `clampScene.ts` (scene split out when big).

Anatomy of a calculator page:

- State = raw input strings (`useState<string>`), parsed with `num()` from
  `src/ui.tsx`; solved via `useMemo` calling the math module.
- Shared `Field` / `Select` / `Readout` controls; tab bar
  (Model · Theory · Design tips, more as earned) using `.tabbar` styles.
- The three.js scene lives in its own component with a mount-once `useEffect`
  and mutable refs for everything per-frame (see the `*Ref` battery at the
  top of any scene component). Geometry updates in place; no React re-render
  per frame.
- **The grab**: the user manipulates the same thing they would in the shop —
  and the manipulated value writes back to the inputs (`onLiveP`-style
  callback). Spring-back, drag limits, and yield events copy the feel of the
  existing scenes, including the haptic/audio cues (`navigator.vibrate`,
  the small AudioContext creak — see the "Haptic / audio feel" section in
  `ColumnCalc.tsx`).
- Stress coloring through `stressColor.ts` ramps — never invent a new ramp
  when an existing one fits; extend that module if the physics needs a new
  semantic (that's how the compression-severity ramp was born).
- Verdict logic: green ≥ 1.25, amber ≥ 1, red < 1 is the house convention
  for safety-factor coloring unless the domain dictates otherwise.
- Empty load box ⇒ report capacity, stay neutral.

## 4. Units toggle

Exemplar: `units.ts` (read its header comment — it is the law) and how
`BoltCalc.tsx` threads `UnitPack` through fields, readouts, and theory.
Display-layer only; the math module never sees imperial. The toggle pins to
the top right, including on phones.

## 5. Theory & design tips

Exemplars: `boltTheory.ts` + `typeset.ts`; the clamp's theory/tips tabs.

- Theory = the derivation **worked with the numbers currently on screen**,
  every line checkable against the Model-tab readouts, in the active unit
  system. Build equations with `eqn(lead, sym, sub, res, cls, cmt)`, `V()`
  for italic symbols, `FR()` for built-up fractions — this is the toolkit's
  textbook/"LaTeX" look, CSS-typeset, no library.
- Explain model bias honestly with direction and magnitude, and explain what
  the 3D view exaggerates (`VIEW_EXAG` pattern).
- Design tips = practitioner advice specific to the application and the
  user's manufacturing context (assembly order, re-torque intervals,
  test-coupon advice, when this part is the wrong choice entirely). Bold the
  actionable numbers. This content comes from the intake answers plus the
  classical literature's practice sections.

## 6. Report export

Exemplar: `ClampCalc.tsx` — `reportHTML()`, the one-page bench sheet, the
`printDoc` state + `exportPDF()` flow, and the print stylesheet section at
the bottom of `src/styles.css`. The traps it already solved, so don't
re-lose them:

- Inline dark backgrounds beat `@media print` — the app shell is classed
  (`.app-shell`) so print CSS can neutralize it; report content renders on
  paper white.
- The on-screen canvas is too soft for paper: re-render the scene offscreen
  at print density (scale 2, taller figure for the full report) on white.
- `afterprint` + two-frame mount dance for Chrome/Safari differences.

Offer both: **one-page bench sheet** (the numbers + figure + verdicts that
go to the shop floor) and **full report** (adds the worked theory and tips —
the full mathematical story with numbers and units substituted in).

## 7. Wire up

- Route in `src/App.tsx` (`/<slug>-calculator`, title "… — MechCalc").
- Home card: move/replace the prototype card; new calculators enter
  **In progress** (amber) and are promoted to **Refined** only by the user's
  word. Card must name the interactive hook and carry the signature equation.
- README: table row (route, name, one-line scope, status) + a "Model notes"
  paragraph in the house voice, + project-layout entries.
- Keep the prototype family under `public/designs/` — it is history and
  still deployed; the picker keeps working.

## 8. Definition of done

Walk this list; each item verified, not assumed:

- [ ] `npm test` green, including new handbook cross-checks and sweeps
- [ ] `npm run typecheck` and `npm run build` clean
- [ ] Grabbable scene writes back to inputs; spring-back and yield feel match
      the existing calculators; colors follow the shared ramps
- [ ] Units toggle flips every field, readout, theory line; internals metric;
      round-trip lossless
- [ ] Theory tab numbers match Model tab readouts exactly (spot-check three)
- [ ] Recommendation (if any) always passes its own checks across a sweep
- [ ] Empty/zero load ⇒ capacity mode, neutral colors
- [ ] Phone pass at ~390px (see "Mobile compatibility" in
      `design-language.md`): no horizontal scroll, header compact, toggle
      pinned, nothing clipped, canvas resizes with the viewport, touch drag
      grabs the model without scrolling the page (Pointer Events +
      `touch-action: none`), haptics behind a capability check
- [ ] PDF export: bench sheet and full report both render on white with a
      crisp figure
- [ ] Route + Home card + README all updated and consistent
- [ ] Scope-honesty footer present; every warning is conditional and true
