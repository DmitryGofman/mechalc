---
name: new-calculator
description: End-to-end workflow for adding a new mechanical-engineering calculator to the MechCalc toolkit — from an application/case study the user brings (statics, dynamics, machine design, later heat transfer & fluids) to a shipped, tested calculator page. Use this skill whenever the user asks to add, prototype, design, or build a new calculator, mentions a new design problem they want turned into a tool ("I'm designing a shaft coupling, let's make a calculator for it"), asks to promote/integrate a design prototype into the app, or wants to continue a calculator that exists only as prototypes. Also use it when picking up one of the "Planned" cards from the Home page roadmap.
---

# New Calculator — from case study to shipped tool

MechCalc grows one calculator at a time, each born from a real design problem
the user faced at work. Every calculator shares one identity: a closed-form
design check where the numbers are paired with a **live, grabbable 3D (or rich
2D) simulation** colored by how close the part is to failing, a **theory tab
that works the derivation with the user's current numbers substituted in**, a
**design-tips section** with practitioner advice for that application, and a
**PDF report export**. The toolkit's feel is molded by each addition — new
calculators must feel like siblings of the existing ones, not guests.

The workflow has two halves separated by a **user checkpoint**:

1. **Prototype** — understand the physics, build one shared plain-JS engine,
   then 3–4 standalone HTML design prototypes exploring genuinely different
   interaction concepts, wired to a picker page under `public/designs/<slug>/`.
2. **Promote** — after the user tries the prototypes and picks a winner
   (usually with grafts from the others), integrate it into the React app:
   tested math module, three.js scene, units toggle, theory tabs, report
   export, route, Home card, README row.

If the user is resuming mid-pipeline ("integrate the snap-fit prototype"),
skip to the matching phase — check `public/designs/` and `src/App.tsx` to see
where a calculator currently stands.

Reference guides in this skill (read the one for the phase you are in):

- `references/design-language.md` — the visual identity: tokens, typography,
  color semantics, stress ramps, layout shells, Home catalog tiers. Read
  before writing ANY UI, prototype or React.
- `references/prototype-guide.md` — phase 1: engine + variant archetypes +
  picker page + wiring into Home.
- `references/promotion-guide.md` — phase 2: math module & test conventions,
  component anatomy, 3D interaction feel, theory/typeset, report export,
  routing, and the definition-of-done checklist.

The codebase itself is the living style guide. The exemplars named in the
reference guides (BoltCalc, ClampCalc, the cylinderclamp prototypes…) outrank
anything written here — when this document and the code disagree, follow the
newest refined calculator and update this skill.

## Phase 0 — Intake (short, structured)

The user typically arrives with one or two sentences: "I'm designing X at
work." Before building anything, run **one** `AskUserQuestion` round — at most
4 questions, each with concrete proposed defaults so the user mostly confirms.
Do the physics homework FIRST so the questions are informed, specific, and
show you already understand the problem. Good questions to pick from (choose
the 3–4 that genuinely matter for this calculator; skip any you can answer
yourself from classical references):

- **Scope of the model** — which idealization? (e.g. "thin-wall or thick-wall
  Lamé? include keyway stress concentration?") Propose the classical
  first-order model plus the one or two refinements that change real
  decisions, the way the bolt calculator added the Shigley pressure-cone
  members and the clamp added creep derating.
- **Failure modes / checks** — which safety factors should headline? Propose
  the standard set from the governing reference (Shigley, Roark, VDI, Blodgett…)
  and let the user add the one their application worries about.
- **Inputs & outputs** — what does the user actually type in at work, and what
  number do they need out (a torque? a wall thickness? a life)? This decides
  which variable the interactive simulation should let you *grab*.
- **Manufacturing / material context** — machined metal, printed polymer,
  sheet, welded? This drives the material table, the design-tips content, and
  whether derates (creep, knockdowns) belong in the model, as they did for
  printed clamps.

Also settle the **slug** (`shaftTorsion`, `pressFit`…), the **display title**,
and the **catalog tag** (existing tags: Compliant mechanisms, Fasteners,
Structures, Drivetrain, Springs, Joints, Pressure, Bearings — reuse before
inventing). If the calculator is on the Home "Planned" list, start from that
card's promise.

## Phase 1 — Physics, then prototypes

**Physics first, UI second.** Write the model as a dependency chain the way
`clamp-engine.js` documents its chain in the header comment: input → each
intermediate → each check. Every formula needs a source (name the reference
and the form of the equation) and a validity range you can state honestly.
Cross-check the numbers against at least one published worked example or
handbook table value BEFORE any prototype exists — a beautiful prototype of
wrong physics poisons the whole comparison round. Keep every internal
calculation metric (mm, N, MPa, N·m — SI where the physics wants it);
prototypes may be metric-only, the units toggle arrives at promotion.

Then build, under `public/designs/<slug>/`:

- `<slug>-engine.js` — ONE shared physics engine used by every variant, so
  variants differ in interaction concept, never in arithmetic.
- `design-a-….html` … `design-d-….html` — 3–4 self-contained prototypes
  (inline CSS/JS, no build step), each a genuinely different concept of how
  the user meets the numbers. Pick archetypes from the menu in
  `references/prototype-guide.md` (control panel, drag-the-wrench, advisor,
  cross-section, free-body-diagram, 3D assembly…) and invent new ones when
  the mechanism suggests it.
- `index.html` — the picker page linking the variants with one-line pitches.
- A Home card in the **In progress** tier pointing at the picker (`href`,
  badge override `PROTOTYPES`), so the deployed site shows the work.

Commit style: `<Calculator name>: <what changed>` (see `git log` — e.g.
"Cylinder clamp: 4 design prototypes + shared physics engine").

### Checkpoint — the user picks

Stop and hand over. Tell the user what each variant explores and where to try
them (`npm run dev` → `/mechalc/designs/<slug>/`, or the deployed Pages URL
after merge). Ask them to pick a winner and name any features to graft from
the losers. Do not start promotion until they have chosen — the choice is
the whole point of building variants.

## Phase 2 — Promote the winner

Follow `references/promotion-guide.md` closely; in outline:

1. **Math module** `src/calculators/<slug>Math.ts` — pure, typed, documented
   port of the engine (input type → result type, no DOM, no React) plus
   `<slug>Math.test.ts`: handbook cross-checks with cited numbers, invariant
   sweeps, edge/degenerate cases. This is where the physics becomes trusted.
2. **Component** `src/calculators/<Slug>Calc.tsx` — the winning design
   rebuilt in the toolkit's React + three.js idiom: grabbable scene, stress
   coloring via `stressColor.ts`, haptic/audio feedback where it fits,
   shared `Field`/`Select`/`Readout` controls, tab bar
   (Model · Theory · Design tips · more as earned).
3. **Units toggle** via `units.ts` — display-layer only; internals stay metric.
4. **Theory with live numbers** via `typeset.ts` (`eqn`/`V`/`FR`) — the
   derivation re-worked with the current inputs substituted, every line
   checkable against the readouts. NOT a static formula sheet. The
   math renders in textbook style (built-up fractions, italic symbols) with
   numbers and units inside — this is the toolkit's "LaTeX look" without any
   library.
5. **Design tips** — practitioner guidance for the application (the material
   the user works in, assembly order, re-torque, test-coupon advice…), in the
   spirit of the clamp and bolt tips tabs.
6. **Report export** — one-page bench sheet + full PDF via the print-stylesheet
   pattern from `ClampCalc.tsx` (offscreen re-render of the scene at print
   density on paper white).
7. **Wire up** — route in `App.tsx`, Home card (In progress tier until the
   user promotes it to Refined), README table row + model notes, retire the
   prototype card in favor of the route.
8. **Verify** — `npm test`, `npm run typecheck`, `npm run build`, and walk the
   definition-of-done checklist at the end of the promotion guide (including
   the phone-width pass).

Ship it as: working calculator on its own route, all checks green, README
honest about scope ("design-check tools, not a substitute for full analysis").

## Judgment calls that keep the toolkit coherent

- **Honest numbers over impressive numbers.** Where the model is biased, say
  so on the theory tab with magnitude and direction, the way the clamp
  explains its straight-beam bias. Warnings escalate green → amber → red on
  real thresholds, and an empty load box reports *capacity* instead of a
  fake safety factor.
- **Recommend, don't just check.** The best calculators answer the question
  the user actually has ("how tight?", "how many bolts?", "what wall?") and
  derive the recommendation from ALL the limiting parts at once, like the
  clamp's recommended torque. Design for that from the intake answers.
- **The simulation is the hook.** The grabbable degree of freedom should be
  the physical act the user performs in the shop (tighten the nut, push the
  column, pull the snap arm). If you can't name that act, revisit the design.
- **Scope honesty.** Reference-quality typical values, "verify before
  production use", stated validity limits. Never present the tool as more
  than a fast closed-form design check.
- **Phone-compatible or not done.** Every deliverable in both phases —
  prototypes and promoted calculators alike — must work one-handed on a
  ~390px phone: touch-draggable simulation that doesn't scroll the page, no
  horizontal overflow, compact header. The "Mobile compatibility" section of
  `references/design-language.md` lists the exact mechanics; the phone pass
  is a checklist item, not a nice-to-have.
