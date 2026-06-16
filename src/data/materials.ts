// Typical engineering reference values. Stored in SI (Pa, kg/m³).
// Verify against a trusted source before relying on them for production design.
export interface Material {
  id: string;
  name: string;
  Sy: number; // yield strength, Pa
  Su: number; // ultimate strength, Pa
  E: number; // Young's modulus, Pa
  rho: number; // density, kg/m³
}

export const MATERIALS: Material[] = [
  { id: "al6061t6", name: "Al 6061-T6", Sy: 276e6, Su: 310e6, E: 68.9e9, rho: 2700 },
  { id: "al7075t6", name: "Al 7075-T6", Sy: 503e6, Su: 572e6, E: 71.7e9, rho: 2810 },
  { id: "steel1018", name: "Steel 1018", Sy: 370e6, Su: 440e6, E: 205e9, rho: 7870 },
  { id: "ss304", name: "Stainless 304", Sy: 215e6, Su: 505e6, E: 193e9, rho: 8000 },
  { id: "ss316", name: "Stainless 316", Sy: 290e6, Su: 580e6, E: 193e9, rho: 8000 },
  { id: "nylon", name: "Nylon (PA6)", Sy: 45e6, Su: 70e6, E: 2.0e9, rho: 1140 },
  { id: "pcabs", name: "PC-ABS", Sy: 55e6, Su: 60e6, E: 2.3e9, rho: 1130 },
];

export const MATERIAL_BY_ID: Record<string, Material> = Object.fromEntries(
  MATERIALS.map((m) => [m.id, m]),
);
