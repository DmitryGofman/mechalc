import type { FormulaDef, ValidationIssue } from "../engine/types";

const PI = Math.PI;

export const sectionRectangle: FormulaDef = {
  id: "section-rectangle",
  category: "Sections",
  name: "Section Properties — rectangle",
  synonyms: ["rectangle", "moment of inertia", "section modulus", "I", "Z", "bar"],
  equation: "A = b·h,   I = b·h³/12,   Z = b·h²/6",
  diagramId: "section-rectangle",
  explanation:
    "Area, area moment of inertia, and section modulus of a solid rectangle bending about " +
    "its horizontal neutral axis (h is the dimension parallel to the load).",
  inputs: [
    { symbol: "b", name: "Width", dimension: "length", defaultUnit: "mm", description: "Width (perpendicular to load)", min: 0 },
    { symbol: "h", name: "Height", dimension: "length", defaultUnit: "mm", description: "Height (parallel to load)", min: 0 },
  ],
  outputs: [
    { symbol: "A", name: "Area A", dimension: "area", preferredUnit: "mm2", description: "b·h" },
    { symbol: "I", name: "Moment of inertia I", dimension: "second_moment", preferredUnit: "mm4", description: "b·h³/12" },
    { symbol: "Z", name: "Section modulus Z", dimension: "section_modulus", preferredUnit: "mm3", description: "b·h²/6" },
  ],
  calculate: ({ b, h }) => ({ A: b * h, I: (b * h ** 3) / 12, Z: (b * h ** 2) / 6 }),
  validate: ({ b, h }) => {
    const e: ValidationIssue[] = [];
    if (b <= 0) e.push({ field: "b", level: "error", message: "Width must be greater than zero" });
    if (h <= 0) e.push({ field: "h", level: "error", message: "Height must be greater than zero" });
    return e;
  },
};

export const sectionRound: FormulaDef = {
  id: "section-round",
  category: "Sections",
  name: "Section Properties — solid round",
  synonyms: ["round", "circle", "shaft", "I", "J", "polar", "Z"],
  equation: "A = πd²/4,   I = πd⁴/64,   J = πd⁴/32,   Z = πd³/32",
  diagramId: "section-round",
  explanation: "Properties of a solid circular cross-section of diameter d, including the polar moment J for torsion.",
  inputs: [{ symbol: "d", name: "Diameter", dimension: "length", defaultUnit: "mm", description: "Outer diameter", min: 0 }],
  outputs: [
    { symbol: "A", name: "Area A", dimension: "area", preferredUnit: "mm2", description: "πd²/4" },
    { symbol: "I", name: "Moment of inertia I", dimension: "second_moment", preferredUnit: "mm4", description: "πd⁴/64" },
    { symbol: "J", name: "Polar moment J", dimension: "second_moment", preferredUnit: "mm4", description: "πd⁴/32" },
    { symbol: "Z", name: "Section modulus Z", dimension: "section_modulus", preferredUnit: "mm3", description: "πd³/32" },
  ],
  calculate: ({ d }) => ({
    A: (PI * d ** 2) / 4,
    I: (PI * d ** 4) / 64,
    J: (PI * d ** 4) / 32,
    Z: (PI * d ** 3) / 32,
  }),
  validate: ({ d }) => (d <= 0 ? [{ field: "d", level: "error", message: "Diameter must be greater than zero" }] : []),
};

export const sectionTube: FormulaDef = {
  id: "section-tube",
  category: "Sections",
  name: "Section Properties — tube",
  synonyms: ["tube", "hollow", "pipe", "annulus", "I", "J"],
  equation: "I = π(do⁴ − di⁴)/64,   J = 2·I,   A = π(do² − di²)/4",
  diagramId: "section-tube",
  explanation: "Properties of a hollow circular tube with outer diameter do and inner diameter di.",
  inputs: [
    { symbol: "do", name: "Outer diameter", dimension: "length", defaultUnit: "mm", description: "Outer diameter", min: 0 },
    { symbol: "di", name: "Inner diameter", dimension: "length", defaultUnit: "mm", description: "Inner diameter", min: 0 },
  ],
  outputs: [
    { symbol: "A", name: "Area A", dimension: "area", preferredUnit: "mm2", description: "π(do² − di²)/4" },
    { symbol: "I", name: "Moment of inertia I", dimension: "second_moment", preferredUnit: "mm4", description: "π(do⁴ − di⁴)/64" },
    { symbol: "J", name: "Polar moment J", dimension: "second_moment", preferredUnit: "mm4", description: "2·I" },
    { symbol: "Z", name: "Section modulus Z", dimension: "section_modulus", preferredUnit: "mm3", description: "2I / do" },
  ],
  calculate: ({ do: outer, di }) => {
    const I = (PI * (outer ** 4 - di ** 4)) / 64;
    return { A: (PI * (outer ** 2 - di ** 2)) / 4, I, J: 2 * I, Z: (2 * I) / outer };
  },
  validate: ({ do: outer, di }) => {
    const e: ValidationIssue[] = [];
    if (outer <= 0) e.push({ field: "do", level: "error", message: "Outer diameter must be greater than zero" });
    if (di < 0) e.push({ field: "di", level: "error", message: "Inner diameter cannot be negative" });
    if (di >= outer) e.push({ field: "di", level: "error", message: "Inner diameter must be smaller than outer" });
    return e;
  },
};
