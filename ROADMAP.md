# MechCalc — evolution roadmap

This file is the persistent memory of the `evolve` skill. Each evolution cycle
reads it to decide what to do, and writes back what it did and what it learned
before it ends. Edit the **Goal** and the backlog freely — the loop follows
this file, not the other way around.

## Goal

Grow MechCalc into a complete bench-reference of closed-form mechanical
design checks — every common machine element a working engineer sizes by hand,
each one built to the full standard in the `new-calculator` skill: tested math,
a grabbable 3D model, a worked printable report, and honest scope notes.

Quality over count. A cycle that cannot meet the bar ships nothing and records
why, rather than shipping a form with numbers.

## Selection policy

One cycle does **one** of these, in priority order — never two at once:

1. **Finish before starting.** If anything sits in *In progress* on the home
   page, promote one calculator to *Refined*: close every gap against the
   promotion bar below.
2. **Build the next Planned calculator** (top of the Planned list on the home
   page), end to end, landing in *In progress*.
3. **Grow the roadmap.** When the Planned list is shorter than three, graduate
   the best idea from the backlog below into a Planned card on the home page
   (with tag, one-line description and governing equation, in the same voice).
4. **Stop honestly.** When the queue and backlog are empty and no new idea
   meets the candidate bar, the loop reports that the goal is reached instead
   of inventing filler. That is a success state, not a failure.

If a cycle discovers mid-way that its pick is too big for one session, it
finishes a coherent, shippable slice (math + tests first, always), commits,
and leaves a journal note telling the next cycle exactly where to resume.

## Promotion bar (In progress → Refined)

Everything in the `new-calculator` skill's anatomy, plus:

- Math tested against textbook identities, including degenerate inputs.
- Theory tab + both PDF exports render correctly (check in print emulation).
- Driven in a real browser: 3D drag works, readouts follow live, phone width
  holds up, console clean.
- Scope notes present in the theory tab **and** the report footer.
- README row and model note updated; card promoted on the home page.

## Candidate bar (what makes a good new calculator)

- Closed-form and textbook-anchored (Shigley, Roark, VDI…) — cite the source.
- A natural grabbable 3D model where the picture and the number are the same
  model — if there is nothing to grab, it is probably a table, not a MechCalc
  calculator.
- An honest, statable scope (static/fatigue, ideal ends, reference allowables).

## Queue

`src/pages/Home.tsx` is authoritative for what the site shows (Refined /
In progress / Planned tiers). Keep this snapshot in sync when a cycle moves a
card:

- **In progress:** Pin & Bolt Shear Joint · Shaft in Torsion · Column Buckling
  · Beam on Two Supports
- **Planned:** Helical Coil Spring · Press/Interference Fit · Thin-Wall
  Pressure Vessel · Bearing Life (L10)

## Idea backlog

Not on the site yet; graduate to a Planned card via policy step 3. Roughly
ordered by fit:

- **Fillet & butt weld group, static** — treat-weld-as-line, Shigley ch. 9;
  grab the load and watch the throat stress distribute around the group.
- **Shaft key & keyway** — shear and bearing on the key, pairs with the shaft
  calculator's keyseat concentration.
- **Spur gear tooth bending (Lewis / AGMA J)** — grab the tooth, watch the
  root stress; honest about dynamic factors.
- **Hertzian contact** — sphere/cylinder pairs, contact patch and subsurface
  shear; pairs with bearing life.
- **Lug / clevis eye (air-frame style)** — extends the pin joint to curved
  net sections and out-of-plane checks.
- **Shrink-fit temperature** — the assembly side of the press-fit calculator:
  interference vs heating/cooling ΔT, natural to build alongside it.
- **Flat / V-belt drive** — tensions, wrap angle, capstan slip limit.
- **Retaining ring groove** — groove shear and ring capacity; small but honest.

## Journal

Newest first. One line per cycle: what it did, and the lesson (if any) that was
folded back into the skills.

| Date | Cycle | Lesson recorded |
| --- | --- | --- |
| 2026-08-11 | Bootstrapped the evolution loop: this file, the `evolve` skill, wiring in CLAUDE.md. | — |
