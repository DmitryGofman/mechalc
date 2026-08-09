<!--
GENERATED FILE — do not edit.
Source: src/materials/library.ts · regenerate with `npm run gen:materials`.
Editing this file directly recreates the split-brain material tables the
library was built to remove; your change would be silently overwritten.
-->

# Material library

Every calculator in MechCalc reads its material properties from one table:
[`src/materials/library.ts`](../src/materials/library.ts). This page is a
generated view of it — edit the library, then run `npm run gen:materials`.

A blank cell means the library deliberately carries no figure for that
property, because no single typical value would be honest. A calculator that
needs it refuses the material rather than computing against a placeholder.

**Scope:** reference-quality typical values for design checks, not certified
allowables. Grade, temper, supplier, temperature and — for printed parts —
process settings all move these numbers. Verify before production use.

**Units:** E and Es in GPa · strengths and pressures in MPa · ρ in kg/m³ ·
α in µm/(m·K) · k in W/(m·K) · cp in J/(kg·K). Printed entries are in-plane (XY).

## Properties

| Symbol | Meaning |
| --- | --- |
| σy | Yield strength (tensile strength at yield, for plastics) |
| σu | Ultimate tensile strength |
| pG | Permissible surface pressure under a bolt head or nut (VDI 2230 A9 for metals) |
| Se | Fully-reversed endurance strength, polished-specimen basis — metals only |
| Es | Secant modulus at the design strain, for snap-fit and living-hinge work |
| εallow | Permissible design strain for a one-time assembly |
| creep | Fraction of bolt preload retained long-term (1 = no measurable relaxation) |

## Metal

| id | Material | Process | E [GPa] | ν | σy [MPa] | σu [MPa] | pG [MPa] | Se [MPa] | Es [GPa] | εallow | creep | ρ [kg/m³] | α [µm/m·K] | k [W/m·K] | cp [J/kg·K] |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `s235` | Mild steel (S235) | wrought | 200 | 0.3 | 235 | 360 | 490 | 180 | — | — | — | 7850 | 12 | 50 | 470 |
| `s355` | Alloy steel (S355 / 4140) | wrought | 200 | 0.3 | 355 | 560 | 760 | 280 | — | — | — | 7850 | 12 | 45 | 470 |
| `spring1095` | Spring Steel (1095) | wrought | 205 | 0.29 | 1200 | 1400 | — | 600 | — | — | — | 7850 | 12.5 | 47 | 460 |
| `ss304` | Stainless 304 / A2 | wrought | 193 | 0.29 | 215 | 505 | 500 | 240 | — | — | — | 8000 | 17.3 | 16 | 500 |
| `castiron250` | Gray cast iron (GJL-250) | cast | 110 | 0.26 | 165 | 250 | 800 | 100 | — | — | — | 7200 | 10.5 | 46 | 490 |
| `brass37` | Brass (CuZn37) | wrought | 100 | 0.34 | 200 | 340 | 300 | 100 | — | — | — | 8440 | 20.5 | 120 | 380 |
| `al6061o` | Aluminum 6061 | wrought | 68.9 | 0.33 | 55 | 125 | — | 60 | — | — | — | 2700 | 23.6 | 167 | 896 |
| `al6061t6` | Aluminum 6061-T6 | wrought | 68.9 | 0.33 | 276 | 310 | 300 | 96 | — | — | — | 2700 | 23.6 | 167 | 896 |
| `al7075o` | Aluminum 7075 | wrought | 71.7 | 0.33 | 103 | 228 | — | — | — | — | — | 2810 | 23.4 | 173 | 960 |
| `al7075t6` | Aluminum 7075-T6 | wrought | 71.7 | 0.33 | 503 | 572 | 410 | 159 | — | — | — | 2810 | 23.4 | 130 | 960 |
| `al5052h32` | Aluminum 5052-H32 | wrought | 70.3 | 0.33 | 193 | 228 | 250 | 117 | — | — | — | 2680 | 23.8 | 138 | 880 |
| `al6063t5` | Aluminum 6063-T5 | wrought | 68.9 | 0.33 | 145 | 185 | — | — | — | — | — | 2700 | 23.4 | 209 | 900 |
| `ti6al4v` | Ti-6Al-4V | wrought | 114 | 0.34 | 880 | 950 | 900 | 510 | — | — | — | 4430 | 8.6 | 6.7 | 526 |
| `chromedsteelrod` | Hard chromed rod | wrought | 200 | 0.3 | 600 | 800 | — | — | — | — | — | 7850 | 12 | 50 | 470 |

## Composite

| id | Material | Process | E [GPa] | ν | σy [MPa] | σu [MPa] | pG [MPa] | Se [MPa] | Es [GPa] | εallow | creep | ρ [kg/m³] | α [µm/m·K] | k [W/m·K] | cp [J/kg·K] |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `fr4` | FR-4 PCB (glass-epoxy) | laminate | 12 | 0.15 | 300 | — | 60 | — | — | — | — | 1850 | 14 | 0.3 | 1100 |

## Plastic

| id | Material | Process | E [GPa] | ν | σy [MPa] | σu [MPa] | pG [MPa] | Se [MPa] | Es [GPa] | εallow | creep | ρ [kg/m³] | α [µm/m·K] | k [W/m·K] | cp [J/kg·K] |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `pom` | POM / Delrin (acetal) | molded | 3.1 | 0.35 | 70 | 70 | 90 | — | 2.6 | 0.04 | — | 1410 | 110 | 0.31 | 1470 |
| `pp` | Polypropylene | molded | 1.5 | 0.42 | 35 | — | — | — | 1.3 | 0.05 | — | 905 | 100 | 0.22 | 1900 |
| `petg` | PETG | molded | 2.1 | 0.4 | 50 | — | — | — | — | — | — | 1270 | 60 | 0.2 | 1200 |
| `abs` | ABS | molded | 2.2 | 0.35 | 45 | — | 55 | — | 2.1 | 0.03 | — | 1050 | 90 | 0.17 | 1400 |
| `pcabs` | PC-ABS blend | molded | 2.4 | 0.36 | 55 | — | 65 | — | 2.2 | 0.03 | — | 1130 | 75 | 0.2 | 1300 |
| `pc` | Polycarbonate | molded | 2.4 | 0.37 | 62 | — | — | — | 2.3 | 0.04 | — | 1200 | 65 | 0.2 | 1200 |
| `pa66dry` | Nylon 6/6 (PA66, dry) | molded | 2.8 | 0.39 | 80 | — | 70 | — | 2.8 | 0.04 | — | 1140 | 80 | 0.25 | 1670 |
| `pa66cond` | Nylon 6/6 (PA66, conditioned) | molded | 1.2 | 0.41 | 55 | — | — | — | 1.2 | 0.06 | — | 1140 | 90 | 0.25 | 1670 |
| `pa12gf30` | Nylon 12 GF30 (glass-filled) | molded | 6 | 0.38 | 110 | — | 110 | — | — | — | — | 1230 | 40 | 0.3 | 1500 |
| `pbtgf30` | PBT-GF30 | molded | 8 | 0.38 | 130 | — | — | — | 8 | 0.012 | — | 1520 | 25 | 0.29 | 1300 |

## FDM

| id | Material | Process | E [GPa] | ν | σy [MPa] | σu [MPa] | pG [MPa] | Se [MPa] | Es [GPa] | εallow | creep | ρ [kg/m³] | α [µm/m·K] | k [W/m·K] | cp [J/kg·K] |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `pla_fdm` | PLA (FDM) | fdm | 3.5 | 0.36 | 50 | — | 55 | — | 3.1 | 0.015 | 0.45 | 1240 | 68 | 0.13 | 1800 |
| `petg_fdm` | PETG (FDM) | fdm | 2 | 0.4 | 45 | — | 50 | — | 1.9 | 0.025 | 0.55 | 1270 | 60 | 0.2 | 1200 |
| `abs_fdm` | ABS (FDM) | fdm | 2 | 0.35 | 40 | — | 46 | — | 1.8 | 0.02 | 0.6 | 1040 | 90 | 0.17 | 1400 |
| `asa_fdm` | ASA (FDM) | fdm | 2 | 0.35 | 42 | — | 46 | — | — | — | 0.6 | 1070 | 85 | 0.17 | 1400 |
| `pcabs_fdm` | PC-ABS (FDM) | fdm | 1.9 | 0.36 | 41 | — | 48 | — | — | — | 0.6 | 1130 | 75 | 0.2 | 1300 |
| `pc_fdm` | Polycarbonate (FDM) | fdm | 2.2 | 0.37 | 57 | — | — | — | — | — | 0.65 | 1200 | 65 | 0.2 | 1200 |
| `pa12_fdm` | Nylon 12 / PA12 (FDM) | fdm | 1.5 | 0.4 | 45 | — | 50 | — | — | — | 0.55 | 1010 | 110 | 0.25 | 1800 |
| `pa12cf_fdm` | Nylon 12 CF (FDM) | fdm | 4 | 0.38 | 70 | — | — | — | — | — | 0.65 | 1090 | 40 | 0.3 | 1600 |
| `pp_fdm` | PP (FDM) | fdm | 1.3 | 0.42 | 28 | — | — | — | — | — | 0.5 | 900 | 100 | 0.22 | 1900 |

## Powder-bed

| id | Material | Process | E [GPa] | ν | σy [MPa] | σu [MPa] | pG [MPa] | Se [MPa] | Es [GPa] | εallow | creep | ρ [kg/m³] | α [µm/m·K] | k [W/m·K] | cp [J/kg·K] |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `pa12_mjf` | PA12 (MJF) | mjf | 1.7 | 0.4 | 48 | — | 50 | — | 1.7 | 0.04 | 0.55 | 1010 | 110 | 0.25 | 1800 |
| `pa11_mjf` | PA11 (MJF) | mjf | 1.6 | 0.4 | 48 | — | — | — | — | — | 0.55 | 1020 | 110 | 0.25 | 1800 |
| `pa12gb_mjf` | PA12 GB (MJF, glass-filled) | mjf | 2.6 | 0.39 | 44 | — | — | — | — | — | 0.6 | 1230 | 70 | 0.3 | 1600 |
| `pa12_sls` | PA12 (SLS) | sls | 1.65 | 0.4 | 48 | — | — | — | — | — | 0.55 | 1000 | 110 | 0.25 | 1800 |

## Elastomer

| id | Material | Process | E [GPa] | ν | σy [MPa] | σu [MPa] | pG [MPa] | Se [MPa] | Es [GPa] | εallow | creep | ρ [kg/m³] | α [µm/m·K] | k [W/m·K] | cp [J/kg·K] |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `tpu95a_fdm` | TPU 95A (FDM) | fdm | 0.04 | 0.48 | 9 | — | — | — | — | — | — | 1200 | 150 | 0.2 | 1800 |
| `tpu85a_fdm` | TPU 85A (FDM, softer) | fdm | 0.012 | 0.48 | 5 | — | — | — | — | — | — | 1180 | 160 | 0.2 | 1800 |
| `tpe_fdm` | TPE (FDM, soft rubber) | fdm | 0.01 | 0.48 | 4 | — | — | — | — | — | — | 1150 | 160 | 0.2 | 1800 |
| `tpu_mjf` | TPU/TPA (MJF, rubber-like) | mjf | 0.08 | 0.48 | 8 | — | — | — | — | — | — | 1100 | 150 | 0.2 | 1800 |

## Provenance

What each entry is, the condition it applies at, and what it is not.

- **Mild steel (S235)** (`s235`) — Typical hot-rolled structural steel, EN 10025 S235JR, room temperature. pG per VDI 2230 Table A9. Se is a polished-specimen estimate (~0.5·σu) — apply your own surface and size factors. _(also called: Mild steel (S235); Steel tube (S235 / DOM))_
- **Alloy steel (S355 / 4140)** (`s355`) — Higher-strength structural / normalised 4140-class steel at room temperature. pG per VDI 2230 Table A9. Quenched-and-tempered 4140 runs far higher — use your own heat-treat data. _(also called: Alloy steel (S355 / 4140); Steel (S355 / 4140N); Steel, alloy (S355 / 4140))_
- **Spring Steel (1095)** (`spring1095`) — Hardened and tempered high-carbon spring steel strip, typical spring temper. Se for high-strength steels plateaus well below 0.5·σu; treat 600 MPa as indicative only and derate for surface finish.
- **Stainless 304 / A2** (`ss304`) — Annealed austenitic 304/A2, room temperature. Work-hardens strongly, so cold-drawn stock is much stronger. Note the low conductivity and high expansion relative to carbon steel. _(also called: Stainless 304 / A2; Stainless 304 tube)_
- **Gray cast iron (GJL-250)** (`castiron250`) — EN-GJL-250 flake graphite iron. Brittle: no real yield point — the quoted σy is a 0.1% proof approximation and tensile capacity is far below its compressive capacity. Excellent bearing pressure, which is why pG is so high.
- **Brass (CuZn37)** (`brass37`) — CuZn37 (CW508L) in a half-hard condition. Properties swing widely with temper; annealed stock is roughly half this strength.
- **Aluminum 6061** (`al6061o`) — 6061 in the O (annealed) temper — soft, as-supplied-for-forming. If your stock is extrusion or plate off the shelf it is almost certainly T6, not this.
- **Aluminum 6061-T6** (`al6061t6`) — The workhorse temper for machined and extruded parts. pG per VDI 2230 Table A9. Aluminium has no true endurance limit — Se is the ~5×10⁸-cycle fatigue strength, so infinite-life reasoning does not apply.
- **Aluminum 7075** (`al7075o`) — 7075 in the O (annealed) temper. Rarely what you have in hand — check for T6 before using these numbers.
- **Aluminum 7075-T6** (`al7075t6`) — High-strength aerospace aluminium. Strong but notch-sensitive and poor in corrosion and weldability compared with 6061. pG per VDI 2230 Table A9.
- **Aluminum 5052-H32** (`al5052h32`) — Strain-hardened sheet alloy — the usual choice for bent brackets and folded enclosures. Not heat-treatable; forming and welding soften it locally.
- **Aluminum 6063-T5** (`al6063t5`) — Architectural extrusion alloy — the metric tube and V-slot profile alloy. Weaker than 6061-T6; do not assume extruded stock is 6061.
- **Ti-6Al-4V** (`ti6al4v`) — Grade 5 titanium, annealed. Note the very low thermal conductivity — it is why it machines badly and why heat concentrates at the cutting edge.
- **Hard chromed rod** (`chromedsteelrod`) — Induction-hardened, hard-chrome-plated linear shafting (the usual CK45/C60 substrate). Strength is the substrate's; the plating is thin and hard — clamping on it risks flaking rather than yielding.
- **FR-4 PCB (glass-epoxy)** (`fr4`) — Woven glass/epoxy laminate. E is the THROUGH-THICKNESS value — the direction a bolted joint actually compresses — and is roughly half the in-plane stiffness. σy is an in-plane flexural strength, not a yield point; FR-4 is brittle. The low pG is the number that matters when bolting boards: they crush long before a metal plate would. Through-thickness expansion also runs several times the in-plane α quoted.
- **POM / Delrin (acetal)** (`pom`) — Unfilled homopolymer acetal at 23 °C. Es/eAllow are generic educational snap-fit values, not production allowables. Excellent resilience and low friction; poor adhesive bonding. _(also called: Delrin (POM); POM / Delrin; POM (acetal))_
- **Polypropylene** (`pp`) — Unfilled homopolymer PP at 23 °C. The classic living-hinge material — it tolerates very high strain in a thin hinge, which is why eAllow is generous. Creeps heavily under sustained load. _(also called: Polypropylene; PP)_
- **PETG** (`petg`) — Extruded/molded copolyester at 23 °C. Tough and clear; softens near 70 °C, so keep it out of hot enclosures and cars.
- **ABS** (`abs`) — General-purpose molded ABS at 23 °C. Es/eAllow are generic educational snap-fit values, not production allowables. _(also called: ABS)_
- **PC-ABS blend** (`pcabs`) — Molded polycarbonate/ABS alloy at 23 °C. Properties vary widely with the PC:ABS ratio — treat as indicative and check the specific grade. _(also called: ABS-PC blend; PC-ABS blend)_
- **Polycarbonate** (`pc`) — Unfilled molded polycarbonate at 23 °C. Very tough and ductile, but notch-sensitive and attacked by many solvents — a sharp internal corner or the wrong cleaner turns it brittle. _(also called: PC)_
- **Nylon 6/6 (PA66, dry)** (`pa66dry`) — Unfilled PA66 dry-as-molded at 23 °C. Nylon absorbs moisture and softens dramatically in service — see the conditioned entry, which is the honest one for most real environments. _(also called: Nylon 6/6 (PA66, dry); PA 66 (dry as molded))_
- **Nylon 6/6 (PA66, conditioned)** (`pa66cond`) — The same PA66 after moisture conditioning at 23 °C / 50% RH — less than half the stiffness, more ductile. Design to this unless the part lives in a sealed dry environment. _(also called: PA 66 (conditioned))_
- **Nylon 12 GF30 (glass-filled)** (`pa12gf30`) — 30% glass-filled PA12, molded, at 23 °C. Strongly anisotropic — quoted properties are in the flow direction, and transverse values are much lower. Abrasive to tooling.
- **PBT-GF30** (`pbtgf30`) — 30% glass PBT, flow direction, 23 °C. Anisotropy is NOT modelled by a single figure. The very low permissible strain is the point: stiff filled plastics make poor snap arms.
- **PLA (FDM)** (`pla_fdm`) — FDM PLA, in-plane (XY), well-tuned print at 23 °C. Stiff but brittle, softens around 55–60 °C, and creeps badly under sustained load — a poor choice for reusable snaps or bolted joints that must hold torque. _(also called: PLA (FDM); PLA (FDM printed))_
- **PETG (FDM)** (`petg_fdm`) — FDM PETG, in-plane (XY) at 23 °C. Layer adhesion is the weak point: orient bending in-plane, never across layers. _(also called: PETG (FDM); PETG (FDM printed))_
- **ABS (FDM)** (`abs_fdm`) — FDM ABS, in-plane (XY) at 23 °C. Layer bonds are the weak point — orient bending in-plane and add a generous root fillet. Warps without an enclosure. _(also called: ABS (FDM); ABS (FDM printed))_
- **ASA (FDM)** (`asa_fdm`) — FDM ASA, in-plane (XY) at 23 °C. ABS-like mechanically but UV-stable — the outdoor choice.
- **PC-ABS (FDM)** (`pcabs_fdm`) — FDM PC-ABS, in-plane (XY) at 23 °C. Tougher and more heat-tolerant than plain ABS; still needs an enclosure to print well.
- **Polycarbonate (FDM)** (`pc_fdm`) — FDM polycarbonate, in-plane (XY) at 23 °C. The stiffest common filament with real heat resistance, but hygroscopic and demanding to print — wet filament loses most of its strength.
- **Nylon 12 / PA12 (FDM)** (`pa12_fdm`) — FDM nylon 12, in-plane (XY) at 23 °C. Tough and fatigue-tolerant — the best common filament for living hinges — but very hygroscopic: dry it before printing and expect service properties to drift with humidity. _(also called: Nylon 12 / PA12 (FDM); Nylon 12 (FDM))_
- **Nylon 12 CF (FDM)** (`pa12cf_fdm`) — Chopped-carbon-filled FDM nylon, in-plane (XY) at 23 °C. Much stiffer and more dimensionally stable than unfilled, but the fibres do nothing for layer adhesion — Z strength stays poor. Abrasive: needs a hardened nozzle.
- **PP (FDM)** (`pp_fdm`) — FDM polypropylene, in-plane (XY) at 23 °C. Chemically resistant and fatigue-tolerant, but warps badly and bonds to almost no bed surface except PP tape.
- **PA12 (MJF)** (`pa12_mjf`) — HP Multi Jet Fusion nylon 12, XY plane, 23 °C. Near-isotropic for a printed part but verify with printed coupons. pG is the conservative figure the bolted-joint calculator has always used; the clamp calculator previously assumed 55 MPa. _(also called: PA12 (MJF); Nylon 12 (MJF); Nylon 12 (PA12); PA12 (MJF printed))_
- **PA11 (MJF)** (`pa11_mjf`) — MJF nylon 11, XY plane, 23 °C. Similar stiffness to PA12 but notably more ductile and impact-tolerant — the better choice for snap features and drop loads.
- **PA12 GB (MJF, glass-filled)** (`pa12gb_mjf`) — Glass-bead-filled MJF nylon 12, XY plane, 23 °C. Stiffer and more dimensionally stable than unfilled, but the beads reduce elongation — stiffer does not mean stronger here.
- **PA12 (SLS)** (`pa12_sls`) — Laser-sintered nylon 12, XY plane, 23 °C. Practically interchangeable with MJF PA12 for design-check purposes; surface finish and refresh ratio drive the real scatter.
- **TPU 95A (FDM)** (`tpu95a_fdm`) — FDM TPU, 95 Shore A, in-plane at 23 °C. The linear modulus quoted is a small-strain tangent only — TPU stiffens dramatically at high strain, so a linear model under-predicts force badly past a few percent.
- **TPU 85A (FDM, softer)** (`tpu85a_fdm`) — FDM TPU, 85 Shore A, in-plane at 23 °C. Same small-strain caveat as the 95A grade, more so.
- **TPE (FDM, soft rubber)** (`tpe_fdm`) — Soft FDM thermoplastic elastomer, in-plane at 23 °C. Indicative small-strain figures for feel only — grades vary enormously.
- **TPU/TPA (MJF, rubber-like)** (`tpu_mjf`) — Powder-bed rubber-like nylon elastomer, XY plane at 23 °C. Stiffer than filament TPU and near-isotropic; same hyperelastic caveat applies.
