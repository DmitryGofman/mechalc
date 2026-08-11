---
name: evolve
description: Run one self-evolution cycle of MechCalc — read ROADMAP.md, pick the single highest-value step (promote an In-progress calculator to Refined, build the next Planned one, or grow the roadmap), do it to the new-calculator standard, then write back what was learned so the next cycle starts smarter. Use when the user says "evolve", "keep going", "next", "continue the roadmap", "build the next calculator", or when a recurring loop or scheduled session fires with no more specific instruction. One invocation is one cycle, sized to fit a session.
---

# One evolution cycle

The catalog grows itself: each cycle reads the roadmap, moves it one step, and
leaves the system smarter than it found it. The skill files and `ROADMAP.md`
are the loop's memory — a fresh session with no context can pick up exactly
where the last one stopped, because everything it needs to know is written
down here, not remembered.

## 1 — Read the state

- `ROADMAP.md` — the goal, the selection policy, the queue, the backlog, and
  the journal. The **last journal entry** may name unfinished work to resume;
  that always wins over starting something new.
- `src/pages/Home.tsx` — the authoritative tier lists (Refined / In progress /
  Planned).
- `git log --oneline -15` — what recent cycles actually shipped.

## 2 — Pick one step

Apply the selection policy in `ROADMAP.md`, top priority first. Announce the
pick and why in one sentence before touching a file. One cycle ships **one**
coherent thing:

- a promotion (In progress → Refined, closing every gap against the promotion
  bar), or
- one new calculator (landing in In progress), or
- one roadmap graduation (backlog idea → Planned card), which is a small cycle
  — fine, that is the step the policy asked for.

If the pick turns out mid-way to be too big for the session, ship the coherent
slice (math module + tests first, always — they are useful alone and testable
alone), and write the resume point into the journal.

## 3 — Do the work

Build and promote **through the `new-calculator` skill** — read it before the
first file; it carries the anatomy, the verification list and the browser
drive-test. Do not restate or shortcut it here.

## 4 — Evolve the system (this is the self- part)

Before committing, write back everything the next cycle needs:

- **Queue:** move the card in `Home.tsx`, mirror it in `ROADMAP.md`'s queue,
  update the README row and model note.
- **Journal:** one new row at the top — what shipped, and where to resume if
  anything is unfinished.
- **Lessons → skills.** If the cycle hit something non-obvious that the next
  builder would hit again, fold it into the skill **at the point where it
  applies** — a sentence in the right section of `new-calculator/SKILL.md`,
  not an appendix of tips. Rules to keep this from rotting:
  - Only lessons verified in *this* repo, in *this* cycle. No speculation.
  - Edit in place; never append a "misc lessons" list.
  - If the skill section already implies it, don't add it. Prune anything the
    codebase now does automatically.
- **Process fixes → this file.** If the cycle misfired — picked wrong, scoped
  too big, verified too late — amend the selection policy in `ROADMAP.md` or
  the steps here so the mistake can't repeat. The loop's own instructions are
  as editable as the code.

## 5 — Verify, commit, deliver

- `npm test` and `npm run build` must pass; drive the changed page in the real
  browser per the `new-calculator` checklist.
- Commit with a message that says what the cycle did; push to the working
  branch.
- Finish with the `preview` skill and hand over the deep link — a cycle whose
  result the user cannot click is not delivered.

## Stopping

When the policy reaches its stop state (empty queue, empty backlog, no
candidate meets the bar), say so plainly, add the final journal row, and end —
do not invent filler calculators to keep the loop busy. If running under a
recurring loop or schedule, tell the user it can be turned off.

## Running continuously

Each invocation is one cycle, so continuity is just repetition:

- **Interactive:** say "evolve" (or "keep going") once per sitting, or run
  `/loop /evolve` and let the session pace itself.
- **Unattended:** a scheduled session (Claude Code Routine / GitHub trigger)
  whose prompt is "Run the evolve skill" gives one cycle per firing, each
  starting cold and recovering the full state from this file and `ROADMAP.md`.
