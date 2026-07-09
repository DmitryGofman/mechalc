import { Link } from "../router";

// The toolkit's catalog. Ready calculators link to their route; planned ones
// are the roadmap — same spirit: closed-form design checks with a live,
// grabbable 3D view and honest notes on scope.
type CalcCard = {
  route?: string;
  tag: string;
  title: string;
  desc: string;
  eq: string;
  ready: boolean;
};

const CALCS: CalcCard[] = [
  {
    route: "/flexure-calculator",
    tag: "Compliant mechanisms",
    title: "Cantilever Flexure",
    desc: "Stiffness, force, peak bending stress and yield safety factor for a rectangular flexure blade — bend the 3D beam and feel the stress.",
    eq: "σ = 3Etδ / 2L²",
    ready: true,
  },
  {
    route: "/bolt-calculator",
    tag: "Fasteners",
    title: "Bolted Joint — Screw Strength",
    desc: "Torque → preload, VDI-style reduced stress, and the clamped sandwich: two plate materials, load sharing, separation & crushing checks — tighten the 3D nut and watch the pressure cones.",
    eq: "Fb = Fi + C·P",
    ready: true,
  },
  {
    tag: "Drivetrain",
    title: "Shaft in Torsion",
    desc: "Shear stress, twist angle and power rating for solid & hollow circular shafts, with keyway stress concentration.",
    eq: "τ = 16T / πd³",
    ready: false,
  },
  {
    tag: "Structures",
    title: "Column Buckling",
    desc: "Critical load for slender and intermediate columns — Euler and Johnson regimes, end-condition factors.",
    eq: "Pcr = π²EI / (KL)²",
    ready: false,
  },
  {
    tag: "Springs",
    title: "Helical Coil Spring",
    desc: "Rate, shear stress with Wahl correction, solid height and buckling check for compression springs.",
    eq: "τ = Kw·8FD / πd³",
    ready: false,
  },
  {
    tag: "Joints",
    title: "Press / Interference Fit",
    desc: "Contact pressure, hub & shaft stresses and transmittable torque from Lamé thick-cylinder theory.",
    eq: "p = f(δ, E, r)",
    ready: false,
  },
  {
    tag: "Pressure",
    title: "Thin-Wall Pressure Vessel",
    desc: "Hoop and axial stress for cylinders and spheres, with a burst safety factor.",
    eq: "σ = p·r / t",
    ready: false,
  },
  {
    tag: "Bearings",
    title: "Bearing Life (L10)",
    desc: "Basic rating life for ball and roller bearings from dynamic load rating and equivalent load.",
    eq: "L10 = (C/P)³",
    ready: false,
  },
];

function Card({ c }: { c: CalcCard }) {
  const body = (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
        <span
          style={{
            fontFamily: "var(--mono)",
            fontSize: 9.5,
            letterSpacing: "0.18em",
            textTransform: "uppercase",
            color: c.ready ? "#3a78c2" : "#46515c",
          }}
        >
          {c.tag}
        </span>
        <span
          style={{
            fontFamily: "var(--mono)",
            fontSize: 9,
            fontWeight: 700,
            letterSpacing: "0.15em",
            color: c.ready ? "#4fb477" : "#6b7884",
            border: `1px solid ${c.ready ? "#4fb477" : "#2a3540"}`,
            borderRadius: 2,
            padding: "2px 6px",
            whiteSpace: "nowrap",
          }}
        >
          {c.ready ? "READY" : "PLANNED"}
        </span>
      </div>
      <div style={{ fontSize: 17, fontWeight: 600, letterSpacing: "-0.01em", color: "#e8edf1", marginTop: 10 }}>
        {c.title}
      </div>
      <div style={{ fontFamily: "var(--sans)", fontSize: 12, color: "#8b97a3", lineHeight: 1.6, marginTop: 6, flex: 1 }}>
        {c.desc}
      </div>
      <div
        style={{
          fontFamily: "var(--mono)",
          fontSize: 11,
          color: c.ready ? "#c2ccd4" : "#46515c",
          marginTop: 12,
          paddingTop: 10,
          borderTop: "1px solid #141c22",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          gap: 8,
        }}
      >
        <span>{c.eq}</span>
        {c.ready && <span style={{ color: "#3a78c2", fontSize: 10 }}>OPEN →</span>}
      </div>
    </>
  );

  if (c.ready && c.route) {
    return (
      <Link to={c.route} className="home-card home-card-ready">
        {body}
      </Link>
    );
  }
  return <div className="home-card home-card-planned">{body}</div>;
}

export default function Home() {
  return (
    <div
      className="flexure-shell"
      style={{
        ["--mono" as string]: "'JetBrains Mono', 'SF Mono', Menlo, monospace",
        ["--sans" as string]: "'Inter', system-ui, sans-serif",
        background: "#080c10",
        minHeight: "100vh",
        color: "#e8edf1",
        fontFamily: "var(--sans)",
      }}
    >
      <div style={{ maxWidth: 860, margin: "0 auto" }}>
        {/* Header */}
        <div style={{ borderBottom: "1px solid #1f2a33", paddingBottom: 18, marginBottom: 24 }}>
          <div
            style={{
              fontFamily: "var(--mono)",
              fontSize: 10,
              letterSpacing: "0.25em",
              color: "#3a78c2",
            }}
          >
            ENGINEERING DESIGN-CHECK TOOLKIT
          </div>
          <h1 style={{ margin: "8px 0 0", fontSize: 30, fontWeight: 600, letterSpacing: "-0.02em" }}>MechCalc</h1>
          <p
            style={{
              fontFamily: "var(--sans)",
              fontSize: 13,
              color: "#8b97a3",
              margin: "10px 0 0",
              lineHeight: 1.7,
              maxWidth: 560,
            }}
          >
            Fast closed-form calculators for mechanical engineers. Every tool pairs the numbers with a live
            3D model you can grab — bend the beam, tighten the nut — and colors the part by how close it is
            to yielding. Equations and scope notes included.
          </p>
        </div>

        {/* Calculator cards */}
        <div className="home-grid">
          {CALCS.map((c) => (
            <Card key={c.title} c={c} />
          ))}
        </div>

        <div
          style={{
            fontFamily: "var(--mono)",
            fontSize: 10,
            color: "#46515c",
            marginTop: 28,
            paddingTop: 14,
            borderTop: "1px solid #141c22",
            lineHeight: 1.8,
          }}
        >
          Design-check tools, not a substitute for full analysis — verify critical parts against your own
          data. Planned calculators land in the same style: pick a tool, trust the scope notes.
        </div>
      </div>
    </div>
  );
}
