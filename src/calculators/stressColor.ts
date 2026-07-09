// Shared stress→color mapping for the 3D viewers: the neutral state is a calm
// green, tension warms through amber to yield-red, compression cools to blue.

export type Stops = Array<[number, [number, number, number]]>;

export function rampColor(stops: Stops, x: number) {
  const xc = Math.max(0, Math.min(stops[stops.length - 1][0], x));
  for (let i = 1; i < stops.length; i++) {
    const [p1, c1] = stops[i];
    if (xc <= p1) {
      const [p0, c0] = stops[i - 1];
      const f = (xc - p0) / (p1 - p0 || 1);
      return { r: c0[0] + (c1[0] - c0[0]) * f, g: c0[1] + (c1[1] - c0[1]) * f, b: c0[2] + (c1[2] - c0[2]) * f };
    }
  }
  const last = stops[stops.length - 1][1];
  return { r: last[0], g: last[1], b: last[2] };
}

export const NEUTRAL_RGB: [number, number, number] = [0.31, 0.706, 0.467]; // calm safe-green

export const TENSION_STOPS: Stops = [
  [0.0, NEUTRAL_RGB],
  [0.5, [0.85, 0.55, 0.22]], // amber
  [1.0, [0.84, 0.27, 0.27]], // yield red
  [1.3, [1.0, 0.3, 0.3]],
];

export const COMPRESSION_STOPS: Stops = [
  [0.0, NEUTRAL_RGB],
  [0.5, [0.2, 0.58, 0.68]], // teal
  [1.0, [0.27, 0.46, 0.9]], // blue
  [1.3, [0.3, 0.4, 1.0]],
];

// signed: + = tension (warm), − = compression (cool).
export function signedStressColor(signed: number) {
  return signed >= 0 ? rampColor(TENSION_STOPS, signed) : rampColor(COMPRESSION_STOPS, -signed);
}
