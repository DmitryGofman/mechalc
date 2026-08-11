---
name: new-calculator
description: Build a new MechCalc calculator, or bring an existing one up to the standard the refined ones set. Use whenever a calculator is being added (from the Home roadmap or from scratch), extended, or reviewed for completeness — it carries the full anatomy every calculator is expected to have: pure tested math, the tabbed page, a grabbable 3D view, the worked theory report with PDF export, design tips, and the wiring into routes, the catalog card and the README. Read it BEFORE writing the first file; a new build STARTS with the architecture quiz to the user (scope, the grab, inputs) before any code, and a calculator that ships without the theory tab or the report is not finished.
---

# What a MechCalc calculator is

> **This skill learns.** It is the distilled experience of every calculator
> built so far, and updating it is part of finishing a build — see the last
> section. If you learn something the hard way, the build is not done until
> that lesson is written back here, in place, so the next builder never hits
> it again.

Not a form with numbers. Every finished one is four things at once: a **closed-form
check** you can trust, a **3D model you can grab** that makes the physics visible,
a **worked calculation** in the user's own numbers that can be printed and filed,
and **honest scope notes** about what it does not cover.

Ship all four. The most common failure is shipping the first two, calling it
done, and leaving the page without its theory tab and report.

## Before any code: the architecture quiz

A build is big — math, page, 3D scene, theory, report — and the expensive
mistakes are decisions, not code: checking the wrong failure modes, a 3D model
with nothing meaningful to grab, a handbook constant that should have been an
input. Settle those **with the user, before the first file**.

When the user asks for a new calculator, put the critical questions to them as
a short quiz (the AskUserQuestion tool — concrete options, your recommended
answer first and marked as such). Ask only what genuinely steers the build,
usually three or four questions from this list:

- **Scope of the physics.** Which checks are in, and which are honestly out
  (static vs fatigue, which failure modes, solid/hollow, which end conditions)?
  Offer the textbook-standard set as the recommendation, citing the source.
- **The grab.** What is the 3D geometry and which part is the load — the thing
  you push, tighten, or pull? If you cannot name the grab, the concept is not
  ready to build.
- **Inputs vs constants.** Which parameters are *the design* — inputs that
  move both the number and the model — and which stay handbook values? Units
  and realistic ranges.
- **Anything that forks the page:** a fourth tab, materials beyond
  `materials.ts`, one configuration or several.

Skip any question the request already answers. If the user says "you decide",
decide, and record the choice and its reasoning in the scope notes. The
settled answers become the written plan — and the brief for the build agent
below. Refinements of an existing calculator usually need no quiz; ask only
if the refinement itself forks.

## Model routing: think on Fable, build on Opus

Two jobs, two models:

- **Fable (the session model) does the thinking:** the quiz, the architecture,
  deriving the math and its textbook validation cases, reviewing the built
  code, the browser drive-test, and the lessons write-back at the end.
- **Opus 5 does the building:** once the architecture is settled, delegate the
  big implementation chunk — the math module, its tests, the page, the theory
  module, the scene — to a subagent via the Agent tool with `model: "opus"`.

The subagent starts cold, so the brief must be self-contained: the quiz
answers and plan, the exact file list, every formula with its anchor values,
which shared pieces to use (`ui.tsx`, `materials.ts`, `stressColor.ts`,
`scene3d.ts`, the content classes), the print-document pattern from this
skill, and the order — math + tests first, proven against the validation
cases, before any UI. Tell it to read this skill file and a refined reference
(`boltTheory.ts`, `ShaftCalc.tsx`) before writing.

The delegation is not a hand-off of responsibility: review the diff yourself,
run the verification list yourself, and fix or send back what falls short.
If the Agent tool is unavailable in the session, or the work is a small
refinement rather than a build, skip the routing and do the work directly.

## Files

Five, for a full calculator:

| File | What lives there |
| --- | --- |
| `src/calculators/<name>Math.ts` | Pure functions. SI in, SI out. No React, no three.js. All the physics. |
| `src/calculators/<name>Math.test.ts` | The closed forms against their textbook identities — never against last run's output. |
| `src/calculators/<Name>Calc.tsx` | The page: tabs, inputs, readouts, the 3D viewer, the print document. |
| `src/calculators/<name>Theory.ts` | Long-form prose as HTML-string builders around the user's numbers: `reportHTML(state)`, `tipsHTML(state)`. |
| `src/calculators/<name>Scene.ts` | Only if the viewer's geometry is big enough to crowd the page file (see `clampScene.ts`, `pinScene.ts`). |

The theory module is a separate file because the same markup renders **twice** —
in the theory tab and inside the print document — and because a 700-line wall of
prose inside a React component makes both harder to edit. `boltTheory.ts` is the
reference.

## The page: tabs, not one long scroll

Three tabs is the standard set. Use the shared classes; they already exist:

```tsx
type Tab = "model" | "theory" | "tips";
const TABS: [Tab, string][] = [
  ["model", "Model"],
  ["theory", "Theory & report"],
  ["tips", "Design tips"],
];

<div className="tabbar" role="tablist">
  {TABS.map(([k, t]) => (
    <button key={k} role="tab" aria-selected={tab === k}
      className={`tabbtn${tab === k ? " on" : ""}`} onClick={() => setTab(k)}>{t}</button>
  ))}
</div>
<div className={`tabpane${tab === "model" ? " on" : ""}`}> … </div>
```

- **Model** — inputs on the left, the safety-factor card and readouts on the
  right (`.flexure-grid` gives you the responsive two-column layout free), then
  the 3D viewer below.
- **Theory & report** — the export buttons first, then the equation list, then
  `reportHTML(state)`, then the plain-language **In short** close in a
  `.calc-note`.
- **Design tips** — `tipsHTML(state)`: numbered practical advice, each tip
  ending in a `.tipnum` line that puts the user's own numbers into it.

Add a fourth tab only when the calculator has a genuinely separate body of
content (the clamp's preload/torque material table; the pin joint's failure-mode
ladder).

## The report is a document, not a re-skin of the page

Printing renders its own tree. **Never** try to re-skin the live UI for print —
inline dark backgrounds beat any `@media print` rule without `!important`, which
is what once turned exports into black slabs.

```tsx
const [printDoc, setPrintDoc] = useState<{ brief: boolean; img: string } | null>(null);
const exportPDF = (brief: boolean) => setPrintDoc({ brief, img: snapRef.current?.() ?? "" });

useEffect(() => {                       // mount the document, then print it
  if (!printDoc) return;
  let done = false;
  const finish = () => { if (!done) { done = true; setPrintDoc(null); } };
  window.addEventListener("afterprint", finish);
  const raf = requestAnimationFrame(() => requestAnimationFrame(() => {
    window.print();                     // Chrome blocks here, Safari returns at once
    setTimeout(finish, 700);
  }));
  return () => { window.removeEventListener("afterprint", finish); cancelAnimationFrame(raf); };
}, [printDoc]);
```

Mark the wrapper `className={printDoc ? "printing" : undefined}` and give the
document `className={`calc-print ${brief ? "brief" : "full"}`}`. The print
stylesheet hides everything else on that page and paints the shell paper white.

Two exports, both through the browser's own print dialog → "Save as PDF":

- **One-page summary** — headline verdict, the figure, the section table, the
  equations. A bench sheet someone can carry to the machine.
- **Full report** — all of that plus the worked calculation and the design tips,
  each starting on a new page (`.sec.brk`).

**The figure.** Snapshot the 3D view onto *paper white*, not the dark canvas —
a black rectangle ruins a calculation sheet. For a three.js viewer, create the
renderer with `preserveDrawingBuffer: true` and expose a snapshot through a ref:

```ts
snapRef.current = () => {
  const dpr = renderer.getPixelRatio();
  scene.background = new THREE.Color("#ffffff");
  renderer.setPixelRatio(2);            // above 300 dpi on paper
  renderer.render(scene, camera);
  const url = renderer.domElement.toDataURL("image/png");
  scene.background = new THREE.Color("#0b1015");
  renderer.setPixelRatio(dpr);
  renderer.render(scene, camera);
  return url;
};
```

## Content classes you already have

Write report and tip HTML against these — they are styled for screen *and*
re-coloured for ink, so anything using them prints correctly for free:

`.theory` wrapper · `.theory .lab` section eyebrow · `h3` / `h4` · `p` ·
`p.pn.warn` and `p.pn.bad` for the honest warnings · `.eqn` with `.lead`,
`.mth`, `.res` (`.bad` / `.warn`), `.cmt` for a worked equation ·
`table.rep` with `td.v` and `tr.hi` · `.tip` (`.key` / `.warn` / `.bad`) with
`.tipnum` · `.calc-note` for the closing summary · `.btnrow` · `.linkish`.

## The 3D view

It is the reason this toolkit exists — the number and the picture have to be the
same model. Non-negotiables:

- **One source of truth.** The viewer computes from the same math module and the
  same inputs as the readouts. Never let the picture use a different value than
  the number beside it — thread the derived quantity in as a prop rather than
  recomputing it a second way.
- **Grabbable.** Something in the scene is the load: a platen to push, a nut to
  tighten, a lever to swing, a flange to pull. Drag empty space to orbit. Say
  which is which in the caption under the canvas.
- **Live readouts.** While dragging, the readouts follow the live value and the
  HUD line names it; on release it springs back to the design value.
- **Honest exaggeration.** Real elastic deformation is invisible. Magnify it,
  and **print the factor** next to the geometry ("twist shown ×102").
- **Coloured by how close it is to failing**, through `stressColor.ts`, with the
  radial or through-thickness gradient shown where it teaches something.
- **Fit the camera to the model**, accounting for the canvas aspect and
  perspective on the nearest point — the canvas is a wide strip on desktop and
  nearly square on a phone.
- **Feel**, where it suits: a rising tone with load, a crack at yield, a short
  `navigator.vibrate`. Always wrapped in try/catch and silent when unavailable.
- Dispose geometries, materials and the renderer on unmount, and remove every
  listener.

## Getting the physics visible

The 3D view earns its place by showing something the numbers cannot:

- Put the feature that governs **in** the geometry — cut the keyseat, draw the
  fillet, model the pressure cone — and pin the hot spot to it.
- If a parameter is the design (a fillet radius, a gap, a bore), make it an
  **input that changes both the number and the model**, not a fixed table value.
  A handbook figure quoted at one condition should become a function of the
  condition, with the anchor documented and the extrapolation range stated.
- Watch the sign conventions. If the model's angle parameterisation runs
  opposite to the rotation you apply, a decoration (a scribe line, an arrow)
  will silently lean the wrong way while everything else looks right. Check it
  by loading the model and confirming every moving thing agrees.

## Wiring in

1. `ROUTES` in `src/App.tsx` — `"/<name>-calculator": { title: "<Name> — MechCalc", el: <NameCalc /> }`.
2. A card in `src/pages/Home.tsx`: **Refined** (full anatomy, validated),
   **In progress** (works, still being refined — amber, still clickable), or
   **Planned** (no route). New ones land in *In progress* and are promoted.
   Remove the roadmap entry when a planned one ships.
3. `README.md` — a row in the calculator table and a **model note** saying what
   the model does and, plainly, what it does not.

## Scope notes are part of the product

Every calculator says what it does not cover, in the theory tab and in the
report footer. Static only? No fatigue? Idealised end conditions? Reference
values rather than certified allowables? Say so in the same voice as the rest —
plainly, without hedging, and where the person reading the number will see it.

## Verify before you call it done

- `npm test` — the math module against textbook identities, including the
  degenerate inputs (zero load, zero radius, a bore that swallows the shaft).
- `npm run build` — this is where `tsc -b` runs.
- **Drive it in a real browser.** Playwright and Chromium are already installed
  (`/opt/pw-browsers/chromium`; never run `playwright install`). Load the page,
  screenshot the 3D view, drag the handle, switch every option that changes
  geometry, check the phone width, and read the console for errors. Rendering
  bugs do not show up in tests — the keyseat that was in the geometry but
  invisible, the line that leaned the wrong way, and the camera that framed the
  model at a third of its size were all found this way and none of them would
  have failed a test.
- Print the report (emulate print media) and look at it. Dark-on-dark text is
  the classic failure.

## Then publish the preview

Finish with the `preview` skill and hand over the link, deep-linked to the
calculator you built. That is the delivery; screenshots are only evidence.

## Leave this skill smarter than you found it

The final step of every build or refinement, before the last commit: re-read
this file and fold in what the session actually taught you. This is how the
skill evolves — each calculator built makes the next one easier, because the
experience accumulates here instead of evaporating when the session ends.

What counts as a lesson:

- A bug you hit that a sentence here would have prevented — a rendering
  gotcha, a sign convention, a print-stylesheet trap. (The `preserveDrawingBuffer`
  snapshot, the "never re-skin the UI for print" rule, and the leaning scribe
  line above all entered this file exactly this way.)
- A detour: something this file told you to do that turned out wrong, stale,
  or already handled by shared code. Fix it or delete it — a skill that says
  things the codebase now does automatically is training people to skim.
- A pattern you extracted into shared code (`scene3d.ts`, `stressColor.ts`,
  a CSS class): update this file to point at the shared piece instead of
  describing the hand-rolled version.

Rules, so the file gets sharper rather than longer:

- **Verified this session only.** An actual bug hit, an actual detour taken.
  No speculative advice, nothing imported from general knowledge.
- **Edit in place**, in the section where the next builder needs the warning —
  never a "misc lessons" appendix at the bottom.
- One or two sentences per lesson, in this file's voice: what breaks, and the
  concrete rule that avoids it.
- A clean build that taught nothing writes nothing. Don't invent an edit.
- Say what was learned in the commit message — git history is this skill's
  changelog.
