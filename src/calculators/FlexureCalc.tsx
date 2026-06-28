import { useState, useMemo, useRef, useEffect } from "react";
import * as THREE from "three";

// ── 3D beam viewer ──────────────────────────────────────────────
// Renders a rectangular cantilever to true L:t:w proportions, bent
// along the cubic cantilever deflection shape. Drag to orbit.
function Beam3D({
  L,
  t,
  w,
  delta,
  color,
}: {
  L: number;
  t: number;
  w: number;
  delta: number;
  color: string;
}) {
  const mountRef = useRef<HTMLDivElement>(null);
  const stateRef = useRef({ yaw: -0.6, pitch: -0.35, dragging: false, lx: 0, ly: 0 });
  const meshRef = useRef<THREE.Mesh | null>(null);
  const wallRef = useRef<THREE.Mesh | null>(null);
  const pivotRef = useRef<THREE.Group | null>(null);

  // One-time scene setup
  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    const width = mount.clientWidth;
    const height = 320;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#0b1015");

    const camera = new THREE.PerspectiveCamera(40, width / height, 0.1, 1000);
    camera.position.set(0, 0, 6);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(width, height);
    mount.appendChild(renderer.domElement);

    scene.add(new THREE.AmbientLight(0xffffff, 0.55));
    const key = new THREE.DirectionalLight(0xffffff, 0.9);
    key.position.set(4, 6, 5);
    scene.add(key);
    const rim = new THREE.DirectionalLight(0x3a78c2, 0.5);
    rim.position.set(-5, 2, -4);
    scene.add(rim);

    const pivot = new THREE.Group();
    scene.add(pivot);
    pivotRef.current = pivot;

    const grid = new THREE.GridHelper(8, 16, 0x1f2a33, 0x141c22);
    grid.position.y = -1.2;
    pivot.add(grid);

    let raf = 0;
    const animate = () => {
      const s = stateRef.current;
      pivot.rotation.y = s.yaw;
      pivot.rotation.x = s.pitch;
      renderer.render(scene, camera);
      raf = requestAnimationFrame(animate);
    };
    animate();

    const onResize = () => {
      const wd = mount.clientWidth;
      camera.aspect = wd / height;
      camera.updateProjectionMatrix();
      renderer.setSize(wd, height);
    };
    window.addEventListener("resize", onResize);

    const el = renderer.domElement;
    el.style.touchAction = "none";
    el.style.cursor = "grab";
    const down = (e: PointerEvent) => {
      const s = stateRef.current;
      s.dragging = true;
      s.lx = e.clientX;
      s.ly = e.clientY;
      el.style.cursor = "grabbing";
      el.setPointerCapture?.(e.pointerId);
    };
    const move = (e: PointerEvent) => {
      const s = stateRef.current;
      if (!s.dragging) return;
      e.preventDefault(); // stop the page from scrolling while orbiting
      s.yaw += (e.clientX - s.lx) * 0.01; // yaw spins freely, full 360°
      s.pitch += (e.clientY - s.ly) * 0.01;
      s.pitch = Math.max(-1.4, Math.min(1.4, s.pitch)); // clamp tilt so it can't flip over
      s.lx = e.clientX;
      s.ly = e.clientY;
    };
    const up = (e: PointerEvent) => {
      stateRef.current.dragging = false;
      el.style.cursor = "grab";
      el.releasePointerCapture?.(e.pointerId);
    };
    // passive:false is required so preventDefault actually blocks scroll on touch
    el.addEventListener("pointerdown", down, { passive: false });
    el.addEventListener("pointermove", move, { passive: false });
    el.addEventListener("pointerup", up);
    el.addEventListener("pointerleave", up);
    el.addEventListener("pointercancel", up);
    // belt-and-suspenders: block native touch scrolling on the canvas
    const blockTouch = (e: TouchEvent) => {
      if (stateRef.current.dragging) e.preventDefault();
    };
    el.addEventListener("touchmove", blockTouch, { passive: false });

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
      el.removeEventListener("pointerdown", down);
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      el.removeEventListener("pointerleave", up);
      el.removeEventListener("pointercancel", up);
      el.removeEventListener("touchmove", blockTouch);
      renderer.dispose();
      if (el.parentNode) el.parentNode.removeChild(el);
    };
  }, []);

  // Rebuild beam geometry whenever dimensions / deflection / color change
  useEffect(() => {
    const pivot = pivotRef.current;
    if (!pivot) return;

    // clear previous beam + wall
    if (meshRef.current) {
      pivot.remove(meshRef.current);
      meshRef.current.geometry.dispose();
      (meshRef.current.material as THREE.Material).dispose();
    }
    if (wallRef.current) {
      pivot.remove(wallRef.current);
      wallRef.current.geometry.dispose();
      (wallRef.current.material as THREE.Material).dispose();
    }

    // Normalize so the longest dim maps to a fixed view length,
    // preserving true relative proportions of L:t:w.
    const Lv = Math.max(L, 1e-3),
      tv = Math.max(t, 1e-3),
      wv = Math.max(w, 1e-3);
    const maxd = Math.max(Lv, tv, wv);
    const scale = 3.2 / maxd;
    const Ls = Lv * scale,
      ts = tv * scale,
      ws = wv * scale;

    const dWorld = Math.min((delta / Lv) * Ls, Ls * 0.9);

    // Beam: built so its ROOT is at local x=0 and it extends to +Ls.
    const SEG = 60;
    const geo = new THREE.BoxGeometry(Ls, ts, ws, SEG, 1, 1);
    geo.translate(Ls / 2, 0, 0); // shift so left face (root) is at x=0
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const xn = pos.getX(i) / Ls; // 0 at root → 1 at tip
      const yShape = (3 * xn * xn - xn * xn * xn) / 2; // cantilever curve
      pos.setY(i, pos.getY(i) - yShape * dWorld);
    }
    geo.computeVertexNormals();

    const mat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(color || "#4fb477"),
      metalness: 0.25,
      roughness: 0.55,
    });
    const mesh = new THREE.Mesh(geo, mat);
    pivot.add(mesh);
    meshRef.current = mesh;

    // Anchor wall: a slab flush against the root face (just left of x=0),
    // sized a bit larger than the beam cross-section so the beam clearly
    // emerges FROM it rather than passing through it.
    const wallThick = 0.22;
    const wallGeo = new THREE.BoxGeometry(wallThick, ts * 2.2 + 0.3, ws * 1.6 + 0.3);
    const wallMat = new THREE.MeshStandardMaterial({
      color: 0x1a242c,
      metalness: 0.1,
      roughness: 0.95,
    });
    const wall = new THREE.Mesh(wallGeo, wallMat);
    pivot.add(wall);
    wallRef.current = wall;

    // Re-center the whole assembly in view: pivot holds beam(0..Ls)+wall,
    // so nudge children left by half the beam length via group offset.
    mesh.position.x = -Ls / 2;
    wall.position.x = -Ls / 2 - wallThick / 2;
  }, [L, t, w, delta, color]);

  return (
    <div>
      <div
        ref={mountRef}
        style={{ width: "100%", height: 320, borderRadius: 3, overflow: "hidden" }}
      />
      <div
        style={{
          fontFamily: "var(--mono)",
          fontSize: 9.5,
          color: "#46515c",
          marginTop: 6,
          textAlign: "center",
        }}
      >
        drag to rotate · proportions are true to L : t : w
      </div>
    </div>
  );
}

// Material library: E in GPa, yield strength in MPa.
// fdm flag = anisotropic 3D-printed value (typical XY in-plane, well below across-layer).
type Material = {
  E: number;
  sigmaY: number;
  color: string;
  grp: string;
  fdm?: boolean;
  soft?: boolean;
};

const MATERIALS: Record<string, Material> = {
  // — Metals —
  "Spring Steel (1095)": { E: 205, sigmaY: 1200, color: "#9aa7b4", grp: "Metal" },
  "Ti-6Al-4V": { E: 114, sigmaY: 880, color: "#c4b59a", grp: "Metal" },
  "Aluminum 6061-T6": { E: 68.9, sigmaY: 276, color: "#b8bcc0", grp: "Metal" },
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

const GROUP_ORDER = ["Metal", "Plastic", "FDM", "Powder-bed", "Elastomer"];

const num = (v: string, fallback = 0) => {
  const n = parseFloat(v);
  return isNaN(n) ? fallback : n;
};

function Field({
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

function Readout({
  label,
  value,
  unit,
  accent,
}: {
  label: string;
  value: string;
  unit: string;
  accent?: string;
}) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "baseline",
        padding: "10px 0",
        borderBottom: "1px solid #141c22",
      }}
    >
      <span
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
        style={{
          fontFamily: "var(--mono)",
          fontSize: 17,
          color: accent || "#e8edf1",
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {value} <span style={{ fontSize: 11, color: "#46515c" }}>{unit}</span>
      </span>
    </div>
  );
}

export default function FlexureCalc() {
  const [matKey, setMatKey] = useState("Spring Steel (1095)");
  const [L, setL] = useState("40"); // mm
  const [t, setT] = useState("0.8"); // mm (bending direction)
  const [w, setW] = useState("10"); // mm
  const [delta, setDelta] = useState("4"); // mm target deflection

  const mat = MATERIALS[matKey];

  const r = useMemo(() => {
    const E = mat.E * 1e9; // Pa
    const sigmaY = mat.sigmaY * 1e6; // Pa
    const Lm = num(L) / 1000; // m
    const tm = num(t) / 1000;
    const wm = num(w) / 1000;
    const dm = num(delta) / 1000;

    const I = (wm * Math.pow(tm, 3)) / 12; // m^4
    const k = (3 * E * I) / Math.pow(Lm, 3); // N/m
    const F = k * dm; // N
    const sigma = (3 * E * tm * dm) / (2 * Math.pow(Lm, 2)); // Pa
    const SF = sigma > 0 ? sigmaY / sigma : Infinity;

    return {
      k: k / 1000, // N/mm
      F, // N
      sigma: sigma / 1e6, // MPa
      SF,
      Lm,
      tm,
      dm,
    };
  }, [mat, L, t, w, delta]);

  const status =
    r.SF >= 2
      ? { c: "#4fb477", t: "SAFE" }
      : r.SF >= 1
        ? { c: "#d9a441", t: "MARGINAL" }
        : { c: "#d65c5c", t: "YIELDING" };

  return (
    <div
      style={{
        ["--mono" as string]: "'JetBrains Mono', 'SF Mono', Menlo, monospace",
        ["--sans" as string]: "'Inter', system-ui, sans-serif",
        background: "#080c10",
        minHeight: "100vh",
        color: "#e8edf1",
        fontFamily: "var(--sans)",
        padding: "24px 16px",
      }}
    >
      <div style={{ maxWidth: 760, margin: "0 auto" }}>
        {/* Header */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-end",
            borderBottom: "1px solid #1f2a33",
            paddingBottom: 14,
            marginBottom: 22,
          }}
        >
          <div>
            <div
              style={{
                fontFamily: "var(--mono)",
                fontSize: 10,
                letterSpacing: "0.25em",
                color: "#3a78c2",
              }}
            >
              COMPLIANT MECHANISM TOOLKIT
            </div>
            <h1 style={{ margin: "6px 0 0", fontSize: 22, fontWeight: 600, letterSpacing: "-0.01em" }}>
              Cantilever Flexure
            </h1>
          </div>
          <div
            style={{
              textAlign: "right",
              fontFamily: "var(--mono)",
              fontSize: 10,
              color: "#46515c",
              lineHeight: 1.6,
            }}
          >
            <div>k = 3EI / L³</div>
            <div>σ = 3Etδ / 2L²</div>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 22, alignItems: "start" }}>
          {/* INPUTS */}
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
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
                Material
              </label>
              <select
                value={matKey}
                onChange={(e) => setMatKey(e.target.value)}
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
                {GROUP_ORDER.map((g) => (
                  <optgroup key={g} label={g}>
                    {Object.keys(MATERIALS)
                      .filter((k) => MATERIALS[k].grp === g)
                      .map((k) => (
                        <option key={k} value={k}>
                          {k}
                        </option>
                      ))}
                  </optgroup>
                ))}
              </select>
              <div style={{ fontFamily: "var(--mono)", fontSize: 10, color: "#46515c", marginTop: 2 }}>
                E = {mat.E} GPa · σ_y = {mat.sigmaY} MPa
              </div>
              {mat.fdm && (
                <div
                  style={{
                    fontFamily: "var(--mono)",
                    fontSize: 9.5,
                    color: "#d9a441",
                    marginTop: 4,
                    lineHeight: 1.5,
                  }}
                >
                  ⚠ Anisotropic — XY in-plane values. Strength across layer lines is far lower; orient
                  flexures so bending stays in-plane.
                </div>
              )}
              {mat.soft && (
                <div
                  style={{
                    fontFamily: "var(--mono)",
                    fontSize: 9.5,
                    color: "#d9a441",
                    marginTop: 4,
                    lineHeight: 1.5,
                  }}
                >
                  ⚠ Rubber-like — linear theory only holds for small δ/L. Treat results as a rough first
                  cut.
                </div>
              )}
            </div>
            <Field label="Length L" unit="mm" value={L} onChange={setL} min="0" />
            <Field label="Thickness t" unit="mm" value={t} onChange={setT} min="0" step="0.1" />
            <Field label="Width w" unit="mm" value={w} onChange={setW} min="0" />
            <Field label="Target deflection δ" unit="mm" value={delta} onChange={setDelta} min="0" step="0.1" />
          </div>

          {/* OUTPUTS */}
          <div>
            <div
              style={{
                background: "#0b1015",
                border: `1px solid ${status.c}33`,
                borderRadius: 3,
                padding: "14px 16px",
                marginBottom: 16,
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontFamily: "var(--mono)", fontSize: 11, letterSpacing: "0.15em", color: "#6b7884" }}>
                  SAFETY FACTOR
                </span>
                <span
                  style={{
                    fontFamily: "var(--mono)",
                    fontSize: 10,
                    fontWeight: 700,
                    letterSpacing: "0.15em",
                    color: status.c,
                    border: `1px solid ${status.c}`,
                    borderRadius: 2,
                    padding: "2px 7px",
                  }}
                >
                  {status.t}
                </span>
              </div>
              <div
                style={{
                  fontFamily: "var(--mono)",
                  fontSize: 38,
                  fontWeight: 600,
                  color: status.c,
                  marginTop: 6,
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {isFinite(r.SF) ? r.SF.toFixed(2) : "∞"}
              </div>
            </div>

            <Readout label="Stiffness k" value={r.k.toFixed(3)} unit="N/mm" />
            <Readout label="Force required F" value={r.F.toFixed(2)} unit="N" />
            <Readout label="Max stress σ" value={r.sigma.toFixed(1)} unit="MPa" accent={status.c} />
          </div>
        </div>

        {/* BEAM VISUALIZATION — 3D */}
        <div
          style={{
            marginTop: 24,
            background: "#0b1015",
            border: "1px solid #141c22",
            borderRadius: 3,
            padding: 16,
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 8,
            }}
          >
            <div
              style={{
                fontFamily: "var(--mono)",
                fontSize: 10,
                letterSpacing: "0.12em",
                textTransform: "uppercase",
                color: "#6b7884",
              }}
            >
              Deflected shape · 3D
            </div>
            <div style={{ fontFamily: "var(--mono)", fontSize: 10, color: "#46515c" }}>
              L {num(L)} · t {num(t)} · w {num(w)} mm
            </div>
          </div>
          <Beam3D L={num(L)} t={num(t)} w={num(w)} delta={num(delta)} color={status.c} />
        </div>

        <p
          style={{
            fontFamily: "var(--mono)",
            fontSize: 10,
            color: "#46515c",
            marginTop: 16,
            lineHeight: 1.7,
          }}
        >
          Linear small-deflection model (Euler-Bernoulli), end-loaded rectangular cantilever. Aim for SF
          ≥ 2 for cyclic/living-hinge duty. Thinner t buys range of motion at the cost of stiffness and
          margin.
        </p>
      </div>
    </div>
  );
}
