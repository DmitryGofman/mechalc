// Recommended tap-drill sizes (~75% thread). Drill diameter in mm.
export interface TapDrill {
  thread: string;
  drillLabel: string;
  drillMm: number;
}

export const TAP_DRILLS: TapDrill[] = [
  // Metric coarse
  { thread: "M3 × 0.5", drillLabel: "2.5 mm", drillMm: 2.5 },
  { thread: "M4 × 0.7", drillLabel: "3.3 mm", drillMm: 3.3 },
  { thread: "M5 × 0.8", drillLabel: "4.2 mm", drillMm: 4.2 },
  { thread: "M6 × 1.0", drillLabel: "5.0 mm", drillMm: 5.0 },
  { thread: "M8 × 1.25", drillLabel: "6.8 mm", drillMm: 6.8 },
  { thread: "M10 × 1.5", drillLabel: "8.5 mm", drillMm: 8.5 },
  { thread: "M12 × 1.75", drillLabel: "10.2 mm", drillMm: 10.2 },
  // Imperial UNC
  { thread: "#4-40", drillLabel: '#43 (0.089")', drillMm: 2.26 },
  { thread: "#6-32", drillLabel: '#36 (0.1065")', drillMm: 2.70 },
  { thread: "#8-32", drillLabel: '#29 (0.136")', drillMm: 3.45 },
  { thread: "#10-24", drillLabel: '#25 (0.1495")', drillMm: 3.80 },
  { thread: "1/4-20", drillLabel: '#7 (0.201")', drillMm: 5.11 },
  { thread: "5/16-18", drillLabel: 'F (0.257")', drillMm: 6.53 },
  { thread: "3/8-16", drillLabel: '5/16" (0.3125")', drillMm: 7.94 },
  { thread: "1/2-13", drillLabel: '27/64" (0.4219")', drillMm: 10.72 },
];
