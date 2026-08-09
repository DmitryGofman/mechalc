// Integrity tests for the shared material library.
//
// These are not physics tests — the calculators' own suites check the physics.
// These check the things that go wrong in a shared table: an id that drifts
// from its key, two materials claiming the same name, a property outside the
// range that makes it meaningful, a menu quietly repointed at the wrong entry
// during a refactor. Cheap to run, and they fail at the moment of the mistake
// instead of three calculators later.

import { describe, expect, it } from "vitest";
import { MATERIALS, resolveName } from "./index";
import { GROUPS } from "./types";
import { MATERIALS as PICKER, GROUP_ORDER } from "../calculators/materials";
import { PLATE_MATERIALS } from "../calculators/boltMath";
import { CLAMP_MATS, CYL_MATS } from "../calculators/clampMath";

const entries = Object.entries(MATERIALS);
const all = Object.values(MATERIALS);
const HEX = /^#[0-9a-f]{6}$/i;

describe("library structure", () => {
  it("keys its record by each material's own id", () => {
    for (const [key, m] of entries) expect(m.id).toBe(key);
  });

  it("gives every material a unique display name", () => {
    const names = all.map((m) => m.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it("never lets an alias collide with another material's name or alias", () => {
    const seen = new Map<string, string>();
    for (const m of all) {
      for (const label of [m.name, ...(m.aliases ?? [])]) {
        const owner = seen.get(label);
        // A material may list its own canonical name among its aliases.
        if (owner && owner !== m.id) {
          throw new Error(`"${label}" is claimed by both ${owner} and ${m.id}`);
        }
        seen.set(label, m.id);
      }
    }
  });

  it("resolves every alias back to its material", () => {
    for (const m of all) {
      for (const label of [m.name, ...(m.aliases ?? [])]) {
        expect(resolveName(label)?.id).toBe(m.id);
      }
    }
  });

  it("files every material under a known group", () => {
    for (const m of all) expect(GROUPS).toContain(m.group);
  });

  it("gives every material a provenance note and both display colours", () => {
    for (const m of all) {
      expect(m.note.length, `${m.id} note`).toBeGreaterThan(30);
      expect(m.color, `${m.id} color`).toMatch(HEX);
      expect(m.tone, `${m.id} tone`).toMatch(HEX);
    }
  });
});

describe("property ranges", () => {
  it("keeps stiffness and strength positive and finite", () => {
    for (const m of all) {
      expect(m.E, `${m.id} E`).toBeGreaterThan(0);
      expect(m.E, `${m.id} E`).toBeLessThan(1000); // GPa — nothing here is diamond
      expect(m.sigmaY, `${m.id} sigmaY`).toBeGreaterThan(0);
    }
  });

  it("never rates a material stronger at yield than at ultimate", () => {
    for (const m of all) {
      if (m.sigmaU !== undefined) expect(m.sigmaU, `${m.id}`).toBeGreaterThanOrEqual(m.sigmaY);
    }
  });

  it("keeps the secant modulus at or below the tangent modulus", () => {
    // Plastics soften as they strain; a secant above the initial slope would
    // mean the two numbers came from different grades.
    for (const m of all) {
      if (m.Es !== undefined) expect(m.Es, `${m.id}`).toBeLessThanOrEqual(m.E);
    }
  });

  it("keeps Poisson's ratio physical", () => {
    for (const m of all) {
      if (m.nu !== undefined) {
        expect(m.nu, `${m.id} nu`).toBeGreaterThan(0);
        expect(m.nu, `${m.id} nu`).toBeLessThan(0.5); // 0.5 = incompressible
      }
    }
  });

  it("expresses creep as a retained fraction in (0, 1]", () => {
    for (const m of all) {
      if (m.creep !== undefined) {
        expect(m.creep, `${m.id} creep`).toBeGreaterThan(0);
        expect(m.creep, `${m.id} creep`).toBeLessThanOrEqual(1);
      }
    }
  });

  it("keeps permissible design strain in a plausible band", () => {
    for (const m of all) {
      if (m.eAllow !== undefined) {
        expect(m.eAllow, `${m.id} eAllow`).toBeGreaterThan(0);
        expect(m.eAllow, `${m.id} eAllow`).toBeLessThan(0.2); // 20% is already heroic
      }
    }
  });

  it("keeps bearing pressure, density and thermal figures positive", () => {
    for (const m of all) {
      for (const key of ["pG", "Se", "rho", "alpha", "k", "cp"] as const) {
        const v = m[key];
        if (v !== undefined) expect(v, `${m.id} ${key}`).toBeGreaterThan(0);
      }
    }
  });

  it("only quotes an endurance strength for metals", () => {
    // Polymer fatigue depends so strongly on grade, temperature and cycle rate
    // that one number would mislead. If this ever fails, either the material
    // moved groups or someone invented a figure.
    for (const m of all) {
      if (m.Se !== undefined) expect(m.group, `${m.id} has Se`).toBe("Metal");
    }
  });

  it("marks printed entries as anisotropic in their note", () => {
    // Every printed entry must say which direction its numbers apply to —
    // using an in-plane figure across layers is the classic printed-part error.
    for (const m of all) {
      if (["fdm", "mjf", "sls"].includes(m.process)) {
        expect(m.note, `${m.id}`).toMatch(/XY|in-plane/i);
      }
    }
  });
});

// ── The calculators' menus ────────────────────────────────────────────────
// These pin the migration: same labels, same numbers as before the library
// existed. If a menu is repointed at the wrong id, the values move and these
// fail — which is exactly the failure a shared table could otherwise hide.

describe("calculator menus", () => {
  it("offers the beam/flexure/column picker the same materials, grouped as before", () => {
    expect(GROUP_ORDER).toEqual(["Metal", "Plastic", "FDM", "Powder-bed", "Elastomer"]);
    expect(Object.keys(PICKER)).toEqual([
      "Spring Steel (1095)",
      "Ti-6Al-4V",
      "Aluminum 6061",
      "Aluminum 6061-T6",
      "Aluminum 7075",
      "Aluminum 7075-T6",
      "Delrin (POM)",
      "Polypropylene",
      "PETG",
      "PLA (FDM)",
      "PETG (FDM)",
      "ABS (FDM)",
      "ASA (FDM)",
      "PC-ABS (FDM)",
      "Polycarbonate (FDM)",
      "Nylon 12 / PA12 (FDM)",
      "Nylon 12 CF (FDM)",
      "PP (FDM)",
      "PA12 (MJF)",
      "PA11 (MJF)",
      "PA12 GB (MJF, glass-filled)",
      "PA12 (SLS)",
      "TPU/TPA (MJF, rubber-like)",
      "TPU 95A (FDM)",
      "TPU 85A (FDM, softer)",
      "TPE (FDM, soft rubber)",
    ]);
    expect(PICKER["Aluminum 6061-T6"]).toEqual({
      E: 68.9,
      sigmaY: 276,
      color: "#b8bcc0",
      grp: "Metal",
    });
    expect(PICKER["PLA (FDM)"]).toMatchObject({ E: 3.5, sigmaY: 50, grp: "FDM", fdm: true });
    expect(PICKER["TPU 95A (FDM)"]).toMatchObject({ E: 0.04, sigmaY: 9, fdm: true, soft: true });
    // Printed flag follows the process, not the display group.
    expect(PICKER["Delrin (POM)"].fdm).toBeUndefined();
    expect(PICKER["TPU/TPA (MJF, rubber-like)"]).toMatchObject({ grp: "Powder-bed", soft: true });
  });

  it("offers the bolted joint the same plates with the same properties", () => {
    expect(Object.keys(PLATE_MATERIALS)).toEqual([
      "Mild steel (S235)",
      "Alloy steel (S355 / 4140)",
      "Stainless 304 / A2",
      "Aluminum 6061-T6",
      "Aluminum 7075-T6",
      "Gray cast iron (GJL-250)",
      "Brass (CuZn37)",
      "Ti-6Al-4V",
      "FR-4 PCB (glass-epoxy)",
      "POM / Delrin",
      "ABS",
      "ABS-PC blend",
      "Nylon 12 (PA12)",
      "Nylon 12 GF30 (glass-filled)",
      "Nylon 6/6 (PA66, dry)",
    ]);
    expect(PLATE_MATERIALS["Mild steel (S235)"]).toEqual({ E: 200, sy: 235, pG: 490, tone: "#39434e" });
    expect(PLATE_MATERIALS["FR-4 PCB (glass-epoxy)"]).toEqual({ E: 12, sy: 300, pG: 60, tone: "#2f4a3c" });
    expect(PLATE_MATERIALS["Nylon 12 (PA12)"]).toEqual({ E: 1.7, sy: 48, pG: 50, tone: "#464a40" });
  });

  it("offers the clamp the same bodies and cylinders", () => {
    expect(Object.keys(CLAMP_MATS)).toEqual([
      "PC-ABS (FDM)",
      "PLA (FDM)",
      "PETG (FDM)",
      "ASA (FDM)",
      "Nylon 12 (FDM)",
      "Nylon 12 (MJF)",
      "Aluminum 5052-H32",
      "Aluminum 6061-T6",
      "Mild steel (S235)",
      "Steel (S355 / 4140N)",
    ]);
    expect(CLAMP_MATS["PLA (FDM)"]).toEqual({
      E: 3500,
      sy: 50,
      pG: 55,
      creep: 0.45,
      printed: true,
      tone: "#37452f",
    });
    // Metals carry no creep figure in the library; the clamp reads that as 1.
    expect(CLAMP_MATS["Mild steel (S235)"]).toEqual({
      E: 200000,
      sy: 235,
      pG: 490,
      creep: 1,
      tone: "#39434e",
    });
    expect(CLAMP_MATS["Mild steel (S235)"].printed).toBeUndefined();
    expect(Object.keys(CYL_MATS)).toEqual([
      "Steel tube (S235 / DOM)",
      "Steel, alloy (S355 / 4140)",
      "Stainless 304 tube",
      "Aluminum 6061-T6",
      "Aluminum 6063-T5",
      "Hard chromed rod",
    ]);
    expect(CYL_MATS["Aluminum 6061-T6"]).toEqual({ E: 68900, sy: 276 });
  });

  it("agrees with itself across calculators about a shared material", () => {
    // The whole point of the library: one aluminium, one steel. Values are
    // expressed in each calculator's own units, so compare after conversion.
    expect(CLAMP_MATS["Aluminum 6061-T6"].E).toBe(PLATE_MATERIALS["Aluminum 6061-T6"].E * 1000);
    expect(CLAMP_MATS["Aluminum 6061-T6"].sy).toBe(PLATE_MATERIALS["Aluminum 6061-T6"].sy);
    expect(CLAMP_MATS["Aluminum 6061-T6"].pG).toBe(PLATE_MATERIALS["Aluminum 6061-T6"].pG);
    expect(CLAMP_MATS["Mild steel (S235)"].pG).toBe(PLATE_MATERIALS["Mild steel (S235)"].pG);
    expect(PICKER["Aluminum 6061-T6"].E).toBe(PLATE_MATERIALS["Aluminum 6061-T6"].E);
    // …including the nylon whose bearing limit used to differ by calculator.
    expect(CLAMP_MATS["Nylon 12 (MJF)"].pG).toBe(PLATE_MATERIALS["Nylon 12 (PA12)"].pG);
  });
});
