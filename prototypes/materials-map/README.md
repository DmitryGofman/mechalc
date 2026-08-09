# Materials property map — design prototypes

Four throwaway HTML prototypes for an interactive Ashby-chart explorer
(materials plotted on log-log property axes, the Ashby "Materials Selection"
style). Each explores a different interaction model on the same dataset.

Open any file directly in a browser — they load `materials-data.js` from this
directory and need no build step.

| File | Idea |
|---|---|
| `p1-atlas.html` | Classic Ashby chart, but any of the 8 properties on either axis. Wheel-zoom/pan, family blobs, hover for a full property card. |
| `p2-terrain.html` | Strength–density treated like a slippy map: family "continents" when zoomed out, materials appear as you zoom, then names, then numbers. Minimap + fly-to search. |
| `p3-panels.html` | Four linked small multiples (strength–density, stiffness–density, conductivity–expansion, toughness–hardness). Hover one dot, it lights up everywhere; click to pin the card. |
| `p4-index.html` | Minimum-mass design indices: pick a case (stiff beam → E½/ρ …), drag the guideline, get a live ranked shortlist and a material passport. |

`materials-data.js` holds ~55 material classes with `[low, high]` ranges for
density, Young's modulus, strength, Vickers hardness, thermal conductivity,
thermal expansion, max service temperature, and fracture toughness. Values are
textbook-typical class envelopes (Ashby-style), not datasheet numbers.

If one of these graduates into the app proper, the dataset moves to
`src/calculators/` as a typed module with tests, per the usual three-file
calculator shape.
