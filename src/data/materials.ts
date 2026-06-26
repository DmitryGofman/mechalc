// Screw material yield strengths. Reference values — verify before production use.
export interface Material {
  id: string;
  name: string;
  SyMPa: number; // yield strength, MPa
}

export const MATERIALS: Material[] = [
  { id: "g4_8", name: "Steel class 4.8", SyMPa: 340 },
  { id: "g8_8", name: "Steel class 8.8", SyMPa: 640 },
  { id: "g10_9", name: "Steel class 10.9", SyMPa: 940 },
  { id: "g12_9", name: "Steel class 12.9", SyMPa: 1100 },
  { id: "ss_a2_70", name: "Stainless A2-70", SyMPa: 450 },
  { id: "ss_a4_80", name: "Stainless A4-80", SyMPa: 600 },
  { id: "al_6061", name: "Aluminium 6061-T6", SyMPa: 276 },
];
