// Shared beam/flexure material library: E in GPa, yield strength in MPa.
// fdm flag = anisotropic 3D-printed value (typical XY in-plane, well below across-layer).
export type Material = {
  E: number;
  sigmaY: number;
  color: string;
  grp: string;
  fdm?: boolean;
  soft?: boolean;
};

export const MATERIALS: Record<string, Material> = {
  // — Metals —
  "Spring Steel (1095)": { E: 205, sigmaY: 1200, color: "#9aa7b4", grp: "Metal" },
  "Ti-6Al-4V": { E: 114, sigmaY: 880, color: "#c4b59a", grp: "Metal" },
  "Aluminum 6061": { E: 68.9, sigmaY: 55, color: "#b8bcc0", grp: "Metal" }, // O temper (annealed)
  "Aluminum 6061-T6": { E: 68.9, sigmaY: 276, color: "#b8bcc0", grp: "Metal" },
  "Aluminum 7075": { E: 71.7, sigmaY: 103, color: "#b8bcc0", grp: "Metal" }, // O temper (annealed)
  "Aluminum 7075-T6": { E: 71.7, sigmaY: 503, color: "#b8bcc0", grp: "Metal" },
  // — Bulk plastics —
  "Delrin (POM)": { E: 3.1, sigmaY: 70, color: "#e6e2d8", grp: "Plastic" },
  Polypropylene: { E: 1.5, sigmaY: 35, color: "#d8e0d4", grp: "Plastic" },
  PETG: { E: 2.1, sigmaY: 50, color: "#d4dde0", grp: "Plastic" },
  // — FDM (filament, XY in-plane) —
  "PLA (FDM)": { E: 3.5, sigmaY: 50, color: "#cfe0c8", grp: "FDM", fdm: true },
  "PETG (FDM)": { E: 2.0, sigmaY: 45, color: "#cfdde0", grp: "FDM", fdm: true },
  "ABS (FDM)": { E: 2.0, sigmaY: 40, color: "#e0d4cf", grp: "FDM", fdm: true },
  "ASA (FDM)": { E: 2.0, sigmaY: 42, color: "#e0d8cf", grp: "FDM", fdm: true },
  "PC-ABS (FDM)": { E: 1.9, sigmaY: 41, color: "#d6d2e0", grp: "FDM", fdm: true },
  "Polycarbonate (FDM)": { E: 2.2, sigmaY: 57, color: "#d2dce0", grp: "FDM", fdm: true },
  "Nylon 12 / PA12 (FDM)": { E: 1.5, sigmaY: 45, color: "#dee0d2", grp: "FDM", fdm: true },
  "Nylon 12 CF (FDM)": { E: 4.0, sigmaY: 70, color: "#c4c8cc", grp: "FDM", fdm: true },
  "PP (FDM)": { E: 1.3, sigmaY: 28, color: "#d8e0d4", grp: "FDM", fdm: true },
  // — Powder-bed (MJF / SLS) —
  "PA12 (MJF)": { E: 1.7, sigmaY: 48, color: "#dee0d2", grp: "Powder-bed", fdm: true },
  "PA11 (MJF)": { E: 1.6, sigmaY: 48, color: "#dee0d2", grp: "Powder-bed", fdm: true },
  "PA12 GB (MJF, glass-filled)": { E: 2.6, sigmaY: 44, color: "#d0d4cc", grp: "Powder-bed", fdm: true },
  "PA12 (SLS)": { E: 1.65, sigmaY: 48, color: "#dee0d2", grp: "Powder-bed", fdm: true },
  "TPU/TPA (MJF, rubber-like)": {
    E: 0.08,
    sigmaY: 8,
    color: "#e0d2da",
    grp: "Powder-bed",
    fdm: true,
    soft: true,
  },
  // — Elastomers (rubber-like) —
  "TPU 95A (FDM)": { E: 0.04, sigmaY: 9, color: "#e0d2da", grp: "Elastomer", fdm: true, soft: true },
  "TPU 85A (FDM, softer)": {
    E: 0.012,
    sigmaY: 5,
    color: "#e0d2da",
    grp: "Elastomer",
    fdm: true,
    soft: true,
  },
  "TPE (FDM, soft rubber)": {
    E: 0.01,
    sigmaY: 4,
    color: "#e0d2da",
    grp: "Elastomer",
    fdm: true,
    soft: true,
  },
};

export const GROUP_ORDER = ["Metal", "Plastic", "FDM", "Powder-bed", "Elastomer"];

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
