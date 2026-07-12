import { useState, useMemo, useRef, useEffect } from "react";
import * as THREE from "three";
import { Field, Select, Readout, num } from "../ui";
import { signedStressColor } from "./stressColor";
import { MATERIALS, GROUP_ORDER, FAVORITES } from "./materials";
import { beamStiffness, beamSigma, beamShape, beamMoment } from "./simpleBeamMath";
import type { SupportType } from "./simpleBeamMath";

// Peak bending stress as a fraction of yield, driving color + feel.
function stressRatio(EGpa: number, tMm: number, LMm: number, deltaMm: number, sigmaYMpa: number, support: SupportType) {
  if (LMm <= 0 || sigmaYMpa <= 0) return 0;
  const sigmaPa = beamSigma(EGpa * 1e9, tMm / 1000, LMm / 1000, Math.abs(deltaMm) / 1000, support);
  return sigmaPa / 1e6 / sigmaYMpa;
}

// ── 3D beam viewer ──────────────────────────────────────────────
// A rectangular beam spanning two supports, drawn to true L:t:w proportions.
// Drag to orbit; in interactive mode, press the middle of the beam down (or
// pull it up) and feel the stress. The color field follows the bending-moment
// diagram: simply supported beams glow hottest at mid-span, fixed-fixed beams
// at the walls — with the tension face flipping at the inflection points.
function Beam2S3D({
  L,
  t,
  w,
  delta,
  support,
  interactive,
  E,
  sigmaY,
  onLiveDelta,
}: {
  L: number;
  t: number;
  w: number;
  delta: number;
  support: SupportType;
  interactive: boolean;
  E: number;
  sigmaY: number;
  onLiveDelta: (mm: number | null) => void;
}) {
  const mountRef = useRef<HTMLDivElement>(null);
  const stateRef = useRef({ yaw: -0.5, pitch: -0.3, dragging: false, lx: 0, ly: 0 });
  const pivotRef = useRef<THREE.Group | null>(null);
  const meshRef = useRef<THREE.Mesh | null>(null);
  const supportsRef = useRef<THREE.Object3D[]>([]);

  // Geometry caches so deflection can be applied per-frame without rebuilding.
  const geoRef = useRef<THREE.BufferGeometry | null>(null);
  const baseYRef = useRef<Float32Array | null>(null);
  const xnRef = useRef<Float32Array | null>(null); // 0..1 along the span
  const colorAttrRef = useRef<THREE.BufferAttribute | null>(null);
  const dimsRef = useRef({ Lv: 1, Ls: 1, halfT: 0.01 });
  const applyRef = useRef<((d: number) => void) | null>(null);

  // Invisible fattened proxy over the middle of the span — the grab target.
  const proxyRef = useRef<THREE.Mesh | null>(null);
  const proxyBaseYRef = useRef<Float32Array | null>(null);
  const proxyXnRef = useRef<Float32Array | null>(null);

  // Live interaction state (driven outside React for smoothness).
  const liveDeltaRef = useRef(delta);
  const designDeltaRef = useRef(delta);
  const grabbingRef = useRef(false);
  const springRef = useRef(false);
  const springVelRef = useRef(0);
  const yieldRef = useRef(false);
  const forceRef = useRef(true);
  const lastVibeRef = useRef(0);
  const audioRef = useRef<{ ctx: AudioContext; gain: GainNode; osc: OscillatorNode } | null>(null);

  // Latest props, readable from the long-lived animation/pointer closures.
  const propsRef = useRef({ interactive, E, sigmaY, L, t, w, support, onLiveDelta });
  useEffect(() => {
    propsRef.current = { interactive, E, sigmaY, L, t, w, support, onLiveDelta };
    forceRef.current = true; // recolor on material / support change
  }, [interactive, E, sigmaY, L, t, w, support, onLiveDelta]);

  // Keep the resting deflection in sync with the design input.
  useEffect(() => {
    designDeltaRef.current = delta;
    if (!grabbingRef.current && !springRef.current) {
      liveDeltaRef.current = delta;
      forceRef.current = true;
    }
  }, [delta]);

  // One-time scene setup
  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    const width = mount.clientWidth;
    const height = mount.clientHeight || 320;

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
    grid.position.y = -1.35;
    pivot.add(grid);

    // Deflect the beam: vertical offset per the closed-form shape, with the
    // cross-section rotating to follow the local slope so thick beams don't
    // shear visually. ξ = distance from the nearer support (0..0.5).
    const applyDeflection = (deltaMm: number) => {
      const geo = geoRef.current;
      const baseY = baseYRef.current;
      const xn = xnRef.current;
      if (!geo || !baseY || !xn) return;
      const { Lv, Ls, halfT } = dimsRef.current;
      const P = propsRef.current;
      const dv = (Math.max(-0.3, Math.min(0.3, deltaMm / Math.max(Lv, 1e-3))) * Ls) as number; // view-units, capped

      const pos = geo.attributes.position as THREE.BufferAttribute;
      const bend = (out: THREE.BufferAttribute, off: Float32Array, frac: Float32Array) => {
        for (let i = 0; i < out.count; i++) {
          const s = frac[i]; // 0..1 along span
          const xi = s <= 0.5 ? s : 1 - s;
          const y = beamShape(xi, P.support);
          out.setY(i, off[i] - dv * y);
        }
        out.needsUpdate = true;
      };
      bend(pos, baseY, xn);
      geo.computeVertexNormals();
      const proxy = proxyRef.current;
      const pBaseY = proxyBaseYRef.current;
      const pXn = proxyXnRef.current;
      if (proxy && pBaseY && pXn) {
        bend(proxy.geometry.attributes.position as THREE.BufferAttribute, pBaseY, pXn);
      }

      // Color by the bending-moment diagram: signed fiber stress
      // = ratio · m(ξ) · (−fiber/halfT) · sign(δ), so pressing down puts the
      // bottom of mid-span in tension — and for fixed ends, the TOP at the walls.
      const col = colorAttrRef.current;
      if (col) {
        const ratioMax = stressRatio(P.E, P.t, P.L, deltaMm, P.sigmaY, P.support);
        const dir = Math.sign(deltaMm) || 0; // + = pressed down
        for (let i = 0; i < col.count; i++) {
          const s = xn[i];
          const xi = s <= 0.5 ? s : 1 - s;
          const m = beamMoment(xi, P.support);
          const signed = ratioMax * m * (-baseY[i] / (halfT || 1e-6)) * dir;
          const c = signedStressColor(signed);
          col.setXYZ(i, c.r, c.g, c.b);
        }
        col.needsUpdate = true;
      }
    };
    applyRef.current = applyDeflection;

    // ── Haptic / audio "feel" ──────────────────────────────────────
    const ensureAudio = () => {
      if (audioRef.current) {
        audioRef.current.ctx.resume?.();
        return;
      }
      try {
        const AC: typeof AudioContext =
          window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        if (!AC) return;
        const ctx = new AC();
        const gain = ctx.createGain();
        gain.gain.value = 0;
        const osc = ctx.createOscillator();
        osc.type = "sawtooth";
        osc.frequency.value = 80;
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        audioRef.current = { ctx, gain, osc };
      } catch {
        /* audio unavailable — silent fallback */
      }
    };
    const crack = () => {
      const a = audioRef.current;
      if (!a) return;
      const { ctx } = a;
      const dur = 0.18;
      const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * dur), ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 2);
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const bp = ctx.createBiquadFilter();
      bp.type = "bandpass";
      bp.frequency.value = 1100;
      bp.Q.value = 0.8;
      const g = ctx.createGain();
      g.gain.value = 0.3;
      src.connect(bp);
      bp.connect(g);
      g.connect(ctx.destination);
      src.start();
    };
    const canVibrate = () => typeof navigator !== "undefined" && typeof navigator.vibrate === "function";
    const updateFeel = (deltaMm: number) => {
      const P = propsRef.current;
      const ratio = stressRatio(P.E, P.t, P.L, deltaMm, P.sigmaY, P.support);
      const a = audioRef.current;
      if (a) {
        a.gain.gain.setTargetAtTime(Math.min(0.14, ratio * 0.12), a.ctx.currentTime, 0.02);
        a.osc.frequency.setTargetAtTime(70 + Math.min(ratio, 1.5) * 230, a.ctx.currentTime, 0.02);
      }
      const yielding = ratio >= 1;
      if (yielding && !yieldRef.current) {
        crack();
        if (canVibrate()) navigator.vibrate([0, 45, 25, 75]);
      }
      yieldRef.current = yielding;
      if (canVibrate()) {
        const now = performance.now();
        const interval = 220 - Math.min(ratio, 1.2) * 150; // more stress → faster ticks
        if (now - lastVibeRef.current > interval) {
          navigator.vibrate(6);
          lastVibeRef.current = now;
        }
      }
    };
    const stopFeel = () => {
      const a = audioRef.current;
      if (a) a.gain.gain.setTargetAtTime(0, a.ctx.currentTime, 0.08);
      yieldRef.current = false;
    };

    let raf = 0;
    let lastApplied = NaN;
    const animate = () => {
      const s = stateRef.current;
      pivot.rotation.y = s.yaw;
      pivot.rotation.x = s.pitch;
      // Damped spring-back to the resting (design) deflection after a release.
      if (springRef.current) {
        const target = designDeltaRef.current;
        const cur = liveDeltaRef.current;
        const norm = Math.min(1, Math.max(0, (Math.log10(Math.max(propsRef.current.E, 1e-3)) + 2) / 4.3));
        const ks = 0.12 + 0.3 * norm; // stiffer materials snap back faster
        springVelRef.current = (springVelRef.current + (target - cur) * ks) * 0.8;
        let ncur = cur + springVelRef.current;
        if (Math.abs(target - ncur) < 1e-3 && Math.abs(springVelRef.current) < 1e-3) {
          ncur = target;
          springRef.current = false;
          propsRef.current.onLiveDelta(null);
        } else {
          propsRef.current.onLiveDelta(ncur);
        }
        liveDeltaRef.current = ncur;
      }
      if (forceRef.current || liveDeltaRef.current !== lastApplied) {
        applyDeflection(liveDeltaRef.current);
        lastApplied = liveDeltaRef.current;
        forceRef.current = false;
      }
      renderer.render(scene, camera);
      raf = requestAnimationFrame(animate);
    };
    animate();

    const onResize = () => {
      const wd = mount.clientWidth;
      const ht = mount.clientHeight || 320;
      camera.aspect = wd / ht;
      camera.updateProjectionMatrix();
      renderer.setSize(wd, ht);
    };
    window.addEventListener("resize", onResize);

    const el = renderer.domElement;
    el.style.touchAction = "none";
    el.style.cursor = "grab";
    const raycaster = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    let dragStartY = 0;
    let dragStartDelta = 0;

    const hitsBeam = (e: PointerEvent) => {
      const target = proxyRef.current || meshRef.current;
      if (!target) return false;
      const rect = el.getBoundingClientRect();
      ndc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      ndc.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(ndc, camera);
      return raycaster.intersectObject(target).length > 0;
    };

    const down = (e: PointerEvent) => {
      const s = stateRef.current;
      // Interactive: press the middle of the beam; miss it → orbit.
      if (propsRef.current.interactive && hitsBeam(e)) {
        grabbingRef.current = true;
        springRef.current = false;
        springVelRef.current = 0;
        dragStartY = e.clientY;
        dragStartDelta = liveDeltaRef.current;
        ensureAudio();
        el.style.cursor = "ns-resize";
        el.setPointerCapture?.(e.pointerId);
        e.preventDefault();
        return;
      }
      s.dragging = true;
      s.lx = e.clientX;
      s.ly = e.clientY;
      el.style.cursor = "grabbing";
      el.setPointerCapture?.(e.pointerId);
    };
    const move = (e: PointerEvent) => {
      if (grabbingRef.current) {
        e.preventDefault();
        const rect = el.getBoundingClientRect();
        const h = rect.height || 320;
        const Lv = Math.max(propsRef.current.L, 1e-3);
        const mmPerPx = (Lv * 0.6) / h; // a full vertical swipe ≈ 0.6·L of travel
        const lim = Lv * 0.28; // supports don't let the middle travel like a cantilever tip
        let nd = dragStartDelta + (e.clientY - dragStartY) * mmPerPx;
        nd = Math.max(-lim, Math.min(lim, nd));
        liveDeltaRef.current = nd;
        propsRef.current.onLiveDelta(nd);
        updateFeel(nd);
        return;
      }
      const s = stateRef.current;
      if (!s.dragging) return;
      e.preventDefault(); // stop the page from scrolling while orbiting
      s.yaw += (e.clientX - s.lx) * 0.01;
      s.pitch += (e.clientY - s.ly) * 0.01;
      s.pitch = Math.max(-1.4, Math.min(1.4, s.pitch));
      s.lx = e.clientX;
      s.ly = e.clientY;
    };
    const up = (e: PointerEvent) => {
      if (grabbingRef.current) {
        grabbingRef.current = false;
        springRef.current = true; // release → spring back to rest
        stopFeel();
        el.style.cursor = "grab";
        el.releasePointerCapture?.(e.pointerId);
        return;
      }
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
    const blockTouch = (e: TouchEvent) => {
      if (stateRef.current.dragging || grabbingRef.current) e.preventDefault();
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
      try {
        audioRef.current?.ctx.close();
      } catch {
        /* ignore */
      }
      audioRef.current = null;
      renderer.dispose();
      if (el.parentNode) el.parentNode.removeChild(el);
    };
  }, []);

  // Rebuild geometry whenever the section / span / support type changes.
  useEffect(() => {
    const pivot = pivotRef.current;
    if (!pivot) return;

    if (meshRef.current) {
      pivot.remove(meshRef.current);
      meshRef.current.geometry.dispose();
      (meshRef.current.material as THREE.Material).dispose();
    }
    if (proxyRef.current) {
      pivot.remove(proxyRef.current);
      proxyRef.current.geometry.dispose();
      (proxyRef.current.material as THREE.Material).dispose();
    }
    for (const s of supportsRef.current) {
      pivot.remove(s);
      s.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.geometry) m.geometry.dispose();
        if (m.material) (m.material as THREE.Material).dispose();
      });
    }
    supportsRef.current = [];

    // Normalize so the span maps to a fixed view length, preserving L:t:w.
    const Lv = Math.max(L, 1e-3),
      tv = Math.max(t, 1e-3),
      wv = Math.max(w, 1e-3);
    const maxd = Math.max(Lv, tv, wv);
    const scale = 3.4 / maxd;
    const Ls = Lv * scale,
      ts = tv * scale,
      ws = wv * scale;

    // Beam centered at the origin, spanning −Ls/2 .. +Ls/2.
    const SEG = 80;
    const geo = new THREE.BoxGeometry(Ls, ts, ws, SEG, 1, 1);
    const pos = geo.attributes.position as THREE.BufferAttribute;
    const baseY = new Float32Array(pos.count);
    const xn = new Float32Array(pos.count);
    for (let i = 0; i < pos.count; i++) {
      baseY[i] = pos.getY(i);
      xn[i] = pos.getX(i) / Ls + 0.5; // 0 at left support → 1 at right support
    }
    const colorAttr = new THREE.BufferAttribute(new Float32Array(pos.count * 3), 3);
    colorAttr.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute("color", colorAttr);

    geoRef.current = geo;
    baseYRef.current = baseY;
    xnRef.current = xn;
    colorAttrRef.current = colorAttr;
    dimsRef.current = { Lv, Ls, halfT: ts / 2 };

    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0.25, roughness: 0.55 });
    const mesh = new THREE.Mesh(geo, mat);
    pivot.add(mesh);
    meshRef.current = mesh;

    // Grab proxy: fat invisible box over the middle half of the span.
    const fat = Math.max(ts, ws, Ls * 0.16);
    const proxyGeo = new THREE.BoxGeometry(Ls * 0.5, fat, fat, Math.floor(SEG / 2), 1, 1);
    const ppos = proxyGeo.attributes.position as THREE.BufferAttribute;
    const pBaseY = new Float32Array(ppos.count);
    const pXn = new Float32Array(ppos.count);
    for (let i = 0; i < ppos.count; i++) {
      pBaseY[i] = ppos.getY(i);
      pXn[i] = ppos.getX(i) / Ls + 0.5; // same span parameterization
    }
    const proxy = new THREE.Mesh(
      proxyGeo,
      new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, colorWrite: false }),
    );
    pivot.add(proxy);
    proxyRef.current = proxy;
    proxyBaseYRef.current = pBaseY;
    proxyXnRef.current = pXn;

    // Supports at the ends. Fixed: wall slabs the beam disappears into.
    // Simple: knife-edge triangular prisms under the beam — the classic pin.
    const supMat = new THREE.MeshStandardMaterial({ color: 0x1a242c, metalness: 0.1, roughness: 0.95 });
    if (support === "fixed") {
      const wallThick = 0.24;
      for (const side of [-1, 1]) {
        const wall = new THREE.Mesh(new THREE.BoxGeometry(wallThick, ts * 2.4 + 0.34, ws * 1.6 + 0.3), supMat.clone());
        wall.position.x = side * (Ls / 2 + wallThick / 2 - 0.02);
        pivot.add(wall);
        supportsRef.current.push(wall);
      }
    } else {
      const height = Math.max(0.55, ts * 1.4);
      for (const side of [-1, 1]) {
        // Triangular prism: 3-sided "cylinder" lying along z, apex up.
        const tri = new THREE.Mesh(new THREE.CylinderGeometry(height * 0.62, height * 0.62, ws * 1.3, 3, 1), supMat.clone());
        tri.rotation.x = Math.PI / 2; // axis along z
        tri.rotation.y = Math.PI; // apex pointing up at the beam
        tri.position.set(side * (Ls / 2 - height * 0.1), -ts / 2 - height * 0.36, 0);
        pivot.add(tri);
        supportsRef.current.push(tri);
      }
    }

    forceRef.current = true;
    applyRef.current?.(liveDeltaRef.current);
  }, [L, t, w, support]);

  return (
    <div>
      <div ref={mountRef} className="flexure-beam" />
      <div
        style={{
          fontFamily: "var(--mono)",
          fontSize: 9.5,
          color: interactive ? "#6b7884" : "#46515c",
          marginTop: 6,
          textAlign: "center",
        }}
      >
        {interactive
          ? "press the middle of the beam · drag empty space to rotate"
          : "drag to rotate · proportions are true to L : t : w"}
      </div>
    </div>
  );
}

// Equations behind the calculator, shown in the theory section.
const EQUATIONS: Array<{ expr: string; note: string }> = [
  { expr: "I = w·t³ / 12", note: "Second moment of area, rectangular section" },
  { expr: "k = 48EI / L³", note: "Center stiffness, simply supported (pins)" },
  { expr: "k = 192EI / L³", note: "Center stiffness, fixed (built-in) ends — 4× stiffer" },
  { expr: "F = k·δ", note: "Force to press the middle down by δ" },
  { expr: "σ = 6Etδ / L²", note: "Peak stress, simply supported — at mid-span" },
  { expr: "σ = 12Etδ / L²", note: "Peak stress, fixed ends — at the walls" },
  { expr: "n = σy / σ", note: "Safety factor against yielding" },
];

export default function SimpleBeamCalc() {
  const [matKey, setMatKey] = useState(FAVORITES[0]);
  const [support, setSupport] = useState<SupportType>("simple");
  const [L, setL] = useState("80"); // mm span between supports
  const [t, setT] = useState("2"); // mm (bending direction)
  const [w, setW] = useState("10"); // mm
  const [delta, setDelta] = useState("3"); // mm center deflection
  const [interactive, setInteractive] = useState(true);
  const [liveDelta, setLiveDelta] = useState<number | null>(null); // mm, while pressing

  const mat = MATERIALS[matKey];

  const effDelta = liveDelta != null ? liveDelta : num(delta);
  const isLive = liveDelta != null;

  const r = useMemo(() => {
    const E = mat.E * 1e9;
    const sigmaY = mat.sigmaY * 1e6;
    const Lm = num(L) / 1000;
    const tm = num(t) / 1000;
    const wm = num(w) / 1000;
    const dm = Math.abs(effDelta) / 1000;

    const I = (wm * Math.pow(tm, 3)) / 12;
    const k = beamStiffness(E, I, Lm, support);
    const F = k * dm;
    const sigma = beamSigma(E, tm, Lm, dm, support);
    const SF = sigma > 0 ? sigmaY / sigma : Infinity;

    return { k: k / 1000, F, sigma: sigma / 1e6, SF };
  }, [mat, L, t, w, effDelta, support]);

  const status =
    r.SF >= 2
      ? { c: "#4fb477", t: "SAFE" }
      : r.SF >= 1
        ? { c: "#d9a441", t: "MARGINAL" }
        : { c: "#d65c5c", t: "YIELDING" };

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
      <div style={{ maxWidth: 760, margin: "0 auto" }}>
        {/* Header */}
        <div
          className="flexure-header"
          style={{
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
              MECHCALC · STRUCTURES
            </div>
            <h1 className="flexure-title" style={{ margin: "6px 0 0", fontSize: 22, fontWeight: 600, letterSpacing: "-0.01em" }}>
              Beam on Two Supports
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
            <div>k = {support === "simple" ? "48" : "192"}EI / L³</div>
            <div>σ = {support === "simple" ? "6" : "12"}Etδ / L²</div>
          </div>
        </div>

        <div className="flexure-grid">
          {/* INPUTS */}
          <div className="flexure-inputs" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <Select
              label="Support type"
              value={support}
              onChange={(v) => setSupport(v as SupportType)}
            >
              <option value="simple">Simply supported (pins)</option>
              <option value="fixed">Fixed — built-in ends</option>
            </Select>

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
                <optgroup label="★ Favorites">
                  {FAVORITES.map((k) => (
                    <option key={`fav-${k}`} value={k}>
                      {k}
                    </option>
                  ))}
                </optgroup>
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
                  ⚠ Anisotropic — XY in-plane values. Strength across layer lines is far lower; orient the
                  beam so bending stays in-plane.
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
            <Field label="Span L" unit="mm" value={L} onChange={setL} min="0" />
            <Field label="Thickness t" unit="mm" value={t} onChange={setT} min="0" step="0.1" />
            <Field label="Width w" unit="mm" value={w} onChange={setW} min="0" />
            <Field label="Center deflection δ" unit="mm" value={delta} onChange={setDelta} min="0" step="0.1" />
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
              <div
                className="flexure-sf-head"
                style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}
              >
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
                className="flexure-sf"
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
            <Readout
              label="Max stress σ"
              value={r.sigma.toFixed(1)}
              unit="MPa"
              accent={status.c}
              hint={support === "simple" ? "at mid-span" : "at the walls"}
            />
          </div>
        </div>

        {/* BEAM VISUALIZATION — 3D */}
        <div
          className="flexure-viz"
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
              gap: 8,
              marginBottom: 8,
              flexWrap: "wrap",
            }}
          >
            <div>
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
              <div
                style={{
                  fontFamily: "var(--mono)",
                  fontSize: 10,
                  color: isLive ? status.c : "#46515c",
                  marginTop: 2,
                }}
              >
                {isLive
                  ? `● pressing · δ ${effDelta.toFixed(1)} mm · F ${r.F.toFixed(1)} N`
                  : `L ${num(L)} · t ${num(t)} · w ${num(w)} mm · ${support === "simple" ? "pins" : "built-in"}`}
              </div>
            </div>
            <button
              onClick={() => {
                const nv = !interactive;
                setInteractive(nv);
                if (!nv) setLiveDelta(null);
              }}
              style={{
                fontFamily: "var(--mono)",
                fontSize: 10,
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                cursor: "pointer",
                borderRadius: 2,
                padding: "6px 10px",
                background: interactive ? `${status.c}1f` : "#0e1419",
                border: `1px solid ${interactive ? status.c : "#1f2a33"}`,
                color: interactive ? status.c : "#8b97a3",
                whiteSpace: "nowrap",
              }}
            >
              {interactive ? "● Interactive" : "Interactive"}
            </button>
          </div>
          <Beam2S3D
            L={num(L)}
            t={num(t)}
            w={num(w)}
            delta={num(delta)}
            support={support}
            interactive={interactive}
            E={mat.E}
            sigmaY={mat.sigmaY}
            onLiveDelta={setLiveDelta}
          />
        </div>

        {/* THEORY & EQUATIONS */}
        <div style={{ marginTop: 24, borderTop: "1px solid #1f2a33", paddingTop: 18 }}>
          <div
            style={{
              fontFamily: "var(--mono)",
              fontSize: 10,
              letterSpacing: "0.2em",
              textTransform: "uppercase",
              color: "#3a78c2",
              marginBottom: 12,
            }}
          >
            Theory &amp; Equations
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            {EQUATIONS.map((eq) => (
              <div
                key={eq.expr + eq.note}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "baseline",
                  gap: 12,
                  padding: "8px 0",
                  borderBottom: "1px solid #141c22",
                  flexWrap: "wrap",
                }}
              >
                <span
                  style={{
                    fontFamily: "var(--mono)",
                    fontSize: 13,
                    color: "#e8edf1",
                    whiteSpace: "nowrap",
                  }}
                >
                  {eq.expr}
                </span>
                <span
                  style={{
                    fontFamily: "var(--mono)",
                    fontSize: 10,
                    color: "#6b7884",
                    textAlign: "right",
                  }}
                >
                  {eq.note}
                </span>
              </div>
            ))}
          </div>

          <div
            style={{
              fontFamily: "var(--mono)",
              fontSize: 10,
              color: "#46515c",
              marginTop: 10,
              lineHeight: 1.6,
            }}
          >
            E Young&apos;s modulus · I second moment of area · L span between supports · t thickness ·
            w width · δ center deflection · σ peak stress · σy yield strength · n safety factor
          </div>

          <p
            style={{
              fontFamily: "var(--sans)",
              fontSize: 12.5,
              color: "#8b97a3",
              marginTop: 16,
              lineHeight: 1.7,
            }}
          >
            <strong style={{ color: "#c2ccd4" }}>Model.</strong> A prismatic rectangular beam spanning two
            supports, loaded by a point force at mid-span — Euler–Bernoulli theory. With{" "}
            <em>pins</em>, the ends are free to rotate: the bending moment peaks at mid-span (FL/4) and the
            beam is hottest there — bottom face in tension when pressed down. With <em>built-in ends</em>,
            the walls grab the end slopes: the span gets 4× stiffer, the peak moment halves and moves to the
            walls (FL/8), and the tension face flips along the span — top fibers stretch at the walls,
            bottom fibers at mid-span, with quiet inflection points at L/4. The 3D color field draws exactly
            this moment diagram.
          </p>
          <p
            style={{
              fontFamily: "var(--sans)",
              fontSize: 12.5,
              color: "#8b97a3",
              marginTop: 10,
              lineHeight: 1.7,
            }}
          >
            <strong style={{ color: "#c2ccd4" }}>Compared to a cantilever.</strong> Same section and length,
            a simply supported span is 16× stiffer than a cantilever (48 vs 3 EI/L³) and a built-in span is
            64× stiffer — support at both ends is enormously effective. That&apos;s why the same press that
            folds a cantilever barely moves a spanning beam, and why real fixtures behave somewhere between
            the pinned and built-in numbers: bolted or short end connections rarely achieve a perfect clamp.
            Treat the two support types as brackets on reality.
          </p>
          <p
            style={{
              fontFamily: "var(--sans)",
              fontSize: 12.5,
              color: "#8b97a3",
              marginTop: 10,
              lineHeight: 1.7,
            }}
          >
            <strong style={{ color: "#c2ccd4" }}>Scope.</strong> Linear small-deflection theory, good for
            roughly δ/L ≲ 0.05 here. Push further and a real beam with restrained ends starts carrying load
            as a stretched membrane — dramatically stiffer than these formulas — while a pinned beam on
            rollers keeps following them longer. Shear deformation matters for very short, deep spans
            (L/t ≲ 10). 3D-printed values are typical in-plane figures; verify against your own coupons.
          </p>

          <p
            style={{
              fontFamily: "var(--sans)",
              fontSize: 12.5,
              color: "#b9c3cc",
              marginTop: 16,
              paddingTop: 12,
              borderTop: "1px dashed #1f2a33",
              lineHeight: 1.7,
            }}
          >
            <span style={{ textDecoration: "underline", textUnderlineOffset: 3, color: "#e8edf1" }}>
              In short:
            </span>{" "}
            holding both ends transforms the beam. The middle barely moves for the same force, and{" "}
            <em>where</em> it can break moves with the supports: pins concentrate stress under your finger
            at mid-span; walls concentrate it at the ends. Press the 3D beam and watch the hot spots settle
            exactly where the moment diagram says they must.
          </p>
        </div>
      </div>
    </div>
  );
}
