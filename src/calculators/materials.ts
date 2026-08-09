// Beam / flexure / column material picker.
//
// This is now a VIEW over the shared library in src/materials — the numbers
// live there, this file only decides which materials these three calculators
// offer, what they are called in the dropdown, and how they are grouped. Edit
// a property in the library and it lands here; edit the lists below to change
// what the picker shows.
//
// E in GPa, yield strength in MPa.
// fdm flag = anisotropic 3D-printed value (typical XY in-plane, well below
// across-layer), which is what drives the orientation warnings in the UI.

import { material, menu, type MenuEntry } from "../materials";

export type Material = {
  E: number;
  sigmaY: number;
  color: string;
  grp: string;
  fdm?: boolean;
  soft?: boolean;
};

// Display groups, in picker order, each listing [label shown, library id].
// The grouping is a display choice and deliberately local: the rubber-like
// powder-bed nylon sits under Powder-bed here, next to the process it shares,
// even though the library files it with the elastomers.
const BY_GROUP: Array<[grp: string, entries: MenuEntry[]]> = [
  [
    "Metal",
    [
      ["Spring Steel (1095)", "spring1095"],
      ["Ti-6Al-4V", "ti6al4v"],
      ["Aluminum 6061", "al6061o"],
      ["Aluminum 6061-T6", "al6061t6"],
      ["Aluminum 7075", "al7075o"],
      ["Aluminum 7075-T6", "al7075t6"],
    ],
  ],
  [
    "Plastic",
    [
      ["Delrin (POM)", "pom"],
      ["Polypropylene", "pp"],
      ["PETG", "petg"],
    ],
  ],
  [
    "FDM",
    [
      ["PLA (FDM)", "pla_fdm"],
      ["PETG (FDM)", "petg_fdm"],
      ["ABS (FDM)", "abs_fdm"],
      ["ASA (FDM)", "asa_fdm"],
      ["PC-ABS (FDM)", "pcabs_fdm"],
      ["Polycarbonate (FDM)", "pc_fdm"],
      ["Nylon 12 / PA12 (FDM)", "pa12_fdm"],
      ["Nylon 12 CF (FDM)", "pa12cf_fdm"],
      ["PP (FDM)", "pp_fdm"],
    ],
  ],
  [
    "Powder-bed",
    [
      ["PA12 (MJF)", "pa12_mjf"],
      ["PA11 (MJF)", "pa11_mjf"],
      ["PA12 GB (MJF, glass-filled)", "pa12gb_mjf"],
      ["PA12 (SLS)", "pa12_sls"],
      ["TPU/TPA (MJF, rubber-like)", "tpu_mjf"],
    ],
  ],
  [
    "Elastomer",
    [
      ["TPU 95A (FDM)", "tpu95a_fdm"],
      ["TPU 85A (FDM, softer)", "tpu85a_fdm"],
      ["TPE (FDM, soft rubber)", "tpe_fdm"],
    ],
  ],
];

const PRINTED = new Set(["fdm", "mjf", "sls"]);

export const MATERIALS: Record<string, Material> = Object.fromEntries(
  BY_GROUP.flatMap(([grp, entries]) =>
    Object.entries(
      menu(entries, (m) => ({
        E: m.E,
        sigmaY: m.sigmaY,
        color: m.color,
        grp,
        // Printed stock is quoted in-plane; the UI warns about layer direction.
        ...(PRINTED.has(m.process) ? { fdm: true } : {}),
        // Rubber-like grades get the small-strain caveat and a softer scene.
        ...(m.group === "Elastomer" ? { soft: true } : {}),
      })),
    ),
  ),
);

export const GROUP_ORDER = BY_GROUP.map(([grp]) => grp);

// Pinned to the top of the material picker for quick access.
export const FAVORITES = [
  "PA12 (MJF)", // Nylon 12 (MJF)
  "PC-ABS (FDM)",
  "PLA (FDM)",
  "ABS (FDM)",
  "Aluminum 6061",
  "Aluminum 6061-T6",
  "Aluminum 7075",
  "Aluminum 7075-T6",
];

/** The library entry behind a picker label — for provenance notes in the UI. */
export const sourceFor = (label: string) => {
  const entry = BY_GROUP.flatMap(([, entries]) => entries).find(([l]) => l === label);
  return entry ? material(entry[1]) : undefined;
};
