# MechCalc design language

Read this before writing any UI — prototype HTML or React. The goal is that a
new page is indistinguishable in feel from the existing ones. When in doubt,
open the newest **Refined** calculator (see the tiers in `src/pages/Home.tsx`)
and copy what it does; as of this writing the most mature exemplars are
`src/calculators/BoltCalc.tsx` (full React idiom, units toggle, theory tabs)
and `src/calculators/ClampCalc.tsx` (tabs, recommendation card, PDF report).

## Identity in one paragraph

A dark instrument panel, not a website. Monospace micro-labels in uppercase
with wide letter-spacing; tabular-nums readouts; hairline borders; almost no
border-radius (2–3px); no shadows, no gradients, no decorative color. Color is
reserved for *meaning*: blue = interactive/accent, green = safe, amber =
marginal, red = failing. The one luminous thing on the page is the simulation.

## Tokens

The prototypes declare these as CSS custom properties (see
`public/designs/cylinderclamp/design-a-panel.html`); React pages inline the
same hex values:

| Token | Hex | Role |
| --- | --- | --- |
| `--bg` | `#080c10` | page background |
| `--panel` | `#0b1015` | card/panel background |
| input bg | `#0e1419` | form controls |
| `--line` | `#1f2a33` | primary hairline border |
| `--line2` | `#141c22` | secondary/faint hairline |
| `--ink` | `#e8edf1` | primary text |
| `--dim` | `#8b97a3` | body/secondary text |
| `--mid` | `#6b7884` | labels |
| `--faint` | `#46515c` | units, hints, disabled |
| `--blue` | `#3a78c2` | accent, focus rings, links, kickers |
| `--green` | `#4fb477` | safe / ready |
| `--amber` | `#d9a441` (chips: `#cf9f52`) | marginal / in-progress |
| `--red` | `#d65c5c` | failing |

Fonts: `--mono` = `'JetBrains Mono', 'SF Mono', Menlo, monospace` (React app
loads JetBrains Mono; prototypes fall back to system monospace), `--sans` =
`'Inter', system-ui, sans-serif`. Mono carries labels, numbers, equations,
kickers; sans carries sentences (descriptions, theory prose, tips).

## Recurring components

- **Kicker**: mono 10px, letter-spacing 0.2–0.25em, uppercase, blue — above
  the h1. Page titles ~22–30px, weight 600, tight letter-spacing (−0.01em).
- **Field**: label row = mono 10px uppercase `--mid` with the unit in
  brackets in `--faint`; input = `#0e1419` bg, `--line` border, radius 2,
  mono 13.5–15px, focus → border turns blue. Use `src/ui.tsx` in React.
- **Readout**: label left / value right, baseline-aligned, hairline
  underneath, `font-variant-numeric: tabular-nums`, unit small in `--faint`.
  Accent the value green/amber/red only when it carries a verdict.
- **Safety-factor card**: big number (~36px mono), colored border + badge
  (OK / MARGINAL / FAILS style), one-line subtext explaining what governs.
- **Warnings**: 2px left border in severity color, small text, tinted copy
  (`.warn/.bad` patterns in the prototypes, `.clamp-warn` in styles.css).
  They appear only when true, and they escalate — never a wall of static
  disclaimers.
- **Tab bar**: mono 10px uppercase buttons, active = blue text + blue
  underline (`.tabbar`/`.tabbtn` in `src/styles.css`).
- **Recommendation card**: green border panel stating the derived answer
  ("use T = …"), with the governing limit named.

## Color as physics: the stress ramps

The 3D/2D scenes are colored by *proximity to failure*, not by raw stress.
Shared ramps live in `src/calculators/stressColor.ts` — use them (or replicate
their stops in prototype JS):

- Neutral is calm green. **Tension warms**: green → amber → red at yield.
- **Compression cools**: green → teal → blue.
- When compression itself is the failure (bearing, crush), use the
  severity ramp: green → teal → blue while healthy, breaking to amber and
  red as the material approaches its own permissible pressure — so "working
  hard" and "being crushed" never look alike.

Sign convention everywhere: + tension warm, − compression cool.

## Layout

- Content column max-width ~760–860px, centered, generous vertical rhythm.
- Two-column input grids that collapse on phones; the simulation gets a full-
  width stage (~300–340px tall, less on phones).
- **Phone-first is non-negotiable** — these get used at the bench. Headers
  compact on small widths, unit toggles pin to the top right, number+unit
  never wraps apart (see the `@media` blocks in `src/styles.css` and the
  responsive commits in `git log`). Test at ~390px width before calling
  anything done.
- Every page ends with a scope-honesty footer line in `--faint` mono.

## Home catalog

`src/pages/Home.tsx` has three tiers — **Refined** (green READY chip),
**In progress** (amber chip, clickable), **Planned** (muted, not clickable).
Cards carry: tag (uppercase category), title, 2–3 line description that names
the interactive hook ("tighten the 3D nut and watch…"), and a signature
equation in mono. Prototype-phase calculators sit in In progress with an
`href` to the picker page and a badge override; promoted ones get `route`.
The card description is marketing-honest: it promises exactly what the tool
does, including its interaction.

## Voice

Labels are terse and technical; prose is first-person-plural engineer talk —
plain, concrete, a little dry, allergic to hype. Numbers get units. Scope
notes admit model limits with direction and magnitude ("biased ~−20% on one
surface"). Comments in code explain *why* (see any math module header).
