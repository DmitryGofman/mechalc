# Mechanical Quick Calc — Architecture

> A fast, no-friction calculator for the **basic design checks a mechanical engineer
> does dozens of times a day** — G-loads, stress, bending, shear, torsion, von Mises,
> bolts. Each calc shows a diagram, explains every variable, handles units for you,
> and auto-saves to history.

The guiding principle: these calculations are *trivial* math but *expensive* in time
because the engineer has to remember the formula, look up a section property, find a
bolt's tensile area, convert mm↔in or N↔lbf, and re-derive the safety factor. The app
collapses that whole ritual into "pick formula → type numbers → read answer + SF".

---

## 0. Product strategy — where the ROI actually is

The original spec is solid. The biggest wins come from sharpening *focus* and making
**units a first-class citizen**, not an afterthought. Concrete recommendations:

### 0.1 Lead with the calculations engineers repeat the most
Rank features by `frequency × time-saved`, not by how impressive they are. The
highest-ROI calcs (the ones done constantly and annoying to do by hand) are:

| Rank | Calc | Why it earns its place |
|------|------|------------------------|
| 1 | **Bolt sizing / preload / torque** | Done on *every* bracket and joint; tensile-area + torque lookup is pure memory work |
| 2 | **G-load → force** (`F = m·n·g`) | First step of nearly every shock/vibe bracket check |
| 3 | **Axial stress + SF** (`σ = F/A`) | The "is this pin/lug/standoff strong enough" check |
| 4 | **Bending in cantilever / simply-supported beam** | Brackets, shafts, mounting arms — constant |
| 5 | **Shear in pin/bolt (single & double)** | Every clevis, hinge, shear joint |
| 6 | **Von Mises** (`σvm = √(σ² + 3τ²)`) | The "do I pass under combined load" gate |
| 7 | **Section properties (I, Z, J, A)** for rect / round / tube | Needed *as an input* to half the calcs above |
| 8 | **Torsion in shaft** (`τ = T·r/J`) | Shafts, fasteners under wrenching |
| 9 | **Cantilever deflection** (`δ = PL³/3EI`) | Stiffness / clearance checks |
| 10 | **Bearing stress** (`σ = F/(d·t)`) | Lug/hole pull-out check, pairs with shear |

**Recommendation:** ship 1–7 as the MVP. They form a closed, genuinely useful loop
(G-load → force → pick a section → stress → von Mises → SF) and cover ~80% of daily
hand-calcs. Defer welds, rivets, fancy beam cases, and material fatigue to v2.

### 0.2 Make units the headline feature, not a checkbox
This is the single biggest differentiator and the thing that "rakes time" in practice.
Engineers lose minutes and make real mistakes on unit conversions. Design for it:

- **Every numeric value carries a unit** internally. No bare numbers in the engine.
- **Canonical SI core**: the calculation engine *only* works in base SI
  (m, m², N, Pa, N·m, kg). Conversion happens at the I/O boundary only. This makes
  every formula trivially correct and unit-bug-free.
- **Per-field unit dropdown**: each input can be entered in the engineer's preferred
  unit (mm, in, MPa, ksi, lbf, kgf…) and is converted to SI on entry.
- **Global unit system toggle**: one switch flips the whole app between **Metric** and
  **Imperial** default units. Remember the choice.
- **Smart result units**: results display in sensible engineering units (MPa not Pa,
  kN not N) with a tap-to-change unit on the result itself.
- **Standalone Unit Converter** screen (a 5th tab): the classic "what's 250 lbf in N"
  / "30 ksi in MPa" / "mm⁴ in in⁴" tool. Cheap to build, used constantly, great
  retention hook even when the user doesn't need a full calc.
- **Dimensional safety**: because everything is SI internally, add a lightweight
  dimensional check in tests so a formula can never silently mix units.

### 0.3 Other high-ROI, low-cost improvements
- **Built-in lookups are the moat.** A bolt picker (M3–M12, tensile area, torque per
  8.8/10.9/12.9) and a material picker (Sy, Su, E, ρ for common Al/steel/SS/plastics)
  remove the "open a spreadsheet / Google it" step. This is what makes it *quick*.
- **Safety factor is always shown** with a color badge (red < 1, amber 1–1.5,
  green ≥ 1.5; thresholds configurable). The SF *is* the answer the engineer cares about.
- **Chaining / pipelines.** Let an output feed the next calc (G-load force → bending
  load). The spec's usage flow (§9) becomes a one-tap "use this result as input".
- **Auto-save everything, name nothing.** Zero-friction history; let naming/notes be
  optional and after-the-fact. Add duplicate + edit-and-recompute.
- **Offline-first.** All formulas, tables, and history are local. No login for MVP.
  An engineer at a bench with bad Wi-Fi must never be blocked.
- **Shareable result card.** Export a calc (diagram + inputs + result + SF) as a PNG
  or PDF snippet to paste into a design review or email. High perceived value, low cost.
- **Input sanity warnings, not just hard errors.** Warn on "area is zero", "SF < 1",
  "tensile stress on a plastic above yield", negative geometry, etc.

### 0.4 Explicitly out of scope for MVP (say no to protect the ROI)
FEA, multi-span/indeterminate beams, fatigue/SN curves, weld groups, bolt-pattern
load distribution, thermal, accounts/cloud sync. Each is a v2+ wedge, not a day-one need.

---

## 1. App structure

### Screens / tabs
1. **Home** — formula search + categories
   - Search box (fuzzy, matches name, symbol, category, synonyms — e.g. "stress",
     "σ", "axial", "tension" all find Axial Stress)
   - Categories: Beams & Bending · Shear · Torsion · Bolts · Pins/Rivets · Welds ·
     Moments of Inertia · Deflection · G-Loads · Von Mises
   - "Recent" and "Favorites" rows up top for one-tap re-entry
2. **Calculator** — the core screen
   - Diagram (SVG, labels mapped to live input values)
   - Equation (rendered, e.g. KaTeX)
   - Input fields, each with: symbol · name · **unit selector** · description tooltip
   - Result(s) with unit · **Safety Factor badge**
   - Actions: Save · Duplicate · Share/Export · "Use result in another calc"
3. **Recent Calculations** — history list (date, type, key result, SF) → reopen / dup / delete
4. **Formula Library** — reference table: equation, variable explanations, usage examples
5. **Unit Converter** *(added)* — standalone length/area/force/stress/moment/mass/inertia converter

### Cross-cutting
- **Unit system + theme** in settings; persisted.
- **Everything offline & local.**

---

## 2. Core data model

```ts
// A physical quantity is ALWAYS a value + a unit. Never a bare number in the engine.
type Quantity = {
  value: number          // numeric magnitude in the given unit
  unit: UnitId           // e.g. "mm", "MPa", "lbf"  (canonical SI under the hood)
}

type Dimension =
  | "length" | "area" | "second_moment_of_area" | "force"
  | "stress" | "moment" | "mass" | "acceleration" | "dimensionless"

type Unit = {
  id: UnitId
  dimension: Dimension
  label: string          // "mm", "MPa", "lbf"
  toSI: number           // multiply by this to get SI base; e.g. mm -> 0.001
  // (offset only needed for temperature; not used in MVP)
}

type Formula = {
  id: string
  category: Category
  name: string
  synonyms: string[]                 // powers search ("tension", "axial", "σ")
  equationTeX: string                // rendered with KaTeX
  diagramId: string
  inputs: InputVariable[]
  outputs: OutputVariable[]
  explanation: string
  references?: string[]              // textbook / standard, builds trust
}

type InputVariable = {
  symbol: string
  name: string
  dimension: Dimension               // drives which unit options are offered
  defaultUnit: UnitId
  description: string
  defaultValue?: number
  source?: "manual" | "boltTable" | "materialTable" | "sectionCalc" | "chained"
  min?: number; max?: number         // for sanity validation
}

type OutputVariable = {
  symbol: string
  name: string
  dimension: Dimension
  preferredUnit: UnitId              // e.g. show stress in MPa, force in kN
  description: string
  isSafetyFactor?: boolean
}

type CalculationResult = {
  id: string
  formulaId: string
  formulaName: string
  category: Category
  inputs: Record<string, Quantity>   // exactly as the user typed (value + unit)
  outputs: Record<string, Quantity>
  safetyFactor?: number
  unitSystem: "metric" | "imperial"
  createdAt: string                  // ISO
  notes?: string
}
```

Note the change from the original spec: `inputs`/`outputs` store **`Quantity`
(value + unit)**, not bare numbers, so a reopened calc reproduces exactly what the
user saw — including their unit choices.

---

## 3. MVP formulas

All formulas are evaluated **in SI**; the table below is the reference form.

### G-load → force
`F = m · n · g`  (g = 9.81 m/s²) → output **F** (resultant force)

### Axial stress (tension / compression)
`σ = F / A` → **σ**, and `SF = Sy / σ`

### Shear
`τ = F / A` (single), `τ = F / (2A)` (double shear) → **τ**, `SF = Ssy / τ`
(Ssy ≈ 0.577·Sy by distortion-energy if not provided)

### Bending in a beam
`σb = M / Z` or `σb = M·y / I` → **σb**, `SF = Sy / σb`
For a cantilever, end load: `M = P · L`.

### Cantilever deflection
`δ = P·L³ / (3·E·I)` → **δ**

### Torsion
`τ = T·r / J` → **τ**

### Von Mises
`σvm = √(σ² + 3τ²)` → **σvm**, `SF = Sy / σvm`

### Section properties (input helpers — high ROI)
- Rectangle: `A = b·h`, `I = b·h³/12`, `Z = b·h²/6`
- Solid round: `A = πd²/4`, `I = πd⁴/64`, `J = πd⁴/32`, `Z = πd³/32`
- Tube: `I = π(do⁴−di⁴)/64`, `J = 2I`, …

### v2 (deferred): bolts (T = K·F·d, σ = F/At), bearing (σ = F/(d·t)),
rivets, fillet weld (`A = 0.707·a·l`, `τ = F/A`).

---

## 4. Diagrams

One simple SVG per formula, with labels bound to live values.

```ts
type Diagram = {
  id: string
  title: string
  svgPath: string
  labels: DiagramLabel[]
}
type DiagramLabel = {
  symbol: string         // matches an InputVariable.symbol
  x: number; y: number   // position in the SVG viewBox
  description: string
}
```

Example — cantilever, end load (`cantilever-end-load.svg`): `P` arrow down at the
free end, `L` dimension along the beam, `M = P·L` at the fixed end, `δ` at the tip,
section `I` callout. As the user types, labels can show the live magnitudes.

---

## 5. Calculation engine

The engine is pure, SI-only, and unit-agnostic. Units are converted at the boundary.

```ts
interface Calculator {
  formulaId: string
  // inputs/outputs here are plain SI numbers; the I/O layer converts Quantity<->SI
  calculate(siInputs: Record<string, number>): Record<string, number>
  validate(siInputs: Record<string, number>): ValidationError[]
}

type ValidationError = {
  field: string
  level: "error" | "warning"     // warnings don't block (e.g. SF < 1)
  message: string
}
```

Example (everything already in SI when it reaches the calculator):

```ts
const axialStress: Calculator = {
  formulaId: "axial-stress",
  calculate({ F, A, Sy }) {
    const sigma = F / A                 // Pa
    const safetyFactor = Sy / sigma
    return { sigma, safetyFactor }
  },
  validate({ A, Sy }) {
    const errs: ValidationError[] = []
    if (A <= 0) errs.push({ field: "A", level: "error", message: "Area must be > 0" })
    if (Sy <= 0) errs.push({ field: "Sy", level: "error", message: "Yield strength must be > 0" })
    return errs
  }
}
```

The screen does: `Quantity → toSI → calculate → fromSI(preferredUnit) → display`.

---

## 6. Units layer (the differentiator)

```ts
// units/registry.ts — single source of truth
const UNITS: Record<UnitId, Unit> = {
  m:   { id: "m",   dimension: "length", label: "m",  toSI: 1 },
  mm:  { id: "mm",  dimension: "length", label: "mm", toSI: 1e-3 },
  in:  { id: "in",  dimension: "length", label: "in", toSI: 0.0254 },
  N:   { id: "N",   dimension: "force",  label: "N",  toSI: 1 },
  kN:  { id: "kN",  dimension: "force",  label: "kN", toSI: 1e3 },
  lbf: { id: "lbf", dimension: "force",  label: "lbf",toSI: 4.4482216 },
  kgf: { id: "kgf", dimension: "force",  label: "kgf",toSI: 9.80665 },
  Pa:  { id: "Pa",  dimension: "stress", label: "Pa", toSI: 1 },
  MPa: { id: "MPa", dimension: "stress", label: "MPa",toSI: 1e6 },
  ksi: { id: "ksi", dimension: "stress", label: "ksi",toSI: 6.894757e6 },
  // ... mm^2/in^2 (area), mm^4/in^4 (2nd moment), N·m/lbf·in (moment), kg/lbm (mass)
}

const toSI   = (q: Quantity) => q.value * UNITS[q.unit].toSI
const fromSI = (siValue: number, unit: UnitId): Quantity =>
  ({ value: siValue / UNITS[unit].toSI, unit })

// Only same-dimension conversions are allowed → impossible to convert mm to N.
function convert(q: Quantity, target: UnitId): Quantity {
  if (UNITS[q.unit].dimension !== UNITS[target].dimension)
    throw new Error("Dimension mismatch")
  return fromSI(toSI(q), target)
}
```

The **standalone Unit Converter** screen is just this `convert()` over a dimension
picker — near-zero extra cost, constant real-world use.

---

## 7. Recent calculations (storage)

- **MVP:** LocalStorage (web) / SQLite or AsyncStorage (mobile), abstracted behind a
  `RecentCalculationsRepo` interface so the backend can be swapped later.
- Auto-save on every successful calc; delete; duplicate; "edit & recompute".
- Stores full `Quantity` inputs + chosen unit system so reopening is pixel-faithful.

```ts
interface RecentCalculationsRepo {
  save(calc: CalculationResult): Promise<void>
  list(limit?: number): Promise<CalculationResult[]>
  get(id: string): Promise<CalculationResult | null>
  delete(id: string): Promise<void>
  duplicate(id: string): Promise<CalculationResult>
}
```

---

## 8. Folder architecture

```
src/
  app/
    home/
    calculators/
    recent/
    library/
    converter/                 // standalone unit converter screen
  components/
    FormulaCard.tsx
    DiagramViewer.tsx
    VariableInput.tsx          // value + per-field UnitSelector
    ResultBox.tsx
    SafetyFactorBadge.tsx
    UnitSelector.tsx
    SectionPropertyPicker.tsx  // rect/round/tube -> A, I, Z, J
    BoltPicker.tsx             // M-size -> At, torque, grade  (v2)
    MaterialPicker.tsx         // material -> Sy, Su, E, rho
  formulas/
    gLoad.ts
    axialStress.ts
    shearStress.ts
    bendingStress.ts
    torsionStress.ts
    vonMises.ts
    beamDeflection.ts
    sectionProperties.ts
    boltTorque.ts              // v2
    rivetBearing.ts            // v2
    weldStrength.ts            // v2
    index.ts                   // registry of all Formula definitions
  engine/
    calculator.ts             // Calculator interface + runner (SI-only)
    validate.ts
  diagrams/
    cantilever-end-load.svg
    simply-supported-center-load.svg
    torsion-shaft.svg
    axial-bar.svg
    pin-single-shear.svg
    pin-double-shear.svg
    rivet-shear.svg            // v2
    fillet-weld.svg            // v2
    bolt-preload.svg           // v2
  data/
    boltTables.ts
    tapDrillTables.ts
    materialProperties.ts
  storage/
    recentCalculations.ts
  units/
    registry.ts                // all units + dimensions
    convert.ts                 // toSI / fromSI / convert
    format.ts                  // pretty result units (Pa->MPa, N->kN)
  search/
    formulaSearch.ts           // fuzzy search over name/symbol/synonyms
```

---

## 9. Built-in tables (the moat)

### Bolts (metric coarse) — M3, M4, M5, M6, M8, M10, M12
Per size: nominal Ø, **tensile stress area `At`**, wrench size, approx. tightening
torque, proof/yield by grade **8.8 / 10.9 / 12.9**.

### Tap-drill (coarse)
M3→2.5 · M4→3.3 · M5→4.2 · M6→5.0 · M8→6.8 · M10→8.5 · M12→10.2 mm

### Materials (Sy, Su, E, ρ)
Al 6061-T6 · Al 7075-T6 · Steel 1018 · SS 304 · SS 316 · Nylon · PC-ABS

```ts
type Material = {
  id: string; name: string
  Sy: Quantity      // yield strength
  Su: Quantity      // ultimate
  E:  Quantity      // Young's modulus
  rho: Quantity     // density
}
```

These feed `MaterialPicker`/`BoltPicker` so an input field can be auto-filled instead
of looked up — the core time-saver.

---

## 10. Example usage flow (10g bracket check)

1. **G-Load** → enter mass `m` (g/kg/lbm), G count `n` → get force `F`.
2. Tap **"use F in another calc" → Bending**.
3. Pick **section** (rect/round/tube) via `SectionPropertyPicker` → `I`, `Z` auto-filled.
4. Pick **material** (e.g. Al 6061-T6) → `Sy` auto-filled.
5. Enter arm length `L` (mm or in — converted automatically).
6. Read **M, σb, and SF** with a color-coded safety badge.
7. Auto-saved to **Recent**; optionally export a result card for the design review.

Every step removes a lookup or a unit conversion the engineer would otherwise do by hand.

---

## 11. Suggested tech stack (for context)

- **Cross-platform UI:** React Native + Expo (one codebase, iOS/Android/web) or a PWA
  if web-first. Engineers want it on a phone at the bench *and* on the desktop.
- **Math rendering:** KaTeX.
- **Local storage:** AsyncStorage/SQLite (native) or LocalStorage/IndexedDB (web)
  behind the repo interface.
- **State:** lightweight (Zustand/Context); the domain is small.
- **Testing:** unit-test every `Calculator` against hand-worked examples **and** add a
  dimensional-consistency test per formula so unit bugs can't ship.

---

## 12. Revised MVP checklist

Ship exactly this, in order:

1. Units layer + per-field unit selector + global metric/imperial toggle
2. Standalone Unit Converter screen
3. G-load → force
4. Axial stress + SF
5. Shear (single & double) + SF
6. Bending (cantilever & simply-supported) + SF
7. Section properties (rect / round / tube)
8. Von Mises
9. Cantilever deflection
10. Material table + picker (Sy, Su, E, ρ)
11. Bolt + tap-drill tables (picker; bolt-torque calc can follow)
12. Auto-saved Recent Calculations (save / reopen / duplicate / delete)
13. Safety-factor badge + result-card export

That's a genuinely useful, units-safe tool covering the everyday hand-calcs — built
around the things engineers repeat most and lose the most time on.
```
