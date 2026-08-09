// Renderers for the derived views of the material library.
//
// Pure string builders with no filesystem access, so both sides can use them:
// scripts/gen-materials.mjs writes their output to disk, and generated.test.ts
// compares the committed files against them. That shared implementation is
// what makes "is the generated copy stale?" a cheap, exact question instead of
// a judgement call.

import { MATERIALS } from "./library";
import type { Material } from "./types";

const BANNER = (extra?: string) =>
  `GENERATED FILE — do not edit.\n` +
  `Source: src/materials/library.ts · regenerate with \`npm run gen:materials\`.\n` +
  `Editing this file directly recreates the split-brain material tables the\n` +
  `library was built to remove; your change would be silently overwritten.` +
  (extra ? `\n\n${extra}` : "");

// ── public/designs/shared/materials.js ──────────────────────────────────────
// The design prototypes are plain browser scripts, so the library reaches them
// as a global rather than an import.
export function renderJS(materials: Record<string, Material> = MATERIALS): string {
  const comment = BANNER(
    [
      "The design prototypes are plain browser scripts, so the shared library",
      "reaches them as a global instead of an import. Load it before the",
      "calculator engine:",
      "",
      '  <script src="../shared/materials.js"></script>',
      '  <script src="my-engine.js"></script>',
      "",
      "Units match the library: E and Es in GPa, strengths and pressures in",
      "MPa, rho kg/m3, alpha um/(m.K), k W/(m.K), cp J/(kg.K). The helpers",
      "below convert to the MPa most engines work in.",
    ].join("\n"),
  )
    .split("\n")
    .map((line) => (line ? ` * ${line}` : " *"))
    .join("\n");

  const body = Object.values(materials)
    .map((m) => `    ${JSON.stringify(m.id)}: ${JSON.stringify(m)},`)
    .join("\n");

  return `/*
${comment}
 */
(function (root) {
  var MATERIALS = {
${body}
  };

  function material(id) {
    var m = MATERIALS[id];
    if (!m) throw new Error('Unknown material id "' + id + '". See src/materials/library.ts.');
    return m;
  }

  function requireProps(m, keys, usedBy) {
    var missing = keys.filter(function (k) {
      return m[k] === undefined || m[k] === null;
    });
    if (missing.length) {
      throw new Error(
        'Material "' + m.id + '" (' + m.name + ') is missing ' + missing.join(", ") +
          ", required by " + usedBy + ". Source the value into src/materials/library.ts " +
          "or drop the material from that menu — do not substitute a placeholder.",
      );
    }
    return m;
  }

  var PRINTED = { fdm: 1, mjf: 1, sls: 1 };

  root.MECHMAT = {
    MATERIALS: MATERIALS,
    material: material,
    requireProps: requireProps,
    /** Young's modulus in MPa — the unit most of the engines work in. */
    E_MPa: function (id) {
      return material(id).E * 1000;
    },
    /** Secant modulus in MPa, or null when the library has no figure. */
    Es_MPa: function (id) {
      var Es = material(id).Es;
      return Es === undefined ? null : Es * 1000;
    },
    /** True for printed stock, whose quoted properties are in-plane (XY). */
    isPrinted: function (id) {
      return !!PRINTED[material(id).process];
    },
    /**
     * Build a table keyed by the label a picker shows.
     * menu([["Mild steel (S235)", "s235"]], function (m) { ... })
     */
    menu: function (entries, project) {
      var out = {};
      entries.forEach(function (e) {
        out[e[0]] = project(material(e[1]), e[0]);
      });
      return out;
    },
  };
})(typeof window !== "undefined" ? window : globalThis);
`;
}

// ── docs/materials.md ───────────────────────────────────────────────────────
const COLS: Array<[string, (m: Material) => unknown]> = [
  ["id", (m) => `\`${m.id}\``],
  ["Material", (m) => m.name],
  ["Process", (m) => m.process],
  ["E [GPa]", (m) => m.E],
  ["ν", (m) => m.nu],
  ["σy [MPa]", (m) => m.sigmaY],
  ["σu [MPa]", (m) => m.sigmaU],
  ["pG [MPa]", (m) => m.pG],
  ["Se [MPa]", (m) => m.Se],
  ["Es [GPa]", (m) => m.Es],
  ["εallow", (m) => m.eAllow],
  ["creep", (m) => m.creep],
  ["ρ [kg/m³]", (m) => m.rho],
  ["α [µm/m·K]", (m) => m.alpha],
  ["k [W/m·K]", (m) => m.k],
  ["cp [J/kg·K]", (m) => m.cp],
];

export function renderMD(materials: Record<string, Material> = MATERIALS): string {
  const all = Object.values(materials);
  const groups = [...new Set(all.map((m) => m.group))];
  const cell = (v: unknown) => (v === undefined || v === null ? "—" : String(v));

  let out =
    `<!--\n${BANNER()}\n-->\n\n` +
    `# Material library\n\n` +
    `Every calculator in MechCalc reads its material properties from one table:\n` +
    `[\`src/materials/library.ts\`](../src/materials/library.ts). This page is a\n` +
    `generated view of it — edit the library, then run \`npm run gen:materials\`.\n\n` +
    `A blank cell means the library deliberately carries no figure for that\n` +
    `property, because no single typical value would be honest. A calculator that\n` +
    `needs it refuses the material rather than computing against a placeholder.\n\n` +
    `**Scope:** reference-quality typical values for design checks, not certified\n` +
    `allowables. Grade, temper, supplier, temperature and — for printed parts —\n` +
    `process settings all move these numbers. Verify before production use.\n\n` +
    `**Units:** E and Es in GPa · strengths and pressures in MPa · ρ in kg/m³ ·\n` +
    `α in µm/(m·K) · k in W/(m·K) · cp in J/(kg·K). Printed entries are in-plane (XY).\n\n` +
    `## Properties\n\n` +
    `| Symbol | Meaning |\n| --- | --- |\n` +
    `| σy | Yield strength (tensile strength at yield, for plastics) |\n` +
    `| σu | Ultimate tensile strength |\n` +
    `| pG | Permissible surface pressure under a bolt head or nut (VDI 2230 A9 for metals) |\n` +
    `| Se | Fully-reversed endurance strength, polished-specimen basis — metals only |\n` +
    `| Es | Secant modulus at the design strain, for snap-fit and living-hinge work |\n` +
    `| εallow | Permissible design strain for a one-time assembly |\n` +
    `| creep | Fraction of bolt preload retained long-term (1 = no measurable relaxation) |\n\n`;

  for (const g of groups) {
    out += `## ${g}\n\n`;
    out += `| ${COLS.map(([h]) => h).join(" | ")} |\n`;
    out += `| ${COLS.map(() => "---").join(" | ")} |\n`;
    for (const m of all.filter((x) => x.group === g)) {
      out += `| ${COLS.map(([, f]) => cell(f(m))).join(" | ")} |\n`;
    }
    out += `\n`;
  }

  out += `## Provenance\n\n`;
  out += `What each entry is, the condition it applies at, and what it is not.\n\n`;
  for (const m of all) {
    const aka = m.aliases?.length ? ` _(also called: ${m.aliases.join("; ")})_` : "";
    out += `- **${m.name}** (\`${m.id}\`) — ${m.note}${aka}\n`;
  }
  return out;
}

/** Everything the generator writes: repo-relative path → contents. */
export const GENERATED_FILES = (): Array<[path: string, content: string]> => [
  ["public/designs/shared/materials.js", renderJS()],
  ["docs/materials.md", renderMD()],
];
