# MechCalc — Engineering Calculators

A toolkit of fast closed-form design-check calculators for mechanical engineers.
The home page lists every calculator; each one lives at its own URL and pairs the
numbers with a live 3D model you can grab, colored by how close the part is to
yielding.

## Calculators

| Route | Calculator | Status |
| --- | --- | --- |
| `/flexure-calculator` | **Cantilever Flexure** — stiffness, force, peak bending stress and yield safety factor for a rectangular flexure blade; bend the 3D beam interactively | ready |
| `/bolt-calculator` | **Bolted Joint — Screw Strength** — torque → preload, VDI 2230-style reduced (von Mises) stress, plus the full clamped-sandwich model: per-plate materials, Shigley pressure-cone member stiffness, load sharing, separation and bearing-crush checks; tighten the 3D nut and watch the pressure cone shade with the load it carries | ready |
| `/beam-calculator` | **Beam on Two Supports** — center-load stiffness, force and peak stress for a span held at both ends, pinned (48EI/L³) or built-in (192EI/L³); press the middle of the 3D beam and the stress colors trace the bending-moment diagram | ready |
| `/buckling-calculator` | **Column Buckling** — Euler critical load for all four classical end conditions (K = 0.5 / 0.7 / 1.0 / 2.0) with the Johnson parabola for short columns; push the 3D column's load platen and watch the initial imperfection amplify by 1/(1−P/Pcr) into the mode shape | ready |
| `/pin-calculator` | **Pin & Bolt Shear Joint — Clevis & Lap** — a pin or bolt in single or double shear through two or three flanges, each plate its own material. Every Shigley Fig 8-23 failure mode: pin shear and clevis pin bending, bearing on pin and members, net-section tension, edge tear-out — solid or hollow pin, metal or printed. Orbit the 3D clevis and pull the loaded flange until something gives; every zone is painted by the check that owns it, with a capacity ladder for what lets go first | ready |
| `designs/pinjoint/` | Design study behind the pin calculator — the three interaction prototypes (control panel with section views, pull-to-failure ladder, 3D joint) on one shared engine | design study |
| `/shaft-calculator` | **Shaft in Torsion** — shear stress, wind-up angle, torsional stiffness and power rating for solid & hollow circular shafts. The keyseat, shoulder fillet or circlip groove that decides where a shaft really breaks is an input, and so is its radius: drag it and Kts moves while the 3D view re-cuts the feature. Push the lever to wind the shaft up and watch the scribe line shear into a helix. Theory, design tips and a one-page or full PDF report | ready |
| `designs/cylinderclamp/` | **Cylinder Clamp — Split Collar** — a two-piece clamp on a rod or tube: recommended torque from the bolt, the body material and the geometry at once, with crown & ear bending, head bearing, tube crush/ovalization, flange-gap closure and creep-derated grip. Drag a bolt head to tighten the 3D assembly, painted by signed bending stress. Theory, design tips, and one-page or full PDF export | ready |
| — | Helical Coil Spring · Press/Interference Fit · Thin-Wall Pressure Vessel · Bearing Life (L10) | planned |

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
  brand.tsx                 logo mark (eight candidates; ACTIVE_DESIGN picks one)
  router.tsx                minimal history router (hash fallback for file://)
  ui.tsx                    shared Field / Select / Readout controls
  styles.css                global reset + fonts + shared layout
  pages/
    Home.tsx                calculator catalog (ready + planned cards)
  calculators/
    FlexureCalc.tsx         cantilever flexure calculator + 3D beam
    BoltCalc.tsx            bolted-joint calculator + 3D screw/nut
    boltMath.ts             pure bolted-joint math (tested)
    SimpleBeamCalc.tsx      beam-on-two-supports calculator + 3D beam
    simpleBeamMath.ts       pure two-support beam math (tested)
    ColumnCalc.tsx          column-buckling calculator + 3D column
    columnMath.ts           pure buckling math: Euler/Johnson, modes (tested)
    PinCalc.tsx             pin/bolt shear-joint calculator + 3D clevis
    pinMath.ts              pure shear-joint math: every Fig 8-23 mode (tested)
    pinScene.ts             pin-joint geometry for the 3D viewer
    scene3d.ts              shared canvas painter for every 3D view
    ShaftCalc.tsx           shaft-torsion calculator + 3D shaft, lever and scribe line
    shaftMath.ts            pure torsion math: J, τ, twist, Kts(r/d), power (tested)
    shaftTheory.ts          worked report + design tips for the shaft page
    materials.ts            shared beam/flexure material library
    stressColor.ts          shared stress → color ramps for the 3D viewers
```

## Branding
The logo is **Moment Field** (`beamfield`): the cantilever from the flexure
calculator, painted by *signed* bending stress on the app's own scale
(`stressColor.ts`) — tension red above the neutral axis, compression blue
below, both relaxing to neutral green toward the free end where the moment
goes to zero — emerging from a hatched fixed wall, with the neutral axis as a
dash-dot centerline.

Every candidate from the study that chose it lives in `public/brand/<design>/`:
four directions (`blueprint`, `beam`, `hexm`, `gauge`) plus four
tension/compression treatments of the beam (`beamsplit`, `beamramp`,
`beamfringe`, `beamfield`), the latter generated by
`scripts/gen-beam-variants.mjs`. All eight are previewed in context —
home-screen, tab and header mockups — at `public/designs/brand/index.html`.

The active design is named by `ACTIVE_DESIGN` in `src/brand.tsx`; it draws the
header mark, and `node scripts/render-icons.mjs` re-rasterizes every PNG and
copies the active set to `public/` as `favicon.svg`, `apple-touch-icon.png`
(the iPhone home-screen icon) and the manifest icons.

## Model notes
**Flexure** — linear small-deflection (Euler-Bernoulli) theory for an end-loaded
rectangular cantilever: `k = 3EI/L³`, `σ = 3Etδ/2L²`. Aim for a safety factor ≥ 2
for cyclic / living-hinge duty.

The bolt calculator's **recommended torque depends on the clamped materials**, not
just the bolt: the target preload is `min(0.65·Sp·As, 0.9·pG·Abear)`, so steel and
aluminum stacks reproduce the familiar handbook figures (≈9 N·m for M6 class 8.8,
dry) while nylon or FR-4 stacks drop to the much lower values their bearing limits
allow (≈1 N·m for M5 into PA12) — matching the separate torque tables plastics and
PCB suppliers publish.

**Bolted joint** — nut-factor model `F = T/(K·d)` on the tensile stress area, with
the ~50% thread-torque split for tightening torsion and the VDI 2230-style reduced
stress `σred = √(σ² + 3τ²)` against proof (torsion relaxes after the wrench lets
go, so the working state is checked on tension vs yield). The clamped members are
modeled per Shigley's 30° pressure-cone frusta — each plate with its own material
and thickness — giving joint stiffness ratio `C = kb/(kb+km)`, external-load
sharing `Fb = Fi + C·P`, separation load, interface pressure, and bearing-pressure
(crushing) checks against per-material permissible pressures pG. Target 60–75% of
proof preload; K scatters ±25% between real joints.

The 3D view shades the **load distribution inside the clamped materials** onto
the pressure cone itself: local pressure `p(z) = F / [π(R(z)² − rh²)]`
with `R(z) = dw/2 + min(z, L−z)·tan30°`, so it peaks at the two bearing faces and
is diluted at mid-grip. Hue is that pressure against the pG of whichever
plate the depth falls in (a mixed stack shows one half hot, the other cool under
the same force); brightness tracks pressure relative to its peak, so the
concentration at the bearing faces stays legible far from the limit.

**Pin/bolt shear joint** — every failure mode of Shigley Fig. 8-23 checked at
once: pin shear across 1 or 2 planes vs `Ssy = 0.577·Sy`, clevis pin bending
`σ = M/Z` with `M = F/2·(t₂/4 + gap + t₁/2)`, bearing over the projected area
`t·d` on both the hole wall and the pin, net-section tension across `(w−d)·t`
(Eq. 8-54) and edge tear-out on the two ligaments `2·t·(a−d/2)` (Fig. 8-25).
Every check is linear in load, so the solver works in stress-per-newton and
gets both the stress at F and each mode's capacity from one number — which is
why the ladder is exact and capacity still means something at zero load. The
pin can be solid or hollow (`Z = π(d⁴−dᵢ⁴)/32d`), metal or printed. Permissible
bearing is derived as `1.5·Sy` for ductile metals — bearing on a projected area
yields later than simple tension because the material is confined — while
polymers and laminate carry explicit creep-limited figures. Scope: static yield
onset, no stress concentration (Kt ≈ 2–3 at the hole governs fatigue and
brittle plates) and no preload friction, i.e. the slipped bearing state.

**Shaft in torsion** — classical circular-shaft theory: `τ = Tc/J`, `θ = TL/GJ`
with `G = E/2(1+ν)`, checked against the distortion-energy shear yield
`τallow = 0.577·σy`. The number that actually governs is the local one: the
machined feature multiplies the surface stress by Kts, and **Kts follows the
radius you actually specify**, not a fixed table entry. A concentration factor
is a property of how sharp a feature is, so a handbook value means nothing
without an r/d — Shigley Table 7-1 gives a shoulder fillet in torsion at two of
them (2.2 at r/d 0.02, 1.5 at r/d 0.1), and two points fix a power law,
`Kts = Kref·(r/d ÷ ref)^−0.238`. It reproduces both anchors exactly; applied to
the keyseat and groove it is an interpolation anchored on their handbook figure
at the standard radius, borrowing the fillet's curve shape on the grounds that
all of them are a notch in torsion. Honest between r/d 0.01 and 0.3, and the
page says so outside that. Drag the radius and the 3D view re-cuts the feature
while the safety factor moves with it. Wind-up is checked against the workshop
rule of thumb of 1° per 20 diameters, which long slender shafts fail long before
they approach shear yield. Static torque only — no bending, no combined stress,
no fatigue; a rotating shaft carrying a steady bending load needs the fatigue
notch factor Kf instead.

The shaft's twist is real but invisible — a steel shaft turns through a couple
of degrees at yield — so the 3D view magnifies it by a factor chosen to put
first yield at a 60° turn, and prints that factor beside the geometry. Materials
that already twist that far, like the elastomers, are shown honestly at ×1.

Material and fastener values are typical reference figures — verify before
production use.
