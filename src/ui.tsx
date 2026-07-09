// Shared form controls and readouts used by every calculator, so the whole
// toolkit keeps one visual language.

export const num = (v: string, fallback = 0) => {
  const n = parseFloat(v);
  return isNaN(n) ? fallback : n;
};

export function Field({
  label,
  unit,
  value,
  onChange,
  step = "any",
  min,
}: {
  label: string;
  unit: string;
  value: string;
  onChange: (v: string) => void;
  step?: string;
  min?: string;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <label
        style={{
          fontSize: 10,
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          color: "#6b7884",
          fontFamily: "var(--mono)",
        }}
      >
        {label} <span style={{ color: "#46515c" }}>[{unit}]</span>
      </label>
      <input
        type="number"
        value={value}
        step={step}
        min={min}
        onChange={(e) => onChange(e.target.value)}
        style={{
          background: "#0e1419",
          border: "1px solid #1f2a33",
          borderRadius: 2,
          color: "#e8edf1",
          padding: "9px 11px",
          fontFamily: "var(--mono)",
          fontSize: 15,
          width: "100%",
          boxSizing: "border-box",
          outline: "none",
        }}
        onFocus={(e) => (e.target.style.borderColor = "#3a78c2")}
        onBlur={(e) => (e.target.style.borderColor = "#1f2a33")}
      />
    </div>
  );
}

export function Select({
  label,
  value,
  options,
  onChange,
  children,
}: {
  label: string;
  value: string;
  options?: string[];
  onChange: (v: string) => void;
  children?: React.ReactNode;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <label
        style={{
          fontSize: 10,
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          color: "#6b7884",
          fontFamily: "var(--mono)",
        }}
      >
        {label}
      </label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{
          background: "#0e1419",
          border: "1px solid #1f2a33",
          borderRadius: 2,
          color: "#e8edf1",
          padding: "9px 11px",
          fontFamily: "var(--mono)",
          fontSize: 14,
          outline: "none",
        }}
      >
        {children ??
          options?.map((k) => (
            <option key={k} value={k}>
              {k}
            </option>
          ))}
      </select>
    </div>
  );
}

export function Readout({
  label,
  value,
  unit,
  accent,
  hint,
}: {
  label: string;
  value: string;
  unit: string;
  accent?: string;
  hint?: string;
}) {
  return (
    <div
      className="flexure-readout"
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "baseline",
        padding: "10px 0",
        borderBottom: "1px solid #141c22",
      }}
    >
      <span
        className="flexure-readout-label"
        style={{
          fontSize: 11,
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          color: "#6b7884",
          fontFamily: "var(--mono)",
        }}
      >
        {label}
      </span>
      <span
        className="flexure-readout-value"
        style={{
          fontFamily: "var(--mono)",
          fontSize: 17,
          color: accent || "#e8edf1",
          fontVariantNumeric: "tabular-nums",
          whiteSpace: "nowrap",
        }}
      >
        {value} <span style={{ fontSize: 11, color: "#46515c" }}>{unit}</span>
        {hint && <span style={{ fontSize: 10, color: "#6b7884", marginLeft: 6 }}>{hint}</span>}
      </span>
    </div>
  );
}
