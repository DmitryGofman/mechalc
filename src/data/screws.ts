// Common metric screw nominal (major) diameters, in mm. Reference values.
export interface Screw {
  id: string;
  label: string;
  dNomMm: number; // nominal major diameter
  dMinorMm: number; // minor/root diameter (threads-in-shear, conservative)
}

export const SCREWS: Screw[] = [
  { id: "m3", label: "M3", dNomMm: 3, dMinorMm: 2.39 },
  { id: "m4", label: "M4", dNomMm: 4, dMinorMm: 3.14 },
  { id: "m5", label: "M5", dNomMm: 5, dMinorMm: 4.02 },
  { id: "m6", label: "M6", dNomMm: 6, dMinorMm: 4.77 },
  { id: "m8", label: "M8", dNomMm: 8, dMinorMm: 6.47 },
  { id: "m10", label: "M10", dNomMm: 10, dMinorMm: 8.16 },
  { id: "m12", label: "M12", dNomMm: 12, dMinorMm: 9.85 },
];
