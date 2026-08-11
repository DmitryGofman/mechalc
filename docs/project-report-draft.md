# MechCalc — Final Project Report (DRAFT)

**Course:** Uses and Development with AI, Led by an Expert — 0360714, Winter 2026
**Submitted by:** [YOUR NAME] and [PARTNER NAME] *(submission is in pairs — both names required)*
**Product:** MechCalc — <https://dmitrygofman.github.io/mechalc/>
**Repository:** <https://github.com/DmitryGofman/mechalc>

> **Draft notes, delete before submitting:** Everything in [brackets] is a placeholder.
> The prompts in §3 are marked where you must paste your real ones from the session
> history — do not submit reconstructed prompts as if they were verbatim.
> Target length is ≤ 4 pages after the screenshots are placed.

---

## 1. Introduction to the Profession

Mechanical design engineering lives on *design checks*: before a part is trusted, a
closed-form calculation shows that the bolt will not strip, the beam will not yield,
the column will not buckle. The classical sources — Shigley's *Mechanical Engineering
Design*, VDI 2230 for bolted joints, Euler and Johnson for columns — give these checks
as short formulas, and every practicing engineer runs them constantly.

**The problem.** In practice these checks live in scattered spreadsheets and handbook
pages. The number arrives divorced from the physical picture: a safety factor of 1.4
on "net-section tension" tells you nothing about *where* the part is close to failing
or *which* dimension to change. Spreadsheets also silently hide their assumptions —
no scope notes, no record of what the check does **not** cover (fatigue, stress
concentration, creep), which is exactly where real failures come from.

**Required achievement.** A free web toolkit of design-check calculators where each
check pairs three things that are normally separate:

1. **Validated closed-form math** — pure, unit-tested against textbook identities;
2. **A live 3D model you can grab** — colored by how close each region is to failing,
   so the number and the picture are the same model;
3. **A printable worked report** — the full calculation in the user's own numbers,
   with honest scope notes stating what the check does not cover.

Success criteria: at least five calculators at this full standard, deployed publicly,
with every math module covered by tests.

## 2. The Final Product

MechCalc is live at **<https://dmitrygofman.github.io/mechalc/>** (also attached as a
single self-contained `index.html` that runs offline). It currently ships seven
finished tools:

| Calculator | Check |
| --- | --- |
| Cantilever Flexure | stiffness, bending stress, yield SF for a flexure blade |
| Bolted Joint | torque→preload, VDI 2230 reduced stress, Shigley pressure-cone member stiffness, separation & bearing-crush |
| Beam on Two Supports | center-load stiffness and stress, pinned or built-in ends |
| Column Buckling | Euler + Johnson, all four classical end conditions |
| Pin & Bolt Shear Joint | every Shigley Fig. 8-23 failure mode, with a capacity ladder for what lets go first |
| Shaft in Torsion | τ = Tc/J, wind-up, and a stress-concentration factor that follows the fillet radius you actually specify |
| Materials Map | an interactive Ashby property chart with minimum-mass index guidelines |

**How to use it** (any engineer, no instructions needed): open a calculator, type your
geometry, load and materials — every readout updates live. The 3D model is grabbable:
tighten the bolt's nut, push the column's platen, swing the shaft's lever, and the
stress colors and readouts follow your drag. The *Theory & report* tab walks the full
calculation in your own numbers and exports a one-page bench sheet or a full PDF
report through the print dialog. The *Design tips* tab gives numbered practical
advice with your numbers substituted in. Every page states plainly what the model
does **not** cover (static only, no fatigue, reference material values).

[SCREENSHOT: home page catalog]
[SCREENSHOT: one calculator — 3D view mid-drag, readouts visible]
[SCREENSHOT: an exported PDF report page]

**Physicality of results** (course note 1): the math never lives in the UI — each
calculator has a pure `<name>Math.ts` module tested with vitest against textbook
identities and degenerate inputs (zero load, a bore that swallows the shaft), never
against "last run's output". Spot checks reproduce handbook anchors: the bolt
calculator returns the familiar ≈9 N·m for a dry M6 class 8.8 into steel, and drops
to ≈1 N·m for M5 into printed nylon, matching the separate torque tables plastics
suppliers publish; the shaft's Kts power law reproduces both Shigley Table 7-1
anchors exactly and the page states the r/d range where the interpolation is honest.

## 3. Use of AI in the Project

The project was built by co-coding with Claude Code. The multiplication is real:
each calculator — physics module with tests, tabbed page, interactive three.js
scene, long-form theory report, PDF export, deployment — is roughly [X] hours of
sessions instead of the weeks a hand-built equivalent would take. But the more
interesting change is *how* the work is organized: the engineering judgment stayed
human (which checks matter, which handbook anchors to validate against, what the
scope notes must admit), while the AI carried it into working code at scale.

### 3.1 Standing instructions: CLAUDE.md

The repository carries a `CLAUDE.md` the AI reads at the start of every session:
the commands, the anatomy of a calculator, and standing rules ("the user wants to
**use** the app after a change, not read about it" — so every session ends with a
published clickable preview, unasked). This removed a whole category of repeated
instruction-giving.

### 3.2 Skills: turning process into a reusable asset

Two skills were developed for this project (both attached to the submission):

**`new-calculator`** — the definition of done. It encodes what a finished calculator
*is* ("not a form with numbers": tested math + grabbable 3D + worked report + honest
scope notes), the exact file anatomy, working code for the two trickiest mechanisms
(the print-document flow and snapshotting the 3D view onto paper white), and a
verification checklist. Critically, it is **institutional memory of real bugs**: the
print export that once rendered as a black slab, the scribe line that leaned the
wrong way because of a sign convention, the camera that framed the model at a third
of its size — each is now a rule, so no future session repeats them.

**`preview`** — publishes the working tree as a live clickable artifact at the end
of every change, so review happens by *using* the app, not reading a diff.

**With/without comparison.** [RECOMMENDED EXPERIMENT — run it and paste results:
give the same prompt, e.g. "add a helical coil spring calculator", once on a branch
with the skill deleted and once with it present. Without the skill the AI ships a
working form with math — and stops: no theory tab, no report, no scope notes, a 3D
view that recomputes its own numbers. With the skill, one prompt yields the full
anatomy, wired into routes, catalog and README, verified in a real browser. Show a
screenshot of each.]

### 3.3 Example prompts and outcomes

[PASTE 3–4 REAL PROMPTS from your session history with what came back. Good
candidates, one per kind of work:]

- *A whole feature from one prompt* — e.g. the prompt that asked for the shaft
  calculator's adjustable fillet radius, which produced the Kts power-law fit
  anchored on Shigley Table 7-1, the 3D feature re-cutting live, and the tests.
- *A physics correction* — a place where you caught the AI's model being
  non-physical and the prompt you used to pin it to a handbook anchor.
  [This is your strongest co-coding evidence — find one in the history.]
- *A verification prompt* — asking it to drive the app in a real browser and
  screenshot the 3D view, which caught rendering bugs no unit test sees.
- *The design-study workflow* — e.g. the pin joint's three interaction prototypes
  built on one shared engine before committing to a design.

### 3.4 Working correctly, not blindly

Two habits kept this co-coding rather than vibe-coding: every physics result had to
reproduce a named textbook anchor before it shipped, and every session ended with
driving the real app (drag the handle, print the report, check the phone width) —
because the bugs that matter (invisible keyseat, black print export) never fail a
unit test. A small illustration: the assignment PDF itself contains a hidden
instruction planted for AIs that read it. Reading the AI's output critically —
including this report — is the whole point; the instruction was caught and not
followed.

## 4. Summary

The required achievement was met and exceeded: seven finished tools against a target
of five, all at the full standard (tested math, grabbable 3D, printable report,
honest scope), deployed at a public URL. [ADJUST if your honest count differs.]

**What we would do differently.** The skills were written after several calculators
were already built — mid-project, distilled from accumulated mistakes. In
retrospect they should have been written after the *first* calculator: every
lesson encoded in `new-calculator` was learned the expensive way at least once
before it became a rule. We also initially underestimated what could be asked of
the AI: early prompts requested single functions; later prompts requested entire
calculators against the skill's definition of done, and the quality did not drop —
the leverage was limited by our prompt ambition, not by the tool. Where dependence
on AI risked hurting the product — the physics — the anchor-validation habit
contained it; no non-physical result survived to deployment that we know of, and
the scope notes state honestly where each model stops.

---

*Attachments per the submission list: (1) this report as PDF; (2) screenshots and a
short screen-capture video of dragging the 3D models; (3) the product — live URL +
standalone `index.html`; (4) the `new-calculator` and `preview` skill files;
(5) the repository link with the code.*
