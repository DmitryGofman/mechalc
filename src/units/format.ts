// Human-friendly number formatting for engineering values.
export function formatNumber(x: number): string {
  if (!isFinite(x)) return "—";
  if (x === 0) return "0";
  const abs = Math.abs(x);
  // Use fixed notation in the readable range, exponential outside it.
  if (abs >= 1e6 || abs < 1e-3) {
    return x.toExponential(3).replace(/e\+?(-?)(\d+)/, "e$1$2");
  }
  // 4 significant figures, trailing zeros trimmed.
  const fixed = Number(x.toPrecision(4));
  return String(fixed);
}
